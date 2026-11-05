#!/usr/bin/env node
/**
 * Render the sponsor booth stamp card: A6, two sides, print-ready.
 *
 *   node graphics/build-stamp-card.mjs
 *
 * Attendees collect a stamp (or a dot) at every sponsor booth, write their
 * name on the back, and hand the full card in at the registration
 * desk to be in the draw on day two.
 *
 * Output in graphics/out/stamp-card/:
 *   stamp-card.pdf          two pages, 105×148 mm trim plus 3 mm bleed
 *   stamp-card-marks.pdf    the same with crop marks, for a print shop
 *   stamp-card-front.png    previews, trimmed to the A6 edge
 *   stamp-card-back.png
 *
 * The booths are the sponsors in content/2026-announcements.json, minus the
 * tiers in NO_BOOTH, so moving a sponsor in the content file moves it here,
 * then the partners in PARTNER_BOOTHS.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "graphics", "out", "stamp-card");

/**
 * Locate Chrome. CHROME_BIN wins; otherwise try the usual places per platform.
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

// The afterparty sponsor hosts the party, not a booth.
const NO_BOOTH = new Set(["Afterparty"]);

const content = JSON.parse(
  readFileSync(join(ROOT, "content", "2026-announcements.json"), "utf8"),
);
// The charity partner has a booth too, with the round logo from their site.
const PARTNER_BOOTHS = [{ name: "Hack Your Future Denmark", logo: "assets/partners/hyf-logo-round.svg", tall: true }];
const booths = [...content.sponsors.filter((s) => !NO_BOOTH.has(s.tier)), ...PARTNER_BOOTHS];

// A6 trim, the bleed the printer wants, and the margin text stays inside.
const TRIM_W = 105;
const TRIM_H = 148;
const BLEED = 3;
const SAFE = 7;
// Chrome rounds the PDF page up to whole CSS pixels, so a page sized in mm
// came out a fraction larger than the background and left a white hairline
// on the right and bottom edges. Size the page in whole pixels and paint to it.
const PX = 96 / 25.4;
const PAGE_W = Math.ceil((TRIM_W + BLEED * 2) * PX) / PX;
const PAGE_H = Math.ceil((TRIM_H + BLEED * 2) * PX) / PX;

/* The field's true hexagon, the same path and ink box as the wall and decks
 * (stage.js, decks/shared/deck.js). Pointy-top; it tiles as a honeycomb. */
const HEX_D =
  "M 974.382812 895.261719 C 991.835938 885.179688 1005.988281 860.671875 1005.988281 840.515625 L 1005.988281 333.214844 C 1005.988281 313.058594 991.835938 288.550781 974.382812 278.46875 L 535.046875 24.820312 C 517.59375 14.742188 489.289062 14.742188 471.835938 24.820312 L 32.5 278.46875 C 15.042969 288.550781 0.894531 313.058594 0.894531 333.214844 L 0.894531 840.515625 C 0.894531 860.671875 15.042969 885.179688 32.5 895.261719 L 471.835938 1148.910156 C 489.289062 1158.988281 517.59375 1158.988281 535.046875 1148.910156 Z";
const HEX_VB = { x: 0.894, y: 17.3, w: 1005.1, h: 1139.1 };
const HEX_RATIO = HEX_VB.w / HEX_VB.h;
const hexViewBox = `${HEX_VB.x} ${HEX_VB.y} ${HEX_VB.w} ${HEX_VB.h}`;

// Seeded, so the card is the same every build.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// Paths in the HTML are relative to graphics/out/stamp-card/.
const asset = (p) => `../../../${p}`;

/* ── front: the honeycomb bleeding off the lower right ─────────────────── */

function frontField() {
  const rand = rng(2026);
  const tints = ["var(--cnd-rose)", "var(--cnd-peach)", "var(--cnd-slate)"];
  const h = 17;
  const gap = 1.5;
  const w = h * HEX_RATIO;
  const dx = w + gap;
  const dy = h * 0.75 + gap * 0.87;
  const cells = [];
  for (let r = -1; r * dy < PAGE_H + h; r++) {
    const off = r % 2 ? dx / 2 : 0;
    for (let c = -1; c * dx < PAGE_W + w; c++) {
      const cx = c * dx + off;
      const cy = r * dy + h / 2;
      // Denser towards the lower right corner.
      const d = Math.min(1, Math.max(0, (cx / PAGE_W) * 1.3 + (cy / PAGE_H) * 0.9 - 1.4) * 1.8);
      if (rand() >= d) continue;
      const o = (0.35 + rand() * 0.5) * (0.5 + 0.5 * d);
      const tint = tints[Math.floor(rand() * tints.length)];
      // Clear of the steps, which run to about 67 mm across the page.
      if (cx - w / 2 < 71 && cy - h / 2 < 134) continue;
      const k = h / HEX_VB.h;
      cells.push(
        `<path d="${HEX_D}" fill="${tint}" opacity="${o.toFixed(2)}" ` +
          `transform="translate(${(cx - w / 2).toFixed(2)} ${(cy - h / 2).toFixed(2)}) scale(${k.toFixed(5)}) translate(${-HEX_VB.x} ${-HEX_VB.y})"/>`,
      );
    }
  }
  // One page-sized SVG, in mm, that clips its own cells. Cells as separate
  // elements hanging past the edge made Chrome shrink the whole PDF page to
  // fit them, overflow: hidden or not.
  return `<svg class="cells" viewBox="0 0 ${PAGE_W} ${PAGE_H}">${cells.join("")}</svg>`;
}

/* ── back: one white hexagon per booth, logo on top, room for the stamp ── */

function honeycomb() {
  // Rows of 4 and 3 interlock when the booths come out even that way (7, 11,
  // 14…). Otherwise every row holds 4 and every other row is shifted half a
  // tile, which costs some tile size, so no booth is left alone on a row.
  const perRow = 4;
  const gap = 2.4;
  const alternate = [0, perRow].includes(booths.length % (perRow * 2 - 1));
  // The tiles fill the card's width, short of the trim by the bleed's worth.
  const span = perRow + (alternate ? 0 : 0.5);
  const w = (TRIM_W - BLEED * 2 - gap * (span - 1)) / span;
  const h = w / HEX_RATIO;
  const dx = w + gap;
  const dy = h * 0.75 + gap * 0.87;
  const rows = [];
  for (let i = 0, r = 0; i < booths.length; r++) {
    const n = alternate && r % 2 ? perRow - 1 : perRow;
    rows.push(booths.slice(i, i + n));
    i += n;
  }
  const tiles = rows.flatMap((row, r) =>
    row.map((s, c) => {
      const left = alternate
        ? (TRIM_W - (row.length * dx - gap)) / 2 + c * dx
        : (TRIM_W - (span * dx - gap)) / 2 + c * dx + (r % 2 ? dx / 2 : 0);
      const top = r * dy;
      return (
        `<div class="tile${s.tall ? " tall" : ""}" style="left:${left.toFixed(2)}mm;top:${top.toFixed(2)}mm;width:${w.toFixed(2)}mm;height:${h.toFixed(2)}mm">` +
        `<svg viewBox="${hexViewBox}"><path d="${HEX_D}" fill="var(--cnd-white)"/>` +
        `<circle cx="503" cy="${HEX_VB.y + HEX_VB.h * 0.665}" r="265" class="ring"/></svg>` +
        `<img src="${asset(s.logo)}" alt="${esc(s.name)}"></div>`
      );
    }),
  );
  const height = (rows.length - 1) * dy + h;
  return { html: tiles.join(""), height };
}

const comb = honeycomb();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Stamp card · Cloud Native Denmark</title>
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
    /* Not Inter: Chrome embeds a variable font as Type 3, which print shops
       reject or rasterise. Space Grotesk ships static and embeds as TrueType. */
    font-family: var(--cnd-font-display);
  }
  .side:last-child { break-after: auto; }
  /* Everything is placed against the trim, not the bleed. */
  .trim { position: absolute; left: ${(PAGE_W - TRIM_W) / 2}mm; top: ${(PAGE_H - TRIM_H) / 2}mm; width: ${TRIM_W}mm; height: ${TRIM_H}mm; }

  .eyebrow {
    font-family: var(--cnd-font-display);
    font-weight: 500;
    font-size: 2.6mm;
    letter-spacing: var(--cnd-track-eyebrow);
    text-transform: uppercase;
    color: var(--cnd-rose);
    margin: 0 0 2.2mm;
  }
  .display {
    font-family: var(--cnd-font-display);
    font-weight: 700;
    line-height: 0.948;
    letter-spacing: -0.015em;
    text-transform: uppercase;
    margin: 0;
  }

  /* front */
  .front { background: var(--cnd-navy); color: var(--cnd-sand); }
  .cells { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  /* The wordmark with the mark at its upper right, at the deck's ratios
     (decks/shared/cnd-deck.css .lockup). Never re-typeset. */
  .lockup { position: absolute; left: ${SAFE}mm; top: 14mm; width: 52mm; aspect-ratio: 1511.728 / 870.581; }
  .lockup img { position: absolute; display: block; }
  .lockup .wordmark { inset: 0; width: 100%; height: 100%; }
  .lockup .mark { left: 83.03%; top: -18.75%; width: 42.07%; height: 70%; object-fit: contain; }
  .when {
    position: absolute; left: ${SAFE}mm; top: 49mm;
    font-family: var(--cnd-font-display); font-weight: 500; font-size: 2.6mm;
    letter-spacing: var(--cnd-track-eyebrow); text-transform: uppercase; margin: 0;
  }
  .front .copy { position: absolute; left: ${SAFE}mm; top: 64mm; width: 78mm; }
  .front .display { font-size: 10.5mm; }
  .steps { list-style: none; padding: 0; margin: 5.5mm 0 0; counter-reset: step; }
  .steps li {
    counter-increment: step;
    position: relative;
    padding-left: 7mm;
    margin-bottom: 2.4mm;
    font-size: 3.3mm;
    line-height: 1.3;
    max-width: 58mm;
  }
  .steps li::before {
    content: counter(step);
    position: absolute; left: 0; top: -0.2mm;
    font-family: var(--cnd-font-display); font-weight: 700; font-size: 3.6mm;
    color: var(--cnd-rose);
  }
  .prize {
    position: absolute; left: ${SAFE}mm; bottom: ${SAFE}mm; width: 50mm; margin: 0;
    font-family: var(--cnd-font-display); font-weight: 700; font-size: 3.5mm; line-height: 1.15;
    text-transform: uppercase;
  }

  /* back */
  .back { background: var(--cnd-sand); color: var(--cnd-navy); }
  .back .head { position: absolute; left: ${SAFE}mm; top: ${SAFE}mm; right: ${SAFE}mm; }
  .back .display { font-size: 6.6mm; }
  .comb { position: absolute; left: 0; top: 28mm; width: ${TRIM_W}mm; height: ${comb.height.toFixed(2)}mm; }
  .tile { position: absolute; }
  .tile svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .tile .ring { fill: none; stroke: var(--cnd-slate); stroke-width: 9; stroke-dasharray: 26 30; opacity: 0.7; }
  /* Logos are contained, never cropped, in the hexagon's upper third. */
  .tile img { position: absolute; left: 16%; width: 68%; top: 15%; height: 22%; object-fit: contain; }
  /* A round or square logo reaches up into the hexagon's point for the height a wide one gets in width. */
  .tile.tall img { top: 6%; height: 35%; }
  .fields { position: absolute; left: ${SAFE}mm; right: ${SAFE}mm; top: ${(28 + comb.height + 10).toFixed(2)}mm; }
  .field { display: flex; align-items: flex-end; gap: 3mm; height: 11mm; border-bottom: 0.3mm solid var(--cnd-navy); }
  .field + .field { margin-top: 1.5mm; }
  .field span {
    font-family: var(--cnd-font-display); font-weight: 500; font-size: 2.4mm;
    letter-spacing: var(--cnd-track-eyebrow); text-transform: uppercase;
    color: var(--cnd-ink-muted); padding-bottom: 1mm;
  }
  .handin {
    position: absolute; left: ${SAFE}mm; right: ${SAFE}mm; bottom: ${SAFE}mm; margin: 0;
    font-size: 2.7mm; line-height: 1.35; color: var(--cnd-ink-muted);
  }
  .handin b { color: var(--cnd-navy); font-weight: 600; }
</style>
</head>
<body>

<section class="side front">
  ${frontField()}
  <div class="trim">
    <div class="lockup">
      <img class="wordmark" src="${asset("brand/logo/cnd-lockup-cream.svg")}" alt="Cloud Native Denmark">
      <img class="mark" src="${asset("brand/logo/cnd-mark.svg")}" alt="">
    </div>
    <p class="when">19–20 Nov 2026 · Copenhagen</p>
    <div class="copy">
      <p class="eyebrow">The booth challenge</p>
      <h1 class="display">Collect<br>the stamps.</h1>
      <ol class="steps">
        <li>Visit every booth and get a stamp on the back.</li>
        <li>Write your name under the stamps.</li>
        <li>Hand in the full card at the registration desk.</li>
      </ol>
    </div>
    <p class="prize">Every full card is in the draw for cool prizes.</p>
  </div>
</section>

<section class="side back">
  <div class="trim">
    <div class="head">
      <p class="eyebrow">${booths.length} booths</p>
      <h2 class="display">One stamp per booth.</h2>
    </div>
    <div class="comb">${comb.html}</div>
    <div class="fields">
      <div class="field"><span>Name</span></div>
    </div>
    <p class="handin"><b>Hand it in at the registration desk.</b> Winners are drawn
    at the closing on day two.</p>
  </div>
</section>

</body>
</html>
`;

mkdirSync(OUT, { recursive: true });
const page = join(OUT, "stamp-card.html");
writeFileSync(page, html);

const common = ["--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--hide-scrollbars"];
const pdf = join(OUT, "stamp-card.pdf");
execFileSync(CHROME, [...common, "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, `file://${page}`], { stdio: "ignore" });
console.log(`  ${pdf}`);

/* The same sheets with crop marks: each side centred on a larger page, with
 * hairline marks at the trim lines, kept clear of the bleed. */
const SLUG = 12;
const MARK_GAP = BLEED + 1;
const SHEET_W = TRIM_W + SLUG * 2;
const SHEET_H = TRIM_H + SLUG * 2;
const t = { l: SLUG, r: SLUG + TRIM_W, t: SLUG, b: SLUG + TRIM_H };
const tick = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const marks =
  `<svg class="marks" viewBox="0 0 ${SHEET_W} ${SHEET_H}">` +
  [
    [t.l, t.t, -1, -1], [t.r, t.t, 1, -1], [t.l, t.b, -1, 1], [t.r, t.b, 1, 1],
  ]
    .map(([x, y, sx, sy]) =>
      tick(x, y + sy * MARK_GAP, x, y + sy * (SLUG - 1)) + tick(x + sx * MARK_GAP, y, x + sx * (SLUG - 1), y),
    )
    .join("") +
  `</svg>`;
const sheetPx = (mm) => Math.ceil(mm * PX);
const marked = join(OUT, ".stamp-card-marks.html");
writeFileSync(
  marked,
  html
    .replace(/@page \{[^}]*\}/, `@page { size: ${sheetPx(SHEET_W)}px ${sheetPx(SHEET_H)}px; margin: 0; }`)
    .replace(
      "</style>",
      `  .sheet { position: relative; width: ${sheetPx(SHEET_W)}px; height: ${sheetPx(SHEET_H)}px; overflow: hidden; break-after: page; background: var(--cnd-white); }
  .sheet:last-child { break-after: auto; }
  .sheet .side { position: absolute; left: ${SLUG - (PAGE_W - TRIM_W) / 2}mm; top: ${SLUG - (PAGE_H - TRIM_H) / 2}mm; break-after: auto; }
  /* Registration black, as a print shop expects of crop marks. */
  .marks { position: absolute; inset: 0; width: ${SHEET_W}mm; height: ${SHEET_H}mm; stroke: #000000; stroke-width: 0.1; }
</style>`,
    )
    .replaceAll('<section class="side', `<div class="sheet">${marks}<section class="side`)
    .replaceAll("</section>", "</section></div>"),
);
const marksPdf = join(OUT, "stamp-card-marks.pdf");
execFileSync(CHROME, [...common, "--no-pdf-header-footer", `--print-to-pdf=${marksPdf}`, `file://${marked}`], { stdio: "ignore" });
rmSync(marked);
console.log(`  ${marksPdf}`);

// Previews at 300 dpi, cropped to the trim: what the cut card will look like.
const DPI = 300;
const px = (mm) => Math.round((mm / 25.4) * DPI);
const scale = DPI / 96;
for (const [i, side] of ["front", "back"].entries()) {
  const preview = join(OUT, `.preview-${side}.html`);
  writeFileSync(
    preview,
    html.replace(
      "</style>",
      `  body { width: ${TRIM_W}mm; height: ${TRIM_H}mm; overflow: hidden; }
  .side { position: absolute; left: -${(PAGE_W - TRIM_W) / 2}mm; top: -${(PAGE_H - TRIM_H) / 2}mm; }
  .side:not(:nth-of-type(${i + 1})) { display: none; }
</style>`,
    ),
  );
  const png = join(OUT, `stamp-card-${side}.png`);
  execFileSync(
    CHROME,
    [
      ...common,
      `--force-device-scale-factor=${scale}`,
      `--window-size=${Math.round(px(TRIM_W) / scale)},${Math.round(px(TRIM_H) / scale)}`,
      "--virtual-time-budget=3000",
      `--screenshot=${png}`,
      `file://${preview}`,
    ],
    { stdio: "ignore" },
  );
  rmSync(preview);
  console.log(`  ${png}`);
}

/* Print versions, when Ghostscript is installed (brew install ghostscript):
 * converted to CMYK with prepress settings (no image downsampling), and each
 * page given a TrimBox and BleedBox so the shop's software knows where to cut.
 * Chrome writes RGB with only a MediaBox. The conversion uses Ghostscript's
 * default CMYK profile; a shop with its own profile may convert again. */
function findGhostscript() {
  for (const path of ["/opt/homebrew/bin/gs", "/usr/local/bin/gs", "/usr/bin/gs"]) if (existsSync(path)) return path;
  return null;
}
const GS = findGhostscript();
const PT = 72 / 25.4;
// [file, trim's offset from the page's top left in mm]
const printable = [
  [pdf, (PAGE_W - TRIM_W) / 2, (PAGE_H - TRIM_H) / 2],
  [marksPdf, SLUG, SLUG],
];
if (!GS) {
  console.log("  (no Ghostscript: skipped the CMYK print files)");
} else {
  for (const [src, left, top] of printable) {
    // Chrome rounds the page; read the size it actually wrote.
    const box = readFileSync(src, "latin1").match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    const pageH = Number(box[2]);
    const rect = (inset) =>
      [left - inset, pageH / PT - top - TRIM_H - inset, left + TRIM_W + inset, pageH / PT - top + inset]
        .map((mm) => (mm * PT).toFixed(2))
        .join(" ");
    const out = src.replace(/\.pdf$/, "-cmyk.pdf");
    execFileSync(
      GS,
      [
        "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER",
        "-sDEVICE=pdfwrite", "-dPDFSETTINGS=/prepress",
        "-sColorConversionStrategy=CMYK", "-sProcessColorModel=DeviceCMYK",
        "-dAutoRotatePages=/None",
        `-sOutputFile=${out}`,
        // Set per page as each one ends; a /PAGES pdfmark is ignored by the
        // PDF interpreter in Ghostscript 10.
        "-c",
        `<< /EndPage { exch pop 0 eq { [ {ThisPage} << /TrimBox [${rect(0)}] /BleedBox [${rect(BLEED)}] >> /PUT pdfmark true } { false } ifelse } >> setpagedevice`,
        "-f", src,
      ],
      { stdio: "ignore" },
    );
    console.log(`  ${out}`);
  }
}
