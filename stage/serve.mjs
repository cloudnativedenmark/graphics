#!/usr/bin/env node
/**
 * Show server for the LED wall. Run it on the laptop that feeds the wall.
 *
 *   node stage/serve.mjs            listen on the network, so a second machine
 *                                   (laptop, iPad) can run the control page
 *   node stage/serve.mjs --local    this machine only
 *   node stage/serve.mjs main       also open the main stage's control panel
 *   node stage/serve.mjs breakout   and screen (or the breakout's) in a Chrome
 *                                   that may play sound without a click
 *   PORT=4040 STAGE_KEY=… node stage/serve.mjs
 *
 * It holds the show state — day, cue, panic, music, voice-of-god mode, guides — for each room
 * (the main-stage wall and the breakout screen, each with its own operator)
 * and pushes every change to that room's pages over Server-Sent Events. The wall window and the
 * control page are both just followers, so a reloaded or crashed wall window
 * comes back on the cue it was showing.
 *
 * Changing the state needs the key. The venue network is shared with every
 * attendee, and nobody should be able to drive the wall from the audience.
 * Reading the state and the pages does not. Prefer a cable or a private
 * network for the control machine anyway.
 *
 * No dependencies: node:http, a static file handler, and EventSource.
 */

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const PORT = Number(process.env.PORT ?? 4040);
const LOCAL = process.argv.includes("--local");
const OPEN = ["main", "breakout"].find((r) => process.argv.includes(r));
const KEY = process.env.STAGE_KEY ?? randomBytes(4).toString("hex");

// Only what the pages need is served — not content/, source/ or .venv.
const PUBLIC = ["stage", "brand", "assets"].map((d) => join(ROOT, d) + sep);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

try {
  execFileSync(process.execPath, [join(HERE, "build.mjs")], { stdio: "pipe" });
} catch (e) {
  process.stderr.write(e.stdout ?? "");
  process.stderr.write(e.stderr ?? "");
  process.exit(1);
}

/** The stage file, re-read on every command so an edited run of show counts. */
const readStage = () => JSON.parse(readFileSync(join(ROOT, "content", "2026-stage.json"), "utf8"));

// The main-stage wall and the breakout screen: one state each, one operator
// each. A page names its room with ?room=, main stage by default.
const ROOMS = ["main", "breakout"];
const roomOf = (r) => (ROOMS.includes(r) ? r : "main");

/** Steps per day and room, counted the way stage/cues.js flattens them: a
 *  talk is two (three with the clear step), a sponsor pitch two (intro, then
 *  the clock running). */
function stepsOf(stage, day, room) {
  const d = stage.days[day];
  return ((room === "breakout" ? d?.breakout : d?.cues) ?? []).flatMap((cue) =>
    cue.scene === "talk"
      ? [
          ...(stage.clearBeforeWalkon ? [{ scene: "talk", state: "clear" }] : []),
          { scene: "talk", state: "walkon" },
          { scene: "talk", state: "live" },
        ]
      : cue.scene === "pitch"
        ? [
            { scene: "pitch", state: "intro", cue },
            { scene: "pitch", state: "running", cue },
          ]
        : [{ scene: cue.scene, cue }],
  );
}
function stepCounts(stage, room) {
  return Object.fromEntries(Object.keys(stage.days).map((day) => [day, stepsOf(stage, day, room).length]));
}

// music starts on: the first cue is the walk-in, which should have its bed
// playing as soon as the screen window gets its first key press (f).
// countdownTo: epoch ms the countdown runs to, set from the control page when
// the schedule slips. null means "use the cue's own `at` time".
// autoLiveAt: when the current walk-on goes live by itself (see walkonSeconds
// in the stage file), so the control page can count it down.
// vog: the voice-of-god mode, the first of the room's VOG_MODES by default
// (the same list as vogModes in stage/cues.js).
const VOG_MODES = { main: ["all", "hosts", "off"], breakout: ["off", "all"] };
// stepAt: when the current step came up, so a looping cue starts on its
// first scene and every window counts the loop from the same moment.
const fresh = (room) => ({ day: "1", i: 0, panic: false, music: true, vog: VOG_MODES[room][0], guides: false, countdownTo: null, autoLiveAt: null, stepAt: Date.now(), rev: 0 });
const states = Object.fromEntries(ROOMS.map((r) => [r, fresh(r)]));
const clients = new Map(ROOMS.map((r) => [r, new Set()]));

function broadcast(room) {
  const msg = `data: ${JSON.stringify(states[room])}\n\n`;
  for (const res of clients.get(room)) res.write(msg);
}

/**
 * A walk-on goes live by itself after walkonSeconds, in time with the sting —
 * the operator may be busy with the speaker's mic. Any command in between
 * (Next included) cancels or replaces the timer.
 */
const autoTimers = {};
function scheduleAutoLive(stage, room) {
  const state = states[room];
  clearTimeout(autoTimers[room]);
  state.autoLiveAt = null;
  const secs = Number(stage.walkonSeconds ?? 0);
  const step = stepsOf(stage, state.day, room)[state.i];
  if (!secs || state.panic || step?.scene !== "talk" || step.state !== "walkon") return;
  state.autoLiveAt = Date.now() + secs * 1000;
  const rev = state.rev;
  autoTimers[room] = setTimeout(() => {
    if (state.rev !== rev) return;
    state.i += 1;
    state.autoLiveAt = null;
    state.stepAt = Date.now();
    lastStep[room] = `${state.day}:${state.i}`;
    state.rev++;
    broadcast(room);
  }, secs * 1000);
}

/**
 * Entering a countdown cue starts its clock: `minutes` (default 5) from the
 * moment it appears. Leaving it clears the clock, so the next countdown
 * starts fresh. The control page's buttons adjust it while it runs. A
 * sponsor's pitch runs on the same clock, from its second step: the first
 * holds the clock while the sponsor is introduced.
 */
const timed = (step) => step?.scene === "countdown" || (step?.scene === "pitch" && step.state === "running");
const lastStep = {};
function onStep(stage, room) {
  const state = states[room];
  const key = `${state.day}:${state.i}`;
  if (key === lastStep[room]) return;
  lastStep[room] = key;
  state.stepAt = Date.now();
  const step = stepsOf(stage, state.day, room)[state.i];
  state.countdownTo = timed(step) ? Date.now() + Number(step.cue.minutes ?? 5) * 60000 : null;
}

function command(body) {
  const stage = readStage();
  const room = roomOf(body.room);
  const state = states[room];
  const counts = stepCounts(stage, room);
  const n = counts[state.day] ?? 1;
  switch (body.cmd) {
    case "next": state.i = Math.min(n - 1, state.i + 1); state.panic = false; break;
    case "prev": state.i = Math.max(0, state.i - 1); state.panic = false; break;
    case "first": state.i = 0; state.panic = false; break;
    case "goto": state.i = Math.max(0, Math.min(n - 1, Number(body.i) || 0)); state.panic = false; break;
    case "day":
      if (!counts[body.day]) return false;
      state.day = String(body.day);
      state.i = 0;
      state.panic = false;
      break;
    case "panic": state.panic = !state.panic; break;
    case "music": state.music = !state.music; break;
    case "vog": {
      // A `mode` sets it; without one (the v key) it steps to the next mode.
      const modes = VOG_MODES[room];
      if (body.mode != null) {
        if (!modes.includes(body.mode)) return false;
        state.vog = body.mode;
      } else state.vog = modes[(modes.indexOf(state.vog) + 1) % modes.length];
      break;
    }
    case "guides": state.guides = !state.guides; break;
    case "countdown": {
      // Start: `minutes` from now. Nudge: `add` minutes to the running target.
      if (body.minutes != null) state.countdownTo = Date.now() + Number(body.minutes) * 60000;
      else if (body.add != null && state.countdownTo) state.countdownTo += Number(body.add) * 60000;
      else if (body.clear) state.countdownTo = null;
      else return false;
      break;
    }
    default: return false;
  }
  state.rev++;
  onStep(stage, room);
  scheduleAutoLive(stage, room);
  broadcast(room);
  return true;
}

function serveFile(req, res, pathname) {
  let file = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!PUBLIC.some((p) => file.startsWith(p)) || !existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  const headers = {
    "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    // The show must reflect the files on disk, never a stale cached copy.
    "cache-control": "no-store",
    // Audio needs byte ranges: without them Chrome can't seek in a track or
    // reliably keep a 4-minute file streaming.
    "accept-ranges": "bytes",
  };
  const size = statSync(file).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      res.writeHead(416, { "content-range": `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "content-length": size });
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/") {
    res.writeHead(302, { location: "/stage/control.html" }).end();
    return;
  }

  if (url.pathname === "/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    const room = roomOf(url.searchParams.get("room"));
    res.write(`data: ${JSON.stringify(states[room])}\n\n`);
    clients.get(room).add(res);
    // A comment line every 15 s keeps proxies and sleepy Wi-Fi from closing it.
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => {
      clearInterval(ping);
      clients.get(room).delete(res);
    });
    return;
  }

  if (url.pathname === "/command" && req.method === "POST") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400).end("bad json");
        return;
      }
      if (body.key !== KEY) {
        res.writeHead(403).end("wrong key");
        return;
      }
      const ok = command(body);
      res.writeHead(ok ? 200 : 400, { "content-type": "application/json" }).end(JSON.stringify(states[roomOf(body.room)]));
    });
    return;
  }

  serveFile(req, res, url.pathname);
});

server.listen(PORT, LOCAL ? "127.0.0.1" : "0.0.0.0", () => {
  const c = process.stdout.isTTY && !process.env.NO_COLOR
    ? (code) => (s) => `\x1b[${code}m${s}\x1b[0m`
    : () => (s) => s;
  const [bold, dim, rose, cyan, yellow] = [c(1), c(2), c(31), c(36), c(33)];
  const url = (path) => cyan(`http://${path}`);
  console.log(`
  ${bold("CND stage")} ${dim(`· port ${PORT}${LOCAL ? " · this machine only" : ""}`)}

  ${rose("Main stage")}  ${dim("control")}  ${url(`localhost:${PORT}/stage/control.html?key=${KEY}`)}
              ${dim("screen ")}  ${url(`localhost:${PORT}/stage/index.html?output`)}

  ${yellow("Breakout  ")}  ${dim("control")}  ${url(`localhost:${PORT}/stage/control.html?key=${KEY}&room=breakout`)}
              ${dim("screen ")}  ${url(`localhost:${PORT}/stage/index.html?output&room=breakout`)}
${OPEN ? `\n  ${dim(`Opening the ${OPEN === "main" ? "main stage" : "breakout"} control and screen in Chrome, sound allowed.`)}\n` : `\n  ${dim("node stage/serve.mjs main | breakout  opens one room's pair with sound allowed")}\n`}`);
  if (OPEN) openRoom(OPEN);
});

/**
 * Open a room's control panel and screen in a Chrome of their own. Chrome
 * otherwise plays no sound until someone clicks in the screen window, so the
 * walk-in and afterparty music would stay silent. The autoplay switch only
 * counts when Chrome starts, hence a separate profile: it starts a fresh
 * Chrome even when your everyday one is open.
 */
function openRoom(room) {
  const chrome = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!existsSync(chrome)) {
    console.error(`  Chrome not found at ${chrome}; set CHROME_BIN, or open the links above.`);
    return;
  }
  const q = room === "breakout" ? "&room=breakout" : "";
  const flags = [`--user-data-dir=${join(homedir(), ".cnd-stage-chrome")}`, "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--new-window"];
  const launch = (url) => spawn(chrome, [...flags, url], { detached: true, stdio: "ignore" }).unref();
  launch(`http://localhost:${PORT}/stage/control.html?key=${KEY}${q}`);
  // The second window joins the Chrome the first one started.
  setTimeout(() => launch(`http://localhost:${PORT}/stage/index.html?output${q}`), 1500);
}
