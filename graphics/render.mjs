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
 *   --eyebrow / --headline / --body   bulletin only; "|" splits lines.
 *                     Prefix a headline line with "^" to set it as the figure,
 *                     much larger than the rest — for countdowns.
 *   --decor shape|hexagons|hexfield|none   bulletin corner device
 *   --portrait FILE    with decor=hexfield, puts a speaker in the big hexagon
 *   --logo FILE        with decor=hexfield, puts a sponsor logo in it
 *   --logos a.svg,b.svg   sponsors template; one hexagon per logo
 *   --perRow N         sponsors template; hexagons per row, default 4
 *   --shape rose|peach|slate|navy|red|white   colour, when decor=shape
 *   --at top-right|top-left|bottom-left      where it bleeds
 *   --texture 1        bulletin only; faint tiled shape outline
 *   --ground navy|sand|red  poster only
 *   --lines "A|B|*C"   poster only; "*" makes a line the red outline
 *   --meta TEXT        poster only; the small red line above the stack
 *   --hexagons         poster only; bleed the hexagon cluster off the right
 *   --surface post|square  post is her native 1080×1350; square is 1080×1080,
 *                     DERIVED rather than measured — see deriveSquare
 *   --portrait-shape circle|mark  portrait frame; circle is the designer's
 *                     own choice and the default
 *   --no-tab          speaker-highlight only: omit the corner tab. For a
 *                     photograph, where the tab lands on the subject.
 *   --band N          speaker-highlight only: footer band height in px. The
 *                     photo window grows to fill what the band gives up and
 *                     the footer artwork moves up with it. Opt-in, so the
 *                     measured defaults still guard the pixel diff.
 *   --footer navy|sand  speaker-highlight only: footer band colour. Picks the
 *                     matching ground-baked lockup, since DENMARK. and the
 *                     year are outlines filled with the ground they sit on.
 *   --scrim N         speaker-highlight v1 only: multiplier on the photo
 *                     scrim, 0 to 1. Her gradient reaches 0.92 navy at the
 *                     bottom edge, which is right under a low text block and
 *                     too heavy when the photograph is the point.
 *   --theme light|dark  linkedin-cover, forms-header, ticket-cover: sand or navy
 *   --line1/--line2/--outline  copy for those three
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

// Tab glow. A Photoshop outer-glow layer effect is not reproducible exactly
// by a single drop-shadow, so these are calibrated against the reference
// rather than extracted — see test/calibrate_glow.py, which found this pair.
// Worth knowing: the sweep is nearly flat (dropping the glow entirely costs
// under 1 dE), so the pixel-diff residual is text antialiasing, not glow.
// If the diff regresses, suspect geometry or type before touching these.
// Overridable via env so test/calibrate_glow.py can sweep them.
// Her scrim, as extracted: a navy wash that deepens toward the bottom edge
// where the v1 text block sits.
const SCRIM_STOPS = [0.15, 0.55, 0.92];

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
  "forms-header": null,
  "ticket-cover": null,
  poster: null,
  bulletin: null,
  sponsors: null,
};

// Templates that are a whole document rather than a content layer composed
// into _social-frame.svg. A cover has no tab, card window or footer band.
const SELF_CONTAINED = new Set(["linkedin-cover", "forms-header", "ticket-cover", "poster", "bulletin", "sponsors"]);

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
    if (name === "frame" || name === "keep-html" || name === "no-tab") {
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

/**
 * Width of a line, in px, from the extracted font metrics.
 *
 * Advances are 1/1000 em. Tracking applies between glyphs, so it is counted
 * (n - 1) times. Unknown characters fall back to a mid-width advance rather
 * than being dropped, so a stray glyph makes a line read slightly wide — the
 * safe direction when this is used to prevent collisions.
 */
function textWidth(metrics, face, text, sizePx, trackingEm = 0) {
  const table = metrics[face];
  if (!table) return text.length * sizePx * 0.55;
  const { advances } = table;
  let em = 0;
  for (const ch of text) em += advances[ch] ?? 550;
  return (em / 1000) * sizePx + trackingEm * sizePx * Math.max(0, text.length - 1);
}

/**
 * Largest size at or below `startPx` whose longest line fits `maxWidth`.
 *
 * Copy for these layouts is written by hand and varies wildly in length — a
 * speaker's name might be "Ana Ruiz" or "Allan Højgaard Jensen" — so the type
 * has to yield rather than the layout breaking. Steps down in 2px increments
 * because a fractional display size looks arbitrary in the output.
 */
function fitSize(metrics, face, lines, startPx, maxWidth, trackingEm) {
  let size = startPx;
  while (size > 24) {
    const widest = Math.max(
      ...lines.map((l) => textWidth(metrics, face, l, size, trackingEm)),
    );
    if (widest <= maxWidth) break;
    size -= 2;
  }
  return size;
}

/**
 * Map the single hexagon's viewBox onto a box of a given width, keeping its
 * aspect. Used for both the scatter and the photo/logo masks, so a hexagon is
 * always her hexagon rather than a redrawn one.
 */
function hexTransform(viewBox, { w, cx, cy }) {
  const [vx, vy, vw, vh] = viewBox.split(/\s+/).map(Number);
  const scale = w / vw;
  const h = vh * scale;
  return {
    transform: `translate(${(cx - w / 2).toFixed(2)} ${(cy - h / 2).toFixed(2)}) scale(${scale.toFixed(5)}) translate(${-vx} ${-vy})`,
    w,
    h,
    x: cx - w / 2,
    y: cy - h / 2,
  };
}

/**
 * Place the flag mark against a wordmark box, using her measured arrangement.
 *
 * The mark sits to the *upper right* of the wordmark, overlapping the "CLOUD
 * NATIVE" lines — it does not lead the lockup. Ratios are taken from the
 * measured footer, where the wordmark is 271x160 at (86, 1111) and the mark is
 * 114x112 at (311, 1081), so any wordmark size reproduces her lockup rather
 * than an approximation of it.
 */
function markFor({ x, y, w, h }) {
  return {
    x: +(x + 0.8303 * w).toFixed(2),
    y: +(y - 0.1875 * h).toFixed(2),
    w: +(0.4207 * w).toFixed(2),
    h: +(0.7 * h).toFixed(2),
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

  if (opts.template === "linkedin-cover") return renderCover(opts, geometry, tokens);
  if (opts.template === "forms-header") return renderFormsHeader(opts, geometry, tokens);
  if (opts.template === "ticket-cover") return renderTicketCover(opts, geometry, tokens);
  if (opts.template === "poster") return renderPoster(opts, geometry, tokens);
  if (opts.template === "bulletin") return renderBulletin(opts, geometry, tokens);
  if (opts.template === "sponsors") return renderSponsors(opts, geometry, tokens);

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

  // --- optional reframing, for the photo-led cards -----------------------
  // Opt-in only. Left alone, every number is still the one measured from her
  // overlays, which is what lets the pixel diff compare like with like.
  //
  // A photograph wants more of the card than a portrait does: her v1 band is
  // 30% of the square, which is right when the window holds a stage shot she
  // art-directed and wrong when it holds a room that has to read at feed size.
  let yearGroundOverride = null;
  let bandScale = 1;
  let bandTop = null;
  const scrim = opts.scrim == null ? 1 : Number(opts.scrim);
  if (!Number.isFinite(scrim) || scrim < 0 || scrim > 1) {
    console.error(`--scrim must be between 0 and 1 (got ${opts.scrim})`);
    process.exit(2);
  }
  if (opts.band != null) {
    const bandH = Number(opts.band);
    if (!Number.isFinite(bandH) || bandH < 140 || bandH > overlay.band.h) {
      console.error(`--band must be between 140 and ${overlay.band.h} (got ${opts.band})`);
      process.exit(2);
    }
    const bandY = canvasH - bandH;
    const ruleY = bandY - overlay.rule.h;
    const k = bandH / overlay.band.h;
    const oldBandY = overlay.band.y;
    // Vertical placement and artwork size both scale, so the footer keeps her
    // proportions. Horizontally the left margin is held, not scaled, because
    // 86px is the margin every other card in the system uses.
    const scaleBox = (b) => ({
      ...b,
      x: +(overlay.lockup.x + (b.x - overlay.lockup.x) * k).toFixed(2),
      y: +(bandY + (b.y - oldBandY) * k).toFixed(2),
      w: +(b.w * k).toFixed(2),
      h: +(b.h * k).toFixed(2),
    });
    overlay = {
      ...overlay,
      content: { ...overlay.content, h: ruleY },
      rule: { ...overlay.rule, y: ruleY },
      band: { y: bandY, h: bandH },
      lockup: scaleBox(overlay.lockup),
      mark: scaleBox(overlay.mark),
    };
    bandScale = k;
    bandTop = { oldY: oldBandY, newY: bandY };
  }
  if (opts.footer) {
    const footers = { navy: color.navy, sand: color.sand };
    const name = opts.footer.toLowerCase();
    if (!footers[name]) {
      console.error(`--footer must be navy or sand (got ${name})`);
      process.exit(2);
    }
    // Red is deliberately not offered: the year is a ground-coloured fill
    // with a red stroke, so on a red band it disappears into itself.
    overlay = { ...overlay, ground: footers[name] };
    yearGroundOverride = footers[name];
  }

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
  if (frameSpec?.tab && !opts["no-tab"]) {
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
    scrimTop: SCRIM_STOPS[0] * scrim,
    scrimMid: SCRIM_STOPS[1] * scrim,
    scrimBottom: SCRIM_STOPS[2] * scrim,
    tabGlowBlur: TAB_GLOW_BLUR,
    tabGlowOpacity: TAB_GLOW_OPACITY,
    lockup: assetURL(
      join(
        ROOT,
        "brand",
        "logo",
        // The lockup artwork is baked for the ground it sits on, so it
        // follows the footer colour when that is overridden.
        (opts.footer?.toLowerCase() ?? (variant === "3" ? "sand" : "navy")) === "sand"
          ? "cnd-lockup-navy.svg"
          : "cnd-lockup-cream.svg",
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
    // Right margin held at the left margin's value, so the year stays optically
    // paired with the lockup as both shrink.
    yearX: bandTop
      ? +(canvasW - 87 - yearSpec.w * bandScale).toFixed(2)
      : yearSpec.x,
    yearY: bandTop
      ? +(bandTop.newY + (yearSpec.baseline - yearShift - bandTop.oldY) * bandScale).toFixed(2)
      : yearSpec.baseline - yearShift,
    yearSize: +(yearSpec.runs[0].size_px * bandScale).toFixed(2),
    yearTracking: `${yearSpec.runs[0].tracking_em}em`,
    // Outline fill matches the ground it sits on, which differs per variant.
    yearGround: yearGroundOverride ?? overlay.ground,
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

/**
 * Google Forms header, 1600x400, in either colourway.
 *
 * Forms crops headers to 4:1, which cuts the sides off the 6:1 LinkedIn
 * cover. This reuses the cover's type specs and hexagon cluster, scaled by
 * FORMS_SCALE, and lays them out for 4:1 with the 2026 lockup on the right.
 * The positions are composed, not measured: there is no designer reference
 * for this surface, so judge it by eye.
 */
const FORMS_SCALE = 1.45;

function renderFormsHeader(opts, geometry, tokens) {
  const theme = (opts.theme ?? "light").toLowerCase();
  if (!["light", "dark"].includes(theme)) {
    console.error(`--theme must be light or dark (got ${theme})`);
    process.exit(2);
  }
  const dark = theme === "dark";
  const color = tokens.color;
  const cover = geometry.cover;
  const display = cover.text["COPEN HAGEN"];
  const outlineSpec = cover.text["2026"];
  const hex = cover.placement.hexagons;
  const s = FORMS_SCALE;
  const [canvasW, canvasH] = [1600, 400];
  const margin = 112;

  // The cover's text block, top of line 1 to the outline baseline, centred.
  const blockH = (outlineSpec.baseline - display.y) * s;
  const top = (canvasH - blockH) / 2;
  const at = (y) => +(top + (y - display.y) * s).toFixed(2);

  // Lockup: the cropped 2026 artwork, 841x434 viewBox.
  const lockupH = 200;
  const lockupW = +((lockupH * 841) / 434).toFixed(2);
  const lockupX = canvasW - margin - lockupW;

  // Hexagons: centred between the copy and the lockup, keeping the cover's
  // slight drop below the vertical centre.
  const hexW = hex.w * s;
  const hexH = hex.h * s;
  const coverDrop = hex.y + hex.h / 2 - cover.canvas[1] / 2;
  const textRight = 560; // widest default line, measured from a render
  const hexX = +((textRight + lockupX) / 2 - hexW / 2).toFixed(2);
  const hexY = +(canvasH / 2 + coverDrop * s - hexH / 2).toFixed(2);

  const ground = dark ? color.navy : color.sand;
  const svg = fill(stripLeadComment(load(join(TEMPLATES, "forms-header.svg"))), {
    canvasW,
    canvasH,
    ground,
    red: color.red,
    hexagons: assetURL(
      join(ROOT, "brand", "logo", dark ? "cnd-hexagons-solid.svg" : "cnd-hexagons.svg"),
    ),
    hexX,
    hexY,
    hexW,
    hexH,
    textX: margin,
    displaySize: +(display.runs[0].size_px * s).toFixed(2),
    displayTracking: `${display.runs[0].tracking_em}em`,
    displayColor: dark ? color.white : color.navy,
    line1: escapeXML((opts.line1 ?? "Tell us").toUpperCase()),
    line2: escapeXML((opts.line2 ?? "How it went").toUpperCase()),
    line1Y: at(display.baseline),
    line2Y: at(display.baseline + leadingOf(display)),
    outline: escapeXML((opts.outline ?? "Feedback").toUpperCase()),
    outlineY: at(outlineSpec.baseline),
    outlineSize: +(outlineSpec.runs[0].size_px * s).toFixed(2),
    outlineTracking: `${outlineSpec.runs[0].tracking_em}em`,
    outlineStroke: +(YEAR_STROKE * s).toFixed(2),
    lockup: assetURL(
      join(ROOT, "brand", "logo", dark ? "cnd-lockup-2026-white.svg" : "cnd-lockup-2026-navy.svg"),
    ),
    lockupX: +lockupX.toFixed(2),
    lockupY: +((canvasH - lockupH) / 2).toFixed(2),
    lockupW,
    lockupH,
  });

  rasterise(svg, {
    canvasW,
    canvasH,
    scale: opts.scale,
    keepHtml: opts["keep-html"],
    slug: `forms-header-${theme}`,
    out: opts.out ?? join(ROOT, "graphics", "out", `forms-header-${theme}.png`),
    label: `forms header, ${theme}`,
  });
}

/**
 * TicketButler event cover, 760x500, in either colourway.
 *
 * Built from the cover's parts: the year-free wordmark + mark (so any year
 * works), its type specs and hexagon cluster. Positions are composed, not
 * measured, so judge it by eye. The outline defaults to next year because
 * the cover goes up when that edition's tickets open.
 */
function renderTicketCover(opts, geometry, tokens) {
  const theme = (opts.theme ?? "light").toLowerCase();
  if (!["light", "dark"].includes(theme)) {
    console.error(`--theme must be light or dark (got ${theme})`);
    process.exit(2);
  }
  const dark = theme === "dark";
  const color = tokens.color;
  const cover = geometry.cover;
  const display = cover.text["COPEN HAGEN"];
  const outlineSpec = cover.text["2026"];
  const place = cover.placement;
  const [canvasW, canvasH] = [760, 500];
  const margin = 56;

  // Lockup top left: wordmark and mark keep their relative placement from
  // the cover, scaled up.
  const ls = 1.25;
  const wordmarkX = margin;
  const wordmarkY = margin + (place.wordmark.y - place.mark.y) * ls;
  const markX = wordmarkX + (place.mark.x - place.wordmark.x) * ls;
  const markY = margin;

  // Copy bottom left, outline baseline on the bottom margin.
  const ts = 1.6;
  const outlineY = canvasH - margin;
  const at = (y) => +(outlineY - (outlineSpec.baseline - y) * ts).toFixed(2);

  // Hexagons bleed off the bottom right.
  const hs = 1.45;
  const hexW = place.hexagons.w * hs;
  const hexH = place.hexagons.h * hs;

  const ground = dark ? color.navy : color.sand;
  const svg = fill(stripLeadComment(load(join(TEMPLATES, "ticket-cover.svg"))), {
    canvasW,
    canvasH,
    ground,
    red: color.red,
    hexagons: assetURL(
      join(ROOT, "brand", "logo", dark ? "cnd-hexagons-solid.svg" : "cnd-hexagons.svg"),
    ),
    hexX: +(canvasW - hexW * 0.78).toFixed(2),
    hexY: +(canvasH - hexH * 0.82).toFixed(2),
    hexW: +hexW.toFixed(2),
    hexH: +hexH.toFixed(2),
    wordmark: assetURL(
      join(ROOT, "brand", "logo", dark ? "cnd-lockup-cream.svg" : "cnd-lockup-navy.svg"),
    ),
    wordmarkX,
    wordmarkY: +wordmarkY.toFixed(2),
    wordmarkW: +(place.wordmark.w * ls).toFixed(2),
    wordmarkH: +(place.wordmark.h * ls).toFixed(2),
    mark: assetURL(join(ROOT, "brand", "logo", "cnd-mark.svg")),
    markX: +markX.toFixed(2),
    markY,
    markW: +(place.mark.w * ls).toFixed(2),
    markH: +(place.mark.h * ls).toFixed(2),
    textX: margin,
    displaySize: +(display.runs[0].size_px * ts).toFixed(2),
    displayTracking: `${display.runs[0].tracking_em}em`,
    displayColor: dark ? color.sand : color.navy,
    line1: escapeXML((opts.line1 ?? "Blind").toUpperCase()),
    line2: escapeXML((opts.line2 ?? "Bird").toUpperCase()),
    line1Y: at(display.baseline),
    line2Y: at(display.baseline + leadingOf(display)),
    outline: escapeXML(String(opts.outline ?? Number(tokens.event.year) + 1).toUpperCase()),
    outlineY,
    outlineSize: +(outlineSpec.runs[0].size_px * ts).toFixed(2),
    outlineTracking: `${outlineSpec.runs[0].tracking_em}em`,
    outlineStroke: +(YEAR_STROKE * ts).toFixed(2),
  });

  rasterise(svg, {
    canvasW,
    canvasH,
    scale: opts.scale,
    keepHtml: opts["keep-html"],
    slug: `ticket-cover-${theme}`,
    out: opts.out ?? join(ROOT, "graphics", "out", `ticket-cover-${theme}.png`),
    label: `ticket cover, ${theme}`,
  });
}


/**
 * Type-led poster: no card, no tab, the stack carries the whole composition.
 *
 * Display type here follows her *deck* display spec rather than her social one:
 * weight 700 at negative tracking. Her social templates set everything in
 * Medium at +0.02em, which is right at 40-49px but goes slack at 130px — and
 * her own lockup and deck titles are heavy with tight tracking, so this is the
 * in-system choice for type at display scale.
 */
function renderPoster(opts, geometry, tokens) {
  const color = tokens.color;
  const grounds = { navy: color.navy, sand: color.sand, red: color.red };
  const groundName = (opts.ground ?? "navy").toLowerCase();
  const ground = grounds[groundName];
  if (!ground) {
    console.error(`--ground must be navy, sand or red (got ${groundName})`);
    process.exit(2);
  }

  const square = (opts.surface ?? "post").toLowerCase() === "square";
  const canvasW = geometry.canvas.w;
  const canvasH = square ? 1080 : geometry.canvas.h;
  const shift = square ? geometry.canvas.h - 1080 : 0;

  // Footer artwork and the year come from the measured "clean" frame, so the
  // poster's footer is identical to every framed layout's.
  const clean = geometry.overlays.clean[groundName === "sand" ? "3" : "2"];
  const yearSpec = Object.values(geometry.frames)
    .map((byVariant) => byVariant["2"]?.year)
    .find(Boolean);

  const onLight = groundName === "sand";
  const solid = onLight ? color.navy : color.white;

  const size = Number(opts.size ?? 190);
  const leading = +(size * 0.948).toFixed(2);
  const textX = clean.lockup.x; // align the stack to the lockup's left edge

  const rawLines = (opts.lines ?? "The|schedule|is|*live").split("|");
  const metaSize = 34;

  // Bottom-anchored against the footer rather than centred in the space above
  // it. Centring left the stack floating with dead air above and below; sitting
  // it on the footer with one clear gap gives the type somewhere to push
  // against, and the air collects at the top where it reads as intentional.
  const footerTop = clean.mark.y - shift;
  const lastBaseline = footerTop - 190;
  const firstBaseline = Math.round(lastBaseline - (rawLines.length - 1) * leading);

  const lines = rawLines
    .map((raw, i) => {
      const outline = raw.trim().startsWith("*");
      const text = escapeXML(raw.trim().replace(/^\*/, "").toUpperCase());
      const y = +(firstBaseline + i * leading).toFixed(2);
      const paint = outline
        ? `fill="${ground}" stroke="${color.red}" stroke-width="${Math.max(
            3,
            Math.round(size / 26),
          )}" paint-order="stroke fill"`
        : `fill="${solid}"`;
      return `<tspan x="${textX}" y="${y}" ${paint}>${text}</tspan>`;
    })
    .join("");

  // Optional hexagon cluster, bled off the right edge. Uses the ground-baked
  // artwork so it holds its colours on navy as well as sand.
  const decoration = opts.hexagons
    ? `<image xlink:href="${assetURL(
        join(ROOT, "brand", "logo", "cnd-hexagons-solid.svg"),
      )}" x="${canvasW - 300}" y="${Math.round(canvasH * 0.06)}" width="460" height="387" opacity="0.9"/>`
    : "";

  const svg = fill(stripLeadComment(load(join(TEMPLATES, "poster.svg"))), {
    canvasW,
    canvasH,
    ground,
    red: color.red,
    decoration,

    textX,
    meta: escapeXML((opts.meta ?? `${tokens.event.dates} · ${tokens.event.venue}`).toUpperCase()),
    // Clear of the first line's ink, not just its baseline: cap height is
    // 0.7em, so a 0.62em offset put the eyebrow *inside* the display type.
    metaY: firstBaseline - Math.round(size * 0.7) - 44,
    metaSize,
    metaTracking: "0.08em",
    metaColor: color.red,

    lines,
    displaySize: size,
    displayTracking: "-0.01em",

    lockup: assetURL(
      join(ROOT, "brand", "logo", onLight ? "cnd-lockup-navy.svg" : "cnd-lockup-cream.svg"),
    ),
    lockupX: clean.lockup.x,
    lockupY: clean.lockup.y - shift,
    lockupW: clean.lockup.w,
    lockupH: clean.lockup.h,
    mark: assetURL(join(ROOT, "brand", "logo", "cnd-mark.svg")),
    markX: clean.mark.x,
    markY: clean.mark.y - shift,
    markW: clean.mark.w,
    markH: clean.mark.h,

    year: tokens.event.year,
    yearX: yearSpec.x,
    yearY: yearSpec.baseline - shift,
    yearSize: yearSpec.runs[0].size_px,
    yearTracking: `${yearSpec.runs[0].tracking_em}em`,
    yearStroke: YEAR_STROKE,
  });

  rasterise(svg, {
    canvasW,
    canvasH,
    scale: opts.scale,
    keepHtml: opts["keep-html"],
    slug: `poster-${groundName}`,
    out: opts.out ?? join(ROOT, "graphics", "out", `poster-${groundName}.png`),
    label: `poster, ${groundName}, ${square ? "square" : "4:5"}`,
  });
}


/**
 * The announcement layout. Square by default, since that is the shape it was
 * asked for; --surface post gives 1080x1350.
 *
 * Content sits in the top 45% and the rest is left empty on purpose — the air
 * is the layout, not an accident, so nothing here tries to fill it.
 */
function renderBulletin(opts, geometry, tokens) {
  const color = tokens.color;
  const grounds = {
    sand: color.sand, bone: color.bone, navy: color.navy, red: color.red,
  };
  const groundName = (opts.ground ?? "sand").toLowerCase();
  const ground = grounds[groundName];
  if (!ground) {
    console.error(`--ground must be sand, bone, navy or red (got ${groundName})`);
    process.exit(2);
  }
  const dark = groundName === "navy" || groundName === "red";
  const onRed = groundName === "red";
  const ink = dark ? color.white : color.navy;
  const canvasW = geometry.canvas.w;
  const canvasH =
    (opts.surface ?? "square").toLowerCase() === "post" ? geometry.canvas.h : 1080;

  const M = 86; // same left margin as the footer lockup, so the grid agrees
  const decorName = (opts.decor ?? "shape").toLowerCase();

  // How much width the copy actually has, which depends on what the decor
  // occupies. hexfield puts a portrait hexagon at x 647, so text must stop
  // well before it — this is the measurement that stops a long name running
  // into the photo.
  const columnW =
    decorName === "hexfield"
      ? 530 // the field's leftmost hexagon edge is 647; 560 left only 12px
      : decorName === "none"
        ? canvasW - M * 2
        : 800;

  const metrics = geometry.metrics;

  // A "^" prefix marks a line as the figure — the countdown number — and sets
  // it much larger than the rest. Countdowns need the number to dominate and
  // the label to sit under it, which a single uniform size cannot do.
  const FIGURE_RATIO = 1.95;
  // Wordmark first, mark to its upper right — her arrangement.
  const wordmark = { x: M, y: 58, w: 150, h: 89 };
  const mark = markFor(wordmark);

  const rawLines = (opts.headline ?? "Platform|engineering.")
    .split("|")
    .map((l) => l.trim());
  const isFigure = rawLines.map((l) => l.startsWith("^"));
  const headLinesRaw = rawLines.map((l) => l.replace(/^\^/, ""));

  // Fit the ordinary lines and the figure separately, then take whichever
  // constraint is tighter — a wide figure must shrink the whole block, not
  // just itself, or the two stop looking like one unit.
  const plainLines = headLinesRaw.filter((_, i) => !isFigure[i]);
  const figureLines = headLinesRaw.filter((_, i) => isFigure[i]);
  const fitPlain = plainLines.length
    ? fitSize(metrics, "SpaceGrotesk-Bold", plainLines, 132, columnW, -0.015)
    : 132;
  const fitFigure = figureLines.length
    ? fitSize(
        metrics, "SpaceGrotesk-Bold", figureLines,
        132 * FIGURE_RATIO, columnW, -0.02,
      ) / FIGURE_RATIO
    : 132;
  const headlineSize = opts.size
    ? Number(opts.size)
    : Math.min(fitPlain, fitFigure);
  const headlineLead = +(headlineSize * 0.95).toFixed(2);
  const sizeOf = (i) =>
    +(headlineSize * (isFigure[i] ? FIGURE_RATIO : 1)).toFixed(2);
  // A figure's label belongs close under it, not a full line away — 0.95 of a
  // 257px figure left them reading as two separate statements.
  const leadOf = (i) => +(sizeOf(i) * (isFigure[i] ? 0.72 : 0.95)).toFixed(2);
  const bodyLinesRaw = (opts.body ?? "Two short lines of|supporting detail.")
    .split("|")
    .map((l) => l.trim());
  const bodySize = fitSize(
    metrics, "Inter-Regular", bodyLinesRaw, 34, columnW, 0,
  );
  const eyebrowSize = 30;

  const bodyLines = bodyLinesRaw;

  const eyebrowBase = 200;
  // A figure is nearly twice the body size, so its cap reaches far above the
  // baseline and would otherwise strike through the eyebrow. Push the block
  // down by the extra cap height.
  const headFirst =
    eyebrowBase + 112 + (isFigure[0] ? 0.7 * (headlineSize * FIGURE_RATIO - headlineSize) : 0);
  // Each line advances by its own leading, so a mixed-size block stacks
  // correctly instead of assuming one uniform step.
  const headBaselines = headLinesRaw.map((_, i) =>
    headLinesRaw
      .slice(0, i)
      .reduce((y, _l, j) => y + leadOf(j), headFirst),
  );
  const headEnd = headBaselines[headBaselines.length - 1];
  const bodyFirst = headEnd + 84;

  const tspans = (lines, x, first, lead) =>
    lines
      .map(
        (l, i) =>
          `<tspan x="${x}" y="${+(first + i * lead).toFixed(2)}">${escapeXML(
            l.trim(),
          )}</tspan>`,
      )
      .join("");

  // Corner accent. Two devices, both hers:
  //   shape     the mark's own silhouette, scaled large and bled off an edge
  //   hexagons  her 4-hexagon cluster, as on the roll-ups and beachflag
  // The cluster uses the ground-baked twin, because the stock artwork is a
  // darkening overlay that disappears on navy and red.
  const decor = decorName;
  const shapeName = (opts.shape ?? (dark ? "white" : "rose")).toLowerCase();
  const shapeColor =
    { rose: color.rose, peach: color.peach, slate: color.slate,
      navy: color.navy, red: color.red, white: color.white }[shapeName] ?? null;
  const at = (opts.at ?? "top-right").toLowerCase();
  let corner = "";
  if (decor === "hexagons") {
    const w = Number(opts.shapeSize ?? 620);
    const h = +(w * 270 / 321).toFixed(2); // the cluster's own aspect
    // Positioned to bleed rather than intrude. The headline runs to roughly
    // x 830 at the default size, so a top-right cluster that starts before
    // that collides with it — which is what the first pass did.
    const spot =
      at === "top-left"
        ? { x: -w * 0.52, y: -h * 0.34 }
        : at === "bottom-left"
          ? { x: -w * 0.48, y: canvasH - h * 0.62 }
          : at === "bottom-right"
            ? { x: canvasW - w * 0.52, y: canvasH - h * 0.62 }
            : { x: canvasW - w * 0.4, y: -h * 0.34 };
    corner =
      `<image xlink:href="${assetURL(
        join(ROOT, "brand", "logo", "cnd-hexagons-solid.svg"),
      )}" x="${spot.x.toFixed(2)}" y="${spot.y.toFixed(2)}" ` +
      `width="${w}" height="${h}" opacity="${dark ? 0.9 : 1}"/>`;
  } else if (decor === "hexfield") {
    corner = hexField(geometry, tokens, canvasW, canvasH, opts, dark);
  } else if (decor !== "none" && shapeColor) {
    const side = Number(opts.shapeSize ?? 470);
    const box =
      at === "top-left"
        ? { cx: M + 40, cy: -30 }
        : at === "bottom-left"
          ? { cx: M + 20, cy: canvasH + 40 }
          : { cx: canvasW - 40, cy: -20 };
    const opacity = dark ? 0.16 : 1;
    corner =
      `<path d="${tokens.shape.path}" fill="${shapeColor}" ` +
      `fill-opacity="${opacity}" transform="${shapeTransform(
        tokens.shape.viewBox,
        { side, cx: box.cx, cy: box.cy },
      )}"/>`;
  }

  // Optional faint tiled outline of the same shape, as in the third reference.
  const texture = opts.texture
    ? `<rect width="${canvasW}" height="${canvasH}" fill="url(#texture)" ` +
      `opacity="${dark ? 0.1 : 0.06}"/>`
    : "";

  const svg = fill(stripLeadComment(load(join(TEMPLATES, "bulletin.svg"))), {
    canvasW,
    canvasH,
    ground,
    shapePath: tokens.shape.path,
    textureTransform: shapeTransform(tokens.shape.viewBox, {
      side: 84, cx: 48, cy: 48,
    }),
    textureColor: dark ? color.white : color.navy,
    texture,
    corner,

    // The flag mark is red with a white cross, so on a red ground it collapses
    // to a white plus. Her package has no red-ground mark treatment and
    // inventing a knockout is a decision for her, so red uses the wordmark
    // alone and the wordmark moves to the margin.
    mark: onRed ? "" : assetURL(join(ROOT, "brand", "logo", "cnd-mark.svg")),
    markX: mark.x,
    markY: mark.y,
    markW: onRed ? 0 : mark.w,
    markH: onRed ? 0 : mark.h,
    wordmark: assetURL(
      join(ROOT, "brand", "logo", dark ? "cnd-lockup-cream.svg" : "cnd-lockup-navy.svg"),
    ),
    wordmarkX: wordmark.x,
    wordmarkY: wordmark.y,
    wordmarkW: wordmark.w,
    wordmarkH: wordmark.h,

    textX: M,
    eyebrow: escapeXML((opts.eyebrow ?? "Track 02 · announced").toUpperCase()),
    eyebrowY: eyebrowBase,
    eyebrowSize,
    eyebrowTracking: "0.18em",
    eyebrowColor: dark ? color.white : color.red,

    headline: headLinesRaw
      .map(
        (line, i) =>
          `<tspan x="${M}" y="${headBaselines[i].toFixed(2)}" ` +
          `font-size="${sizeOf(i)}"` +
          (isFigure[i] ? ' letter-spacing="-0.02em"' : "") +
          `>${escapeXML(line)}</tspan>`,
      )
      .join(""),
    headlineSize,
    headlineColor: ink,

    body: tspans(bodyLines, M, bodyFirst, bodySize * 1.45),
    bodySize,
    bodyColor: dark
      ? color.white
      : color["ink-muted"],
  });

  rasterise(svg, {
    canvasW,
    canvasH,
    scale: opts.scale,
    keepHtml: opts["keep-html"],
    slug: `bulletin-${groundName}`,
    out: opts.out ?? join(ROOT, "graphics", "out", `bulletin-${groundName}.png`),
    label: `bulletin, ${groundName}, ${canvasW}x${canvasH}`,
  });
}


/**
 * A scatter of her hexagons, optionally with a photo or a logo inside one.
 *
 * The arrangement is fixed rather than random: the text block runs to about
 * x 700 at the current display size, so every hexagon is placed clear of it,
 * and several bleed off an edge so the field reads as a crop of something
 * larger rather than a tidy motif dropped in a corner.
 *
 * With --portrait the largest hexagon becomes the photo — the speaker sits in
 * one of the hexagons rather than beside them. With --logo it becomes a white
 * hexagon holding a contained logo, since a logo must never be cropped.
 */
function hexField(geometry, tokens, canvasW, canvasH, opts, dark) {
  const color = tokens.color;
  const hex = geometry.hexagon;
  // On red the rose and peach accents sit too close to the ground and go
  // muddy, so the field tints with white instead — the same move her hexagon
  // overlay makes on sand, inverted.
  const onRedGround = (opts.ground ?? "").toLowerCase() === "red";
  const fills = onRedGround
    ? [color.white, color.white, color.white]
    : [color.rose, color.peach, color.slate];

  // Two-speaker keynotes need a matched pair rather than one big hexagon and a
  // scattering. These interlock the way her cluster does: the second sits half
  // a cell right and three-quarters of a cell down from the first.
  const pairSpots = [
    { w: 340, cx: 790, cy: 340 },
    { w: 340, cx: 930, cy: 616 },
    { w: 196, cx: 620, cy: 616 },
    { w: 150, cx: 1046, cy: 300 },
    { w: 236, cx: 790, cy: 892 },
    { w: 124, cx: 606, cy: 900 },
  ];

  // width, centre x, centre y — the big one first, so it can take the photo.
  // Kept clear of the text: at 132px the headline runs to about x 620, so the
  // photo hexagon starts past that. The first pass had it at cx 800 with
  // w 470, whose left edge landed at 565 and clipped the descender of the
  // headline's last word.
  const spots = [
    { w: 430, cx: 862, cy: 372 },
    { w: 214, cx: 1064, cy: 656 },
    { w: 286, cx: 792, cy: 790 },
    { w: 156, cx: 1020, cy: 216 },
    { w: 200, cx: 966, cy: 1010 },
    { w: 132, cx: 660, cy: 986 },
    { w: 108, cx: 604, cy: 690 },
  ];

  const media = opts.portrait ?? opts.logo;
  const second = opts.portrait2;
  // The spot lists are laid out against the 1080-tall square. On the taller
  // 4:5 surface their vertical positions scale with the canvas, otherwise the
  // field bunches in the middle and leaves a dead third at the bottom.
  const cyScale = canvasH / 1080;
  const layout = (second ? pairSpots : spots).map((sp) => ({
    ...sp,
    cy: +(sp.cy * cyScale).toFixed(2),
  }));
  const mediaCount = second ? 2 : media ? 1 : 0;
  const parts = [];
  const defs = [];

  layout.forEach((spot, i) => {
    const box = hexTransform(hex.viewBox, spot);
    if (i === 1 && second) {
      const id = "hexmask1";
      defs.push(
        `<clipPath id="${id}"><path d="${hex.path}" transform="${box.transform}"/></clipPath>`,
      );
      parts.push(
        `<g clip-path="url(#${id})"><image xlink:href="${assetURL(
          resolve(second),
        )}" x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" ` +
          `width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" ` +
          `preserveAspectRatio="${opts.align2 ?? "xMidYMid"} slice"/></g>`,
      );
      return;
    }
    if (i === 0 && media) {
      const id = `hexmask${i}`;
      defs.push(
        `<clipPath id="${id}"><path d="${hex.path}" transform="${box.transform}"/></clipPath>`,
      );
      if (opts.logo) {
        // White hexagon, logo contained inside with padding. Contained, never
        // cropped — a clipped sponsor logo is worse than no logo.
        const pad = box.w * 0.22;
        parts.push(
          `<path d="${hex.path}" transform="${box.transform}" fill="${color.white}"/>` +
            `<image xlink:href="${assetURL(resolve(opts.logo))}" ` +
            `x="${(box.x + pad).toFixed(2)}" y="${(box.y + pad).toFixed(2)}" ` +
            `width="${(box.w - pad * 2).toFixed(2)}" height="${(box.h - pad * 2).toFixed(2)}" ` +
            `preserveAspectRatio="xMidYMid meet"/>`,
        );
      } else {
        parts.push(
          `<g clip-path="url(#${id})"><image xlink:href="${assetURL(
            resolve(opts.portrait),
          )}" x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" ` +
            `width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" ` +
            `preserveAspectRatio="${opts.align ?? "xMidYMid"} slice"/></g>`,
        );
      }
      return;
    }
    const fill = fills[Math.max(0, i - mediaCount) % fills.length];
    parts.push(
      `<path d="${hex.path}" transform="${box.transform}" fill="${fill}" ` +
        `fill-opacity="${onRedGround ? 0.16 : dark ? 0.92 : 1}"/>`,
    );
  });

  return (defs.length ? `<defs>${defs.join("")}</defs>` : "") + parts.join("");
}


/**
 * A tier of sponsors, each logo inside one of her hexagons.
 *
 * Logos are *contained* with padding, never clipped — a cropped sponsor logo
 * is worse than no logo, and every hexagon carries a white ground so logos of
 * any colour sit legibly on navy, sand or red.
 *
 * The row is a honeycomb: alternate hexagons step down half a cell, which is
 * how her cluster interlocks, rather than sitting in a plain line.
 */
function renderSponsors(opts, geometry, tokens) {
  const color = tokens.color;
  const grounds = {
    sand: color.sand, bone: color.bone, navy: color.navy, red: color.red,
  };
  const groundName = (opts.ground ?? "navy").toLowerCase();
  const ground = grounds[groundName];
  if (!ground) {
    console.error(`--ground must be sand, bone, navy or red (got ${groundName})`);
    process.exit(2);
  }
  const dark = groundName === "navy" || groundName === "red";
  const onRed = groundName === "red";
  const ink = dark ? color.white : color.navy;
  const hex = geometry.hexagon;
  const canvasW = geometry.canvas.w;
  const canvasH =
    (opts.surface ?? "square").toLowerCase() === "post" ? geometry.canvas.h : 1080;

  const logos = (opts.logos ?? "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
  if (logos.length === 0) {
    console.error("--logos needs at least one file, comma separated");
    process.exit(2);
  }

  const M = 86;
  const wordmark = { x: M, y: 58, w: 150, h: 89 };
  const mark = markFor(wordmark);

  const headLines = (opts.headline ?? "Thank you,|gold sponsors.")
    .split("|")
    .map((l) => l.trim());
  const headSize = opts.size
    ? Number(opts.size)
    : fitSize(
        geometry.metrics, "SpaceGrotesk-Bold", headLines, 132,
        canvasW - M * 2, -0.015,
      );
  const headLead = +(headSize * 0.95).toFixed(2);

  const eyebrowBase = 200;
  // A figure is nearly twice the body size, so its cap reaches far above the
  // baseline and would otherwise strike through the eyebrow. Push the block
  // down by the extra cap height.
  // No figure lines in a sponsor tier, so the plain offset applies.
  const headFirst = eyebrowBase + 112;
  const headBottom = headFirst + (headLines.length - 1) * headLead;

  // Fit the honeycomb to the space left below the headline.
  //
  // The vertical budget has to know the row count *before* sizing a cell. A
  // single-row formula sized two rows of bronze sponsors so they overlapped and
  // the bottom row ran off the canvas. Total height of the block is one cell,
  // plus 0.84 of a cell per additional row, plus the 0.24 stagger the odd
  // columns are pushed down by.
  const perRow = Math.min(logos.length, Number(opts.perRow ?? 4));
  const rows = Math.ceil(logos.length / perRow);
  const gap = 20;
  const fieldTop = headBottom + 118;

  // A honeycomb offsets alternate *rows* horizontally by half a cell and steps
  // down three-quarters of a cell. Staggering individual columns downward
  // instead — which is what the first version did — stacks same-column
  // hexagons on top of each other and they merge into a white blob.
  const ROW_STEP = 0.8;
  const stack = 1 + (rows - 1) * ROW_STEP;
  const cellH = Math.min(
    ((canvasW - M * 2 - gap * perRow) / perRow) * (1090.11 / 1005.874),
    (canvasH - fieldTop - 60) / stack,
  );
  const cellW = Math.round((cellH * 1005.874) / 1090.11);
  // Drawn slightly inside the lattice cell so neighbours have visible gaps.
  const drawW = Math.round(cellW * 0.94);

  const defs = [];
  const cells = [];
  logos.forEach((logoPath, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = Math.min(perRow, logos.length - row * perRow);
    const pitch = cellW + gap;
    const rowW = inRow * pitch - gap;
    // Odd rows shift half a pitch right, so cells nest between the row above.
    const x0 = (canvasW - rowW) / 2 + (row % 2 ? pitch / 2 : 0);
    const cx = x0 + col * pitch + cellW / 2;
    const cy = fieldTop + row * cellH * ROW_STEP + cellH / 2;
    const box = hexTransform(hex.viewBox, { w: drawW, cx, cy });
    const pad = drawW * 0.2;
    cells.push(
      `<path d="${hex.path}" transform="${box.transform}" fill="${color.white}"/>` +
        `<image xlink:href="${assetURL(resolve(logoPath))}" ` +
        `x="${(box.x + pad).toFixed(2)}" y="${(box.y + pad).toFixed(2)}" ` +
        `width="${(box.w - pad * 2).toFixed(2)}" ` +
        `height="${(box.h - pad * 2).toFixed(2)}" ` +
        `preserveAspectRatio="xMidYMid meet"/>`,
    );
  });

  const tspans = (lines, x, first, lead) =>
    lines
      .map(
        (l, i) =>
          `<tspan x="${x}" y="${+(first + i * lead).toFixed(2)}">${escapeXML(
            l.trim(),
          )}</tspan>`,
      )
      .join("");

  const svg = fill(stripLeadComment(load(join(TEMPLATES, "bulletin.svg"))), {
    canvasW,
    canvasH,
    ground,
    shapePath: tokens.shape.path,
    textureTransform: shapeTransform(tokens.shape.viewBox, { side: 84, cx: 48, cy: 48 }),
    textureColor: dark ? color.white : color.navy,
    texture: "",
    corner: (defs.length ? `<defs>${defs.join("")}</defs>` : "") + cells.join(""),

    mark: onRed ? "" : assetURL(join(ROOT, "brand", "logo", "cnd-mark.svg")),
    markX: mark.x,
    markY: mark.y,
    markW: onRed ? 0 : mark.w,
    markH: onRed ? 0 : mark.h,
    wordmark: assetURL(
      join(ROOT, "brand", "logo", dark ? "cnd-lockup-cream.svg" : "cnd-lockup-navy.svg"),
    ),
    wordmarkX: wordmark.x,
    wordmarkY: wordmark.y,
    wordmarkW: wordmark.w,
    wordmarkH: wordmark.h,

    textX: M,
    eyebrow: escapeXML((opts.eyebrow ?? "Sponsors · 2026").toUpperCase()),
    eyebrowY: eyebrowBase,
    eyebrowSize: 30,
    eyebrowTracking: "0.18em",
    eyebrowColor: dark ? color.white : color.red,

    headline: tspans(headLines, M, headFirst, headLead),
    headlineSize: headSize,
    headlineColor: ink,

    body: "",
    bodySize: 34,
    bodyColor: ink,
  });

  rasterise(svg, {
    canvasW,
    canvasH,
    scale: opts.scale,
    keepHtml: opts["keep-html"],
    slug: `sponsors-${groundName}`,
    out: opts.out ?? join(ROOT, "graphics", "out", `sponsors-${groundName}.png`),
    label: `sponsors, ${groundName}, ${logos.length} logo(s)`,
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
