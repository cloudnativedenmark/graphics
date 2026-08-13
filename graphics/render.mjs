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
 *   --surface post|square  post is her native 1080×1350; square is 1080×1080,
 *                     DERIVED rather than measured — see deriveSquare
 *   --portrait-shape circle|mark  portrait frame; circle is the designer's
 *                     own choice and the default
 *   --theme light|dark  linkedin-cover only: sand ground or navy ground
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
  "linkedin-cover": null,
};

// Templates that are a whole document rather than a content layer composed
// into _social-frame.svg. A cover has no tab, card window or footer band.
const SELF_CONTAINED = new Set(["linkedin-cover"]);

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

/**
 * Derive a 1080×1080 square frame from the designer's 1080×1350 one.
 *
 * She never drew a square, so this is DERIVED, not measured — the one surface
 * in the system that does not trace back to her files. It is adapted by an
 * explicit rule rather than by eye, so it stays predictable:
 *
 *   x geometry     unchanged. The width is identical at 1080, so every
 *                  horizontal position and the tab carry over untouched.
 *   footer zone    unchanged distance from the bottom edge. The lockup, mark
 *                  and year are fixed-size artwork and must not be rescaled,
 *                  so they simply move up by the 270px the canvas lost.
 *   card window    absorbs the whole 270px difference.
 *   card text      vertical offsets scale by the card's height ratio, which
 *                  keeps the composition's proportions inside the shorter
 *                  card instead of letting the statement run out of it.
 *
 * Anything printed should use her native 1080×1350 instead.
 */
function deriveSquare(overlay, content) {
  const LOST = 270; // 1350 - 1080
  const card = overlay.content;
  const squareCard = { ...card, h: card.h - LOST };
  const ratio = squareCard.h / card.h;

  const shift = (box) => (box ? { ...box, y: box.y - LOST } : box);
  const scaleText = (spec) => ({
    ...spec,
    baseline: +(card.y + (spec.baseline - card.y) * ratio).toFixed(2),
    leading_derived_px:
      spec.leading_derived_px == null
        ? null
        : +(spec.leading_derived_px * ratio).toFixed(2),
  });

  return {
    overlay: {
      ...overlay,
      size: [1080, 1080],
      content: squareCard,
      rule: shift(overlay.rule),
      band: shift(overlay.band),
      lockup: shift(overlay.lockup),
      mark: shift(overlay.mark),
    },
    content: Object.fromEntries(
      Object.entries(content).map(([k, v]) => [k, scaleText(v)]),
    ),
    yearShift: LOST,
  };
}

/** Portrait frame box, derived from the card window by token ratios. */
function portraitBox(card, pr) {
  const side = Math.round(card.h * pr.sideOfCardHeight);
  return {
    side,
    cx: Math.round(card.x + card.w * pr.centreXOfCardWidth),
    cy: Math.round(card.y + card.h * pr.centreYOfCardHeight),
  };
}

/**
 * Map the shape's viewBox onto a square box, so one path serves any size.
 * The shape is slightly wider than tall, so it is fitted by width and
 * centred vertically — matching how it reads in the mark.
 */
function shapeTransform(viewBox, { side, cx, cy }) {
  const [vx, vy, vw, vh] = viewBox.split(/\s+/).map(Number);
  const scale = side / vw;
  const x = cx - side / 2;
  const y = cy - (vh * scale) / 2;
  return `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(5)}) translate(${-vx} ${-vy})`;
}

/** Path relative to the intermediate HTML, which lives in templates/. */
const assetURL = (abs) => relative(TEMPLATES, abs).split("\\").join("/");

// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const geometry = loadJSON(join(ROOT, "brand", "geometry.json"));
  const tokens = loadJSON(join(ROOT, "brand", "tokens.json"));

  if (SELF_CONTAINED.has(opts.template)) {
    return renderCover(opts, geometry, tokens);
  }

  const variant = String(opts.variant);
  if (!["1", "2", "3"].includes(variant)) {
    console.error(`--variant must be 1, 2 or 3 (got ${variant})`);
    process.exit(2);
  }

  const category =
    opts.category ?? DEFAULT_CATEGORY[opts.template] ?? "speaker-highlights";
  if (!geometry.overlays[category]?.[variant]) {
    console.error(`no measured geometry for ${category} v${variant}`);
    process.exit(2);
  }
  const frameSpec = geometry.frames[category]?.[variant];
  let overlay = geometry.overlays[category][variant];
  let content = geometry.content[variant === "1" ? "1" : "2"];
  let canvasW = geometry.canvas.w;
  let canvasH = geometry.canvas.h;
  let yearShift = 0;

  const surface = (opts.surface ?? "post").toLowerCase();
  if (surface === "square") {
    const derived = deriveSquare(overlay, content);
    overlay = derived.overlay;
    content = derived.content;
    canvasH = 1080;
    yearShift = derived.yearShift;
  } else if (surface !== "post") {
    console.error(`--surface must be post or square (got ${surface})`);
    process.exit(2);
  }
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

    // Portrait frame, as ratios of the card window so it survives a card
    // change.
    //
    // Defaults to the circle, because that is what the designer used in her
    // own composed example and most of this system also has to hold up in
    // print. The brand silhouette is available via --portrait-shape mark:
    // it is verified to be this mark's own outline (0.9977 IoU) so it is not
    // off-brand, but it is not her choice, so it does not get to be default.
    const pr = tokens.portrait;
    const side = Math.round(box.h * pr.sideOfCardHeight);
    const pcx = Math.round(box.x + box.w * pr.centreXOfCardWidth);
    const pcy = Math.round(box.y + box.h * pr.centreYOfCardHeight);
    const useCircle = (opts["portrait-shape"] ?? "circle") === "circle";
    const clip = useCircle ? "portrait-circle" : "brand-shape";

    const portraitLayer = opts.portrait
      ? `<g clip-path="url(#${clip})"><image xlink:href="${assetURL(
          resolve(opts.portrait),
        )}" x="${pcx - side / 2}" y="${pcy - side / 2}" width="${side}" ` +
        `height="${side}" preserveAspectRatio="xMidYMid slice"/></g>`
      : "";

    contentSVG = fill(stripLeadComment(load(layout)), {
      portraitLayer,
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

  // The "clean" category has no PSD group of its own, so it has no frame spec
  // and would silently lose the outline year. The year is identical across
  // every category the designer drew, so borrow it from any of them.
  const yearSpec =
    frameSpec?.year ??
    Object.values(geometry.frames)
      .map((byVariant) => byVariant[variant]?.year)
      .find(Boolean);
  if (!yearSpec) {
    console.error(`no year type spec available for variant ${variant}`);
    process.exit(2);
  }
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
    shapePath: tokens.shape.path,
    shapeTransform: shapeTransform(tokens.shape.viewBox, portraitBox(overlay.content, tokens.portrait)),
    portraitCX: portraitBox(overlay.content, tokens.portrait).cx,
    portraitCY: portraitBox(overlay.content, tokens.portrait).cy,
    portraitR: portraitBox(overlay.content, tokens.portrait).side / 2,
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
    yearX: yearSpec.x,
    yearY: yearSpec.baseline - yearShift,
    yearSize: yearSpec.runs[0].size_px,
    yearTracking: `${yearSpec.runs[0].tracking_em}em`,
    // Outline fill matches the ground it sits on, which differs per variant.
    yearGround: overlay.ground,
    yearStroke: YEAR_STROKE,
  });

  rasterise(svg, {
    canvasW,
    canvasH,
    scale: opts.scale,
    keepHtml: opts["keep-html"],
    slug: `${opts.template}-${variant}`,
    out:
      opts.out ??
      join(
        ROOT,
        "graphics",
        "out",
        `${opts.template}-v${variant}${surface === "square" ? "-square" : ""}${opts.frame ? "-frame" : ""}.png`,
      ),
    label: `${category} v${variant} ${surface}${opts.frame ? " (frame only)" : ""}`,
  });
}

/**
 * The LinkedIn page cover, 1128x191, in either colourway.
 *
 * Themes reuse the social colourways rather than inventing cover-specific
 * ones: navy on sand for light, cream on navy for dark. That works because
 * extract.py splits the cover's fused lockup back into wordmark + mark, so
 * the cream wordmark can stand in for the navy one.
 */
function renderCover(opts, geometry, tokens) {
  const theme = (opts.theme ?? "light").toLowerCase();
  if (!["light", "dark"].includes(theme)) {
    console.error(`--theme must be light or dark (got ${theme})`);
    process.exit(2);
  }
  const dark = theme === "dark";
  const color = tokens.color;
  const cover = geometry.cover;
  const [canvasW, canvasH] = cover.canvas;
  const place = cover.placement;

  // The designer's own two display lines and outline year, reused as the
  // type spec for whatever copy the caller supplies.
  const display = cover.text["COPEN HAGEN"];
  const outlineSpec = cover.text["2026"];
  const ground = dark ? color.navy : color.sand;

  const svg = fill(stripLeadComment(load(join(TEMPLATES, "linkedin-cover.svg"))), {
    canvasW,
    canvasH,
    ground,
    red: color.red,

    // The stock cluster is a darkening overlay and vanishes on navy, so the
    // dark cover uses the ground-baked twin. On sand the two are identical.
    hexagons: assetURL(
      join(
        ROOT,
        "brand",
        "logo",
        dark ? "cnd-hexagons-solid.svg" : "cnd-hexagons.svg",
      ),
    ),
    hexX: place.hexagons.x,
    hexY: place.hexagons.y,
    hexW: place.hexagons.w,
    hexH: place.hexagons.h,

    textX: display.x,
    displaySize: display.runs[0].size_px,
    displayTracking: `${display.runs[0].tracking_em}em`,
    displayColor: dark ? color.sand : color.navy,
    line1: escapeXML((opts.line1 ?? "Schedule").toUpperCase()),
    line2: escapeXML((opts.line2 ?? "Is live").toUpperCase()),
    line1Y: display.baseline,
    line2Y: +(display.baseline + leadingOf(display)).toFixed(2),

    outline: escapeXML((opts.outline ?? tokens.event.year).toUpperCase()),
    outlineY: outlineSpec.baseline,
    outlineSize: outlineSpec.runs[0].size_px,
    outlineTracking: `${outlineSpec.runs[0].tracking_em}em`,
    outlineStroke: YEAR_STROKE,

    wordmark: assetURL(
      join(ROOT, "brand", "logo", dark ? "cnd-lockup-cream.svg" : "cnd-lockup-navy.svg"),
    ),
    wordmarkX: place.wordmark.x,
    wordmarkY: place.wordmark.y,
    wordmarkW: place.wordmark.w,
    wordmarkH: place.wordmark.h,
    mark: assetURL(join(ROOT, "brand", "logo", "cnd-mark.svg")),
    markX: place.mark.x,
    markY: place.mark.y,
    markW: place.mark.w,
    markH: place.mark.h,
  });

  rasterise(svg, {
    canvasW,
    canvasH,
    scale: opts.scale,
    keepHtml: opts["keep-html"],
    slug: `linkedin-cover-${theme}`,
    out: opts.out ?? join(ROOT, "graphics", "out", `linkedin-cover-${theme}.png`),
    label: `cover, ${theme}`,
  });
}

/** Wrap an SVG in a minimal document and screenshot it with Chrome. */
function rasterise(svg, { canvasW, canvasH, scale, keepHtml, slug, out, label }) {
  const html = `<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="${assetURL(join(ROOT, "brand", "tokens.css"))}">
<style>
  html, body { margin: 0; background: transparent; }
  svg { display: block; }
</style>
${svg}
`;

  const tmp = join(TEMPLATES, `.render-${slug}.html`);
  writeFileSync(tmp, html);

  const target = resolve(out);
  mkdirSync(dirname(target), { recursive: true });

  try {
    execFileSync(
      CHROME,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        `--force-device-scale-factor=${scale}`,
        `--window-size=${canvasW},${canvasH}`,
        "--default-background-color=00000000",
        "--virtual-time-budget=4000",
        `--screenshot=${target}`,
        `file://${tmp}`,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
  } catch (err) {
    console.error(`Chrome failed:\n${err.stderr?.toString() ?? err.message}`);
    process.exit(1);
  } finally {
    if (!keepHtml) rmSync(tmp, { force: true });
  }

  if (!existsSync(target)) {
    console.error("Chrome produced no output");
    process.exit(1);
  }
  console.log(
    `${relative(ROOT, target)}  ${canvasW * scale}x${canvasH * scale}  ${label}`,
  );
}

main();
