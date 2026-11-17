/* Cloud Native Denmark — deck runtime.
 *
 * Scales the fixed 1920×1080 stage to the viewport, moves between slides,
 * draws the honeycomb field, fills talk, team and sponsor slides from the
 * wall's show data, and gets out of the way for printing.
 *
 *   → ← space         next / previous
 *   Home End          first / last
 *   f                 fullscreen
 *   p                 print (same output as --print-to-pdf)
 *   #7 in the URL     jump to slide 7, and the hash tracks as you move
 *
 * Speaker notes: an <aside class="notes"> inside a slide. It is lifted out
 * before anything renders, so it never shows, prints or affects layout.
 * Talk and rate slides get a note written from the show data when they
 * have none. ../notes.html?deck=<name> follows the deck (see ../start.sh).
 *
 * No build step and no dependencies beyond stage/show.data.js, which
 * `node stage/build.mjs` writes from content/. Each deck loads it before this
 * file.
 */

(() => {
  const deck = document.querySelector(".deck");
  const slides = [...document.querySelectorAll(".slide")];
  if (!deck || slides.length === 0) return;

  const SHOW = window.SHOW;

  // Lift the speaker notes out first: speaker slides are rebuilt from the
  // show data below, which would throw an authored note away.
  const authoredNotes = slides.map((slide) => {
    const aside = slide.querySelector(":scope > aside.notes");
    if (!aside) return "";
    aside.remove();
    return aside.textContent
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/([^\n])\n(?=[^\n])/g, "$1 ")
      .trim();
  });
  const W = 1920;
  const H = 1080;

  /* ── shape ─────────────────────────────────────────────────────────────
   * The brand hexagon, the same path and ink box the wall uses (stage.js). */
  const HEX_D =
    "M 974.382812 895.261719 C 991.835938 885.179688 1005.988281 860.671875 1005.988281 840.515625 L 1005.988281 333.214844 C 1005.988281 313.058594 991.835938 288.550781 974.382812 278.46875 L 535.046875 24.820312 C 517.59375 14.742188 489.289062 14.742188 471.835938 24.820312 L 32.5 278.46875 C 15.042969 288.550781 0.894531 313.058594 0.894531 333.214844 L 0.894531 840.515625 C 0.894531 860.671875 15.042969 885.179688 32.5 895.261719 L 471.835938 1148.910156 C 489.289062 1158.988281 517.59375 1158.988281 535.046875 1148.910156 Z";
  const HEX_VB = { x: 0.894, y: 17.3, w: 1005.1, h: 1139.1 };
  const HEX_RATIO = HEX_VB.w / HEX_VB.h;
  // Portraits and logos use the logo silhouette's ratio, as the wall does.
  const SHAPE_RATIO = 221.15 / 214.59;

  /* The silhouette as an objectBoundingBox clip path, which the CSS applies
   * with clip-path: url(#cnd-shape). Not a CSS mask: Chrome's PDF export
   * drops masks, so every portrait, logo tile and QR printed as a square.
   * Path from brand/logo/cnd-shape-mask.svg (generated from tokens.json),
   * mapped from its 4.49 4.49 221.15 214.59 viewBox onto 0..1. */
  const SHAPE_D =
    "M225.407 135.107L206.4 52.547a14.838 14.838 0 0 0-7.958-9.9l-76.935-36.73a14.825 14.825 0 0 0-12.771 0L31.808 42.669a14.838 14.838 0 0 0-7.961 9.895L4.873 135.129a14.668 14.668 0 0 0 1.995 11.185c.261.4.538.788.838 1.162l53.246 66.205a14.98 14.98 0 0 0 11.499 5.487l85.387-.02a14.986 14.986 0 0 0 11.5-5.48l53.227-66.211a14.72 14.72 0 0 0 2.842-12.347z";
  // A second clip, #cnd-hex, is the field's true hexagon. The silhouette
  // does not tile, so anything laid out as a honeycomb (sponsor tiles, the
  // photo gallery) uses this one, as the wall's sponsor scene does.
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<svg width="0" height="0" style="position:absolute" aria-hidden="true">` +
      `<clipPath id="cnd-shape" clipPathUnits="objectBoundingBox">` +
      `<path transform="scale(${1 / 221.15} ${1 / 214.59}) translate(-4.49 -4.49)" d="${SHAPE_D}"/></clipPath>` +
      `<clipPath id="cnd-hex" clipPathUnits="objectBoundingBox">` +
      `<path transform="scale(${1 / HEX_VB.w} ${1 / HEX_VB.h}) translate(${-HEX_VB.x} ${-HEX_VB.y})" d="${HEX_D}"/></clipPath>` +
      `</svg>`,
  );

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // Hyphenated words stay whole: "REAL-" at a line end reads as a typo.
  const title = (s) => esc(s).replace(/(\S+-\S+)/g, '<span style="white-space:nowrap">$1</span>');
  // show.data.js paths are relative to stage/; decks sit one level deeper.
  const asset = (p) => (p && p.startsWith("../") ? `../${p}` : p);

  /* ── field ─────────────────────────────────────────────────────────────
   * The wall's honeycomb: seed 2026, rose/peach/slate, no red (it is the
   * loudest thing on any screen, which is backwards for decoration). Cells
   * are scaled from the wall's 190 of 1176 to this stage's 1080. Every slide
   * draws from the same cells, so moving between slides reads as the field
   * shifting rather than being replaced.
   *
   * A slide picks its density with data-field; each layout has a default. */

  function rng(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexPlace(cx, cy, h) {
    const k = h / HEX_VB.h;
    const w = h * HEX_RATIO;
    return `translate(${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)}) scale(${k.toFixed(5)}) translate(${-HEX_VB.x} ${-HEX_VB.y})`;
  }

  const smooth = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  const DENSITY = {
    // Text left, field right: title and logistics slides.
    right: (x) => smooth(1240, 1640, x) * 0.7,
    // Centred text or a portrait in the middle: the field frames the edges.
    edges: (x) => Math.max(1 - smooth(60, 220, x), smooth(1700, 1860, x)) * 0.62,
    // Busy slides: a few faint cells at the very edges only.
    quiet: (x) => Math.max(1 - smooth(20, 90, x), smooth(1830, 1900, x)) * 0.55,
    none: () => 0,
  };
  const ALPHA = { right: 0.9, edges: 0.9, quiet: 0.35, none: 0 };
  const DEFAULT_FIELD = {
    title: "right",
    section: "edges",
    logistics: "right",
    speaker: "edges",
    quote: "edges",
    pitch: "edges",
    photo: "none",
  };

  const cells = (() => {
    const rand = rng(2026);
    const palette = ["var(--cnd-rose)", "var(--cnd-peach)", "var(--cnd-slate)", "var(--cnd-slate)", "var(--cnd-rose)", "var(--cnd-peach)"];
    const h = 175;
    const gap = 15;
    const w = h * HEX_RATIO;
    const dx = w + gap;
    const dy = h * 0.75 + gap * 0.87;
    const out = [];
    for (let r = -1; r * dy < H + h; r++) {
      const off = r % 2 ? dx / 2 : 0;
      for (let c = -1; c * dx < W + w; c++) {
        out.push({
          cx: c * dx + off,
          cy: r * dy + h / 2 - 18,
          h,
          pick: rand(),
          tint: palette[Math.floor(rand() * palette.length)],
          level: 0.55 + rand() * 0.45,
          breathe: 14 + rand() * 12,
          phase: -rand() * 26,
        });
      }
    }
    return out;
  })();

  function field(mode) {
    const f = DENSITY[mode] ?? DENSITY.quiet;
    const alpha = ALPHA[mode] ?? ALPHA.quiet;
    const paths = cells
      .map((cell) => {
        const d = f(cell.cx);
        if (cell.pick >= d) return "";
        const o = alpha * cell.level * (0.45 + 0.55 * d);
        return (
          `<g opacity="${o.toFixed(3)}"><path class="cell" d="${HEX_D}" transform="${hexPlace(cell.cx, cell.cy, cell.h)}" ` +
          `fill="${cell.tint}" style="--breathe:${cell.breathe.toFixed(1)}s;--phase:${cell.phase.toFixed(1)}s"/></g>`
        );
      })
      .join("");
    return `<svg class="field" viewBox="0 0 ${W} ${H}" aria-hidden="true">${paths}</svg>`;
  }

  /* ── data slides ───────────────────────────────────────────────────────
   * Talks, organizers and sponsors come from the same file as the wall, so a
   * title fixed in content/ is fixed on both. A slide that names something
   * missing from the data shows TODO rather than inventing it. */

  const dayLabel = (talk) => {
    for (const day of Object.values(SHOW?.days ?? {})) {
      if (day.cues.some((c) => c.talk === talk)) return day.label;
    }
    return "";
  };
  const namesOf = (t) => {
    const names = t.speakers.map((s) => s.name);
    return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0] ?? "";
  };

  function speakerSlide(slide, t, slug) {
    // Same arrangements as the wall's walk-on, scaled from its 768×720 box:
    // one large hexagon, two corner to corner, or three as two over one.
    const n = t.speakers.length;
    const shots =
      n >= 3
        ? [{ x: 0, y: 0, h: 290 }, { x: 311, y: 0, h: 290 }, { x: 155, y: 280, h: 290 }]
        : n === 2
          ? [{ x: 0, y: 0, h: 368 }, { x: 240, y: 212, h: 368 }]
          : [{ x: 10, y: 0, h: 580 }];
    const portraits = t.speakers
      .slice(0, shots.length)
      .map((s, i) => {
        const b = shots[i];
        const pos = s.align === "xMidYMin" ? "center top" : s.align === "xMinYMid" ? "left center" : "center";
        return s.portrait
          ? `<img class="portrait" src="${esc(asset(s.portrait))}" alt="" style="left:${b.x}px;top:${b.y}px;width:${(b.h * SHAPE_RATIO).toFixed(0)}px;height:${b.h}px;object-position:${pos}">`
          : "";
      })
      .join("");
    // A break deck says where and when instead ("Up next on the main
    // stage · 10:25"), via data-eyebrow.
    const day = dayLabel(slug);
    const eyebrow = slide.dataset.eyebrow ?? `${t.kind}${day ? ` · ${day}` : ""}`;
    slide.innerHTML =
      `<div class="portraits rise">${portraits}</div>` +
      `<div class="copy rise">` +
      `<p class="eyebrow">${esc(eyebrow)}</p>` +
      `<h2 class="display" data-fit="440">${title(t.title)}</h2>` +
      `<div class="names">` +
      t.speakers
        .map((s) => `<div><p class="name">${esc(s.name)}</p>${s.role ? `<p class="role">${esc(s.role)}</p>` : ""}</div>`)
        .join("") +
      `</div></div>`;
  }

  function rateSlide(slide, t) {
    const body = slide.querySelector(".pad .body");
    if (body) body.textContent = `${t.title} · ${namesOf(t)}`;
    // The talk's Sessionize feedback code (stage/build.mjs), navy on the hexagon.
    const qr = slide.querySelector(".qr");
    if (qr && t.feedback) {
      const n = t.feedback.n + 4;
      qr.innerHTML = `<svg viewBox="-2 -2 ${n} ${n}" role="img" aria-label="Rate this session"><path d="${t.feedback.d}"/>${t.feedback.mark ?? ""}</svg>`;
    }
  }

  /* People boards, by data-source:
   *   organizers  the team, two rows
   *   hosts       the welcome talk's speakers, with their organizer roles
   *   speakers    everyone on the 2026 programme, once each, in programme
   *               order; the hosts' welcome and wrap-up are not talks */
  const NOT_TALKS = new Set(["Welcome", "Wrap-up", "Remarks"]);
  function peopleFor(source) {
    const organizers = SHOW?.organizers ?? [];
    if (source === "organizers") return organizers;
    if (source === "hosts") {
      return (SHOW?.talks?.["d1-welcome"]?.speakers ?? []).map((s) => ({
        ...s,
        role: s.role || organizers.find((o) => o.name === s.name)?.role || "",
      }));
    }
    if (source === "speakers") {
      const seen = new Map();
      for (const t of Object.values(SHOW?.talks ?? {})) {
        if (NOT_TALKS.has(t.kind)) continue;
        for (const s of t.speakers) if (!seen.has(s.name)) seen.set(s.name, { ...s, role: "" });
      }
      return [...seen.values()];
    }
    return [];
  }

  function peopleSlide(slide, source) {
    const grid = slide.querySelector(".people");
    const people = peopleFor(source);
    if (source === "organizers") grid.style.setProperty("--per-row", String(Math.ceil(people.length / 2) || 1));
    grid.innerHTML = people
      .map(
        (o) =>
          `<div class="person">${o.portrait ? `<img src="${esc(asset(o.portrait))}" alt="">` : `<div class="avatar"></div>`}` +
          `<span class="who">${esc(o.name)}</span>${o.role ? `<span class="what">${esc(o.role)}</span>` : ""}</div>`,
      )
      .join("");
  }

  function partySlide(slide) {
    const sponsors = SHOW?.tiers?.find((t) => t.tier === "Afterparty")?.sponsors ?? [];
    if (!sponsors.length) return;
    const h = 500;
    slide.insertAdjacentHTML(
      "beforeend",
      `<div class="party-sponsor rise"><p class="eyebrow" style="margin:0">Sponsored by</p>` +
        sponsors
          .map(
            (s) =>
              `<div class="hexlogo" style="width:${(h * HEX_RATIO).toFixed(0)}px;height:${h}px">` +
              `<img src="${esc(asset(s.logo))}" alt="${esc(s.name)}"></div>`,
          )
          .join("") +
        `</div>`,
    );
  }

  /* The community sponsors and the partners, on a slide of their own: one
   * honeycomb of five across, then the partners side by side beside it. */
  function communitySlide(slide) {
    const sponsors = (SHOW?.tiers ?? []).find((t) => t.tier === "Community")?.sponsors ?? [];
    const partners = SHOW?.partners ?? [];
    const gap = 14;
    const top = 380;
    const h = 230;
    const w = h * HEX_RATIO;
    const per = 5;
    const tile = (s, x, y) =>
      `<div class="hexlogo" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${w.toFixed(0)}px;height:${h}px">` +
      `<img src="${esc(asset(s.logo))}" alt="${esc(s.name)}"></div>`;
    let x = 90;
    const comb = sponsors
      .map((s, n) => {
        const r = Math.floor(n / per);
        const c = n % per;
        return tile(s, x + c * (w + gap) + (r % 2 ? (w + gap) / 2 : 0), top + r * (h * 0.75 + gap));
      })
      .join("");
    const rows = Math.ceil(sponsors.length / per);
    x += Math.min(per, sponsors.length) * (w + gap) + (rows > 1 ? (w + gap) / 2 : 0) + 76;
    const partnerHtml = partners.map((s, n) => tile(s, x + n * (w + gap), top)).join("");
    slide.insertAdjacentHTML(
      "beforeend",
      `<div class="rise">${sponsors.length ? `<p class="tier-label" style="left:90px;top:${top - 60}px">Community</p>` : ""}${comb}</div>` +
        `<div class="rise">${partners.length ? `<p class="tier-label" style="left:${x}px;top:${top - 60}px">Partners &amp; media</p>` : ""}${partnerHtml}</div>`,
    );
  }

  /* A breaker before a gold sponsor's pitch: just their logo, on the white
   * hexagon the wall's pitch scene uses, in the middle of the slide. */
  function pitchSlide(slide) {
    const name = slide.dataset.sponsor;
    const s = (SHOW?.tiers ?? []).flatMap((t) => t.sponsors).find((x) => x.name === name);
    if (!s) return console.warn(`deck: no sponsor "${name}" in stage/show.data.js`);
    const h = 760;
    const w = h * HEX_RATIO;
    slide.insertAdjacentHTML(
      "beforeend",
      `<div class="hexlogo pitch-logo rise" style="left:${((1920 - w) / 2).toFixed(0)}px;top:${(1080 - h) / 2}px;width:${w.toFixed(0)}px;height:${h}px">` +
        `<img src="${esc(asset(s.logo))}" alt="${esc(s.name)}"></div>`,
    );
  }

  function sponsorSlide(slide) {
    // Tiers left to right, largest first, each a small honeycomb — the wall's
    // sponsor scene, laid out under the heading instead of beside it.
    // The afterparty sponsor sits top-right beside the heading rather than
    // as a fourth column, which would shrink every tier. Any other extra
    // tier shrinks the row until it fits between the margins.
    const spec = { Platinum: { h: 440, per: 1 }, Gold: { h: 250, per: 2 }, Bronze: { h: 190, per: 2 } };
    const gap = 14;
    const top = 380;
    const party = (SHOW?.tiers ?? []).find((t) => t.tier === "Afterparty")?.sponsors ?? [];
    const tiers = (SHOW?.tiers ?? []).filter(
      (t) => t.sponsors.length && t.tier !== "Afterparty" && t.tier !== "Community",
    );
    const widthAt = (k) =>
      tiers.reduce((sum, tier) => {
        const { h, per } = spec[tier.tier] ?? { h: 190, per: 2 };
        const w = h * k * HEX_RATIO;
        const rows = Math.ceil(tier.sponsors.length / per);
        return sum + Math.min(per, tier.sponsors.length) * (w + gap) + (rows > 1 ? (w + gap) / 2 : 0) + 76;
      }, -76 - gap);
    const k = Math.min(1, (W - 180) / widthAt(1));
    let x = 90;
    const html = tiers
      .map((tier) => {
        const base = spec[tier.tier] ?? { h: 190, per: 2 };
        const h = Math.round(base.h * k);
        const per = base.per;
        const w = h * HEX_RATIO;
        const rows = Math.ceil(tier.sponsors.length / per);
        const block =
          `<p class="tier-label" style="left:${x}px;top:${top - 60}px">${esc(tier.tier)}</p>` +
          tier.sponsors
            .map((s, n) => {
              const r = Math.floor(n / per);
              const c = n % per;
              const lx = x + c * (w + gap) + (r % 2 ? (w + gap) / 2 : 0);
              const ly = top + r * (h * 0.75 + gap);
              return (
                `<div class="hexlogo" style="left:${lx.toFixed(0)}px;top:${ly.toFixed(0)}px;width:${w.toFixed(0)}px;height:${h}px">` +
                `<img src="${esc(asset(s.logo))}" alt="${esc(s.name)}"></div>`
              );
            })
            .join("");
        x += Math.min(per, tier.sponsors.length) * (w + gap) + (rows > 1 ? (w + gap) / 2 : 0) + 76;
        return `<div class="rise">${block}</div>`;
      })
      .join("");
    const ph = 210;
    const pw = ph * HEX_RATIO;
    const partyHtml = party
      .map(
        (s, n) =>
          `<div class="hexlogo" style="left:${(W - 90 - pw - n * (pw + gap)).toFixed(0)}px;top:70px;width:${pw.toFixed(0)}px;height:${ph}px">` +
          `<img src="${esc(asset(s.logo))}" alt="${esc(s.name)}"></div>`,
      )
      .join("");
    const partyLabel = party.length
      ? `<p class="tier-label" style="right:${(90 + party.length * (pw + gap) + 16).toFixed(0)}px;top:160px">Afterparty</p>`
      : "";
    slide.insertAdjacentHTML("beforeend", html + `<div class="rise">${partyLabel}${partyHtml}</div>`);
  }

  /* The town sign's skyline pictogram: a house, a church with its spire, a
   * long low building, a small house, a tall house. Inline so it fills with
   * the palette's navy. */
  const SKYLINE =
    `<svg viewBox="0 0 232 70" aria-hidden="true">` +
    `<path d="M0 70V40L20 22L40 40V70Z"/>` +
    `<path d="M48 70V30L57 0L66 30V70Z"/><path d="M66 70V48L83 36L100 48V70Z"/>` +
    `<path d="M108 70V48L129 40L150 48V70Z"/>` +
    `<path d="M158 70V54L170 42L182 54V70Z"/>` +
    `<path d="M190 70V28L211 10L232 28V70Z"/></svg>`;
  document.querySelectorAll(".citysign .face").forEach((face) => face.insertAdjacentHTML("beforeend", SKYLINE));

  /* Maps (shared/denmark.js, shared/nordics.js, built by build-maps.py).
   *   <div class="geomap" data-map="denmark"></div>
   *   <div class="geomap" data-map="nordics" data-pin="../../assets/…svg"
   *        style="--pin: 40; --label: 26"></div>
   * Pins are the field's hexagon, or an image (a community's mark) when
   * data-pin is set. Each pin carries the side its label goes on, chosen by
   * hand in build-maps.py so neighbours do not collide. --pin and --label
   * are sizes in the map's own viewBox units. */
  const MAPS = { denmark: window.CND_DENMARK, nordics: window.CND_NORDICS };
  document.querySelectorAll(".geomap").forEach((el) => {
    const map = MAPS[el.dataset.map];
    if (!map) return console.warn(`deck: no map "${el.dataset.map}"; load shared/${el.dataset.map}.js`);
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.getPropertyValue("--pin")) || 52;
    const fs = parseFloat(cs.getPropertyValue("--label")) || 50;
    const img = el.dataset.pin;
    const gap = size * 0.5 + fs * 0.35;
    const pins = Object.entries(map.pins)
      .map(([name, [x, y, side]]) => {
        const at = {
          l: [x - gap, y + fs * 0.35, "end"],
          r: [x + gap, y + fs * 0.35, "start"],
          t: [x, y - gap, "middle"],
          b: [x, y + gap + fs * 0.7, "middle"],
        }[side ?? "r"];
        const mark = img
          ? `<image href="${esc(img)}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"/>`
          : `<path d="${HEX_D}" transform="${hexPlace(x, y, size)}"/>`;
        return `<g class="pin">${mark}<text x="${at[0].toFixed(1)}" y="${at[1].toFixed(1)}" text-anchor="${at[2]}" font-size="${fs}">${esc(name)}</text></g>`;
      })
      .join("");
    el.innerHTML = `<svg viewBox="${map.viewBox}" aria-label="Map"><path class="land" d="${map.d}"/>${pins}</svg>`;
  });

  slides.forEach((slide) => {
    const slug = slide.dataset.talk;
    const t = slug ? SHOW?.talks?.[slug] : null;
    if (slug && !t) {
      console.warn(`deck: no talk "${slug}" in stage/show.data.js`);
    } else if (t && slide.dataset.layout === "speaker") {
      speakerSlide(slide, t, slug);
    } else if (t && slide.dataset.layout === "rate") {
      rateSlide(slide, t);
    }
    // Codes for the links in the stage file's `qr` (the photographers'
    // gallery, the meetup groups), encoded by stage/build.mjs.
    slide.querySelectorAll(".qr[data-qr]").forEach((el) => {
      const q = SHOW?.qrs?.[el.dataset.qr];
      if (!q) return console.warn(`deck: no QR "${el.dataset.qr}" in stage/show.data.js; add its link to qr in content/2026-stage.json`);
      const n = q.n + 4;
      el.innerHTML = `<svg viewBox="-2 -2 ${n} ${n}" role="img" aria-label="${esc(el.dataset.label ?? el.dataset.qr)}"><path d="${q.d}"/>${q.mark ?? ""}</svg>`;
    });
    if (slide.dataset.layout === "pitch") pitchSlide(slide);
    if (slide.dataset.source === "sponsors") sponsorSlide(slide);
    else if (slide.dataset.source === "community") communitySlide(slide);
    else if (slide.dataset.source === "afterparty") partySlide(slide);
    else if (slide.dataset.source) peopleSlide(slide, slide.dataset.source);

    const mode = slide.dataset.field ?? DEFAULT_FIELD[slide.dataset.layout] ?? "quiet";
    slide.insertAdjacentHTML("afterbegin", field(mode));
  });

  /* ── fitting ───────────────────────────────────────────────────────────
   * Display type shrinks until it fits its box, the wall's rule, so a long
   * talk title never runs into the names under it. Slides are display:none
   * until shown, so each is shown briefly to be measured. Run again once the
   * fonts land, since the fallback face measures differently. */
  function fitAll() {
    slides.forEach((slide) => {
      const els = slide.querySelectorAll("[data-fit]");
      if (!els.length) return;
      const was = slide.hasAttribute("data-active");
      slide.setAttribute("data-active", "");
      els.forEach((el) => {
        el.style.fontSize = "";
        const max = Number(el.dataset.fit);
        let size = parseFloat(getComputedStyle(el).fontSize);
        // Shrink until it is no taller than its budget and no word runs
        // past its box: one long word ("PODDISRUPTIONBUDGETS?") cannot
        // wrap, and the slide's overflow: hidden would cut it off.
        while ((el.scrollHeight > max || el.scrollWidth > el.clientWidth + 1) && size > 40) {
          size -= 2;
          el.style.fontSize = `${size}px`;
        }
      });
      if (!was) slide.removeAttribute("data-active");
    });
  }
  fitAll();
  document.fonts?.ready.then(fitAll);

  /* ── presenter ───────────────────────────────────────────────────────
   * The deck publishes where it is to localStorage, and ../notes.html in
   * another window of the same browser follows it. The notes window can
   * also move the deck, so the presenter can drive from the laptop screen
   * while the deck sits fullscreen on the projector. Storage is keyed by the
   * deck's folder name, so the four decks never cross-talk. */
  const DECK_ID =
    location.pathname
      .split("/")
      .filter((p) => p && p !== "index.html")
      .pop() ?? "deck";
  const STATE_KEY = `cnd-deck:${DECK_ID}`;
  const COMMAND_KEY = `${STATE_KEY}:go`;

  // A <br> in a display line is a word break, not nothing.
  const text = (el) => {
    if (!el) return "";
    const copy = el.cloneNode(true);
    copy.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
    return copy.textContent.replace(/\s+/g, " ").trim();
  };

  function labelOf(slide) {
    if (slide.dataset.label) return slide.dataset.label;
    const slug = slide.dataset.talk;
    const t = slug ? SHOW?.talks?.[slug] : null;
    if (t && slide.dataset.layout === "speaker") return `${t.kind}: ${namesOf(t)}`;
    if (t && slide.dataset.layout === "rate") return `Rate: ${t.title}`;
    if (slide.dataset.layout === "pitch") return `Gold sponsor pitch: ${slide.dataset.sponsor}`;
    const eyebrow = text(slide.querySelector(".eyebrow"));
    const head = text(slide.querySelector(".display, .heading"));
    return [eyebrow, head].filter(Boolean).join(" · ") || slide.dataset.layout || "Slide";
  }

  function noteOf(slide, i) {
    if (authoredNotes[i]) return authoredNotes[i];
    const slug = slide.dataset.talk;
    const t = slug ? SHOW?.talks?.[slug] : null;
    if (!t) return "";
    const when = t.start ? ` ${t.start}–${t.end}${t.room ? `, ${t.room}` : ""}.` : "";
    if (slide.dataset.layout === "speaker") {
      const who = t.speakers.map((s) => (s.role ? `${s.name}, ${s.role}` : s.name)).join("\n");
      return `Introduce:\n${who}\n\n${t.kind}: “${t.title}”.${when}`;
    }
    if (slide.dataset.layout === "rate") {
      return `Thank ${namesOf(t)}. Ask the room to rate “${t.title}” with the QR code before they leave.`;
    }
    return "";
  }

  const labels = slides.map(labelOf);
  const notes = slides.map(noteOf);

  function publish() {
    try {
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          deck: DECK_ID,
          title: document.body.dataset.deckTitle ?? "Cloud Native Denmark",
          index,
          count: slides.length,
          label: labels[index],
          note: notes[index],
          next: labels[index + 1] ?? null,
          at: Date.now(),
        }),
      );
    } catch {
      // Private windows and file:// can refuse storage. The deck still runs.
    }
  }

  addEventListener("storage", (e) => {
    if (e.key !== COMMAND_KEY || !e.newValue) return;
    try {
      const { to } = JSON.parse(e.newValue);
      if (Number.isFinite(to)) show(to);
    } catch {}
  });

  /* ── navigation ─────────────────────────────────────────────────────── */

  let index = 0;

  /* The stage is a fixed 1920×1080 so every measurement in the CSS is a real
   * pixel. Fitting is one transform on the slide, which keeps text crisp and
   * avoids reflow between screen sizes — a slide can never lay out differently
   * on the projector than it did here. */
  function fit() {
    const w = window.innerWidth / 1920;
    const h = window.innerHeight / 1080;
    deck.style.setProperty("--fit", String(Math.min(w, h)));
  }

  function show(next, { pushHash = true, enter = true } = {}) {
    index = Math.max(0, Math.min(slides.length - 1, next));
    slides.forEach((s, i) => {
      s.removeAttribute("data-enter");
      i === index ? s.setAttribute("data-active", "") : s.removeAttribute("data-active");
    });
    // The entrance only plays when a presenter moves, never on load, print
    // or measurement, so those always see the settled slide.
    if (enter) {
      void slides[index].offsetWidth;
      slides[index].setAttribute("data-enter", "");
    }
    if (pushHash) history.replaceState(null, "", `#${index + 1}`);
    publish();
    document.title = `${index + 1}/${slides.length} · ${
      document.body.dataset.deckTitle ?? "Cloud Native Denmark"
    }`;
  }

  const fromHash = () => {
    const n = parseInt(location.hash.slice(1), 10);
    return Number.isFinite(n) ? n - 1 : 0;
  };

  addEventListener("resize", fit);
  addEventListener("hashchange", () => show(fromHash(), { pushHash: false }));

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        e.preventDefault();
        show(index + 1);
        break;
      case "ArrowLeft":
      case "PageUp":
        e.preventDefault();
        show(index - 1);
        break;
      case "Home":
        show(0);
        break;
      case "End":
        show(slides.length - 1);
        break;
      case "f":
        document.fullscreenElement
          ? document.exitFullscreen()
          : deck.requestFullscreen?.();
        break;
      case "p":
        print();
        break;
    }
  });

  /* Advance on click, but never when the click was a text selection or a link. */
  addEventListener("click", (e) => {
    if (e.target.closest("a") || getSelection()?.toString()) return;
    show(index + 1);
  });

  fit();
  show(fromHash(), { pushHash: false, enter: false });
})();
