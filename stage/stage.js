/* Cloud Native Denmark — LED wall runtime.
 *
 *   → space PageDown   next cue (clickers send PageDown)
 *   ← PageUp           previous cue
 *   Home               first cue of the day
 *   1 / 2              switch to day one / day two
 *   b                  panic still on/off — lockup only, safe at any moment
 *   g                  guides: cabinet grid, zones, possible occlusion band
 *   f                  fullscreen
 *   m                  music on/off (starts muted: Chrome needs a key press
 *                      before it will play sound)
 *
 * URL: ?day=1&step=4   start there
 *      ?room=breakout  the breakout room's 1920×1080 screen, with its own run
 *                      of show and operator (main stage when absent)
 *      ?output         1:1 at the top-left, no HUD — the window on the LED feed
 *      ?still          no motion, end state only (stage/render.mjs uses this)
 *      ?clock=08:55    pretend it is this time, for the countdown
 *      ?guides         guides on
 *
 *      ?preview        scaled to the window, no HUD, never plays music —
 *                      the live preview inside the control page
 *      ?audio          play sound in this window even without ?output. Only
 *                      the ?output window plays sound otherwise.
 *
 * Two ways to run it:
 *
 *   Served (the show):  node stage/serve.mjs, then open the printed URLs.
 *                       The server owns the state; this page only follows it,
 *                       and the control page (control.html) drives it from
 *                       this or any other machine. Keys here still work.
 *   From file://:       rehearsal only. Keys drive this window, and other
 *                       windows on the same machine follow on a
 *                       BroadcastChannel where Chrome allows it.
 */

(() => {
  const SHOW = window.SHOW;
  const params = new URLSearchParams(location.search);
  const ROOM = SHOW.rooms?.[params.get("room")] ? params.get("room") : "main";
  const BREAKOUT = ROOM === "breakout";
  const W = SHOW.rooms?.[ROOM]?.width ?? SHOW.wall.width;
  const H = SHOW.rooms?.[ROOM]?.height ?? SHOW.wall.height;
  const CX = W / 2;

  const OUTPUT = params.has("output");
  const STILL = params.has("still");
  const PREVIEW = params.has("preview");
  const SERVED = location.protocol.startsWith("http");
  // A still is a fixed picture of the step in its URL — the control page's
  // "next" preview is one — so it never follows the show.
  const FOLLOW = SERVED && !STILL;
  // Exactly one window makes sound: the wall (?output). Two windows playing
  // means one of them keeps playing while the other has moved on to a talk.
  // ?audio forces it on, for a single-window rehearsal.
  const AUDIO = (OUTPUT || params.has("audio")) && !PREVIEW && !STILL;

  // The brand hexagon from brand/geometry.json (via cnd-hexagon.svg). The
  // viewBox is the path's own ink box: the one stored in the SVG starts at
  // y 66.9 and clips the top vertex off.
  const HEX_D =
    "M 974.382812 895.261719 C 991.835938 885.179688 1005.988281 860.671875 1005.988281 840.515625 L 1005.988281 333.214844 C 1005.988281 313.058594 991.835938 288.550781 974.382812 278.46875 L 535.046875 24.820312 C 517.59375 14.742188 489.289062 14.742188 471.835938 24.820312 L 32.5 278.46875 C 15.042969 288.550781 0.894531 313.058594 0.894531 333.214844 L 0.894531 840.515625 C 0.894531 860.671875 15.042969 885.179688 32.5 895.261719 L 471.835938 1148.910156 C 489.289062 1158.988281 517.59375 1158.988281 535.046875 1148.910156 Z";
  const HEX_VB = { x: 0.894, y: 17.3, w: 1005.1, h: 1139.1 };
  const HEX_RATIO = HEX_VB.w / HEX_VB.h;

  const C = {
    navy: "var(--cnd-navy)",
    red: "var(--cnd-red)",
    rose: "var(--cnd-rose)",
    peach: "var(--cnd-peach)",
    slate: "var(--cnd-slate)",
    sand: "var(--cnd-sand)",
  };

  // Titles keep hyphenated words whole: "REAL-" at a line end reads as a typo
  // from the back of a hall.
  const title = (s) => esc(s).replace(/(\S+-\S+)/g, '<span style="white-space:nowrap">$1</span>');

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // Seeded, so the field is the same every time the laptop reloads — and the
  // same in a render as on the night.
  function rng(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** SVG transform placing the brand hexagon with height h, centred at cx, cy. */
  function hexPlace(cx, cy, h) {
    const k = h / HEX_VB.h;
    const w = h * HEX_RATIO;
    return `translate(${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)}) scale(${k.toFixed(5)}) translate(${-HEX_VB.x} ${-HEX_VB.y})`;
  }

  /** Pointy-top honeycomb centres covering the wall plus one cell of bleed. */
  function honeycomb(h, gap) {
    const w = h * HEX_RATIO;
    const dx = w + gap;
    const dy = h * 0.75 + gap * 0.87;
    const out = [];
    for (let r = -1; r * dy < H + h; r++) {
      const off = r % 2 ? dx / 2 : 0;
      for (let c = -1; c * dx < W + w; c++) out.push({ cx: c * dx + off, cy: r * dy + h / 2 - 20, r, c });
    }
    return out;
  }

  const smooth = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  /* ── field ────────────────────────────────────────────────────────────
   * One honeycomb for the whole show. Scenes change only its density — a
   * function of x — so cells fade in and out rather than the field being
   * rebuilt, and moving from walk-on to live reads as the field clearing out
   * of the speaker's way.
   */

  const DENSITY = {
    // Walk-in, breaks, messages: nobody on stage, text in the thirds. The
    // field gathers in the centre, clear of the words.
    ambient: (x) => 0.6 * Math.exp(-(((x - CX) / 500) ** 2)),
    // Walk-on: portrait and title own the middle, so the field sits at the
    // outer edges and frames them.
    walkon: (x) => Math.max(1 - smooth(160, 580, x), smooth(W - 380, W - 100, x)) * 0.62,
    // Live: a person is standing in front of the middle third. Almost nothing
    // anywhere — a few faint cells at the very edges, a trace in the centre.
    live: (x) => Math.max(1 - smooth(40, 140, x), smooth(W - 140, W - 40, x)) * 0.6 + 0.05 * Math.exp(-(((x - CX) / 680) ** 2)),
    // Sponsors: logos across the right two thirds; keep behind them clean.
    sponsors: (x) => (1 - smooth(1060, 1280, x)) * 0.35 + smooth(W - 160, W - 20, x) * 0.6,
  };

  // The breakout screen is a projector beside the speaker, not behind them,
  // and its scenes fill the frame edge to edge: the field only frames it.
  if (BREAKOUT) {
    const edges = (x) => Math.max(1 - smooth(30, 190, x), smooth(W - 190, W - 30, x));
    Object.assign(DENSITY, {
      ambient: (x) => edges(x) * 0.7,
      walkon: (x) => edges(x) * 0.7,
      live: (x) => edges(x) * 0.5,
      sponsors: (x) => edges(x) * 0.5,
    });
  }

  // Fewer cells, more solid: a half-transparent rose on navy turns brown, so
  // the loud scenes use near-solid tints and the quiet ones use very few.
  const FIELD_ALPHA = { ambient: 0.9, walkon: 0.9, live: 0.3, sponsors: 0.6 };

  const field = (() => {
    const rand = rng(2026);
    // No red in the field: at LED brightness a full-red cell is the loudest
    // thing on the wall, which is backwards for decoration.
    const palette = [C.rose, C.peach, C.slate, C.slate, C.rose, C.peach];
    const h = 190;
    const cells = honeycomb(h, 16).map((p) => ({
      ...p,
      h,
      pick: rand(),
      tint: palette[Math.floor(rand() * palette.length)],
      level: 0.55 + rand() * 0.45,
      breathe: 14 + rand() * 12,
      phase: -rand() * 26,
    }));

    const drifters = Array.from({ length: 5 }, (_, i) => ({
      h: 130 + rand() * 220,
      cy: 150 + rand() * (H - 300),
      drift: 220 + rand() * 140,
      phase: -rand() * 300,
      tint: i % 2 ? C.sand : C.slate,
    }));

    const svg =
      `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">` +
      drifters
        .map(
          (d) =>
            `<g class="drifter" style="--drift:${d.drift.toFixed(0)}s;--phase:${d.phase.toFixed(1)}s">` +
            `<path d="${HEX_D}" transform="${hexPlace(0, d.cy, d.h)}" fill="${d.tint}" opacity="0.05"/></g>`,
        )
        .join("") +
      cells
        .map(
          (cell, i) =>
            `<g class="cell" data-i="${i}"><g transform="${hexPlace(cell.cx, cell.cy, cell.h)}">` +
            `<path d="${HEX_D}" fill="${cell.tint}" style="--breathe:${cell.breathe.toFixed(1)}s;--phase:${cell.phase.toFixed(1)}s"/></g></g>`,
        )
        .join("") +
      `</svg>`;

    const el = document.createElement("div");
    el.className = "field";
    el.innerHTML = svg;
    const nodes = [...el.querySelectorAll(".cell")];

    function set(mode) {
      const f = DENSITY[mode];
      const alpha = FIELD_ALPHA[mode];
      nodes.forEach((node, i) => {
        const cell = cells[i];
        const d = f(cell.cx);
        const on = cell.pick < d;
        node.style.setProperty("--o", on ? (alpha * cell.level * (0.45 + 0.55 * d)).toFixed(3) : "0");
        // Delay by distance from the centre: cells nearest the speaker go
        // first, so the field reads as parting outward.
        node.style.setProperty("--d", `${((Math.abs(cell.cx - CX) / CX) * 0.9).toFixed(2)}s`);
        // Cells leaving drift a little away from the centre as they fade.
        node.style.setProperty("--dx", on ? "0px" : `${Math.sign(cell.cx - CX) * 70}px`);
        node.style.setProperty("--s", on ? "1" : "0.7");
      });
    }

    return { el, set };
  })();

  /* ── wipe ─────────────────────────────────────────────────────────────
   * Every scene change is a wave of hexagons: they grow in from the left and
   * cover the wall, the scene is swapped underneath, and they shrink away in
   * the same direction. Most cells are navy, so the wave reads as the old
   * scene being eaten hexagon by hexagon; a quarter carry the accent colours,
   * which is what makes it the brand rather than a generic transition.
   */

  const wipe = (() => {
    const rand = rng(404);
    const h = 290;
    // No red: at full strength it strobes across the wall mid-wave. The rest
    // are tints at 35% over navy — the wave should be felt more than seen.
    const accents = [C.rose, C.peach, C.slate];
    const cells = honeycomb(h, 0).map((p) => ({
      ...p,
      jitter: rand() * 0.14,
      fill: rand() < 0.14 ? accents[Math.floor(rand() * accents.length)] : C.navy,
    }))
      // Accents drawn last: grown to 1.16 to close the gaps at the rounded
      // corners, a navy neighbour drawn on top would bite a notch out of them.
      .sort((p, q) => (p.fill === C.navy ? 0 : 1) - (q.fill === C.navy ? 0 : 1));
    const el = document.createElement("div");
    el.className = "wipe";
    el.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">` +
      cells
        .map(
          (cell) =>
            // Every cell is solid navy, so the old scene is fully covered;
            // an accent is a tint laid over that navy, not a solid colour.
            `<g transform="${hexPlace(cell.cx, cell.cy, h)}"><g class="wc"><path d="${HEX_D}" fill="${C.navy}"/>` +
            (cell.fill === C.navy ? "" : `<path d="${HEX_D}" fill="${cell.fill}" fill-opacity="0.35"/>`) +
            `</g></g>`,
        )
        .join("") +
      `</svg>`;
    const paths = [...el.querySelectorAll(".wc")];
    const SPREAD = 0.7; // seconds from first cell to last
    const CELL = 0.8; // matches the CSS transition

    function stagger() {
      paths.forEach((p, i) => {
        const x = Math.min(1, Math.max(0, cells[i].cx / W));
        p.style.setProperty("--d", `${(x * SPREAD + cells[i].jitter).toFixed(3)}s`);
      });
    }

    // One wave at a time. A press during a wave replaces whatever change was
    // waiting rather than queueing another full wave, so two quick presses
    // land on the latest cue in one wave instead of lagging behind.
    let running = false;
    let queued = null;
    function run(swap) {
      if (STILL) {
        swap();
        return;
      }
      if (running) {
        queued = swap;
        return;
      }
      running = true;
      stagger();
      el.toggleAttribute("data-covered", true);
      setTimeout(() => {
        swap();
        if (queued) {
          queued();
          queued = null;
        }
        el.toggleAttribute("data-covered", false);
        setTimeout(() => {
          running = false;
          if (queued) {
            const next = queued;
            queued = null;
            run(next);
          }
        }, (SPREAD + CELL + 0.2) * 1000);
      }, (SPREAD + 0.14 + CELL + 0.08) * 1000);
    }
    return { el, run };
  })();

  /* ── pieces ───────────────────────────────────────────────────────── */

  /** Wordmark + mark at the designer's measured ratios (markFor in render.mjs). */
  function lockup(x, y, w) {
    const h = (w * 870.581) / 1511.728;
    const m = { x: 0.8303 * w, y: -0.1875 * h, w: 0.4207 * w, h: 0.7 * h };
    return (
      `<div class="lockup" style="left:${x}px;top:${y}px;width:${w}px;height:${h.toFixed(1)}px">` +
      `<img src="../brand/logo/cnd-lockup-cream.svg" alt="Cloud Native Denmark" style="left:0;top:0;width:${w}px;height:${h.toFixed(1)}px">` +
      `<img src="../brand/logo/cnd-mark.svg" alt="" style="left:${m.x.toFixed(1)}px;top:${m.y.toFixed(1)}px;width:${m.w.toFixed(1)}px;height:${m.h.toFixed(1)}px;object-fit:contain">` +
      `</div>`
    );
  }

  function hexLogo(s, h, style = "") {
    return (
      `<div class="hexlogo" style="width:${(h * HEX_RATIO).toFixed(1)}px;height:${h}px;${style}">` +
      `<svg viewBox="${HEX_VB.x} ${HEX_VB.y} ${HEX_VB.w} ${HEX_VB.h}"><path d="${HEX_D}"/></svg>` +
      `<img src="${esc(s.logo)}" alt="${esc(s.name)}"></div>`
    );
  }

  /** A QR code on a white brand hexagon, the way sponsor logos sit. The code
   *  (from stage/build.mjs) is a module count and one path; the square it
   *  needs, quiet zone included, fits inside the hexagon's waist. */
  function qrTile(q, h, style = "") {
    const w = h * HEX_RATIO;
    const side = w * 0.7;
    return (
      `<div class="hexlogo qr" style="width:${w.toFixed(1)}px;height:${h}px;${style}">` +
      `<svg viewBox="${HEX_VB.x} ${HEX_VB.y} ${HEX_VB.w} ${HEX_VB.h}"><path d="${HEX_D}"/></svg>` +
      `<svg class="code" viewBox="-2 -2 ${q.n + 4} ${q.n + 4}" style="left:${((w - side) / 2).toFixed(1)}px;top:${((h - side) / 2).toFixed(1)}px;width:${side.toFixed(1)}px;height:${side.toFixed(1)}px">` +
      `<path d="${q.d}"/>${q.mark ?? ""}</svg></div>`
    );
  }

  /** Sponsor row for the loop scenes: a fixed row of white hexagons across
   *  the bottom of the wall, always there, whose logos change in groups
   *  (stage.js rotators). `tiers` limits which sponsors appear; `false`
   *  means no row at all. */
  const SLOTS = 6;
  function sponsorRow(tiers) {
    // Off unless a cue asks for tiers: the sponsor wall is in every loop now.
    if (!Array.isArray(tiers)) return "";
    const all = SHOW.tiers.filter((t) => tiers.includes(t.tier)).flatMap((t) => t.sponsors);
    if (!all.length) return "";
    const slots = Math.min(SLOTS, all.length);
    // Groups of `slots`, the last one topped up from the start of the list so
    // every box always carries a logo.
    const groups = [];
    for (let i = 0; i < all.length; i += slots) {
      const g = all.slice(i, i + slots);
      for (let k = 0; g.length < slots; k++) g.push(all[k]);
      groups.push(g);
    }
    const h = 150;
    const w = h * HEX_RATIO;
    const boxes = groups[0]
      .map((sp, i) => {
        const cx = (W * (i + 0.5)) / slots;
        return hexLogo(sp, h, `position:absolute;left:${(cx - w / 2).toFixed(0)}px;top:0`).replace(
          '<div class="hexlogo"',
          `<div class="hexlogo slot" data-slot="${i}"`,
        );
      })
      .join("");
    const data = esc(JSON.stringify(groups.map((g) => g.map((sp) => ({ logo: sp.logo, name: sp.name })))));
    return `<div class="sponsor-row rise" style="--i:4" data-groups="${data}">${boxes}</div>`;
  }

  /** Every 7 s the next group swaps in, box by box from the left. */
  let rotators = [];
  function startRotators(root) {
    rotators.forEach(clearInterval);
    rotators = [];
    if (STILL) return;
    root.querySelectorAll(".sponsor-row[data-groups]").forEach((row) => {
      const groups = JSON.parse(row.dataset.groups);
      if (groups.length < 2) return;
      let g = 0;
      rotators.push(
        setInterval(() => {
          g = (g + 1) % groups.length;
          row.querySelectorAll(".slot img").forEach((img, i) => {
            setTimeout(() => {
              img.classList.add("out");
              setTimeout(() => {
                img.src = groups[g][i].logo;
                img.alt = groups[g][i].name;
                img.classList.remove("out");
              }, 450);
            }, i * 110);
          });
        }, 7000),
      );
    });
  }

  /* Where things sit, per room. The main wall keeps its content in the outer
   * thirds; the breakout screen is 16:9 and uses the whole frame. */
  const L = BREAKOUT
    ? { lockup: [110, 400, 600], sponsors: { x0: 110, top: 520, right: W - 110, label: 74 }, qr: 640 }
    : { lockup: [130, 320, 880], sponsors: { x0: 1300, top: 280, right: W - 100, label: 72 }, qr: 820 };

  const { cuesFor, nextIn } = window.CUES;
  const roomName = SHOW.rooms?.[ROOM]?.schedule ?? "Main stage";

  /** The talk this room had last before a cue: what the feedback scene asks about. */
  function lastTalkBefore(cue, day) {
    const cues = cuesFor(day, ROOM);
    for (let k = cues.indexOf(cue) - 1; k >= 0; k--) if (cues[k].scene === "talk") return SHOW.talks[cues[k].talk];
    return null;
  }

  const dayLabel = (day) => SHOW.days[day]?.label ?? "";
  const namesOf = (talk) => window.CUES.namesOf(talk);

  /* ── scenes ───────────────────────────────────────────────────────────
   * Each returns { html, mode } — mode picks the field density.
   */

  /** Tiers left to right, largest first, each a small honeycomb of white
   *  hexagons, under a heading in the left zone. Every tier shrinks together
   *  until the row ends inside the frame. Used by the sponsor wall and the
   *  community scene. */
  const COMMUNITY_TIERS = ["Community"];
  function tierWall(tiers, spec, eyebrow, headline) {
    const gap = 16;
    const widthAt = (k) =>
      tiers.reduce((sum, tier) => {
        const { h, per } = spec[tier.tier] ?? { h: 230, per: 3 };
        const w = h * k * HEX_RATIO;
        const rows = Math.ceil(tier.sponsors.length / per);
        return sum + Math.min(per, tier.sponsors.length) * (w + gap) + (rows > 1 ? (w + gap) / 2 : 0) + 100;
      }, -100 - gap);
    const { x0, top, right, label } = L.sponsors;
    // Shrink every tier together until the row ends inside the frame; the
    // margins between tiers don't scale, so search rather than divide.
    let k = 1;
    while (k > 0.3 && widthAt(k) > right - x0) k -= 0.01;
    let x = x0;
    let i = 0;
    const blocks = tiers.map((tier) => {
      const base = spec[tier.tier] ?? { h: 230, per: 3 };
      const h = Math.round(base.h * k);
      const per = base.per;
      const w = h * HEX_RATIO;
      const rows = Math.ceil(tier.sponsors.length / per);
      const html =
        `<p class="tier-label rise" style="--i:${i++};left:${x}px;top:${top - label}px">${esc(tier.tier)}</p>` +
        tier.sponsors
          .map((s, n) => {
            const r = Math.floor(n / per);
            const c = n % per;
            const lx = x + c * (w + gap) + (r % 2 ? (w + gap) / 2 : 0);
            const ly = top + r * (h * 0.75 + gap);
            return hexLogo(s, h, `position:absolute;left:${lx.toFixed(0)}px;top:${ly.toFixed(0)}px`);
          })
          .join("");
      const cols = Math.min(per, tier.sponsors.length);
      x += cols * (w + gap) + (rows > 1 ? (w + gap) / 2 : 0) + 100;
      return `<div class="rise" style="--i:${i++}">${html}</div>`;
    });
    return {
      mode: "sponsors",
      html:
        `<div class="box zone-left sponsors-head">` +
        `<p class="eyebrow rise" style="--i:0">${esc(eyebrow)}</p>` +
        `<h2 class="display rise" style="--i:1" data-fit="${BREAKOUT ? 300 : 640}">${esc(headline)}</h2>` +
        `</div>` +
        blocks.join(""),
    };
  }

  const SCENES = {
    walkin(cue) {
      return {
        mode: "ambient",
        html:
          `<div class="rise" style="--i:0">${lockup(...L.lockup)}</div>` +
          `<div class="box zone-right" style="height:760px">` +
          `<p class="eyebrow rise" style="--i:1">Edition ${esc(SHOW.event.edition)} · ${esc(SHOW.event.venue)}</p>` +
          `<h1 class="display rise" style="--i:2" data-fit="640">Welcome.</h1>` +
          `<p class="body rise" style="--i:3;margin-top:26px">${esc(SHOW.event.dates.replace("-", "–"))} · ${esc(SHOW.event.domain)}</p>` +
          `</div>` +
          sponsorRow(cue.ticker),
      };
    },

    countdown(cue) {
      const next = (cue.next ?? []).map((slug) => SHOW.talks[slug]);
      return {
        mode: "ambient",
        html:
          `<div class="box zone-left">` +
          `<p class="eyebrow rise" style="--i:0">${esc(cue.title)} start in</p>` +
          `<p class="clock rise" style="--i:1" data-at="${esc(cue.at)}">00:00</p>` +
          `</div>` +
          `<div class="box zone-right">` +
          `<p class="eyebrow rise" style="--i:2">Up next · main stage</p>` +
          `<div class="up-next">` +
          next
            .map(
              (t, i) =>
                `<div class="rise" style="--i:${3 + i}"><p class="talk-line">${title(t.title)}</p><p class="who">${esc(namesOf(t))}</p></div>`,
            )
            .join("") +
          `</div></div>`,
      };
    },

    talk(cue, day) {
      const t = SHOW.talks[cue.talk];
      // Single: one 720-tall portrait. Pair: two 456-tall portraits sitting
      // corner to corner in the same 768×720 box — hexagons tile, overlapping
      // ones read as a clipped blob. Trio (the organizers): two over one.
      const n = t.speakers.length;
      const shots =
        n >= 3
          ? [
              { x: 0, y: 0, h: 360 },
              { x: 386, y: 0, h: 360 },
              { x: 193, y: 348, h: 360 },
            ]
          : n === 2
            ? [
                { x: 0, y: 0, h: 456 },
                { x: 298, y: 264, h: 456 },
              ]
            : [{ x: 13, y: 0, h: 720 }];
      const portraits = t.speakers
        .slice(0, shots.length)
        .map((s, i) => {
          const b = shots[i];
          const w = b.h * (221.15 / 214.59);
          const pos = s.align === "xMidYMin" ? "center top" : s.align === "xMinYMid" ? "left center" : "center";
          return s.portrait
            ? `<img class="portrait" src="${esc(s.portrait)}" alt="" style="left:${b.x}px;top:${b.y}px;width:${w.toFixed(0)}px;height:${b.h}px;object-position:${pos}">`
            : "";
        })
        .join("");
      return {
        mode: "walkon",
        talk: true,
        html:
          `<div class="portraits"><div class="rise" style="--i:0;position:absolute;inset:0">${portraits}</div></div>` +
          `<div class="title"><div class="box rise" style="--i:1;inset:0;justify-content:flex-end">` +
          `<p class="eyebrow">${esc(t.kind)} · ${esc(dayLabel(day))}</p>` +
          `<h2 class="display" data-fit="480">${title(t.title)}</h2>` +
          `</div></div>` +
          `<div class="people"><div class="box rise" style="--i:2;inset:0;gap:22px">` +
          t.speakers
            .map((s) => `<div><p class="name">${esc(s.name)}</p>${s.role ? `<p class="role">${esc(s.role)}</p>` : ""}</div>`)
            .join("") +
          `</div></div>`,
      };
    },

    // Between sessions: when we are back, what is next here, and what starts
    // at the same time in the other rooms, so people can pick before they
    // move. Loops with the sponsors, the photos and feedback for the last talk.
    break(cue, day) {
      const until = cue.until;
      const here = cue.next ? SHOW.talks[cue.next] : nextIn(day, roomName, until);
      const others = ["Main stage", "Breakout", "Workshop"]
        .filter((r) => r !== roomName)
        .map((r) => ({ r, t: nextIn(day, r, until) }))
        // Only what starts with this one: a session hours away is not a choice.
        .filter(({ t }) => t && t.start === here?.start);
      const label = (r) => (r === "Main stage" ? "On the main stage" : r === "Breakout" ? "In the breakout room" : "In the workshop room");
      const row = (eyebrow, t, i, lead) =>
        `<div class="rise${lead ? " lead" : ""}" style="--i:${i}"><p class="eyebrow">${esc(eyebrow)}</p>` +
        `<p class="talk-line">${title(t.title)}</p><p class="who">${esc(namesOf(t))}</p></div>`;
      return {
        mode: "ambient",
        html:
          `<div class="box zone-left" style="height:760px">` +
          `<p class="eyebrow rise" style="--i:0">${esc(cue.eyebrow)}</p>` +
          `<h2 class="display rise" style="--i:1" data-fit="560">${esc(cue.headline ?? `Back at ${until}.`)}</h2>` +
          `</div>` +
          (here
            ? `<div class="box zone-right"><div class="up-next rooms">` +
              row(BREAKOUT ? `Next in this room · ${here.start}` : `Next on the main stage · ${here.start}`, here, 2, true) +
              others.map(({ r, t }, k) => row(`${label(r)} · ${t.start}`, t, 3 + k, false)).join("") +
              `</div></div>`
            : "") +
          sponsorRow(cue.ticker),
      };
    },

    // The photographers' gallery, in the break loops.
    photos() {
      const q = SHOW.photos;
      return {
        mode: "ambient",
        html:
          `<div class="box zone-left">` +
          `<p class="eyebrow rise" style="--i:0">Photos from today</p>` +
          `<h2 class="display rise" style="--i:1" data-fit="520">Find yourself.</h2>` +
          `<p class="body rise" style="--i:2;margin-top:30px">Our photographers upload all day. Scan to browse and download.</p>` +
          `</div>` +
          (q ? `<div class="rise qr-zone" style="--i:3">${qrTile(q, L.qr)}</div>` : ""),
      };
    },

    // The hashtags, in the pre-show and countdown loops. Mixed case, as they
    // are typed: the capitals are what make them readable.
    social() {
      const s = SHOW.social ?? {};
      return {
        mode: "ambient",
        html:
          `<div class="box zone-left">` +
          `<p class="eyebrow rise" style="--i:0">Sharing is caring</p>` +
          `<h2 class="display rise" style="--i:1" data-fit="640">Post about your experience.</h2>` +
          `</div>` +
          `<div class="box zone-right">` +
          `<p class="hashtags rise" style="--i:2">${(s.hashtags ?? []).map(esc).join("<br>")}</p>` +
          (s.prize ? `<p class="body rise" style="--i:3;margin-top:40px">${esc(s.prize)}</p>` : "") +
          `</div>`,
      };
    },

    // Feedback for the talk that just ended in this room, from Sessionize.
    // Only in a loop when that talk has a link (see loopOf).
    feedback(cue, day) {
      const t = lastTalkBefore(cue, day);
      // Nothing to rate yet (the first break of the day): the break itself.
      if (!t?.feedback) return SCENES.break(cue, day);
      return {
        mode: "ambient",
        html:
          `<div class="box zone-left">` +
          `<p class="eyebrow rise" style="--i:0">Rate the session</p>` +
          `<h2 class="display rise" style="--i:1" data-fit="420">How was it?</h2>` +
          `<div class="up-next rise" style="--i:2;margin-top:40px"><div><p class="talk-line">${title(t.title)}</p>` +
          `<p class="who">${esc(namesOf(t))}</p></div></div>` +
          `</div>` +
          `<div class="rise qr-zone" style="--i:3">${qrTile(t.feedback, L.qr)}</div>`,
      };
    },

    // A gold sponsor's two minutes: their logo large on the left, the clock on
    // the right, the speaker between them. The clock starts when the cue
    // comes up (stage/serve.mjs).
    pitch(cue) {
      const sp = SHOW.tiers.flatMap((t) => t.sponsors.map((s) => ({ ...s, tier: t.tier }))).find((s) => s.name === cue.sponsor);
      return {
        mode: "ambient",
        html:
          (sp ? `<div class="rise pitch-logo" style="--i:0">${hexLogo(sp, BREAKOUT ? 640 : 760)}</div>` : "") +
          `<div class="box zone-right">` +
          `<p class="eyebrow rise" style="--i:1">${esc(sp?.tier ?? "Gold")} sponsor · ${esc(cue.sponsor)}</p>` +
          `<p class="clock rise" style="--i:2" data-minutes="${cue.minutes ?? 2}">${String(cue.minutes ?? 2).padStart(2, "0")}:00</p>` +
          `</div>`,
      };
    },

    message(cue) {
      return {
        mode: "ambient",
        html:
          `<div class="box zone-left">` +
          `<p class="eyebrow rise" style="--i:0">${esc(cue.eyebrow)}</p>` +
          `<h2 class="display rise" style="--i:1" data-fit="640">${esc(cue.headline)}</h2>` +
          `</div>` +
          `<div class="box zone-right">` +
          `<p class="body rise" style="--i:2">${esc(cue.body)}</p>` +
          `</div>`,
      };
    },

    sponsors() {
      return tierWall(
        SHOW.tiers.filter((t) => t.sponsors.length && !COMMUNITY_TIERS.includes(t.tier)),
        { Platinum: { h: 560, per: 1 }, Gold: { h: 310, per: 2 }, Bronze: { h: 230, per: 3 }, Afterparty: { h: 310, per: 1 } },
        `${SHOW.event.name} ${SHOW.event.year}`,
        "Thank you, sponsors.",
      );
    },

    // The community sponsors and the partners: a scene of their own, since
    // ten more logos on the sponsor wall would shrink every tier.
    community() {
      const tiers = SHOW.tiers.filter((t) => t.sponsors.length && COMMUNITY_TIERS.includes(t.tier));
      if (SHOW.partners?.length) tiers.push({ tier: "Partners & media", sponsors: SHOW.partners });
      return tierWall(
        tiers,
        { Community: { h: 300, per: 5 }, "Partners & media": { h: 300, per: 1 } },
        "Community sponsors & partners",
        "Thank you, community.",
      );
    },

    // The organizing team, in the walk-in and pre-show loops. Two rows of
    // five small portraits in the right two-thirds; nobody is on stage yet,
    // so the middle is free.
    team() {
      const people = SHOW.organizers ?? [];
      const cols = Math.ceil(people.length / 2) || 1;
      const x0 = 1290, x1 = W - 100, colW = (x1 - x0) / cols;
      const h = 270, w = h * HEX_RATIO;
      const cells = people
        .map((o, n) => {
          const r = Math.floor(n / cols), c = n % cols;
          const left = x0 + c * colW, top = 110 + r * 500;
          return (
            `<div class="org rise" style="--i:${2 + n};left:${left.toFixed(0)}px;top:${top}px;width:${colW.toFixed(0)}px">` +
            (o.portrait ? `<img class="portrait" src="${esc(o.portrait)}" alt="" style="position:relative;display:block;margin:0 auto;width:${w.toFixed(0)}px;height:${h}px">` : "") +
            `<p class="org-name">${esc(o.name)}</p><p class="org-role">${esc(o.role)}</p></div>`
          );
        })
        .join("");
      return {
        mode: "sponsors",
        html:
          `<div class="box zone-left" style="width:980px">` +
          `<p class="eyebrow rise" style="--i:0">${esc(SHOW.event.name)} ${esc(SHOW.event.year)}</p>` +
          `<h2 class="display rise" style="--i:1" data-fit="640">Your organizers.</h2>` +
          `</div>` +
          cells,
      };
    },

    // Between talks: the wall goes quiet before the next walk-on, so the
    // walk-on has something to arrive into. Field at live density, no text.
    clear() {
      return { mode: "live", html: "" };
    },

    // Safe at any moment, including mid-talk: lockup small at the left, field
    // at live density, nothing in the centre.
    still() {
      return { mode: "live", html: lockup(130, 440, 560) };
    },
  };

  /* ── fitting ──────────────────────────────────────────────────────────
   * Display type shrinks until it fits its box, the same rule the social
   * layouts follow, so a long title never clips on the wall.
   */
  function fitText(root) {
    root.querySelectorAll("[data-fit]").forEach((el) => {
      const max = Number(el.dataset.fit);
      let size = parseFloat(getComputedStyle(el).fontSize);
      const box = el.parentElement;
      const other = [...box.children].filter((c) => c !== el).reduce((n, c) => n + c.offsetHeight, 0);
      while (size > 40 && (el.offsetHeight + other > max || el.scrollWidth > el.clientWidth + 1)) {
        size -= 4;
        el.style.fontSize = `${size}px`;
      }
    });
  }

  /* ── live placement ───────────────────────────────────────────────────
   * Where each talk group lands when the speaker is at the lectern, measured
   * from the laid-out walk-on text so any title length ends up centred in its
   * third. The move itself is one CSS transform per group (stage.css).
   *
   *   left third   portrait, with name and job title under it
   *   right third  talk title
   */
  const LIVE = { cy: 540, left: 130, leftEnd: 1170, right: 2526, rightW: 1040, maxTitleH: 500, gap: 44 };

  function planLive(section) {
    const fit = parseFloat(wall.style.getPropertyValue("--fit")) || 1;
    const textWidth = (el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().width / fit;
    };
    // Vertical extent of a group's content, in its own unscaled coordinates.
    const extent = (group) => {
      const kids = [...group.querySelector(".box, .rise").children];
      const box = group.querySelector(".box, .rise");
      const top = Math.min(...kids.map((k) => box.offsetTop + k.offsetTop));
      const bottom = Math.max(...kids.map((k) => box.offsetTop + k.offsetTop + k.offsetHeight));
      const width = Math.max(...kids.map((k) => (k.tagName === "IMG" ? k.offsetLeft + k.offsetWidth : textWidth(k))));
      const left = Math.min(...kids.map((k) => (k.tagName === "IMG" ? k.offsetLeft : 0)));
      return { top, bottom, left, width: width - left };
    };
    const set = (group, s, targetLeft, e, cy = LIVE.cy) => {
      const tx = targetLeft - group.offsetLeft - s * e.left;
      const ty = cy - group.offsetTop - s * ((e.top + e.bottom) / 2);
      group.style.setProperty("--tx", tx.toFixed(1));
      group.style.setProperty("--ty", ty.toFixed(1));
      group.style.setProperty("--ts", s.toFixed(3));
    };

    const portraits = section.querySelector(".portraits");
    const people = section.querySelector(".people");
    const title = section.querySelector(".title");

    // The wall is tall enough to stack them, which leaves the names the
    // whole width of the third instead of what the portrait leaves over.
    const pe = extent(portraits);
    const ps = 0.66;
    const ne = extent(people);
    const ns = Math.min(0.85, (LIVE.leftEnd - LIVE.left) / ne.width);
    const ph = (pe.bottom - pe.top) * ps;
    const nh = (ne.bottom - ne.top) * ns;
    const top = LIVE.cy - (ph + LIVE.gap + nh) / 2;
    set(portraits, ps, LIVE.left, pe, top + ph / 2);
    set(people, ns, LIVE.left, ne, top + ph + LIVE.gap + nh / 2);

    const te = extent(title);
    set(title, Math.min(0.62, LIVE.rightW / te.width, LIVE.maxTitleH / (te.bottom - te.top)), LIVE.right, te);
  }

  /* ── clock ────────────────────────────────────────────────────────── */

  function now() {
    const fake = params.get("clock");
    if (!fake) return new Date();
    const [hh, mm, ss = "0"] = fake.split(":");
    const d = new Date();
    d.setHours(+hh, +mm, +ss, 0);
    return d;
  }

  // Set from the control page ("start 5:00 now"); overrides the cue's `at`.
  // Declared here because the clock ticks before show control is set up.
  let countdownTo = null;

  function tickClocks() {
    document.querySelectorAll(".clock[data-at], .clock[data-minutes]").forEach((el) => {
      const t = now();
      let target = new Date(t);
      if (el.dataset.at) {
        const [hh, mm] = el.dataset.at.split(":").map(Number);
        target.setHours(hh, mm, 0, 0);
      } else {
        // A pitch shows its full time until the server starts the clock.
        target = new Date(t.getTime() + Number(el.dataset.minutes) * 60000);
      }
      if (countdownTo) target = new Date(countdownTo);
      const left = Math.max(0, Math.round((target - t) / 1000));
      const m = Math.min(99, Math.floor(left / 60));
      el.textContent = `${String(m).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    });
  }

  /* ── music ────────────────────────────────────────────────────────────
   * Beds and a sting.
   *
   * A bed is a set of tracks (calm for breakfast, pre-show for the last half
   * hour) that crossfade into each other and loop. Each cue picks a set, by
   * scene or by its own `music`; moving between cues on the same set keeps the
   * track going instead of restarting it.
   *
   * A walk-on theme plays once on every walk-on, over a quick fade of the bed,
   * rotating through the list so consecutive talks differ. Going live fades
   * whatever is left of it; the clear step before a walk-on and the talk
   * itself are silent.
   *
   * Fades are long on the beds, because the room talks over them and a cut is
   * what people notice, and short around the sting, because that is the
   * moment the room should notice.
   */
  const music = (() => {
    const cfg = SHOW.music;
    const off = { cue() {}, set() {}, vog() {}, get on() { return false; } };
    if (!cfg || !AUDIO) return off;
    const VOL = cfg.volume ?? 0.8;
    const XF = cfg.crossfade ?? 4;

    let enabled = false;
    let want = null; // set the current cue asks for
    let current = null; // set actually playing
    let index = 0;
    let lastKey = null;

    const decks = [new Audio(), new Audio()];
    decks.forEach((a) => (a.preload = "auto"));
    let active = 0;
    // One element per theme, preloaded, so a walk-on never waits on the disk.
    const stings = (cfg.walkon ?? []).map((src) => Object.assign(new Audio(src), { preload: "auto" }));
    let sting = stings[0] ?? null;
    // The voice of god: "Please welcome to the stage…", one clip per talk,
    // `delay` seconds into the walk-on, with the theme ducked under it. It
    // has its own switch (`vog` in the show state), independent of the
    // music: with the music off the voice plays on its own.
    const VO = { delay: 1.2, duck: 0.3, volume: 1, ...cfg.announce };
    const voices = new Map(
      Object.values(SHOW.talks)
        .filter((t) => t.announce)
        .map((t) => [t.slug, Object.assign(new Audio(t.announce), { preload: "auto" })]),
    );
    let voice = null;
    let voiceTimer = null;
    let vogOn = true;
    function stopVoice(seconds) {
      clearTimeout(voiceTimer);
      const v = voice;
      if (v && !v.paused) fade(v, 0, seconds, () => v.pause());
    }

    const timers = new Map();
    function fade(a, to, seconds, then) {
      clearInterval(timers.get(a));
      const from = a.volume;
      const t0 = performance.now();
      const id = setInterval(() => {
        const k = seconds <= 0 ? 1 : Math.min(1, (performance.now() - t0) / (seconds * 1000));
        a.volume = from + (to - from) * k;
        if (k === 1) {
          clearInterval(id);
          then?.();
        }
      }, 40);
      timers.set(a, id);
    }

    function startTrack(fadeIn) {
      const list = cfg.sets[current] ?? [];
      if (!list.length) return;
      const a = decks[active];
      a.src = list[index % list.length];
      a.loop = list.length === 1; // a single track is a seamless loop file
      a.volume = 0;
      play(a);
      fade(a, VOL, fadeIn);
    }

    // Without --autoplay-policy=no-user-gesture-required (the wall opened
    // from the control page's link, say), Chrome refuses sound until someone
    // presses a key or clicks in the wall window. Remember the refusal and
    // start the bed again on that first key or click, rather than staying
    // silent until the next cue.
    let blocked = false;
    function play(a) {
      a.play().catch((e) => {
        if (e.name !== "NotAllowedError") return;
        blocked = true;
        lastEvent = `blocked by Chrome's autoplay policy at ${new Date().toLocaleTimeString()}: click the wall window or press f`;
      });
    }
    for (const type of ["keydown", "pointerdown"])
      addEventListener(type, () => {
        if (!blocked) return;
        blocked = false;
        if (enabled && current && !bedPlaying()) startTrack(2);
      });

    // Playlists: start the next track XF seconds before this one ends, and
    // after the last track start the list over. Never silence in a set.
    function advance(xf) {
      const a = decks[active];
      fade(a, 0, xf, () => a.pause());
      active = 1 - active;
      index++;
      startTrack(xf);
    }
    setInterval(() => {
      if (!current || (cfg.sets[current]?.length ?? 0) < 2) return;
      const a = decks[active];
      if (!a.duration || a.duration - a.currentTime > XF) return;
      advance(XF);
    }, 200);
    // Safety net for when the timer misses the end (a throttled window): go
    // straight on to the next track. A network hiccup resumes the same track
    // where it was; only a file that can't be decoded is skipped.
    let lastEvent = null;
    decks.forEach((a) => {
      a.addEventListener("ended", () => {
        if (a !== decks[active] || !current || !enabled) return;
        lastEvent = `ended ${a.src.split("/").pop()} at ${new Date().toLocaleTimeString()}`;
        advance(0.5);
      });
      a.addEventListener("error", () => {
        if (a !== decks[active] || !current || !enabled || !a.error) return;
        lastEvent = `error ${a.error.code} ${a.src.split("/").pop()} at ${new Date().toLocaleTimeString()}`;
        if (a.error.code === MediaError.MEDIA_ERR_NETWORK) {
          const at = a.currentTime;
          setTimeout(() => {
            if (a !== decks[active]) return;
            a.load();
            a.currentTime = at;
            a.play().catch(() => {});
          }, 1000);
        } else advance(0.5);
      });
    });

    const bedPlaying = () => decks.some((a) => !a.paused);

    function bed(fadeOut) {
      const target = enabled ? want : null;
      if (target === current) {
        // Same set, keep the track going. If it has stopped, start it again.
        if (target && !bedPlaying()) startTrack(2);
        return;
      }
      decks.forEach((a) => fade(a, 0, fadeOut, () => a.pause()));
      current = target;
      if (!target) return;
      index = 0;
      active = 1 - active;
      startTrack(3);
    }

    function stopSting(seconds) {
      stopVoice(seconds);
      if (sting && !sting.paused) fade(sting, 0, seconds, () => sting.pause());
    }

    return {
      /** Called on every apply; only a change of step does anything. */
      cue(key, cue, stepState, talkIndex = 0) {
        if (key === lastKey) return;
        lastKey = key;
        if (cue?.scene === "talk" && stepState === "clear") {
          stopSting(1.5);
          want = null;
          bed(3);
          return;
        }
        if (cue?.scene === "talk" && stepState === "walkon") {
          want = null;
          bed(0.8);
          // The n-th talk of the day gets the n-th theme, so neighbours differ
          // and a reload replays the same one.
          if (stings.length) sting = stings[talkIndex % stings.length];
          stopVoice(0.3);
          const st = enabled ? sting : null;
          if (st) {
            clearInterval(timers.get(st));
            st.currentTime = 0;
            st.volume = VOL;
            st.play().catch(() => {});
          }
          voice = vogOn ? voices.get(cue.talk) ?? null : null;
          const v = voice;
          if (v) {
            voiceTimer = setTimeout(() => {
              v.currentTime = 0;
              v.volume = VO.volume;
              v.onended = () => st && st === sting && !st.paused && fade(st, VOL, 1.2);
              play(v);
              if (st) fade(st, VOL * VO.duck, 0.35);
            }, VO.delay * 1000);
          }
          return;
        }
        // Live: silence, always, whatever the cue says. Someone is talking.
        if (cue?.scene === "talk") {
          stopSting(0.6);
          want = null;
          bed(0.6);
          return;
        }
        stopSting(1.5);
        want = !cue || cue.music === false ? null : (cue.music ?? cfg.scenes?.[cue.scene] ?? null);
        bed(4);
      },
      set(on) {
        if (on === enabled) return;
        enabled = on;
        if (!on) stopSting(1);
        bed(on ? 3 : 2);
      },
      get on() {
        return enabled;
      },
      /** The voice-of-god switch. Off mid-announcement fades the voice out
       *  and brings the theme back up under nobody. */
      vog(on) {
        if (on === vogOn) return;
        vogOn = on;
        if (!on && voice && (!voice.paused || voiceTimer)) {
          const st = sting;
          stopVoice(0.5);
          if (enabled && st && !st.paused) fade(st, VOL, 1.2);
        }
      },
      /** Rehearsal: jump the bed to `s` seconds before the end of its track,
       *  to hear the handover without waiting 4 minutes. */
      skipToEnd(s = 10) {
        const a = decks[active];
        if (a.duration) a.currentTime = Math.max(0, a.duration - s);
      },
      /** For the console on the show laptop: what is playing, how loud. */
      status() {
        const name = (a) => (a.src ? decodeURIComponent(a.src.split("/").pop()) : null);
        return {
          enabled,
          vog: vogOn,
          blocked,
          set: current,
          lastEvent,
          decks: decks.map((a) => ({ track: name(a), playing: !a.paused, volume: +a.volume.toFixed(2), at: +a.currentTime.toFixed(1) })),
          sting: sting && { track: name(sting), playing: !sting.paused, volume: +sting.volume.toFixed(2), at: +sting.currentTime.toFixed(1) },
          voice: voice && { track: name(voice), playing: !voice.paused, volume: +voice.volume.toFixed(2), at: +voice.currentTime.toFixed(1) },
        };
      },
    };
  })();
  window.stageMusic = () => music.status?.();
  window.stageMusic.skipToEnd = (s) => music.skipToEnd?.(s);

  /* ── show control ─────────────────────────────────────────────────── */

  const wall = document.createElement("div");
  wall.className = "wall";
  wall.style.width = `${W}px`;
  wall.style.height = `${H}px`;
  if (BREAKOUT) document.documentElement.classList.add("room-breakout");
  const scenes = document.createElement("div");
  scenes.className = "scenes";
  const guides = document.createElement("div");
  guides.className = "guides";
  guides.hidden = !params.has("guides");
  guides.innerHTML = BREAKOUT ? "" :
    `<div class="zone" style="left:0;width:${W / 3}px">Left third · content</div>` +
    `<div class="zone" style="left:${W / 3}px;width:${W / 3}px">Centre · speaker stands here · subtle only</div>` +
    `<div class="zone" style="left:${(2 * W) / 3}px;width:${W / 3}px">Right third · content</div>` +
    `<div class="occlusion">Bottom cabinet row · may be hidden by lectern / monitors (TBC on site)</div>`;
  wall.append(field.el, scenes, wipe.el, guides);
  document.body.append(wall);
  if (STILL) document.documentElement.classList.add("still");
  if (OUTPUT || PREVIEW) document.documentElement.classList.add("output");

  const hud = document.createElement("div");
  hud.className = "hud";
  document.body.append(hud);

  const { describe } = window.CUES;
  const stepsFor = (day) => window.CUES.stepsFor(day, ROOM);

  const state = {
    day: params.get("day") ?? "1",
    i: 0,
    panic: false,
    music: false,
    vog: true,
    guides: params.has("guides"),
    countdownTo: null,
    mountedCue: null,
  };
  state.i = Math.max(0, Math.min(stepsFor(state.day).length - 1, Number(params.get("step") ?? 0)));

  function renderHud() {
    const steps = stepsFor(state.day);
    hud.innerHTML =
      `<ol>${steps.map((s, i) => `<li${i === state.i ? " data-current" : ""}>${esc(describe(s))}</li>`).join("")}</ol>` +
      `<div>${esc(dayLabel(state.day))}${state.panic ? " · <b>PANIC STILL</b>" : ""} · music ${state.music ? "on" : "off"} · voice of god ${state.vog === false ? "off" : "on"}` +
      `${FOLLOW ? " · following the show server" : ""}` +
      `${AUDIO ? "" : " · <b>no sound in this window</b> (sound plays in the ?output window; add ?audio to rehearse with sound here)"}<br>` +
      `<kbd>→</kbd> next &nbsp;<kbd>←</kbd> back &nbsp;<kbd>1</kbd><kbd>2</kbd> day &nbsp;<kbd>b</kbd> still &nbsp;<kbd>m</kbd> music &nbsp;<kbd>v</kbd> voice of god &nbsp;<kbd>g</kbd> guides &nbsp;<kbd>f</kbd> fullscreen</div>`;
  }

  function mount(scene, stepState) {
    scenes.innerHTML = `<section class="scene ${scene.talk ? "talk" : ""}" data-state="${stepState ?? ""}">${scene.html}</section>`;
    const el = scenes.firstElementChild;
    fitText(el);
    startRotators(el);
    // The breakout projector has no one standing in front of it: its talk
    // card stays where it is.
    if (scene.talk && !BREAKOUT) planLive(el);
    tickClocks();
    field.set(stepState === "live" ? "live" : scene.mode);
    return el;
  }

  /* A looping cue (the pre-show) alternates scenes on the clock: every
   * window computes the same phase from Date.now(), so they stay in step
   * without asking the server. */
  let loopTimer = null;
  // `every` is seconds per scene: one number for all, or a list, one each.
  // `holdLast`: in the last this-many seconds of a countdown, stay on the
  // first scene, so the room sees the clock reach zero.
  // A loop's scenes, minus feedback when the talk before has no link yet.
  function loopOf(cue, day) {
    return cue.loop.filter((name) => name !== "feedback" || lastTalkBefore(cue, day)?.feedback);
  }
  function loopPhase(cue, day) {
    if (cue.holdLast && countdownTo && countdownTo - Date.now() <= cue.holdLast * 1000) return 0;
    const loop = loopOf(cue, day);
    const secs = loop.map((_, k) => (Array.isArray(cue.every) ? cue.every[k] : cue.every) ?? 30);
    let t = (Date.now() / 1000) % secs.reduce((a, b) => a + b, 0);
    for (let k = 0; k < secs.length; k++) {
      if (t < secs[k]) return k;
      t -= secs[k];
    }
    return 0;
  }
  function startLoop(cue, day) {
    clearInterval(loopTimer);
    if (!cue.loop?.length || STILL) return;
    let shown = loopPhase(cue, day);
    loopTimer = setInterval(() => {
      const p = loopPhase(cue, day);
      if (p === shown) return;
      shown = p;
      const scene = SCENES[loopOf(cue, day)[p]](cue, day);
      wipe.run(() => mount(scene));
    }, 500);
  }

  function apply({ silent = false } = {}) {
    const steps = stepsFor(state.day);
    const step = steps[state.i];
    renderHud();
    guides.hidden = !state.guides;
    countdownTo = state.countdownTo;
    tickClocks();
    // `silent`: a walk-on replayed only to glide into a live talk after a
    // reload. The room is mid-talk; it must not hear the walk-on theme again.
    music.set(state.music && !silent);
    music.vog(state.vog !== false);
    const talkIndex = cuesFor(state.day, ROOM).slice(0, step.c).filter((c) => c.scene === "talk").length;
    music.cue(state.panic ? "panic" : `${state.day}:${state.i}`, state.panic ? null : step.cue, step.state, talkIndex);
    if (state.panic) {
      if (state.mountedCue === "panic") return;
      clearInterval(loopTimer);
      state.mountedCue = "panic";
      return wipe.run(() => mount(SCENES.still()));
    }
    if (step.state === "clear") {
      const clearKey = `${state.day}:${step.c}:clear`;
      if (state.mountedCue === clearKey) return;
      state.mountedCue = clearKey;
      clearInterval(loopTimer);
      return wipe.run(() => mount(SCENES.clear()));
    }
    const key = `${state.day}:${step.c}`;
    const section = scenes.firstElementChild;
    if (key === state.mountedCue && step.cue.scene !== "talk") return;
    // Same talk, walk-on → live (or back): no wipe. The groups glide to the
    // thirds and the field parts — the transition the whole scene is built for.
    if (key === state.mountedCue && step.cue.scene === "talk" && section) {
      section.dataset.state = step.state;
      field.set(step.state === "live" ? "live" : "walkon");
      return;
    }
    state.mountedCue = key;
    clearInterval(loopTimer);
    // `?scene=` picks one scene of a loop, for the stills of each.
    const pick = params.get("scene");
    const loop = step.cue.loop?.length ? loopOf(step.cue, state.day) : null;
    const name = loop ? (loop.includes(pick) ? pick : loop[STILL ? 0 : loopPhase(step.cue, state.day)]) : step.cue.scene;
    const scene = SCENES[name](step.cue, state.day);
    wipe.run(() => mount(scene, step.state));
    startLoop(step.cue, state.day);
  }

  /* ── driving it ───────────────────────────────────────────────────────
   * Served: a key press becomes a command to the server, and the change
   * comes back over /events like every other page's — this window never
   * moves on its own, so it cannot drift from the control page.
   * file://: the same commands are applied locally.
   */

  const KEY = params.get("key") ?? "";

  function local(cmd) {
    const n = stepsFor(state.day).length;
    const next = { ...state };
    const before = `${state.day}:${state.i}`;
    if (cmd.cmd === "next") Object.assign(next, { i: Math.min(n - 1, state.i + 1), panic: false });
    else if (cmd.cmd === "prev") Object.assign(next, { i: Math.max(0, state.i - 1), panic: false });
    else if (cmd.cmd === "first") Object.assign(next, { i: 0, panic: false });
    else if (cmd.cmd === "day" && SHOW.days[cmd.day]) Object.assign(next, { day: cmd.day, i: 0, panic: false });
    else if (cmd.cmd === "panic") next.panic = !state.panic;
    else if (cmd.cmd === "music") next.music = !state.music;
    else if (cmd.cmd === "vog") next.vog = state.vog === false;
    else if (cmd.cmd === "guides") next.guides = !state.guides;
    else if (cmd.cmd === "countdown") {
      if (cmd.minutes != null) next.countdownTo = Date.now() + cmd.minutes * 60000;
      else if (cmd.add != null && state.countdownTo) next.countdownTo = state.countdownTo + cmd.add * 60000;
      else if (cmd.clear) next.countdownTo = null;
    }
    // Same as the server: a countdown starts at its `minutes` when it comes up.
    if (`${next.day}:${next.i}` !== before) {
      const step = stepsFor(next.day)[next.i];
      next.countdownTo = ["countdown", "pitch"].includes(step?.cue.scene) ? Date.now() + (step.cue.minutes ?? 5) * 60000 : null;
    }
    return next;
  }

  let follow = (incoming, { silent = false } = {}) => {
    Object.assign(state, incoming);
    apply({ silent });
  };

  // First state: wait for fonts so fitText measures Space Grotesk. A talk
  // arriving at its live step mounts at walk-on and glides, unless this is a
  // still, which goes straight to the end state.
  let ready = false;
  let pending = null;
  function receive(incoming) {
    if (!ready) {
      pending = incoming;
      return;
    }
    follow(incoming);
  }

  let send;
  if (FOLLOW) {
    send = (cmd) =>
      fetch("/command", { method: "POST", body: JSON.stringify({ ...cmd, room: ROOM, key: KEY }) }).then((r) => {
        if (r.status === 403) console.warn("stage: keys on this window need ?key=… to drive the show");
      });
    const events = new EventSource(`/events?room=${ROOM}`);
    events.onmessage = (e) => receive(JSON.parse(e.data));
  } else {
    const channel = "BroadcastChannel" in window ? new BroadcastChannel(`cnd-stage-${ROOM}`) : null;
    channel?.addEventListener("message", (e) => receive(e.data));
    let autoTimer = null;
    send = (cmd) => {
      const next = local(cmd);
      const { mountedCue, ...shared } = next;
      follow(shared);
      channel?.postMessage(shared);
      // Same auto-live as the server, for rehearsing from file://.
      clearTimeout(autoTimer);
      const step = stepsFor(state.day)[state.i];
      if (SHOW.walkonSeconds && !state.panic && step?.state === "walkon") {
        autoTimer = setTimeout(() => send({ cmd: "next" }), SHOW.walkonSeconds * 1000);
      }
    };
  }

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "ArrowRight" || k === " " || k === "PageDown") send({ cmd: "next" });
    else if (k === "ArrowLeft" || k === "PageUp") send({ cmd: "prev" });
    else if (k === "Home") send({ cmd: "first" });
    else if (k === "1" || k === "2") send({ cmd: "day", day: k });
    else if (k === "b") send({ cmd: "panic" });
    else if (k === "m") send({ cmd: "music" });
    else if (k === "v") send({ cmd: "vog" });
    else if (k === "g") send({ cmd: "guides" });
    else if (k === "f") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    else return;
    e.preventDefault();
  });

  function fit() {
    const f = OUTPUT ? 1 : Math.min(1, innerWidth / W);
    wall.style.setProperty("--fit", f);
    hud.style.top = `${H * f + 12}px`;
  }
  addEventListener("resize", fit);
  fit();

  if (!STILL) setInterval(tickClocks, 250);

  document.fonts.ready.then(() => {
    ready = true;
    const first = pending ?? (FOLLOW ? null : { ...state });
    pending = null;
    if (!first) return; // served: the first /events message will arrive
    const steps = stepsFor(first.day ?? state.day);
    const step = steps[first.i ?? state.i];
    if (step?.cue.scene === "talk" && step.state === "live" && !STILL) {
      follow({ ...first, i: first.i - 1 }, { silent: true });
      setTimeout(() => follow(first), 2600);
    } else {
      follow(first);
    }
  });
})();
