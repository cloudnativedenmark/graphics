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
console.log(
  `wrote tokens.css (${Object.keys(t.color).length} colors, ${
    Object.values(t.fontFile).flat().length
  } font faces) and logo/cnd-shape.svg`,
);
