#!/usr/bin/env node
/**
 * Build the break decks: one per break per room, from the schedule.
 *
 *   node decks/build-breaks.mjs                    every break, HTML and PDF
 *   node decks/build-breaks.mjs day2-main-1550     just these (HTML and PDF)
 *   node decks/build-breaks.mjs --html             HTML only, no printing
 *   node decks/build-breaks.mjs --pptx             then PowerPoint for Slides
 *
 * Runs stage/build.mjs first, so a re-synced schedule (stage/sync-schedule.mjs)
 * or an edit to content/ flows straight through. Writes
 * decks/breaks/<day>-<room>-<HHMM>.html and .pdf, named for the time the
 * room is back. Decks for breaks no longer on the schedule are removed.
 *
 * Every deck is the same run, in this order:
 *   Back at       when, and what starts then in every room, this one first
 *   Rate          one per talk in this room since the last break
 *   Tonight       the sponsor crawl and afterparty, on a day that has them
 *   Sponsors, Up next, Post it, Community, Photos
 *
 * Talk, sponsor and QR slides are filled at runtime by shared/deck.js from
 * stage/show.data.js, like the other decks; this script only decides which
 * slides a break gets and writes the "Back at" copy.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "decks", "breaks");

const args = process.argv.slice(2);
const htmlOnly = args.includes("--html");
const pptx = args.includes("--pptx");
const only = new Set(args.filter((a) => !a.startsWith("--")));

execFileSync(process.execPath, [join(ROOT, "stage", "build.mjs")], { stdio: "inherit" });
const src = readFileSync(join(ROOT, "stage", "show.data.js"), "utf8");
const SHOW = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));

// The rooms with a screen get a deck; the workshop room is only listed.
const SCREENS = { "Main stage": "main", Breakout: "breakout" };
const NEXT_HERE = { "Main stage": "Next on the main stage", Breakout: "Next in the breakout room" };
const UP_NEXT = { "Main stage": "Up next on the main stage", Breakout: "Up next in the breakout room" };
const ELSEWHERE = { "Main stage": "On the main stage", Breakout: "In the breakout room", Workshop: "In the workshop room" };
const ROOM_ORDER = ["Main stage", "Breakout", "Workshop"];
// The hosts' welcome, wrap-ups and remarks are not rated (shared/deck.js).
const NOT_TALKS = new Set(["Welcome", "Wrap-up", "Remarks"]);
const isBreak = (p) => p.service && /coffee break|lunch/i.test(p.title);

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const names = (t) => {
  const n = t.speakers.map((s) => s.name);
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} & ${n.at(-1)}` : (n[0] ?? "");
};

const talks = SHOW.programme.filter((p) => p.talk).map((p) => ({ ...p, t: SHOW.talks[p.talk] }));
const decks = [];

for (const day of [...new Set(SHOW.programme.map((p) => p.day))].sort()) {
  const breaks = SHOW.programme.filter((p) => p.day === day && isBreak(p)).sort((a, b) => a.start.localeCompare(b.start));
  const today = talks.filter((p) => p.day === day);
  const crawl = SHOW.programme.find((p) => p.day === day && p.service && /sponsor crawl/i.test(p.title));
  const party = SHOW.programme.find((p) => p.day === day && p.service && /after ?party/i.test(p.title));

  for (const [room, key] of Object.entries(SCREENS)) {
    let since = "00:00";
    for (const br of breaks) {
      const back = br.end;
      const next = today.filter((p) => p.start === back).sort((a, b) => ROOM_ORDER.indexOf(a.room) - ROOM_ORDER.indexOf(b.room));
      const here = next.find((p) => p.room === room);
      const rated = today.filter(
        (p) => p.room === room && p.start >= since && p.end <= br.start && !NOT_TALKS.has(p.t.kind),
      );
      since = br.end;
      if (!here) continue; // nothing in this room after the break: no deck
      decks.push({
        name: `day${day}-${key}-${back.replace(":", "")}`,
        day,
        room,
        br,
        here,
        others: next.filter((p) => p !== here),
        rated,
        tonight: crawl && party ? { crawl, party } : null,
      });
    }
  }
}

function backSlide(d) {
  const item = (eyebrow, p, first) =>
    `<div><p class="eyebrow">${esc(eyebrow)} · ${esc(p.start)}</p>` +
    `<p class="talk-title"${first ? ' data-fit="300"' : ""}>${esc(p.t.title)}</p>` +
    `<p class="who">${esc(names(p.t))}</p></div>`;
  const label = /lunch/i.test(d.br.title) ? "Lunch" : "Coffee break";
  return `<section class="slide" data-layout="back">
  <div class="pad">
    <div>
      <p class="eyebrow">${label}</p>
      <h2 class="display">Back at<br>${esc(d.br.end)}.</h2>
    </div>
    <div class="next">
      ${[item(NEXT_HERE[d.room], d.here, true), ...d.others.map((p) => item(ELSEWHERE[p.room], p, false))].join("\n      ")}
    </div>
  </div>
</section>`;
}

const rateSlide = (p) => `<section class="slide" data-layout="rate" data-talk="${esc(p.talk)}">
  <div class="pad">
    <div>
      <p class="eyebrow">Rate the session</p>
      <h2 class="display">How was it?</h2>
      <p class="body"></p>
    </div>
    <div class="qr"></div>
  </div>
</section>`;

const tonightSlide = ({ crawl, party }) => `<section class="slide" data-layout="logistics" data-field="quiet" data-source="afterparty">
  <div class="pad">
    <p class="eyebrow">Tonight</p>
    <h2 class="display">Sponsor crawl,<br>then party.</h2>
    <dl class="kv tonight">
      <dt>${esc(crawl.start)}</dt><dd>Sponsor crawl: visit the booths</dd>
      <dt>${esc(party.start)}</dt><dd>Afterparty until ${esc(party.end)}, in your ticket</dd>
    </dl>
  </div>
</section>`;

// The LinkedIn logo in one colour (white), as LinkedIn's brand rules allow.
const LINKEDIN =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z";

function page(d) {
  const title = `Day ${d.day} · ${d.room} · ${/lunch/i.test(d.br.title) ? "Lunch" : "Coffee break"} until ${d.br.end}`;
  const slides = [
    backSlide(d),
    ...d.rated.map(rateSlide),
    ...(d.day === "1" && d.tonight ? [tonightSlide(d.tonight)] : []),
    `<section class="slide" data-layout="sponsors" data-source="sponsors">
  <div class="pad">
    <p class="eyebrow">Who makes it possible</p>
    <h2 class="heading">Thank you, sponsors</h2>
  </div>
</section>`,
    `<section class="slide" data-layout="speaker" data-talk="${esc(d.here.talk)}" data-eyebrow="${esc(UP_NEXT[d.room])} · ${esc(d.here.start)}"></section>`,
    `<section class="slide" data-layout="logistics" data-field="quiet">
  <svg class="social-logo" viewBox="0 0 24 24" role="img" aria-label="LinkedIn"><path d="${LINKEDIN}"/></svg>
  <div class="pad">
    <p class="eyebrow">Sharing is caring</p>
    <h2 class="display">Post it.</h2>
    <dl class="kv">
      <dt>Where</dt><dd>LinkedIn</dd>
      <dt>Hashtags</dt><dd>#CNDenmark · #CloudNativeDenmark</dd>
      <dt>Win</dt><dd>Three best posts win, drawn on day two</dd>
    </dl>
  </div>
</section>`,
    `<section class="slide" data-layout="sponsors" data-source="community">
  <div class="pad">
    <p class="eyebrow">Community sponsors &amp; partners</p>
    <h2 class="heading">Thank you, community</h2>
  </div>
</section>`,
    `<section class="slide" data-layout="rate">
  <div class="pad">
    <div>
      <p class="eyebrow">Photos from today</p>
      <h2 class="display">Find yourself.</h2>
      <p class="body">Our photographers upload all day. Scan to browse, download and post.</p>
    </div>
    <div class="qr" data-qr="photos" data-label="Conference photos"></div>
  </div>
</section>`,
  ];
  return `<!doctype html>
<!-- GENERATED by decks/build-breaks.mjs from the schedule — do not edit.
     Change content/ (or Sessionize, then stage/sync-schedule.mjs) and
     run the script again. -->
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)} · Cloud Native Denmark 2026</title>
<link rel="stylesheet" href="../../brand/tokens.css">
<link rel="stylesheet" href="../shared/cnd-deck.css">
</head>
<body class="deck" data-deck-title="${esc(title)}">

${slides.join("\n\n")}

<script src="../../stage/show.data.js"></script>
<script src="../shared/deck.js"></script>
</body>
</html>
`;
}

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error("Could not find Chrome. Install it, or set CHROME_BIN.");
    process.exit(1);
  }
  return found;
}

// A full build owns decks/breaks/: anything not on the schedule any more goes.
if (!only.size) {
  const keep = new Set(decks.map((d) => d.name));
  for (const f of readdirSync(OUT)) {
    const m = f.match(/^(day\d-[a-z]+-\d{4})\.(html|pdf)$/);
    if (m && !keep.has(m[1])) {
      rmSync(join(OUT, f));
      console.log(`removed  decks/breaks/${f} (no longer on the schedule)`);
    }
  }
}

const unknown = [...only].filter((n) => !decks.some((d) => d.name === n));
if (unknown.length) {
  console.error(`No such break: ${unknown.join(", ")}. On the schedule: ${decks.map((d) => d.name).join(", ")}`);
  process.exit(1);
}

const chrome = htmlOnly ? null : findChrome();
for (const d of decks.filter((d) => !only.size || only.has(d.name))) {
  const html = join(OUT, `${d.name}.html`);
  writeFileSync(html, page(d));
  for (const p of d.rated) if (!p.t.feedback) console.warn(`  warning: ${p.talk} has no feedback QR (content/2026-qr.json)`);
  if (chrome) {
    execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--no-pdf-header-footer",
        "--virtual-time-budget=10000",
        `--print-to-pdf=${join(OUT, `${d.name}.pdf`)}`,
        `file://${html}`,
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );
  }
  const slides = 1 + d.rated.length + (d.day === "1" && d.tonight ? 1 : 0) + 5;
  console.log(`${d.name}  ${slides} slides  ${d.room}, back at ${d.br.end} → ${d.here.t.title}`);
}

if (pptx) {
  const names = decks.filter((d) => !only.size || only.has(d.name)).map((d) => d.name);
  // The venv from requirements.txt has pdfplumber, pikepdf and python-pptx.
  const venv = join(ROOT, ".venv", "bin", "python");
  const python = existsSync(venv) ? venv : "python3";
  execFileSync(python, [join(ROOT, "decks", "breaks-to-pptx.py"), ...names], { stdio: "inherit" });
}
