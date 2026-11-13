#!/usr/bin/env node
/**
 * Render printable documents — guides, briefs, handouts — from Markdown in
 * content/documents/ to branded A4 PDFs.
 *
 *   node graphics/build-documents.mjs                    # every document
 *   node graphics/build-documents.mjs track-host-guide   # one, by slug or path
 *
 * Output in graphics/out/documents/: <slug>.pdf, plus <slug>.html beside it
 * to open in Chrome while editing. The look is graphics/templates/document.css.
 *
 * Front matter:
 *   title    required. The cover headline; a terminal full stop echoes DENMARK.
 *   eyebrow  the rose line above the title
 *   lead     a sentence or two under the title
 *   meta     the small line at the bottom of the cover: dates, venue
 *   updated  YYYY-MM-DD, in the footer of every page so printed copies can
 *            be told apart
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { frontMatter, inline, markdown } from "./markdown.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "content", "documents");
const OUT = join(ROOT, "graphics", "out", "documents");

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

/* The field's true hexagon, the same path as the wall, decks and stamp card. */
const HEX_D =
  "M 974.382812 895.261719 C 991.835938 885.179688 1005.988281 860.671875 1005.988281 840.515625 L 1005.988281 333.214844 C 1005.988281 313.058594 991.835938 288.550781 974.382812 278.46875 L 535.046875 24.820312 C 517.59375 14.742188 489.289062 14.742188 471.835938 24.820312 L 32.5 278.46875 C 15.042969 288.550781 0.894531 313.058594 0.894531 333.214844 L 0.894531 840.515625 C 0.894531 860.671875 15.042969 885.179688 32.5 895.261719 L 471.835938 1148.910156 C 489.289062 1158.988281 517.59375 1158.988281 535.046875 1148.910156 Z";
const HEX_VB = { x: 0.894, y: 17.3, w: 1005.1, h: 1139.1 };

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** The honeycomb on the cover's right edge, in mm: rose, peach and slate, no red. */
function coverField() {
  const W = 84;
  const H = 140;
  const h = 13;
  const gap = 1.3;
  const w = h * (HEX_VB.w / HEX_VB.h);
  const dx = w + gap;
  const dy = h * 0.75 + gap * 0.87;
  const rand = rng(2026);
  const tints = ["--cnd-rose", "--cnd-peach", "--cnd-slate"];
  const k = h / HEX_VB.h;
  const cells = [];
  for (let r = -1; r * dy < H + h; r++) {
    const off = r % 2 ? dx / 2 : 0;
    for (let c = -1; c * dx < W + w; c++) {
      const x = c * dx + off;
      const y = r * dy;
      // Denser towards the right edge and the top.
      const d = Math.min(1, Math.max(0, (x / W) * 1.6 - 0.4 - (y / H) * 0.35));
      if (rand() >= d) continue;
      const o = (0.3 + rand() * 0.55) * (0.45 + 0.55 * d);
      const tint = tints[Math.floor(rand() * tints.length)];
      cells.push(
        `<path d="${HEX_D}" style="fill:var(${tint})" opacity="${o.toFixed(2)}" ` +
          `transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(5)}) translate(${-HEX_VB.x} ${-HEX_VB.y})"/>`,
      );
    }
  }
  return `<svg class="field" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">${cells.join("")}</svg>`;
}

const cssString = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const plain = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`updated: "${iso}" is not YYYY-MM-DD`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function render(file) {
  const { data, body } = frontMatter(readFileSync(file, "utf8"));
  if (!data.title) throw new Error(`${file}: front matter needs a title`);
  const title = inline(data.title);
  const asset = (p) => `../../../${p}`;
  const footer = ["Cloud Native Denmark", plain(title).replace(/\.$/, ""), data.updated && `Updated ${formatDate(data.updated)}`]
    .filter(Boolean)
    .join(" · ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${plain(title).replace(/\.$/, "")} · Cloud Native Denmark</title>
<link rel="stylesheet" href="${asset("brand/tokens.css")}">
<link rel="stylesheet" href="${asset("graphics/templates/document.css")}">
<style>@page { @bottom-left { content: ${cssString(footer)}; } }</style>
</head>
<body>
<header class="cover">
  ${coverField()}
  <div class="lockup">
    <img class="wordmark" src="${asset("brand/logo/cnd-lockup-cream.svg")}" alt="Cloud Native Denmark">
    <img class="mark" src="${asset("brand/logo/cnd-mark.svg")}" alt="">
  </div>
  ${data.eyebrow ? `<p class="eyebrow">${inline(data.eyebrow)}</p>` : ""}
  <h1>${title}</h1>
  ${data.lead ? `<p class="lead">${inline(data.lead)}</p>` : ""}
  ${data.meta ? `<p class="meta">${inline(data.meta)}</p>` : ""}
</header>
<main class="doc">
${markdown(body)}
</main>
</body>
</html>
`;
}

const args = process.argv.slice(2);
const files = args.length
  ? args.map((a) => (a.endsWith(".md") ? resolve(a) : join(SRC, `${a}.md`)))
  : readdirSync(SRC).filter((f) => f.endsWith(".md")).map((f) => join(SRC, f));

const CHROME = findChrome();
mkdirSync(OUT, { recursive: true });
for (const file of files) {
  if (!existsSync(file)) {
    console.error(`No such document: ${file}`);
    process.exit(1);
  }
  const slug = basename(file, ".md");
  const html = join(OUT, `${slug}.html`);
  const pdf = join(OUT, `${slug}.pdf`);
  writeFileSync(html, render(file));
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--allow-file-access-from-files",
      "--hide-scrollbars",
      "--no-pdf-header-footer",
      "--generate-pdf-document-outline",
      `--print-to-pdf=${pdf}`,
      `file://${html}`,
    ],
    { stdio: "ignore" },
  );
  console.log(`  ${pdf}`);
}
