# Cloud Native Denmark — slide design system

> The authoritative spec for laying out CND slides. When you build or edit a
> slide, **match this document**.

The decks run on the two projector screens either side of the LED wall
([`docs/stage-led-wall.md`](../docs/stage-led-wall.md)), so they wear the
wall's look: navy ground, the honeycomb field, rose eyebrows, Bold uppercase
display, portraits and logos in the brand hexagon, and no straight lines.
Side by side with the wall, the brand book's bone and red pages read as a
different event.

The grid and type scale still come from her brand-book deck pages
(1280×720, measured and multiplied by 1.5). `decks/shared/cnd-deck.css` is the
implementation; this file is the contract.

---

## 0. How to use this

- Four decks, one per main-stage block, in run-of-show order from
  [`content/2026-stage.json`](../content/2026-stage.json):
  `day1-morning`, `day1-afternoon`, `day2-morning`, `day2-afternoon`.
- Decks are **HTML + CSS** on a fixed **1920×1080** stage. One `<section
  class="slide">` per slide, `data-layout` picks the layout.
- Colours and families come from [`brand/tokens.css`](../brand/tokens.css).
  **Never write a hex value in a deck or in the deck CSS** — the token lint
  fails on it, and should.
- Each deck loads `../../stage/show.data.js` and then `deck.js`. The data file
  is written by `node stage/build.mjs`; run it after editing `content/`.
- `deck.js` is load-bearing: it draws the field, fills the data slides, fits
  long titles, injects the hexagon clip path and scales the stage.

Open a deck with `open -a "Google Chrome" decks/day1-morning/index.html`
and press `f`.

---

## 1. Canvas and grid

| Property | Value |
|---|---|
| Stage | 1920 × 1080 |
| Margin (`--m`) | 90px all round |
| Columns | 825 + 90 gutter + 825 (`--col`, `--gutter`) |
| Body copy measure | capped at `--col` (825px) |

`.pad` is the content box: `position: absolute; inset: var(--m)`.

**Nothing may cross the stage edge** except the field. `test/slide-overflow.mjs`
measures every slide and fails on anything past it, with 2px of slack.

---

## 2. Ground and field

Every slide is **navy**. There are no other grounds.

The **field** is the wall's honeycomb: seed 2026, rose, peach and slate (no
red), cells scaled from the wall's 190 of 1176 to 175 of 1080. Every slide
draws from the same cells, so moving between slides reads as the field
shifting. Cells breathe over 14–26 s; the PDF shows them at full strength.

`data-field` sets the density; each layout has a default.

| Field | Where the cells are | Default for |
|---|---|---|
| `right` | Gathered on the right; text on the left | `title`, `logistics` |
| `edges` | Framing both edges | `section`, `speaker`, `quote` |
| `quiet` | A few faint cells at the very edges | everything else |
| `none` | No field | `photo`; set it on `map` |

---

## 3. Type scale

Display type is **Space Grotesk**, body is **Inter**.

| Class | Size | Weight | Notes |
|---|---|---|---|
| `.display` | 168px | 700 | Leading 0.948, uppercase. `section` 186, `logistics` 140, `rate` 120, `speaker` 104 and shrinks to fit. |
| `.heading` | 101px | 700 | Uppercase. Content-slide title, always under an eyebrow. |
| `.lead` | 58px | 400 | Leading 1.216. |
| `.col-heading` | 52px | 700 | Uppercase. |
| `.card-heading` | 49px | 700 | Uppercase, white, with a hexagon marker above. |
| `.name` | 44px | 700 | Uppercase. Speaker names. |
| `.kv dd` | 44px | 700 | |
| `.body` | 40px | 400 | Leading 1.346, sand at 80%. |
| `.eyebrow` | 34px | 500 | Uppercase, **rose**, tracked. Rose rather than red, as on the wall. |
| `.figure` | 247px | 700 | Outline numerals: navy fill, rose stroke, the countdown clock's device. |

`[data-fit="440"]` shrinks an element's type until it is no taller than
440px. Speaker titles use it so a long title never runs into the names.

---

## 4. Chrome

**None.** No footer, no page number, no progress bar: the wall has none, and
a rule along the bottom of the projector is a straight line. Brand presence
comes from the field and the lockup on the cover. The slide number is in the
URL hash and the window title for the presenter.

---

## 5. Layouts

| Layout | Shape | Slots |
|---|---|---|
| `title` | Lockup artwork left, edition and date under it, field right. | `.lockup` > `.wordmark` + `.mark`, `.eyebrow`, `.when` |
| `section` | Centred eyebrow and display with a terminal period. | `.eyebrow`, `.display`, optional `.body` |
| `split` | Eyebrow and heading, then two text columns (`data-n="3"` for three). | `.pad` > `.eyebrow` + `.heading`, `.cols` → `.stack` / `.card` |
| `stat` | Outline figure beside a heading, body and marked list. | `.pad`, `.cols` → `.figure` + `.figure-caption` / `.col-heading` + `.body` + `.marked` |
| `speaker` | The wall's walk-on: hexagon portraits left, eyebrow, title, names and roles right. **Filled from `data-talk`.** | empty `<section>` |
| `rate` | Display left, QR on a white hexagon right. With `data-talk` the body becomes the talk title and speakers. | `.eyebrow`, `.display`, `.body`, `.qr` |
| `logistics` | Eyebrow, display, and body or a `.kv` list in the left two-thirds. The workhorse. | `.eyebrow`, `.display`, `.body`, `.kv` |
| `map` | Narrow text column left, the venue plan contained right. | `.pad`, `.plan` > `img` |
| `people` | Hexagon portraits with name and role. `data-source` fills it: `organizers` (two rows), `hosts` (the welcome talk's three, large: `data-size="hosts"`), `speakers` (everyone on the programme, names only: `data-size="all"`). | `.pad`, empty `.people` |
| *maps* | `<div class="geomap" data-map="denmark">` or `"nordics"`, placed by CSS per map. Pins are the hexagon, or an image with `data-pin` (the Cloud Native Nordics mark). Outlines and pin label sides come from `shared/build-maps.py` (Natural Earth 1:10m). | `.geomap` |
| `gallery` | Words left, photos in a hand-placed honeycomb right. Credit the photographer. | `.pad` > … + `.credit`, `img.photo` |
| `sponsors` | Tiered honeycomb of white hexagons. `data-source="sponsors"` fills it. | `.pad` |
| `table` | Heading and a table; rows separated by tint, not rules. | `.pad`, `.wrap` > `table.cnd` |
| `quote` | Quote mark, blockquote, rose attribution. | `.quote-mark`, `.quote`, `.attribution` |
| `photo` | Full-bleed shot with a scrim and text over it. | `.shot` > `img`, `.scrim`, `.pad` |

---

## 6. The brand shape

Portraits, logo tiles, the QR and every marker are clipped to the logo's
silhouette with `clip-path: url(#cnd-shape)`, an `objectBoundingBox` clip path
`deck.js` injects from `brand/logo/cnd-shape-mask.svg`'s path. **Not a CSS
mask**: Chrome's PDF export drops masks, so every portrait and logo printed as
a square.

Anything laid out as a honeycomb (sponsor tiles, the gallery) uses
`url(#cnd-hex)` instead: the field's true hexagon, because the silhouette does
not tile and its rows overlap.

Sponsor logos sit on white hexagons, contained, never cropped. Two speakers
sit corner to corner, three as two over one, as on the wall.

---

## 7. Content, not markup

Talk, organizer and sponsor slides come from `stage/show.data.js`, which
`stage/build.mjs` writes from
[`content/2026-announcements.json`](../content/2026-announcements.json) and
[`content/2026-stage.json`](../content/2026-stage.json). The projectors and
the wall therefore show the same title, names, job titles and photos. Fix
them in `content/`, never in a deck.

```html
<section class="slide" data-layout="speaker" data-talk="d1-agent-no-idea"></section>
```

A slug missing from the data logs a warning and leaves the slide empty.

Anything still unknown is marked `TODO` next to where it belongs, so
`grep -rn TODO decks/` **is** the pre-flight checklist.

---

## 8. Presenting and exporting

```bash
decks/start.sh                # all four decks, each with its speaker-notes window, on :8026
decks/start.sh day1-morning   # just one
```

Speaker notes go in the slide they belong to:

```html
<section class="slide" data-layout="section">
  <div class="pad">…</div>
  <aside class="notes">Thank the crew. Remind people about the afterparty bus.</aside>
</section>
```

`deck.js` lifts the aside out before anything renders, so it never shows,
prints or counts toward overflow. Line breaks inside a paragraph join up; a
blank line starts a new one. Talk and rate slides with no aside get a note
written from the show data (who to introduce, title, time). A slide's label in
the notes window is its eyebrow and heading, or `data-label` if set.

`→ ← space` next/previous · `Home End` first/last · `f` fullscreen · `p` print ·
`#7` in the URL jumps to slide 7. The text rises in briefly when you move to
a slide, as on the wall.

```bash
"$CHROME_BIN" --headless --print-to-pdf=day1-morning.pdf \
  --no-pdf-header-footer decks/day1-morning/index.html
```

One page per slide at exactly 1920×1080, via `@page { size: 20in 11.25in }`.

---

## 9. Do / don't

**Do**

- Keep content inside the margins, and run `test/run.sh` before presenting.
- Put an eyebrow over every heading; it does the job the red rule used to.
- Put unknowns in as `TODO` rather than inventing a plausible value.
- Keep the deck and the wall saying the same thing at the same moment: the
  break times and end-of-day lines are cues in `content/2026-stage.json` too.

**Don't**

- Don't write a hex value anywhere in a deck.
- Don't add a bone, sand or red slide, a rule, a box border or a footer.
- Don't use red in the field or for type; it is the accent in the mark.
- Don't re-typeset the lockup; use the artwork.
- Don't retype a talk title, speaker name or sponsor into a deck.
- Don't paste speaker decks in. Last year that made a 119-slide, 160MB file.
  Speaker decks stay separate and get wired in on the day.
