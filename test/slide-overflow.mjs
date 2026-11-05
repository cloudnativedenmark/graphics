#!/usr/bin/env node
/**
 * Check every deck slide for content running outside the 1920×1080 stage.
 *
 *   node test/slide-overflow.mjs
 *
 * A slide that overflows looks fine in the editor and then clips on the
 * projector, which is a bad thing to discover live. This measures each slide's
 * actual laid-out content against the stage and fails on anything past it.
 *
 * Chrome has no scripting bridge here, so the measurement is injected as a
 * data: URL page that imports each deck, runs in the page, and prints a JSON
 * verdict to the console — captured via --dump-dom on a page that writes the
 * result into the DOM.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DECKS = join(ROOT, "decks");

/**
 * Locate Chrome. CHROME_BIN wins; otherwise try the usual places per platform.
 * Hardcoding the macOS path meant these scripts only ran on one machine.
 */
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

const STAGE_W = 1920;
const STAGE_H = 1080;
// A couple of px of slack: subpixel text metrics and the field's
// cells legitimately touch the edge.
const SLACK = 2;

/**
 * Runs inside the page. Every slide is temporarily made visible and unscaled so
 * its true layout can be measured, then restored.
 */
const PROBE = `
(() => {
  const deck = document.querySelector('.deck');
  deck.style.setProperty('--fit', '1');
  const out = [];
  document.querySelectorAll('.slide').forEach((slide, i) => {
    const wasActive = slide.hasAttribute('data-active');
    slide.setAttribute('data-active', '');
    const prevOverflow = slide.style.overflow;
    // The stage clips by design; unclip to see what would have been cut.
    slide.style.overflow = 'visible';

    const stage = slide.getBoundingClientRect();
    let worst = null;
    slide.querySelectorAll('*').forEach((el) => {
      if (!el.getClientRects().length) return;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') return;
      const r = el.getBoundingClientRect();
      const over = {
        right: r.right - stage.right,
        bottom: r.bottom - stage.bottom,
        left: stage.left - r.left,
        top: stage.top - r.top,
      };
      // The honeycomb field bleeds off the edges on purpose.
      if (el.closest('.field')) return;
      const max = Math.max(over.right, over.bottom, over.left, over.top);
      if (max > (worst?.amount ?? -Infinity)) {
        worst = {
          amount: max,
          side: Object.keys(over).reduce((a, b) => (over[a] > over[b] ? a : b)),
          tag: el.tagName.toLowerCase(),
          cls: el.className && String(el.className).slice(0, 40),
          text: (el.textContent || '').trim().slice(0, 48),
        };
      }
    });

    out.push({
      index: i + 1,
      layout: slide.dataset.layout ?? '(none)',
      w: Math.round(stage.width),
      h: Math.round(stage.height),
      scrollW: slide.scrollWidth,
      scrollH: slide.scrollHeight,
      worst,
    });

    slide.style.overflow = prevOverflow;
    if (!wasActive) slide.removeAttribute('data-active');
  });
  const el = document.createElement('pre');
  el.id = 'overflow-result';
  el.textContent = JSON.stringify(out);
  document.body.append(el);
})();
`;

function measure(deckDir) {
  const src = join(DECKS, deckDir, "index.html");
  const html = readFileSync(src, "utf8").replace(
    "</body>",
    `<script>${PROBE}</script></body>`,
  );
  // The probe copy sits beside the original so relative asset paths resolve.
  const probeFile = join(DECKS, deckDir, ".overflow-probe.html");
  writeFileSync(probeFile, html);
  try {
    const dom = execFileSync(
      CHROME,
      [
        "--headless",
        "--disable-gpu",
        `--window-size=${STAGE_W},${STAGE_H}`,
        "--virtual-time-budget=6000",
        "--dump-dom",
        `file://${probeFile}`,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
    const m = dom.match(/<pre id="overflow-result">([\s\S]*?)<\/pre>/);
    if (!m) throw new Error("probe did not report");
    return JSON.parse(decodeEntities(m[1]));
  } finally {
    rmSync(probeFile, { force: true });
  }
}

const decodeEntities = (s) =>
  s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&amp;", "&");

// ---------------------------------------------------------------------------

const decks = readdirSync(DECKS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "shared")
  .map((d) => d.name)
  .sort();

let failures = 0;
let slides = 0;

for (const deck of decks) {
  console.log(`\n=== ${deck} ===`);
  const results = measure(deck);
  for (const r of results) {
    slides++;
    const wrongSize = r.w !== STAGE_W || r.h !== STAGE_H;
    const over = r.worst && r.worst.amount > SLACK ? r.worst : null;
    const bad = wrongSize || over;
    failures += bad ? 1 : 0;
    const label = `  ${String(r.index).padStart(2)} ${r.layout.padEnd(11)}`;
    if (wrongSize) {
      console.log(`${label} FAIL stage is ${r.w}×${r.h}, expected ${STAGE_W}×${STAGE_H}`);
    } else if (over) {
      console.log(
        `${label} FAIL ${Math.round(over.amount)}px past ${over.side} ` +
          `— <${over.tag} class="${over.cls}"> "${over.text}"`,
      );
    } else {
      console.log(`${label} ok`);
    }
  }
}

console.log(
  `\n${slides} slide(s) across ${decks.length} deck(s); slack ${SLACK}px`,
);
if (failures) {
  console.log(`${failures} slide(s) overflow the stage`);
  process.exit(1);
}
console.log("no slide overflows the stage");
