#!/usr/bin/env node
/**
 * Fail if any template, renderer or deck stylesheet hardcodes a colour that
 * is not in brand/tokens.json.
 *
 *   node test/token-lint.mjs
 *
 * This exists because the drift it catches has already happened once: the
 * generated deck in the designer's brand book had wandered to #001A33 navy
 * and #E63026 red and picked up an off-brand #4F81BD table header and
 * #10B981 status green. Nothing flagged it. Now something does.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SCAN_DIRS = ["graphics", "decks", "stage"];
const SCAN_EXT = new Set([".svg", ".mjs", ".css", ".html", ".js"]);
const SKIP_DIRS = new Set(["out", "node_modules", ".git"]);

// Colours allowed outside the palette, each for a stated reason. Anything
// not listed here and not in tokens.json is a failure.
const ALLOWED = new Map([
  ["#FFF", "SVG mask luminance — white keeps, not a brand colour"],
  ["#000", "SVG mask luminance — black knocks out, not a brand colour"],
  ["#FFFFFF", "brand white, also mask luminance"],
  ["#000000", "SVG mask luminance"],
  ["#D97757", "Claude Code's own orange, on its mascot in the day-two thank-you (stage.css): a guest's mark keeps its colours, as sponsor logos do"],
]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SCAN_EXT.has(extname(full))) out.push(full);
  }
  return out;
}

const tokens = JSON.parse(readFileSync(join(ROOT, "brand", "tokens.json"), "utf8"));
const palette = new Set(Object.values(tokens.color).map((c) => c.toUpperCase()));

let violations = 0;
for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  try {
    statSync(abs);
  } catch {
    continue; // decks/ may not exist yet
  }
  for (const file of walk(abs)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const raw of line.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
        const hex = raw.toUpperCase();
        if (palette.has(hex) || ALLOWED.has(hex)) continue;
        // Ignore SVG/CSS id references like url(#tab-glow) — those matched
        // the pattern only if they happen to be hex-ish, which is rare, but
        // guard anyway.
        if (/url\(#/.test(line) && !/[:=]\s*["']?#/.test(line)) continue;
        console.error(
          `${relative(ROOT, file)}:${i + 1}  ${raw}  not in brand/tokens.json`,
        );
        violations++;
      }
    });
  }
}

if (violations) {
  console.error(
    `\n${violations} hardcoded colour(s). Add to brand/tokens.json and ` +
      `regenerate, or justify in test/token-lint.mjs ALLOWED.`,
  );
  process.exit(1);
}
console.log(`token lint clean — ${palette.size} palette colours`);
