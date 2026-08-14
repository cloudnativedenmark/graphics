# Cloud Native Denmark — slide design system

> The authoritative spec for laying out CND slides. Derived from the designer's
> own deck pages in the 2026 brand book. When you build or edit a slide,
> **match this document**.

Every number here traces to her pages, which are **1280×720**. The grid and type
scale were measured off them and multiplied by **1.5** — same 16:9, so nothing is
reproportioned. `decks/shared/cnd-deck.css` is the implementation; this file is
the contract.

---

## 0. How to use this

- Decks are **HTML + CSS** on a fixed **1920×1080** stage. One `<section
  class="slide">` per slide, `data-layout` picks the layout.
- Colours and families come from [`brand/tokens.css`](../brand/tokens.css), which
  each deck links directly. **Never write a hex value in a deck or in the deck
  CSS** — the token lint fails on it, and should.
- Slides are `display: none` until `deck.js` activates one, so the runtime is
  load-bearing. It also fits the stage to the window and injects the footer.
- The stage is a *fixed* 1920×1080 scaled by one transform, so a slide can never
  lay out differently on the projector than it did on your laptop.

Start a new deck by copying an existing `index.html`: the `<head>`, the two
stylesheet links and the trailing `<script>` are the whole scaffold.

---

## 1. Canvas and grid

| Property | Value |
|---|---|
| Stage | 1920 × 1080 |
| Margin (`--m`) | 90px all round |
| Columns | 825 + 90 gutter + 825 (`--col`, `--gutter`) |
| Footer rule | y ≈ 963 |
| Body copy measure | capped at `--col` (825px) |

`.pad` is the content box: `position: absolute; inset: var(--m)`. Almost every
layout puts its content inside one.

**Nothing may cross the stage edge.** `test/slide-overflow.mjs` measures every
slide and fails on anything past it, with 2px of slack for subpixel text and the
deliberately bleeding corner accents. Shrink type before you break the grid.

---

## 2. Grounds

Set with `data-ground` on the slide. Four, and they are not interchangeable.

| Ground | Background | Notes |
|---|---|---|
| *(default)* | `--cnd-bone` | The deck ground. Navy ink. |
| `navy` | `--cnd-navy` | White ink; body copy drops to 76% sand. |
| `sand` | `--cnd-sand` | Navy ink. Warmer than bone; use for contrast between neighbouring slides. |
| `red` | `--cnd-red` | White ink, **navy** eyebrow and page number. No mark in the footer. |

`sand` is the *social* ground and `bone` is the *deck* ground. No check can catch
the wrong one, so pick deliberately.

---

## 3. Type scale

Display type is **Space Grotesk**, body is **Inter**. Both from tokens.

| Class | Size | Weight | Notes |
|---|---|---|---|
| `.display` | 168px | 700 | Leading 0.948, uppercase, `text-wrap: balance`. `section` bumps it to 186px. |
| `.slide-title` | 101px | 700 | Uppercase, with the red rule as its own `border-top` — so the rule spans the text, not a fixed width. |
| `.lead` | 58px | 400 | Leading 1.216. |
| `.col-heading` | 52px | 700 | Uppercase. |
| `.card-heading` | 49px | 700 | Uppercase, red. |
| `.kv dd` | 44px | 700 | |
| `.body` | 40px | 400 | Leading 1.346, muted ink. |
| `.eyebrow` | 34px | 500 | Uppercase, red, tracked `--cnd-track-eyebrow`. |
| `.figure` | 247px | 700 | The giant statistic. |
| `.badge`, `.state` | 24px | 700 | Uppercase, tracked. |
| Footer | 21px | 500 | Uppercase, tracked. |

Deck display type uses Bold at tight tracking. That is **her deck's own
treatment** and is not a licence to mix it into the social graphics, which are
Medium uppercase at +0.02em.

---

## 4. Chrome

`deck.js` injects a footer into every slide, so it is never hand-written:

1. **Mark** — bottom-left, `brand/logo/cnd-mark.svg` at 44px.
2. **Edition** — centred, `Edition N° 04 · cloudnativedenmark.dk`. Override per
   deck with `data-footer` on `<body>`.
3. **Page number** — bottom-right, zero-padded, red (navy on red grounds),
   tabular figures.
4. **Progress line** — a red 4px track along the very bottom of the window.

The footer is a three-column grid, not `space-between`, so the centre text stays
put on slides that carry no mark.

**The mark, not the wordmark.** The lockup is a three-line stacked block; at 44px
its strokes go sub-pixel and it renders as grey mush. The footer text already
spells the name. The cover carries the full lockup at size.

**Red grounds get no mark.** It is a red flag with a white cross, so on red its
field merges into the slide and all that survives is a floating white plus. A
knockout version is an open question for the designer.

Opt a slide out entirely with `data-chrome="none"` — the cover and the closing
slide, which end on the mark rather than on chrome.

---

## 5. Layouts

Set with `data-layout`. Eleven, all implemented.

| Layout | Shape | Slots |
|---|---|---|
| `title` | Bone, full-bleed red field over the right 46.9% (matching her title page exactly). **One per deck.** | `.field`, `.eyebrow`, `.display`, `.title-meta` → `.when` / `.divider` / `.blurb` |
| `section` | Centred eyebrow, huge display with a terminal period, short red underline. The divider between acts. | `.eyebrow`, `.display`, `.rule` |
| `split` | Two columns: prose stack left, white card right. | `.slide-title`, `.cols` → `.stack` / `.card` |
| `stat` | Giant figure beside a heading, body and marked list. | `.slide-title`, `.cols` → `.figure` + `.figure-caption` / `.col-heading` + `.body` + `.marked` |
| `speaker` | 620px circular portrait left, badge + talk + name + role right. Two speakers get `.pair`. | `.cols` → `.portrait` or `.pair`, `.badge`, `.talk`, `.who`, `.what` |
| `rate` | Display headline left, QR right. Follows each session intro. | `.eyebrow`, `.display`, `.body`, `.qr` |
| `logistics` | Eyebrow, display, and either body or a `.kv` list. The workhorse. | `.eyebrow`, `.display`, `.body`, `.kv` |
| `table` | Title plus a table or a sponsor tier wall. | `.slide-title`, `.wrap` > `table.cnd`, or `.tier` |
| `people` | Grid of avatars with name and role. Set `--per-row`. | `.slide-title`, `.people` → `.person` |
| `quote` | Oversized quote mark, blockquote, attribution. | `.quote-mark`, `.quote`, `.attribution` |
| `photo` | Full-bleed shot with a scrim and text over it. | `.shot` > `img`, `.scrim`, `.pad` |

---

## 6. Components

- **`.card`** — white, radius 24, padding 62, soft double shadow. Holds a
  `.card-heading` (red) and body.
- **`.marked`** — list whose markers are the **logo hexagon**, not bullets. The
  first three cycle red → peach → slate.
- **`.kv`** — definition list for logistics: red tracked term, bold value.
  Wifi, times, links.
- **`.badge`** — red pill, uppercase. Session kind on speaker slides.
- **`.accent`** — the hexagon silhouette bleeding off an edge, placed with
  `data-at="top-right"` or `"bottom-left"`, coloured with `--accent-color`. One
  per slide at most.
- **`.tier`** — the sponsor wall. Rows carry `data-tier`; tile sizes step down
  platinum → gold → bronze. Tiles are a **fixed size**, and logos are
  `object-fit: contain` against a definite height, so they are never cropped and
  never blow the row open.
- **`.portrait` / `.pair`** — one circle, or two staggered 396px circles ringed
  in the ground colour, mirroring how the announcement graphics handle a
  two-speaker talk.

---

## 7. Content, not markup

Speaker and sponsor slides are generated from
[`content/2026-announcements.json`](../content/2026-announcements.json) — the same
file the announcement graphics read. Add a sponsor there and it appears in both.
Logos come from `assets/sponsors/`, portraits from `assets/speakers/`.

Anything still unknown is marked `TODO` next to where it belongs, so
`grep -rn TODO decks/` **is** the pre-flight checklist.

---

## 8. Presenting and exporting

`→ ← space` next/previous · `Home End` first/last · `f` fullscreen · `p` print ·
`#7` in the URL jumps to slide 7.

```bash
"$CHROME_BIN" --headless --print-to-pdf=day1-opening.pdf \
  --no-pdf-header-footer decks/day1-opening/index.html
```

One page per slide at exactly 1920×1080, via `@page { size: 20in 11.25in }`.

---

## 9. Do / don't

**Do**

- Keep content inside the margins, and run `test/run.sh` before presenting.
- Pick a ground per slide deliberately; alternating bone and navy gives the deck
  rhythm.
- Let `.slide-title` carry its own red rule so the rule matches the text width.
- Put unknowns in as `TODO` rather than inventing a plausible value.
- Reorder generated speaker sections rather than retyping them.

**Don't**

- Don't write a hex value anywhere in a deck.
- Don't hand-write a footer — it is injected.
- Don't re-typeset the lockup, and don't put the wordmark in the footer.
- Don't use more than one bleeding `.accent` per slide.
- Don't size a sponsor tile to its logo; the tiles are fixed and the logo fits
  inside.
- Don't paste speaker decks in. Last year that made a 119-slide, 160MB file.
  Speaker decks stay separate and get wired in on the day.
