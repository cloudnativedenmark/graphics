#!/usr/bin/env node
/**
 * Render a Cloud Native Denmark social graphic to PNG.
 *
 *   node graphics/render.mjs speaker-highlight \
 *     --variant 2 \
 *     --name "Jinhong Brejnholt" \
 *     --role "Chief Cloud Architect, Saxo Bank" \
 *     --highlight "PLATFORM TEAMS|DON'T SCALE BY|ADDING PEOPLE" \
 *     --photo path/to/portrait.jpg \
 *     --out graphics/out/jinhong.png
 *
 *   node graphics/render.mjs speaker-highlight --variant 2 --frame
 *     ...renders frame furniture only, with the content window transparent.
 *     This is what test/pixel-diff.mjs compares to the designer's overlays.
 *
 * Options
 *   --variant 1|2|3   1 = navy photo, 2 = navy card, 3 = sand card
 *   --name/--role/--highlight  content; "|" splits highlight lines
 *   --category NAME   tab label source; defaults per template
 *   --label TEXT      override the tab label
 *   --scale N         device pixel ratio, e.g. 2 for retina export
 *   --frame           frame only, content window transparent
 *   --out PATH        output PNG
 *   --keep-html       leave the intermediate HTML in place for debugging
 *
 * No npm dependencies: geometry comes from brand/geometry.json and
 * rasterising is done by the Chrome already on this machine.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TEMPLATES = join(HERE, "templates");

const CHROME =
  process.env.CHROME_BIN ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Tab glow. A Photoshop outer-glow layer effect is not reproducible exactly
// by a single drop-shadow, so these are calibrated against the reference
// rather than extracted — see test/calibrate_glow.py, which found this pair.
// Worth knowing: the sweep is nearly flat (dropping the glow entirely costs
// under 1 dE), so the pixel-diff residual is text antialiasing, not glow.
// If the diff regresses, suspect geometry or type before touching these.
// Overridable via env so test/calibrate_glow.py can sweep them.
const TAB_GLOW_BLUR = Number(process.env.CND_TAB_GLOW_BLUR ?? 32);
const TAB_GLOW_OPACITY = Number(process.env.CND_TAB_GLOW_OPACITY ?? 0.65);

// Stroke on the outline year. Photoshop stores this as a layer effect;
// calibrated against the reference.
const YEAR_STROKE = Number(process.env.CND_YEAR_STROKE ?? 3);

// Default tab label per template, overridable with --label.
const DEFAULT_CATEGORY = {
  "speaker-highlight": "speaker-highlights",
  "sponsor-highlight": "sponsor-highlights",
  "schedule-announcement": "schedule-announcements",
  "cfp-notification": "CFP-notifications",
  clean: null,
};

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [template, ...rest] = argv;
  if (!template || template.startsWith("--")) {
    console.error("usage: node graphics/render.mjs <template> [options]");
    console.error(`templates: ${Object.keys(DEFAULT_CATEGORY).join(", ")}`);
    process.exit(2);
  }
  const opts = { template, variant: "2", scale: 1, frame: false };
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    if (name === "frame" || name === "keep-html") {
      opts[name] = true;
    } else {
      opts[name] = rest[++i];
    }
  }
  return opts;
}

const load = (p) => readFileSync(p, "utf8");
const loadJSON = (p) => JSON.parse(load(p));

/** Replace every {{key}} with values[key], erroring on anything unresolved. */
function fill(text, values) {
  const out = text.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    values[k] === undefined || values[k] === null ? "" : String(values[k]),
  );
  const leftover = out.match(/\{\{(\w+)\}\}/);
  if (leftover) throw new Error(`unresolved placeholder ${leftover[0]}`);
  return out;
}

/** Strip the HTML comment block templates open with. */
const stripLeadComment = (s) => s.replace(/^\s*<!--[\s\S]*?-->\s*/, "");

/**
 * Lay out lines from a first baseline downward.
 *
 * SVG's y attribute is the baseline, so geometry.json's `baseline` (ink top
 * plus one cap height) drops straight in. Photoshop's layer transform is the
 * text-box origin rather than the baseline and must not be used here.
 */
function tspanLines(text, x, baselineY, leading) {
  return text
    .split("|")
    .map((line, i) => {
      const y = +(baselineY + i * leading).toFixed(2);
      return `<tspan x="${x}" y="${y}">${escapeXML(line.trim())}</tspan>`;
    })
    .join("");
}

/** Leading for a block: the designer's derived value, else 1.21x the size. */
const leadingOf = (spec) =>
  spec.leading_derived_px ?? +(spec.runs[0].size_px * 1.21).toFixed(2);

/**
 * The tab label is box text that wraps in Photoshop. Every category the
 * designer shipped is exactly two words and sets on two lines, so split on
 * the last space unless the caller gave explicit "|" breaks.
 */
function labelLines(text) {
  if (text.includes("|")) return text;
  const i = text.lastIndexOf(" ");
  return i === -1 ? text : `${text.slice(0, i)}|${text.slice(i + 1)}`;
}

const escapeXML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
  );

/** Path relative to the intermediate HTML, which lives in templates/. */
const assetURL = (abs) => relative(TEMPLATES, abs).split("\\").join("/");

// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const geometry = loadJSON(join(ROOT, "brand", "geometry.json"));
  const tokens = loadJSON(join(ROOT, "brand", "tokens.json"));

  const variant = String(opts.variant);
  if (!["1", "2", "3"].includes(variant)) {
    console.error(`--variant must be 1, 2 or 3 (got ${variant})`);
    process.exit(2);
  }

  const category =
    opts.category ?? DEFAULT_CATEGORY[opts.template] ?? "speaker-highlights";
  const overlay = geometry.overlays[category]?.[variant];
  if (!overlay) {
    console.error(`no measured geometry for ${category} v${variant}`);
    process.exit(2);
  }
  const frameSpec = geometry.frames[category]?.[variant];
  const content = geometry.content[variant === "1" ? "1" : "2"];
  const { w: canvasW, h: canvasH } = geometry.canvas;
  const color = tokens.color;

  // --- content layer -----------------------------------------------------
  const box = overlay.content;
  const names = Object.keys(content);
  const nameSpec = content[names[0]];
  const roleSpec = content[names[1]];
  const highSpec = content[names[2]];

  let contentSVG = "";
  if (!opts.frame) {
    const photoLayer = opts.photo
      ? `<image xlink:href="${assetURL(resolve(opts.photo))}" x="${box.x}" y="${box.y}" ` +
        `width="${box.w}" height="${box.h}" preserveAspectRatio="xMidYMid slice"/>` +
        (variant === "1"
          ? `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#scrim)"/>`
          : "")
      : `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" ` +
        `fill="${variant === "1" ? color.navy : color.white}"/>`;

    // Categories share one content layout unless a template overrides it.
    // All four of the designer's categories are name / role / statement, so
    // statement.svg is the default rather than four near-identical copies.
    const specific = join(TEMPLATES, `${opts.template}.svg`);
    const layout = existsSync(specific) ? specific : join(TEMPLATES, "statement.svg");

    contentSVG = fill(stripLeadComment(load(layout)), {
      photoLayer,
      nameX: nameSpec.x,
      nameY: nameSpec.baseline,
      nameSize: nameSpec.runs[0].size_px,
      nameTracking: `${nameSpec.runs[0].tracking_em}em`,
      nameColor: nameSpec.runs[0].color,
      name: escapeXML((opts.name ?? "Name Lastname").toUpperCase()),

      roleX: roleSpec.x,
      roleY: roleSpec.baseline,
      roleSize: roleSpec.runs[0].size_px,
      roleTracking: `${roleSpec.runs[0].tracking_em}em`,
      roleColor: roleSpec.runs[0].color,
      role: escapeXML((opts.role ?? "Title Lorem Ipsum").toUpperCase()),

      highlightSize: highSpec.runs[0].size_px,
      highlightTracking: `${highSpec.runs[0].tracking_em}em`,
      highlightColor: highSpec.runs[0].color,
      highlightLines: tspanLines(
        (opts.highlight ?? "Highlight lorem|ipsum dolores|lorem ipsum").toUpperCase(),
        highSpec.x,
        highSpec.baseline,
        leadingOf(highSpec),
      ),
    });
  }

  // --- rule (v1 only) ----------------------------------------------------
  const rule = overlay.rule
    ? `<rect x="0" y="${overlay.rule.y}" width="${canvasW}" height="${overlay.rule.h}" fill="${color.red}"/>`
    : "";

  // --- tab ---------------------------------------------------------------
  let tab = "";
  if (frameSpec?.tab) {
    const label = frameSpec.label;
    const run = label.runs[0];
    // The label is centred on its own ink box, which coincides with the
    // tab's centre line. Rotate about that same point so the v1 label turns
    // with the tab rather than swinging away from it.
    const cx = +(label.x + label.w / 2).toFixed(2);
    const cy = +(label.y + label.h / 2).toFixed(2);
    const rot = label.rotation
      ? ` transform="rotate(${label.rotation} ${cx} ${cy})"`
      : "";
    const labelText = labelLines(
      (opts.label ?? category.replace(/-/g, " ")).toUpperCase(),
    );
    tab =
      `<g filter="url(#tab-glow)">` +
      `<path d="${frameSpec.tab.path}" fill="${color.red}"/></g>` +
      `<text${rot} font-family="Space Grotesk" font-weight="500" ` +
      `font-size="${run.size_px}" letter-spacing="${run.tracking_em}em" ` +
      `fill="${run.color}" text-anchor="middle">` +
      tspanLines(labelText, cx, label.baseline, leadingOf(label)) +
      `</text>`;
  }

  // --- frame -------------------------------------------------------------
  // Footer artwork placement is measured per variant from the overlay, not
  // taken from PSD layer bounds — those describe the padded placed canvas.
  const place = { lockup: overlay.lockup, mark: overlay.mark };
  if (!place.lockup || !place.mark) {
    console.error(`overlay for ${category} v${variant} has no measured footer artwork`);
    process.exit(2);
  }

  const yearSpec = frameSpec?.year;
  const svg = fill(stripLeadComment(load(join(TEMPLATES, "_social-frame.svg"))), {
    canvasW,
    canvasH,
    ground: overlay.ground,
    navy: color.navy,
    red: color.red,
    contentX: box.x,
    contentY: box.y,
    contentW: box.w,
    contentH: box.h,
    contentR: box.r,
    content: contentSVG,
    rule,
    tab,
    tabGlowBlur: TAB_GLOW_BLUR,
    tabGlowOpacity: TAB_GLOW_OPACITY,
    lockup: assetURL(
      join(
        ROOT,
        "brand",
        "logo",
        variant === "3" ? "cnd-lockup-navy.svg" : "cnd-lockup-cream.svg",
      ),
    ),
    lockupX: place.lockup.x,
    lockupY: place.lockup.y,
    lockupW: place.lockup.w,
    lockupH: place.lockup.h,
    mark: assetURL(join(ROOT, "brand", "logo", "cnd-mark.svg")),
    markX: place.mark.x,
    markY: place.mark.y,
    markW: place.mark.w,
    markH: place.mark.h,
    year: tokens.event.year,
    yearX: yearSpec?.x ?? 0,
    yearY: yearSpec?.baseline ?? 0,
    yearSize: yearSpec?.runs[0].size_px ?? 0,
    yearTracking: `${yearSpec?.runs[0].tracking_em ?? 0}em`,
    yearGround: yearSpec?.runs[0].color ?? "none",
    yearStroke: YEAR_STROKE,
  });

  // --- rasterise ---------------------------------------------------------
  const html = `<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="${assetURL(join(ROOT, "brand", "tokens.css"))}">
<style>
  html, body { margin: 0; background: transparent; }
  svg { display: block; }
</style>
${svg}
`;

  const tmp = join(TEMPLATES, `.render-${opts.template}-${variant}.html`);
  writeFileSync(tmp, html);

  const out = resolve(
    opts.out ??
      join(
        ROOT,
        "graphics",
        "out",
        `${opts.template}-v${variant}${opts.frame ? "-frame" : ""}.png`,
      ),
  );
  mkdirSync(dirname(out), { recursive: true });

  try {
    execFileSync(
      CHROME,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        `--force-device-scale-factor=${opts.scale}`,
        `--window-size=${canvasW},${canvasH}`,
        "--default-background-color=00000000",
        "--virtual-time-budget=4000",
        `--screenshot=${out}`,
        `file://${tmp}`,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (err) {
    console.error(`Chrome failed:\n${err.stderr?.toString() ?? err.message}`);
    process.exit(1);
  } finally {
    if (!opts["keep-html"]) rmSync(tmp, { force: true });
  }

  if (!existsSync(out)) {
    console.error("Chrome produced no output");
    process.exit(1);
  }
  console.log(
    `${relative(ROOT, out)}  ${canvasW * opts.scale}x${canvasH * opts.scale}` +
      `  ${category} v${variant}${opts.frame ? " (frame only)" : ""}`,
  );
}

main();
