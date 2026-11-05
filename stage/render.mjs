#!/usr/bin/env node
/**
 * Render every cue of the LED wall show to a 1:1 PNG.
 *
 *   node stage/render.mjs            both days, both rooms, plus a guides frame
 *   node stage/render.mjs --day 1    one day
 *
 * Main-stage stills are d1-…, the breakout screen's (1920×1080) b1-….
 *
 * Writes graphics/out/stage/. These are for review, and as the static
 * fallback the AV vendor keeps loaded in case playback fails — every scene
 * must exist as a still as well as in motion.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = join(ROOT, "graphics", "out", "stage");

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
  for (const path of candidates) if (existsSync(path)) return path;
  console.error("Could not find Chrome. Install it, or set CHROME_BIN.");
  process.exit(1);
}
const CHROME = findChrome();

execFileSync(process.execPath, [join(HERE, "build.mjs")], { stdio: "inherit" });

const stage = JSON.parse(readFileSync(join(ROOT, "content", "2026-stage.json"), "utf8"));
const content = JSON.parse(readFileSync(join(ROOT, "content", "2026-announcements.json"), "utf8"));
const SIZES = { main: [stage.wall.width, stage.wall.height], breakout: [1920, 1080] };

const onlyDay = process.argv.includes("--day") ? process.argv[process.argv.indexOf("--day") + 1] : null;
mkdirSync(OUT, { recursive: true });

const slugify = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const nameOf = (slug) => {
  const t = [...content.keynotes, ...(content.sessions ?? [])].find((k) => k.slug === slug);
  // Stage-only items (welcome, wrap-up) have no announcement; the slug says enough.
  return t ? slugify(t.body.split("||")[1].split("|")[0]) : slug;
};

function shoot(query, file, room = "main") {
  const [W, H] = SIZES[room];
  const url = `${pathToFileURL(join(HERE, "index.html")).href}?output&still&room=${room}&${query}`;
  const target = join(OUT, file);
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      `--window-size=${W},${H}`,
      "--virtual-time-budget=5000",
      `--screenshot=${target}`,
      url,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  console.log(`${relative(ROOT, target)}  ${W}x${H}`);
}

for (const [day, d] of Object.entries(stage.days)) for (const room of ["main", "breakout"]) {
  if (onlyDay && day !== onlyDay) continue;
  const cues = (room === "breakout" ? d.breakout : d.cues) ?? [];
  const prefix = room === "breakout" ? "b" : "d";
  let i = 0;
  cues.forEach((cue, c) => {
    const states = cue.scene === "talk" ? [...(stage.clearBeforeWalkon ? ["clear"] : []), "walkon", "live"] : [null];
    const clock = cue.scene === "countdown" ? `&clock=${cue.at.split(":")[0] - 1}:55:00` : "";
    // A looping cue gets one still per scene in its loop, same step number.
    if (cue.loop?.length) {
      for (const scene of cue.loop)
        shoot(`day=${day}&step=${i}&scene=${scene}${clock}`, `${prefix}${day}-${String(i).padStart(2, "0")}-${cue.scene}-${scene}.png`, room);
      i++;
      return;
    }
    for (const state of states) {
      const label = cue.scene === "talk" ? `${state}-${nameOf(cue.talk)}` : cue.scene === "pitch" ? `pitch-${slugify(cue.sponsor)}` : cue.scene;
      shoot(`day=${day}&step=${i}${clock}`, `${prefix}${day}-${String(i).padStart(2, "0")}-${label}.png`, room);
      i++;
    }
  });
}

// One frame with the guides on, for the vendor call: cabinets, zones, and the
// bottom row that may be hidden on the night.
shoot("day=1&step=4&guides", "guides-live.png");
