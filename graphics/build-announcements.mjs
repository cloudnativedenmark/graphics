#!/usr/bin/env node
/**
 * Render every 2026 announcement graphic from content/2026-announcements.json.
 *
 *   node graphics/build-announcements.mjs
 *   node graphics/build-announcements.mjs --scale 2     # retina
 *   node graphics/build-announcements.mjs --surface post # 4:5 as well
 *
 * Content lives in the JSON, not in this file, so adding a keynote or moving a
 * sponsor between tiers is a content edit rather than a code change. Output
 * lands in graphics/out/announcements/.
 *
 * Each keynote renders square by default because that is the format these were
 * designed against; pass --surface post for the 1080x1350 feed variant too.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RENDER = join(ROOT, "graphics", "render.mjs");
const OUT = join(ROOT, "graphics", "out", "announcements");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const scale = flag("scale", "1");
const surfaces = argv.includes("--surface")
  ? [flag("surface", "square")]
  : ["square"];

const content = JSON.parse(
  readFileSync(join(ROOT, "content", "2026-announcements.json"), "utf8"),
);

mkdirSync(OUT, { recursive: true });

function render(args, label) {
  try {
    const out = execFileSync("node", [RENDER, ...args], { encoding: "utf8" });
    console.log(`  ${out.trim()}`);
  } catch (err) {
    console.error(`  FAILED ${label}: ${err.stderr?.toString().trim() ?? err.message}`);
    process.exitCode = 1;
  }
}

for (const surface of surfaces) {
  const suffix = surface === "square" ? "" : `-${surface}`;

  console.log(`\nkeynotes (${surface})`);
  for (const k of content.keynotes) {
    const args = [
      "bulletin",
      "--ground", k.ground ?? "navy",
      "--decor", "hexfield",
      "--eyebrow", k.eyebrow,
      "--headline", k.headline,
      "--body", k.body,
      "--surface", surface,
      "--scale", scale,
      "--out", join(OUT, `${k.slug}${suffix}.png`),
    ];
    if (k.portrait) args.push("--portrait", join(ROOT, k.portrait));
    if (k.portrait2) args.push("--portrait2", join(ROOT, k.portrait2));
    // Crop alignment, for photos where the subject is not centred — a wide
    // stage shot, or a headshot with a dog in the other half of the frame.
    if (k.align) args.push("--align", k.align);
    if (k.align2) args.push("--align2", k.align2);
    render(args, k.slug);
  }

  console.log(`\nsponsor tiers (${surface})`);
  for (const t of content.sponsorTiers) {
    if (t.single) {
      // A single sponsor gets the keynote layout with a logo in the hexagon,
      // which gives them the whole graphic rather than one cell of a row.
      render(
        [
          "bulletin",
          "--ground", t.ground ?? "navy",
          "--decor", "hexfield",
          "--logo", join(ROOT, t.single),
          "--eyebrow", t.eyebrow,
          "--headline", t.headline,
          "--body", t.body ?? "",
          "--surface", surface,
          "--scale", scale,
          "--out", join(OUT, `sponsors-${t.slug}${suffix}.png`),
        ],
        t.slug,
      );
      continue;
    }
    render(
      [
        "sponsors",
        "--ground", t.ground ?? "navy",
        "--logos", t.logos.map((l) => join(ROOT, l)).join(","),
        "--perRow", String(t.perRow ?? 4),
        "--eyebrow", t.eyebrow,
        "--headline", t.headline,
        "--surface", surface,
        "--scale", scale,
        "--out", join(OUT, `sponsors-${t.slug}${suffix}.png`),
      ],
      t.slug,
    );
  }
}

console.log(`\n-> ${relative(ROOT, OUT)}`);
