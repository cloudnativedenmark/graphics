#!/usr/bin/env node
/**
 * Build the LED wall's show data from the content files.
 *
 *   node stage/build.mjs
 *
 * Reads content/2026-announcements.json (talk titles, names, portraits,
 * sponsors) and content/2026-stage.json (job titles, run of show) and writes
 * stage/show.data.js, which the player loads with a plain <script> tag.
 *
 * A script rather than JSON because the player runs from file:// on the show
 * laptop, and Chrome refuses fetch() there. No server to forget to start.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { qrRows } from "./qr.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const content = read("content/2026-announcements.json");
const stage = read("content/2026-stage.json");
const tokens = read("brand/tokens.json");

// Asset paths in the content file are repo-relative; the player lives in stage/.
const fromStage = (p) => (p ? `../${p}` : null);

/**
 * The announcement `body` is "Full title|continued||Speaker & Speaker". The
 * title's `|` breaks were chosen for a 1080px card, not the wall, so they are
 * joined back into one line and the wall's own layout wraps it.
 */
function parseTalk(entry, kind) {
  const [titlePart, namesPart = ""] = entry.body.split("||");
  // A break after a hyphen ("Real-|World") joins without a space.
  const title = titlePart.replace(/-\|/g, "-").split("|").join(" ").replace(/\s+/g, " ").trim();
  const names = namesPart.split("|")[0].split(" & ").map((s) => s.trim()).filter(Boolean);
  const roles = stage.roles[entry.slug] ?? [];
  const portraits = [entry.portrait, entry.portrait2].filter(Boolean);
  const aligns = [entry.align, entry.align2];
  return {
    slug: entry.slug,
    kind,
    title,
    speakers: names.map((name, i) => ({
      name,
      // A TODO never reaches the wall: an empty line reads better than a placeholder.
      role: roles[i] && !/^TODO/.test(roles[i]) ? roles[i] : "",
      portrait: fromStage(portraits[i] ?? null),
      align: aligns[i] ?? null,
    })),
  };
}

const talks = {};
// The announcement eyebrow ("Keynote", "Lightning talk") is the wall's eyebrow too.
for (const k of content.keynotes) talks[k.slug] = parseTalk(k, "Keynote");
for (const s of content.sessions ?? []) talks[s.slug] = parseTalk(s, s.eyebrow ?? "Session");

// Stage-only items (remarks, the charity partner, wrap-ups) are written out
// in full in the stage file.
for (const [slug, t] of Object.entries(stage.talks ?? {})) {
  if (slug.startsWith("$")) continue;
  talks[slug] = {
    slug,
    kind: t.kind,
    title: t.title,
    // The Sessionize title, when the wall words it differently.
    schedule: t.schedule,
    speakers: t.speakers.map((sp) => ({
      name: sp.name,
      role: sp.role && !/^TODO/.test(sp.role) ? sp.role : "",
      portrait: fromStage(sp.portrait ?? null),
      align: sp.align ?? null,
    })),
  };
}

/* The final schedule (content/2026-schedule.json, synced from Sessionize)
 * adds when and where to every talk. Sessions are matched to the entries
 * above by title, so hand-picked portraits and crops stay; anything on the
 * schedule without an entry gets one from Sessionize, keyed by its id. Job
 * titles missing above come from the speaker's Sessionize tagline. */
const schedule = existsSync(join(ROOT, "content", "2026-schedule.json")) ? read("content/2026-schedule.json") : null;
const titleKey = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const organizerPortrait = new Map((stage.organizers?.people ?? []).map((o) => [o.name, o.portrait]));
const organizerNames = new Set(organizerPortrait.keys());
// Remarks by the hosts are not talks; their eyebrow says what they are.
function kindFor(session) {
  if (/sponsor keynote/i.test(session.title)) return "Sponsor keynote";
  if (session.room === "Workshop") return "Workshop";
  if (session.speakers.length && session.speakers.every((s) => organizerNames.has(s.name))) return "Remarks";
  return "Session";
}
const byTitle = new Map(Object.values(talks).map((t) => [titleKey(t.schedule ?? t.title), t]));
const programme = [];
for (const s of schedule?.sessions ?? []) {
  const when = { id: s.id, day: s.day, room: s.room, start: s.start, end: s.end };
  if (s.service) {
    programme.push({ ...when, service: true, title: s.title });
    continue;
  }
  let t = byTitle.get(titleKey(s.title));
  if (!t) {
    t = talks[`sz-${s.id}`] = {
      slug: `sz-${s.id}`,
      kind: kindFor(s),
      title: s.title,
      speakers: s.speakers.map((sp) => ({
        name: sp.name,
        role: organizerNames.has(sp.name) ? "" : sp.tagLine,
        portrait: fromStage(organizerPortrait.get(sp.name) ?? sp.portrait),
        align: null,
      })),
    };
  } else {
    // A co-speaker the announcement left out is still on stage.
    for (const from of s.speakers) {
      if (t.speakers.some((sp) => sp.name === from.name)) continue;
      t.speakers.push({ name: from.name, role: "", portrait: null, align: null });
    }
    for (const sp of t.speakers) {
      const from = s.speakers.find((x) => x.name === sp.name);
      if (!sp.role && from && !organizerNames.has(sp.name)) sp.role = from.tagLine;
      if (!sp.portrait && from?.portrait) sp.portrait = fromStage(from.portrait);
    }
  }
  Object.assign(t, when);
  programme.push({ ...when, talk: t.slug });
}

/* QR codes, read out of their PNGs by stage/import-qr.py: a module grid per
 * code, keyed by Sessionize session id. The photos link is encoded here
 * (stage/qr.mjs). Both are drawn by the wall as one path ({ n, d }) on a
 * white hexagon. */
const qrCodes = existsSync(join(ROOT, "content", "2026-qr.json")) ? read("content/2026-qr.json").codes : {};
function qrPath(code) {
  if (!code) return null;
  let d = "";
  code.rows.forEach((row, y) => {
    for (const m of row.matchAll(/1+/g)) d += `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`;
  });
  const q = { n: code.rows.length, d };
  if (code.logo) q.mark = sessionizeMark(code.logo);
  return q;
}

/* The Sessionize mark their feedback codes carry in the middle: a tile
 * with one big rounded corner and a tilted star cut out of it, redrawn in
 * module units so it scales with the code. The tile class takes the code's
 * colour; .qr-star is white (cnd-deck.css, stage.css). */
function sessionizeMark([r0, c0, r1, c1]) {
  const S = 4.8;
  const x = (c0 + c1 + 1) / 2 - S / 2;
  const y = (r0 + r1 + 1) / 2 - S / 2;
  const r = 0.55;
  const R = 2.1;
  const f = (v) => +v.toFixed(3);
  const tile =
    `M${f(x + r)} ${f(y)}H${f(x + S - R)}A${R} ${R} 0 0 1 ${f(x + S)} ${f(y + R)}` +
    `V${f(y + S - r)}A${r} ${r} 0 0 1 ${f(x + S - r)} ${f(y + S)}H${f(x + r)}` +
    `A${r} ${r} 0 0 1 ${f(x)} ${f(y + S - r)}V${f(y + r)}A${r} ${r} 0 0 1 ${f(x + r)} ${f(y)}Z`;
  const cx = x + S * 0.44;
  const cy = y + S * 0.55;
  const outer = S * 0.39;
  const inner = outer * 0.45;
  const turn = (15 * Math.PI) / 180;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = turn - Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? inner : outer;
    return `${f(cx + rad * Math.cos(a))} ${f(cy + rad * Math.sin(a))}`;
  });
  return `<path d="${tile}"/><path class="qr-star" stroke-linejoin="round" d="M${pts.join("L")}Z"/>`;
}
for (const t of Object.values(talks)) {
  const q = qrPath(qrCodes[t.id]);
  if (q) t.feedback = q;
}

// A talk's walk-on announcement, if one has been recorded for it
// (assets/audio/announce/<slug>.mp3; the words are in the stage file).
for (const t of Object.values(talks)) {
  const file = `assets/audio/announce/${t.slug}.mp3`;
  if (existsSync(join(ROOT, file))) t.announce = fromStage(file);
}

const missing = [];
for (const [day, { cues }] of Object.entries(stage.days)) {
  for (const cue of cues) {
    for (const ref of [cue.talk, cue.next].flat().filter(Boolean)) {
      if (!talks[ref]) missing.push(`day ${day}: ${ref}`);
    }
  }
}
if (missing.length) {
  console.error(`Unknown talk slug(s) in content/2026-stage.json:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

const tierOrder = content.tiers.map((t) => t.tier);
const show = {
  event: tokens.event,
  wall: stage.wall,
  // Where each screen is and how big: the wall behind the main stage, and the
  // projector in the breakout room. `schedule` is the room's Sessionize name.
  rooms: {
    main: { label: "Main stage", schedule: "Main stage", width: stage.wall.width, height: stage.wall.height },
    breakout: { label: "Breakout", schedule: "Breakout", width: 1920, height: 1080 },
  },
  talks,
  tiers: tierOrder.map((tier) => ({
    tier,
    sponsors: content.sponsors
      .filter((s) => s.tier === tier)
      .map((s) => ({ name: s.name, logo: fromStage(s.logo) })),
  })),
  // Partners & media (CNCF, the charity partner): thanked beside the
  // community sponsors, but not a sponsor tier.
  partners: (content.partners ?? []).map((p) => ({ name: p.name, logo: fromStage(p.logo) })),
  days: stage.days,
  // Every session of both days in every room, in time order: the breaks'
  // "next here / next in the breakout" and the breakout screen read this.
  programme,
  organizers: (stage.organizers?.people ?? []).map((o) => ({ ...o, portrait: fromStage(o.portrait) })),
  social: stage.social ?? null,
  photos: stage.qr?.photos ? qrPath({ rows: qrRows(stage.qr.photos) }) : null,
  music: stage.music
    ? {
        ...stage.music,
        sets: Object.fromEntries(Object.entries(stage.music.sets ?? {}).map(([k, v]) => [k, v.map(fromStage)])),
        walkon: [stage.music.walkon ?? []].flat().map(fromStage),
      }
    : null,
  walkonSeconds: stage.walkonSeconds ?? 0,
  clearBeforeWalkon: !!stage.clearBeforeWalkon,
};

const out = join(HERE, "show.data.js");
writeFileSync(
  out,
  `/* GENERATED by stage/build.mjs — do not edit. Edit content/2026-stage.json. */\n` +
    `window.SHOW = ${JSON.stringify(show, null, 2)};\n`,
);
console.log(`stage/show.data.js  ${Object.keys(talks).length} talks, ${content.sponsors.length} sponsors`);
