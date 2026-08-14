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
// Both surfaces by default: square for the grid, 4:5 for the feed. Items that
// only make sense in one declare `surfaces` in the content file.
const surfaces = argv.includes("--surface")
  ? [flag("surface", "square")]
  : ["square", "post"];

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

  // General announcements can ask for specific surfaces, since a schedule
  // reveal wants both the square and the 4:5 feed version.
  const general = (content.general ?? []).filter(
    (g) => !g.surfaces || g.surfaces.includes(surface),
  );
  if (general.length) {
    console.log(`\nannouncements (${surface})`);
    for (const g of general) {
      render(
        [
          "bulletin",
          "--ground", g.ground ?? "navy",
          "--decor", g.decor ?? "hexfield",
          "--eyebrow", g.eyebrow,
          "--headline", g.headline,
          "--body", g.body,
          "--surface", surface,
          "--scale", scale,
          "--out", join(OUT, `${g.slug}${suffix}.png`),
        ],
        g.slug,
      );
    }
  }

  console.log(`\ncountdowns (${surface})`);
  for (const c of content.countdowns ?? []) {
    // Single digits are zero-padded, which is what makes a countdown read as a
    // countdown rather than as a number that happens to be small.
    const figure = c.days < 10 ? `0${c.days}` : String(c.days);
    const unit = c.days === 1 ? "day" : "days";
    render(
      [
        "bulletin",
        "--ground", c.ground ?? "navy",
        "--decor", "hexfield",
        "--eyebrow", c.eyebrow,
        "--headline", `^${figure}|${unit} to go.`,
        "--body", c.body,
        "--surface", surface,
        "--scale", scale,
        "--out", join(OUT, `countdown-${String(c.days).padStart(2, "0")}${suffix}.png`),
      ],
      `countdown ${c.days}`,
    );
  }

  console.log(`\nsponsors — singles (${surface})`);
  for (const sp of content.sponsors) {
    const tier = content.tiers.find((t) => t.tier === sp.tier) ?? {};
    render(
      [
        "bulletin",
        "--ground", tier.ground ?? "navy",
        "--decor", "hexfield",
        "--logo", join(ROOT, sp.logo),
        "--eyebrow", `${sp.tier} sponsor`,
        "--headline", `Thank you,|${sp.name}.`,
        "--body", `${sp.tier} sponsor of|Cloud Native Denmark 2026.`,
        "--surface", surface,
        "--scale", scale,
        "--out", join(OUT, `sponsor-${sp.slug}${suffix}.png`),
      ],
      sp.slug,
    );
  }

  console.log(`\nsponsors — tiers (${surface})`);
  for (const t of content.tiers) {
    const logos = content.sponsors.filter((s) => s.tier === t.tier);
    if (logos.length === 0) continue;
    const plural = logos.length === 1 ? "sponsor" : "sponsors";
    if (logos.length === 1) {
      // A tier of one is just that sponsor's single, so skip the honeycomb.
      console.log(`  (skipped ${t.tier}: one sponsor, covered by its single)`);
      continue;
    }
    render(
      [
        "sponsors",
        "--ground", t.ground ?? "navy",
        "--logos", logos.map((s) => join(ROOT, s.logo)).join(","),
        "--perRow", String(t.perRow ?? 4),
        "--eyebrow", `${t.tier} ${plural} · 2026`,
        "--headline", `Thank you,|${t.tier.toLowerCase()} ${plural}.`,
        "--surface", surface,
        "--scale", scale,
        "--out", join(OUT, `tier-${t.tier.toLowerCase()}${suffix}.png`),
      ],
      t.tier,
    );
  }
}

console.log(`\n-> ${relative(ROOT, OUT)}`);
