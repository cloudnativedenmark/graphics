#!/usr/bin/env node
/**
 * Render a prize voucher: one A4 page, printed once per prize.
 *
 *   node graphics/build-prize-voucher.mjs
 *   node graphics/build-prize-voucher.mjs --redeem "ardanlabs.com/redeem"
 *
 * Built for the five Ardan Labs Mastery Bundles, printed in A4 like the CNCF
 * gift cards: the same card family as the stamp card (navy, lockup,
 * honeycomb in the lower right) with the prize sponsor's logo on a white
 * hexagon. The card is designed at A6 and scaled 2x onto A4, which is the
 * same shape to within a millimetre.
 *
 * The code box is left empty to write each code in by hand, so no codes
 * live in the repo. Until --redeem is given, the redeem line prints TODO,
 * highlighted, so a draft can't pass for final.
 *
 * Output in graphics/out/prize-voucher/:
 *   ardan-labs-mastery.pdf   one A4 page; print one copy per prize
 *   ardan-labs-mastery.png   preview
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "graphics", "out", "prize-voucher");
const SLUG = "ardan-labs-mastery";

/* The prize. Facts from ardanlabs.com/training/self-paced/individuals/bundles/mastery/
 * as of 2026-11-20; that page calls it the "Go, Rust, Docker & K8s Bundle". */
const PRIZE = {
  sponsor: "Ardan Labs",
  logo: "assets/sponsors/ardan-labs.svg",
  eyebrow: "Congratulations, you won",
  title: ["Mastery", "Bundle."],
  body:
    "Every Go, Rust, Docker and Kubernetes module from Ardan Labs. " +
    "Over 227 hours of self-paced training.",
};

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
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
    "/snap/bin/chromium",
  ];
  for (const path of candidates) if (existsSync(path)) return path;
  console.error("Could not find Chrome. Install it, or set CHROME_BIN.");
  process.exit(1);
}
const CHROME = findChrome();

const redeem = arg("redeem");

// A6 trim, bleed and safe margin; page sized in whole pixels (see stamp card).
const TRIM_W = 105;
const TRIM_H = 148;
const BLEED = 3;
const SAFE = 7;
const PX = 96 / 25.4;
const PAGE_W = Math.ceil((TRIM_W + BLEED * 2) * PX) / PX;
const PAGE_H = Math.ceil((TRIM_H + BLEED * 2) * PX) / PX;

/* The field's true hexagon, the same path as the wall, decks and stamp card. */
const HEX_D =
  "M 974.382812 895.261719 C 991.835938 885.179688 1005.988281 860.671875 1005.988281 840.515625 L 1005.988281 333.214844 C 1005.988281 313.058594 991.835938 288.550781 974.382812 278.46875 L 535.046875 24.820312 C 517.59375 14.742188 489.289062 14.742188 471.835938 24.820312 L 32.5 278.46875 C 15.042969 288.550781 0.894531 313.058594 0.894531 333.214844 L 0.894531 840.515625 C 0.894531 860.671875 15.042969 885.179688 32.5 895.261719 L 471.835938 1148.910156 C 489.289062 1158.988281 517.59375 1158.988281 535.046875 1148.910156 Z";
const HEX_VB = { x: 0.894, y: 17.3, w: 1005.1, h: 1139.1 };
const HEX_RATIO = HEX_VB.w / HEX_VB.h;

// The sponsor's white hexagon, in trim mm.
const BADGE = { x: 70, y: 50, w: 28 };
BADGE.h = BADGE.w / HEX_RATIO;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const asset = (p) => `../../../${p}`;

/** The honeycomb in the lower right, clear of the copy column and the badge. */
function field() {
  const rand = rng(2027);
  const tints = ["var(--cnd-rose)", "var(--cnd-peach)", "var(--cnd-slate)"];
  const h = 15;
  const gap = 1.5;
  const w = h * HEX_RATIO;
  const dx = w + gap;
  const dy = h * 0.75 + gap * 0.87;
  const off = (PAGE_W - TRIM_W) / 2; // trim → page
  const cells = [];
  for (let r = -1; r * dy < PAGE_H + h; r++) {
    const shift = r % 2 ? dx / 2 : 0;
    for (let c = -1; c * dx < PAGE_W + w; c++) {
      const cx = c * dx + shift;
      const cy = r * dy + h / 2;
      const d = Math.min(1, Math.max(0, (cx / PAGE_W) * 1.3 + (cy / PAGE_H) * 0.9 - 1.35) * 1.8);
      if (rand() >= d) continue;
      const o = (0.35 + rand() * 0.5) * (0.5 + 0.5 * d);
      const tint = tints[Math.floor(rand() * tints.length)];
      const [l, t] = [cx - w / 2 - off, cy - h / 2 - off]; // cell's top-left in trim mm
      if (l < 72) continue; // the copy column and the code box
      if (l < BADGE.x + BADGE.w + 1 && t < BADGE.y + BADGE.h + 1 && t + h > BADGE.y - 1) continue;
      const k = h / HEX_VB.h;
      cells.push(
        `<path d="${HEX_D}" fill="${tint}" opacity="${o.toFixed(2)}" ` +
          `transform="translate(${(cx - w / 2).toFixed(2)} ${(cy - h / 2).toFixed(2)}) scale(${k.toFixed(5)}) translate(${-HEX_VB.x} ${-HEX_VB.y})"/>`,
      );
    }
  }
  return `<svg class="cells" viewBox="0 0 ${PAGE_W} ${PAGE_H}">${cells.join("")}</svg>`;
}

const cells = field();

const card = () => `
<section class="side">
  ${cells}
  <div class="trim">
    <div class="lockup">
      <img class="wordmark" src="${asset("brand/logo/cnd-lockup-cream.svg")}" alt="Cloud Native Denmark">
      <img class="mark" src="${asset("brand/logo/cnd-mark.svg")}" alt="">
    </div>
    <p class="when">19–20 Nov 2026 · Copenhagen</p>
    <div class="badge">
      <svg viewBox="${HEX_VB.x} ${HEX_VB.y} ${HEX_VB.w} ${HEX_VB.h}"><path d="${HEX_D}" fill="var(--cnd-white)"/></svg>
      <img src="${asset(PRIZE.logo)}" alt="${esc(PRIZE.sponsor)}">
    </div>
    <div class="copy">
      <p class="eyebrow">${esc(PRIZE.eyebrow)}</p>
      <h1 class="display">${PRIZE.title.map(esc).join("<br>")}</h1>
      <p class="body">${esc(PRIZE.body)}</p>
    </div>
    <div class="code">
      <span>Your code</span>
      <b></b>
    </div>
    <p class="redeem">Redeem at ${redeem ? `<b>${esc(redeem)}</b>` : `<mark>TODO</mark>`}</p>
  </div>
</section>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Prize voucher · ${esc(PRIZE.sponsor)} · Cloud Native Denmark</title>
<link rel="stylesheet" href="${asset("brand/tokens.css")}">
<style>
  @page { size: ${Math.round(PAGE_W * PX)}px ${Math.round(PAGE_H * PX)}px; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .side {
    position: relative;
    width: ${Math.round(PAGE_W * PX)}px;
    height: ${Math.round(PAGE_H * PX)}px;
    overflow: hidden;
    break-after: page;
    /* Space Grotesk only: Chrome embeds variable Inter as Type 3. */
    font-family: var(--cnd-font-display);
    background: var(--cnd-navy);
    color: var(--cnd-sand);
  }
  .side:last-of-type { break-after: auto; }
  .trim { position: absolute; left: ${(PAGE_W - TRIM_W) / 2}mm; top: ${(PAGE_H - TRIM_H) / 2}mm; width: ${TRIM_W}mm; height: ${TRIM_H}mm; }
  .cells { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

  /* The wordmark with the mark at its upper right. Never re-typeset. */
  .lockup { position: absolute; left: ${SAFE}mm; top: 13mm; width: 40mm; aspect-ratio: 1511.728 / 870.581; }
  .lockup img { position: absolute; display: block; }
  .lockup .wordmark { inset: 0; width: 100%; height: 100%; }
  .lockup .mark { left: 83.03%; top: -18.75%; width: 42.07%; height: 70%; object-fit: contain; }
  .when {
    position: absolute; left: ${SAFE}mm; top: 40mm; margin: 0;
    font-weight: 500; font-size: 2.4mm; letter-spacing: var(--cnd-track-eyebrow); text-transform: uppercase;
  }

  /* Sponsor logo: contained, never cropped, on a white hexagon. */
  .badge { position: absolute; left: ${BADGE.x}mm; top: ${BADGE.y}mm; width: ${BADGE.w}mm; height: ${BADGE.h.toFixed(2)}mm; }
  .badge svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .badge img { position: absolute; left: 20%; top: 20%; width: 60%; height: 60%; object-fit: contain; }

  .copy { position: absolute; left: ${SAFE}mm; top: 56mm; width: 60mm; }
  .eyebrow {
    font-weight: 500; font-size: 2.5mm; letter-spacing: var(--cnd-track-eyebrow);
    text-transform: uppercase; color: var(--cnd-rose); margin: 0 0 2.2mm;
  }
  .display {
    font-weight: 700; font-size: 10.5mm; line-height: 0.948; letter-spacing: -0.015em;
    text-transform: uppercase; margin: 0;
  }
  .body { font-size: 3.2mm; line-height: 1.35; margin: 4.5mm 0 0; }

  .code {
    position: absolute; left: ${SAFE}mm; top: 112mm; width: 62mm; height: 14mm;
    border: 0.35mm solid var(--cnd-sand); border-radius: 1.5mm;
    padding: 1.6mm 2.4mm;
  }
  .code span {
    display: block; font-weight: 500; font-size: 2.2mm;
    letter-spacing: var(--cnd-track-eyebrow); text-transform: uppercase; color: var(--cnd-peach);
  }
  .code b { display: block; margin-top: 1.4mm; font-weight: 700; font-size: 4.4mm; letter-spacing: 0.04em; }
  .redeem { position: absolute; left: ${SAFE}mm; bottom: ${SAFE}mm; margin: 0; font-size: 2.9mm; }
  .redeem b { font-weight: 700; }
  .redeem mark { background: var(--cnd-peach); color: var(--cnd-navy); padding: 0 1mm; font-weight: 700; }
</style>
</head>
<body>
${card()}
</body>
</html>
`;

mkdirSync(OUT, { recursive: true });
const common = ["--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--hide-scrollbars"];
const print = (htmlText, name) => {
  const page = join(OUT, `.${name}.html`);
  writeFileSync(page, htmlText);
  const pdf = join(OUT, `${name}.pdf`);
  execFileSync(CHROME, [...common, "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, `file://${page}`], { stdio: "ignore" });
  rmSync(page);
  console.log(`  ${pdf}`);
};

const A4 = { w: 210, h: 297 };
const ZOOM = 2;
const a4 = html
  .replace(/@page \{[^}]*\}/, `@page { size: A4; margin: 0; }`)
  .replace(
    "</style>",
    `  html, body { width: ${A4.w}mm; height: ${A4.h}mm; overflow: hidden; background: var(--cnd-navy); }
  /* Trim edge on the page edge, centred vertically; the bleed falls outside. */
  .side { position: absolute; transform-origin: 0 0; transform: scale(${ZOOM});
          left: ${-((PAGE_W - TRIM_W) / 2) * ZOOM}mm;
          top: ${(A4.h - TRIM_H * ZOOM) / 2 - ((PAGE_H - TRIM_H) / 2) * ZOOM}mm; }
</style>`,
  );
print(a4, SLUG);

/* Preview at 150 dpi. */
const DPI = 150;
const scale = DPI / 96;
const preview = join(OUT, ".preview.html");
writeFileSync(preview, a4);
const png = join(OUT, `${SLUG}.png`);
execFileSync(
  CHROME,
  [
    ...common,
    `--force-device-scale-factor=${scale}`,
    `--window-size=${Math.round(A4.w * PX)},${Math.round(A4.h * PX)}`,
    "--virtual-time-budget=3000",
    `--screenshot=${png}`,
    `file://${preview}`,
  ],
  { stdio: "ignore" },
);
rmSync(preview);
console.log(`  ${png}`);
