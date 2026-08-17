#!/usr/bin/env node
// Generates brand/tokens.css from brand/tokens.json.
// tokens.json is the single source of truth; never hand-edit tokens.css.
//
//   node brand/build-tokens.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));

const faces = Object.entries(t.fontFile)
  .flatMap(([family, files]) =>
    files.map(
      (f) => `@font-face {
  font-family: "${family}";
  src: url("fonts/${f.file}") format("truetype");
  font-weight: ${f.weight};
  font-style: ${f.style ?? "normal"};
  font-display: block;
}`,
    ),
  )
  .join("\n\n");

const group = (obj, prefix) =>
  Object.entries(obj)
    .map(([k, v]) => `  --cnd-${prefix}${k}: ${v};`)
    .join("\n");

/**
 * The shape silhouette as a CSS mask, inlined as a data URI.
 *
 * A data URI rather than a url() to logo/cnd-shape-mask.svg on purpose: decks
 * and renders are opened over file://, where every document is its own opaque
 * origin, so Chrome refuses to load an external SVG as a mask and silently
 * clips the masked element away to nothing. A data URI has no origin to fail.
 *
 * Only the characters that break CSS url() parsing are escaped, so the value
 * stays readable in the generated file.
 */
const shapeMask = () => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${t.shape.viewBox}">` +
    `<path d="${t.shape.path}" fill="#000"/></svg>`;
  const encoded = svg
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/"/g, "%22")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
  return `url("data:image/svg+xml,${encoded}")`;
};

const css = `/* GENERATED FILE — do not edit.
 * Source: brand/tokens.json
 * Regenerate: node brand/build-tokens.mjs
 */

${faces}

:root {
  /* palette */
${group(t.color, "")}

  /* families */
  --cnd-font-display: "${t.font.display}", system-ui, sans-serif;
  --cnd-font-body: "${t.font.body}", system-ui, sans-serif;

  /* tracking */
${group(t.tracking, "track-")}

  /* leading */
${group(t.leading, "lead-")}

  /* The logo silhouette as a mask, for clipping portraits into the shape —
   * which is how cloudnativedenmark.dk crops its own team photos. */
  --cnd-shape-mask: ${shapeMask()};
}

/* Reset shared by every rendered surface. Renders are fixed-size canvases,
 * never responsive documents, so margin and overflow must be zeroed. */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}

body {
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
}

/* The outline-numeral device: fill matches the ground, stroke is red.
 * Set --cnd-outline-ground to whatever sits behind it. */
.cnd-outline {
  color: var(--cnd-outline-ground, transparent);
  -webkit-text-stroke: var(--cnd-outline-width, 2px) var(--cnd-red);
  letter-spacing: var(--cnd-track-display);
}
`;

writeFileSync(join(here, "tokens.css"), css);

// The shape motif ships as a standalone asset too, generated from the same
// token so the path exists in exactly one place.
writeFileSync(
  join(here, "logo", "cnd-shape.svg"),
  `<!-- GENERATED from brand/tokens.json shape.path — do not edit -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${t.shape.viewBox}">
  <path d="${t.shape.path}" fill="currentColor"/>
</svg>
`,
);

// A second copy with an explicit black fill, for use as a CSS mask. The
// currentColor version above is right for inline use, where it picks up the
// surrounding ink — but a mask-image loads the SVG as an isolated document with
// no inherited colour, so currentColor has nothing to resolve against. The deck
// clips portraits into this, matching how cloudnativedenmark.dk does it.
writeFileSync(
  join(here, "logo", "cnd-shape-mask.svg"),
  `<!-- GENERATED from brand/tokens.json shape.path — do not edit.
     Explicit black fill so this works as a CSS mask-image. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${t.shape.viewBox}">
  <path d="${t.shape.path}" fill="#000"/>
</svg>
`,
);
console.log(
  `wrote tokens.css (${Object.keys(t.color).length} colors, ${
    Object.values(t.fontFile).flat().length
  } font faces) and logo/cnd-shape.svg`,
);
