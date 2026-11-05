#!/usr/bin/env node
/**
 * Export a run of the LED wall as an MP4, with its music.
 *
 *   node stage/export-video.mjs                 day one, default timeline
 *   node stage/export-video.mjs --fps 50        the wall's own frame rate
 *   node stage/export-video.mjs --preshow 60 --countdown 30 --talks 2
 *                                               a short one, to check quickly
 *
 * Default timeline: 5 minutes of the pre-show loop, the first 2 minutes of the
 * countdown, then every talk of the morning block (clear, walk-on, live).
 *
 * Frame by frame, not a screen recording, so the video is smooth whatever the
 * machine: the page runs on a fake clock that advances 1/fps per frame. Its
 * timers fire on that clock, and every CSS animation and transition is pinned
 * to it before the frame is captured. The music is mixed separately from the
 * same cue times, with the files and fades the wall itself uses.
 *
 * Writes graphics/out/stage/wall-day1.mp4.
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = join(ROOT, "graphics", "out", "stage");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const FPS = arg("fps", 25);
const PRESHOW = arg("preshow", 300); // seconds of the pre-show loop
const COUNTDOWN = arg("countdown", 120); // seconds of the countdown
const TALKS = arg("talks", Infinity); // how many talks of the block
const CLEAR = 4; // the clear wall before each walk-on
const LIVE = 8; // how long each talk stays live before the next one
const TAIL = 3;

const CHROME = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(CHROME)) {
  console.error("Could not find Chrome. Set CHROME_BIN.");
  process.exit(1);
}

execFileSync(process.execPath, [join(HERE, "build.mjs")], { stdio: "inherit" });
const stage = JSON.parse(readFileSync(join(ROOT, "content", "2026-stage.json"), "utf8"));
const { width: W, height: H } = stage.wall;
const DAY = "1";
const cues = stage.days[DAY].cues;

// Steps as stage/cues.js counts them: a talk is clear, walk-on, live.
const perTalk = stage.clearBeforeWalkon ? 3 : 2;
const preshowStep = cues.findIndex((c) => c.music === "preshow");
const countdownCue = cues.findIndex((c, i) => i > preshowStep && c.scene === "countdown");
if (preshowStep < 0 || countdownCue !== preshowStep + 1) {
  console.error("Expected the pre-show cue to be followed by the countdown on day one.");
  process.exit(1);
}
const talks = [];
for (let c = countdownCue + 1; c < cues.length && cues[c].scene === "talk"; c++) talks.push(cues[c].talk);
talks.splice(TALKS);

// The timeline, in seconds, and the key presses that make it.
const WALKON = stage.walkonSeconds || 20;
const presses = []; // times of → presses
let t = PRESHOW;
presses.push(t); // → countdown
t += COUNTDOWN;
const walkons = [];
for (let k = 0; k < talks.length; k++) {
  presses.push(t); // → clear
  if (stage.clearBeforeWalkon) {
    t += CLEAR;
    presses.push(t); // → walk-on; live follows by itself after WALKON
  }
  walkons.push(t);
  t += WALKON + LIVE;
}
const clearAt = PRESHOW + COUNTDOWN;
const END = t + TAIL;
const FRAMES = Math.round(END * FPS);

// Start the fake clock on a boundary of both loops (90 s pre-show, 60 s
// countdown), so the pre-show opens on "Welcome." and the countdown's
// sponsor breaks fall on its minutes.
const t0 = new Date();
t0.setHours(8, 25, 0, 0);
const START = Math.ceil(t0.getTime() / 180000) * 180000;

/* The fake clock, installed before the page's own scripts run. */
const CLOCK = `(() => {
  const RealDate = Date;
  let T = ${START};
  const timers = new Map();
  let seq = 0;
  class FakeDate extends RealDate {
    constructor(...a) { a.length ? super(...a) : super(T); }
    static now() { return T; }
  }
  window.Date = FakeDate;
  const perf0 = T;
  performance.now = () => T - perf0;
  const add = (fn, ms, every, args) => {
    const id = ++seq;
    timers.set(id, { fn, at: T + Math.max(0, ms || 0), every, args });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, 0, args);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, Math.max(1, ms || 0), args);
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  const started = new WeakMap();
  window.__advance = (ms) => {
    const until = T + ms;
    for (;;) {
      let next = null;
      for (const [id, x] of timers) if (x.at <= until && (!next || x.at < next[1].at)) next = [id, x];
      if (!next) break;
      const [id, x] = next;
      T = Math.max(T, x.at);
      if (x.every) x.at += x.every; else timers.delete(id);
      try { typeof x.fn === "function" ? x.fn(...x.args) : 0; } catch (e) { console.error(e); }
    }
    T = until;
    // Pin every animation to the fake clock: its age since it first appeared.
    for (const a of document.getAnimations()) {
      if (!started.has(a)) { started.set(a, T); a.pause(); }
      a.currentTime = T - started.get(a);
    }
    return T;
  };
})();`;

mkdirSync(OUT, { recursive: true });
const profile = join(tmpdir(), `cnd-export-${process.pid}`);
const PORT = 9400 + (process.pid % 200);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--window-size=${W},${H}`,
    "--hide-scrollbars",
    "--mute-audio",
    "--allow-file-access-from-files",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  // Its own process group, so cleanup takes Chrome's helper processes too.
  { stdio: "ignore", detached: true },
);
const cleanup = () => {
  try {
    process.kill(-chrome.pid, "SIGKILL");
  } catch {}
  rmSync(profile, { recursive: true, force: true });
};
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let k = 0; k < 50 && !target; k++) {
  await sleep(200);
  target = await fetch(`http://127.0.0.1:${PORT}/json`)
    .then((r) => r.json())
    .then((l) => l.find((x) => x.type === "page"))
    .catch(() => null);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  pending.get(m.id)?.(m);
  pending.delete(m.id);
};
await new Promise((r) => (ws.onopen = r));
const call = (method, params = {}) =>
  new Promise((r, j) => {
    pending.set(++id, (m) => (m.error ? j(new Error(`${method}: ${m.error.message}`)) : r(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const ev = async (expression) => (await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

await call("Page.enable");
await call("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await call("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK });
const url = `${pathToFileURL(join(HERE, "index.html")).href}?preview&day=${DAY}&step=${preshowStep}`;
await call("Page.navigate", { url });
// Wait for fonts and every portrait and logo, so no frame shows one loading.
for (let k = 0; k < 100; k++) {
  await sleep(100);
  if (await ev(`!!document.querySelector('.scenes section') && document.fonts.status === 'loaded'`)) break;
}
await ev(`Promise.all(Object.values(SHOW.talks).flatMap(t => t.speakers.map(s => s.portrait))
  .concat(SHOW.tiers.flatMap(t => t.sponsors.map(s => s.logo)), (SHOW.organizers || []).map(o => o.portrait))
  .filter(Boolean).map(src => { const i = new Image(); i.src = src; return i.decode().catch(() => {}); }))`);

const video = join(OUT, "wall-day1.video.mp4");
const ff = spawn(
  "ffmpeg",
  ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
   "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", video],
  { stdio: ["pipe", "inherit", "inherit"] },
);
const write = (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once("drain", r)));

const pressFrames = new Set(presses.map((s) => Math.round(s * FPS)));
const began = Date.now();
for (let f = 0; f < FRAMES; f++) {
  if (pressFrames.has(f)) await ev(`dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }))`);
  await ev(`__advance(${1000 / FPS})`);
  const { data } = await call("Page.captureScreenshot", { format: "jpeg", quality: 92 });
  await write(Buffer.from(data, "base64"));
  if (f % (FPS * 10) === 0) {
    const done = (f + 1) / FRAMES;
    const left = ((Date.now() - began) / done - (Date.now() - began)) / 60000;
    process.stdout.write(`\r  frame ${f + 1}/${FRAMES}  ${(done * 100).toFixed(0)}%  ~${left.toFixed(0)} min left   `);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
console.log();

/* The music, from the same times: the pre-show set from the first frame,
 * carrying on through the countdown, a 3 s fade on the first clear, then each
 * talk's walk-on theme. Nothing during a talk. */
const music = stage.music;
const set = music.sets[cues[preshowStep].music];
const XF = music.crossfade ?? 4;
const theme = (k) => music.walkon[k % music.walkon.length];
const talkIndex = (slug) => cues.slice(0, cues.findIndex((c) => c.talk === slug)).filter((c) => c.scene === "talk").length;
const inputs = [];
const filters = [];
// Enough tracks of the set to cover the pre-show and countdown.
let covered = 0;
const beds = [];
for (let k = 0; covered < clearAt + 5; k++) {
  const file = join(ROOT, set[k % set.length]);
  beds.push(file);
  covered += Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])) - XF;
}
beds.forEach((f) => inputs.push("-i", f));
let chain = "[0:a]";
for (let k = 1; k < beds.length; k++) {
  filters.push(`${chain}[${k}:a]acrossfade=d=${XF}[x${k}]`);
  chain = `[x${k}]`;
}
filters.push(`${chain}atrim=0:${clearAt + 3},afade=t=in:d=3,afade=t=out:st=${clearAt}:d=3[bed]`);
const mix = ["[bed]"];
// Each walk-on: its theme, and the announcement over it with the theme
// ducked, as the wall does it (music.announce in the stage file).
const VO = { delay: 1.2, duck: 0.3, volume: 1, ...music.announce };
const VOL = music.volume ?? 0.8;
const duration = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]));
let n = beds.length;
talks.forEach((slug, k) => {
  const ms = Math.round(walkons[k] * 1000);
  const voice = join(ROOT, "assets", "audio", "announce", `${slug}.mp3`);
  inputs.push("-i", join(ROOT, theme(talkIndex(slug))));
  const themeIn = n++;
  if (existsSync(voice)) {
    const a = VO.delay;
    const b = a + duration(voice);
    const d = 1 - VO.duck;
    // Theme gain over its own time: down in 0.35 s at the voice, back up over 1.2 s after it.
    const env = `if(lt(t,${a}),1,if(lt(t,${a + 0.35}),1-${d}*(t-${a})/0.35,if(lt(t,${b}),${VO.duck},if(lt(t,${b + 1.2}),${VO.duck}+${d}*(t-${b})/1.2,1))))`;
    filters.push(`[${themeIn}:a]volume='${env}':eval=frame,adelay=${ms}|${ms}[s${k}]`);
    inputs.push("-i", voice);
    const vms = Math.round((walkons[k] + a) * 1000);
    filters.push(`[${n++}:a]aformat=channel_layouts=stereo,volume=${VO.volume / VOL},adelay=${vms}|${vms}[v${k}]`);
    mix.push(`[s${k}]`, `[v${k}]`);
  } else {
    filters.push(`[${themeIn}:a]adelay=${ms}|${ms}[s${k}]`);
    mix.push(`[s${k}]`);
  }
});
filters.push(`${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=longest,apad,atrim=0:${END},volume=${VOL}[out]`);
const audio = join(OUT, "wall-day1.audio.m4a");
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-c:a", "aac", "-b:a", "192k", audio], { stdio: "inherit" });

const final = join(OUT, process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "wall-day1.mp4");
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-i", audio, "-c", "copy", "-shortest", "-movflags", "+faststart", final], { stdio: "inherit" });
rmSync(video);
rmSync(audio);

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
console.log(`${relative(ROOT, final)}  ${W}x${H} ${FPS} fps  ${mmss(END)}`);
console.log(`  0:00 pre-show · ${mmss(PRESHOW)} countdown · ${talks.map((s, k) => `${mmss(walkons[k])} walk-on ${s}`).join(" · ")}`);
console.log(`  rendered in ${mmss((Date.now() - began) / 1000)}`);
// The DevTools socket would keep node running; exit, which closes Chrome.
process.exit(0);
