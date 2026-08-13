# Cloud Native Denmark — Design System, Graphics Skill & Remarks Decks

**Date:** 2026-08-13
**Status:** Approved design, ready for implementation planning

## 1. Context

Cloud Native Denmark (CND) is a two-day, practitioner-run cloud native
conference — edition N° 04, 19–20 November 2026, Scandic Copenhagen. It is run
by volunteers, and all profits go to charity (840,000 DKK donated across the
first three editions; the 2026 target pushes cumulative giving past 1M DKK).

A designer delivered a 2026 brand package: logo in Illustrator and SVG,
LinkedIn cover and post templates as layered PSDs plus flattened transparent
PNG overlays, roll-ups, beachflag, t-shirt mockups, and a 24-page brand book
PDF that includes a Google Slides deck treatment.

The organizers need to produce digital graphics continuously through the year —
speaker announcements, sponsor thanks, schedule reveals, CFP notices — without
opening Photoshop for each one, and without the brand drifting. They also need
four presentation decks for the event itself.

### Goals

1. A **design system** captured as code, derived from the designer's actual
   source files, that any organizer can produce on-brand graphics from.
2. A **skill** (`cnd-graphics`) that lets Claude generate those graphics
   correctly and consistently from a short request.
3. **Four remarks decks** — Day 1 and Day 2, opening and closing — scaffolded
   from the structure the 2025 decks actually used.

### Non-goals

Print production (roll-ups, beachflag, t-shirts) stays with the designer; the
press-ready PDFs already exist. This system covers digital output only. We are
also not building a GUI, a web app, or a CMS.

## 2. Decisions

These were settled with the user before writing this spec.

| Decision | Choice | Rationale |
|---|---|---|
| Deck format | Self-contained HTML at 1920×1080, presented in Chrome or exported to PDF | Pixel-exact brand control, shares one token file with the graphics. Accepted tradeoff: non-technical organizers cannot edit decks without touching code. |
| Palette authority | The designer's production values | The print-ready overlays and the logo are what actually ships. The brand book's embedded Google Slides deck had drifted (`#001A33` navy, `#E63026` red) and had picked up off-brand blue and green; those are corrected, not preserved. |
| Graphics scope (v1) | All four categories, LinkedIn cover, extra aspect ratios, organizer/AV set | See §6. |
| Geometry authority | Extracted from PSD/AI, not measured by eye | The PSDs carry exact layer bboxes, corner radii, vector paths and type specs. Re-runnable when the designer ships a new version. |
| Source files in git | Extracted derivatives committed; originals gitignored | Keeps the repo clonable in seconds. `extract.py` regenerates derivatives from a dropped-in `Transfer.zip`. |

## 3. Repository layout

```
graphics/
├── .claude/skills/cnd-graphics/
│   ├── SKILL.md                     # entry point, routing, invariants
│   └── references/
│       ├── design-system.md         # tokens, type, the nine devices, do/don't
│       ├── graphics-recipes.md      # per-template anatomy and content slots
│       └── deck-authoring.md        # slide layout catalogue
├── brand/
│   ├── extract.py                   # PSD/AI → SVG + geometry.json
│   ├── tokens.css                   # single source of truth (CSS custom props)
│   ├── tokens.json                  # same values, for scripts
│   ├── geometry.json                # extracted positions, radii, type specs
│   ├── fonts/                       # Space Grotesk + Inter, self-hosted woff2
│   ├── logo/
│   │   ├── cnd-mark.svg             # flag mark
│   │   ├── cnd-lockup-navy.svg      # for light grounds
│   │   ├── cnd-lockup-cream.svg     # for navy grounds
│   │   └── cnd-tab.svg              # trapezoid tab path
│   └── reference/                   # designer's overlay PNGs, for regression diffs
├── graphics/
│   ├── templates/*.html
│   ├── render.mjs                   # headless Chrome renderer
│   └── out/                         # generated, gitignored
├── decks/
│   ├── shared/cnd-deck.css, deck.js
│   ├── day1-opening/index.html
│   ├── day1-closing/index.html
│   ├── day2-opening/index.html
│   └── day2-closing/index.html
├── source/                          # gitignored: designer's PSD/AI/INDD/zip
├── test/                            # verification scripts (§8)
└── README.md
```

**No npm dependencies.** Rendering uses the Chrome CLI already on the machine
(`--headless --screenshot` for graphics, `--print-to-pdf` for decks).
`extract.py` needs `psd-tools` in a local venv, but only when re-extracting from
new designer files — not for day-to-day graphics work.

## 4. The design system

### 4.1 Color

Sampled from the designer's print-ready overlays and the logo's Illustrator
source. These are the authoritative values.

| Token | Value | Role |
|---|---|---|
| `--cnd-navy` | `#19213C` | primary ground; display text on light grounds |
| `--cnd-red` | `#FF281E` | tabs, rules, eyebrows, the flag mark, outline strokes |
| `--cnd-sand` | `#F2E6D5` | warm alternate ground (LinkedIn variant 3, cover) |
| `--cnd-bone` | `#F8F5F2` | cooler off-white; the deck's content ground |
| `--cnd-white` | `#FFFFFF` | cards, display text on navy |
| `--cnd-rose` | `#E07E77` | hexagon cluster, accent |
| `--cnd-peach` | `#F0AD95` | hexagon cluster, accent |
| `--cnd-slate` | `#858388` | hexagon cluster, muted accent |
| `--cnd-ink-muted` | `#4A5568` | deck body copy on light grounds |

Deliberately dropped: `#4F81BD` (blue table header) and `#10B981` (green
status), both artifacts of the generated deck. Status and emphasis use navy,
red, and slate instead.

`--cnd-bone` and `--cnd-sand` are both kept and are not interchangeable: sand is
the social/brand-book ground, bone is the slide ground. The token lint (§8)
cannot catch a wrong choice between them, so `design-system.md` states the rule
explicitly.

### 4.2 Typography

Both families are already installed on the author's machine and will be
self-hosted in `brand/fonts/` as woff2 so rendering does not depend on that.

**Social graphics are set entirely in `SpaceGrotesk-Medium`, uppercase,
tracking `0.02em`.** No Bold, no Inter. This was verified against every text
layer in `CND-linkedin-template-1.psd` and the cover PSD. Reference sizes at
the 1080×1350 canvas:

| Role | Rendered size | Color | Notes |
|---|---|---|---|
| Speaker name | 40px | white on navy / navy on white | layer scale 1.0 |
| Role / title | 29px | `--cnd-red` | layer scale 1.0 |
| Highlight statement | 49px | white on navy / navy on white | multi-line, layer scale 1.0 |
| Tab label | **43px** | white | leading 48px, centered; `FontSize` 33 × scale 1.3032 |
| Year `2026` | **65px** | outline (see below) | `FontSize` 50 × scale 1.3032 |
| Cover wordmark | 41px | navy | tracking 0.02em, leading 35px |
| Cover year | 41px | outline | tracking `0.24em` |

The tab label and year sit on layers carrying a **1.3032 affine scale**, so
their raw `FontSize` is not their rendered size. `geometry.json` exposes both:
always read `size_px`, never `size`. The body-copy layers are unscaled, which is
why 40/29/49 pass through unchanged. The v1 tab label is additionally **rotated
30°**.

**Decks** use Space Grotesk for display and eyebrows, Inter for body copy at
`1.65` line-height. Never Inter for a headline; never Space Grotesk for a
paragraph.

Sizes above are the reference canvas, not hardcoded pixels. Templates express
type in `em` or `cqw` against the canvas so a 1080×1350 recipe re-renders
correctly at 2160×2700 for retina export.

### 4.3 The nine signature devices

These are what make an asset read as CND rather than as generic conference
design. Each becomes a documented CSS class.

1. **Red rule above title** — 3px red line above an uppercase display heading.
   On every deck content slide.
2. **Full-bleed red field** — solid red occupying roughly the right 47% of the
   title slide.
3. **Trapezoid tab** — red tab hanging from the top edge with an outer glow,
   holding a category label. Exact path from `Polygon 1` (§5).
4. **Outline numerals** — the mechanism is *fill in the background color, stroke
   in red*, confirmed in two independent PSDs. In CSS:
   `color: var(--ground); -webkit-text-stroke: 2px var(--cnd-red)`.
5. **Outline `DENMARK.`** — part of the lockup, ships as vector; never
   re-typeset.
6. **Hexagon cluster** — four hexagons in rose / peach / slate, irregular
   arrangement.
7. **Corner-bleeding pentagon blobs** — irregular pentagons cropped by the
   canvas edge, in accent colors.
8. **Rounded content card** — a *window* rather than a filled shape: the
   overlay is transparent there so a photo or color shows through. At the
   1080×1350 canvas it spans x 38–1042, y 40–984 with a **51px** corner
   radius, all measured from the overlay's alpha channel (see §5 on why not
   from the PSD).
9. **Footer rule with edition + domain** — thin rule, `EDITION N° 04` left,
   `CLOUDNATIVEDENMARK.DK` right.

### 4.4 Logo rules

Three ships: `cnd-mark.svg` (flag only), `cnd-lockup-navy.svg` (light grounds),
`cnd-lockup-cream.svg` (navy grounds). All are real vector recovered from the
PSD's embedded smart objects. The lockup is never re-typeset from live text, and
never recolored beyond the two supplied colorways.

## 5. Extraction pipeline

`brand/extract.py` is the bridge from designer deliverables to code, and is
re-runnable. Given `source/` containing the designer's files it emits
`brand/logo/*.svg`, `brand/geometry.json`, and `brand/reference/*.png`.

What it does, all verified working during design:

- **Smart objects → SVG.** Embedded `.ai` payloads in the PSD are
  PDF-compatible; written out and converted with `pdftocairo -svg`. This
  recovered the cream lockup, the navy lockup, and the flag mark.
- **Standalone `.ai` → SVG.** Same path; `logo-without-caption-and-year.ai`
  is `%PDF-1.5`.
- **Vector shapes → SVG paths.** `psd-tools` exposes `vector_mask.paths` as
  bezier knots. Knot anchors are `(y, x)` normalized to document height and
  width, so `anchor × (height, width)` gives canvas coordinates. This yields the
  trapezoid tab's 10-knot path exactly — verified by rendering it and comparing
  to the overlay, where it matched at x 304–775 along the top edge.
- **Type specs** from `engine_dict.StyleRun` — font name, size, tracking
  (1/1000 em), leading, caps flag, and ARGB fill.
- **Layer bboxes** for text and smart-object placement.

### 5.1 Which source wins for which fact

Vector-mask paths and `origination` radii live in the layer's *untransformed*
space, and several layers carry a scale transform. Taken at face value they are
wrong: the card's path implies x −3–1084 with a 91px radius, while the exported
overlay's actual window is x 38–1042 with a ≈48px radius. The tab path happened
to have an identity transform, which is why it matched.

So the split is:

| Fact | Source |
|---|---|
| Frame furniture geometry — card window, footer band, rules, tab placement | **Measured from the overlay PNGs** (post-transform, unambiguous) |
| Tab outline path | PSD vector mask, *after* verifying against the overlay |
| Type specs — family, size, tracking, leading, color | PSD `engine_dict` |
| Logo and mark artwork | PSD embedded smart objects |

`extract.py` therefore does both: it reads the PSDs for type and artwork, and
measures the overlay PNGs for geometry. The measurement is the part that must
not be replaced with a hardcoded guess — it is how the numbers stay correct if
the designer ships a v5 with a different layout.

`geometry.json` is committed, so day-to-day work never needs the venv or the
590MB of sources.

## 6. Graphics templates

Every template is one HTML file consuming `tokens.css` and `geometry.json`,
rendered by `render.mjs` at any output size.

**Why rebuild the frames in code rather than composite the designer's PNG
overlays:** the overlays bake in their category label, so they cover only the
four labels she shipped. The organizers need labels she did not ship
(`WORKSHOP`, `CFP OPEN`, `TICKETS LIVE`, `AFTERPARTY`). A code-built tab takes
any string. Her overlays remain the regression target (§8), so fidelity is
verified rather than assumed.

### 6.1 The designer's four, three variants each — 1080×1350

Categories: `speaker-highlight`, `sponsor-highlight`, `schedule-announcement`,
`cfp-notification`. Variants:

- **v1 — navy photo:** full-bleed photo with navy gradient scrim, tab rotated
  into the top-right corner, navy footer band with a red top rule.
- **v2 — navy card:** navy ground, white 91px-radius card, tab centered on the
  top edge with glow.
- **v3 — sand card:** sand ground, white card, navy lockup, red outline year.

Content slots per category are documented in `graphics-recipes.md`. The speaker
recipe takes name, role, org, headshot, and an optional pull quote; the sponsor
recipe takes tier, logo, and blurb.

### 6.2 LinkedIn cover — 1128×191

Rebuilt from the cover PSD: sand ground, hexagon cluster, `COPEN HAGEN` +
outline year at left, lockup at right. Year is a parameter so 2027 is a one-word
change.

### 6.3 Extra aspect ratios

`1080×1080` square, `1200×630` OG/link-preview, and a `clean` unlabelled frame
in all three variants for arbitrary content.

### 6.4 Organizer and AV set

Speaker cards for the AV desk, session slates matching the deck's speaker-intro
layout, and a `rate-this-session` QR graphic consistent with the deck slide of
the same name.

## 7. The decks

`decks/shared/cnd-deck.css` provides the layout catalogue; `deck.js` provides
arrow-key navigation and a `?print` mode that flattens all slides for
`--print-to-pdf`. Each deck is a single `index.html` of
`<section class="slide" data-layout="…">` elements.

### 7.1 Layouts

`title`, `section-divider`, `content-split`, `stat`, `quote`, `people-grid`,
`speaker-intro`, `rate-session`, `photo-full`, `logistics`, `sponsor-tier`,
`table`, `chart`, `thanks`, `closing`.

`speaker-intro` and `rate-session` recur once per session, so adding a session
is three lines of HTML rather than a copy-pasted block.

### 7.2 The four decks

Scaffolded from the 2025 decks' actual structure, with 2026 content where known
(edition N° 04, 19–20 Nov, Scandic Copenhagen, 840K DKK to date) and explicit
`TODO` markers where not (2026 speakers, sponsors, wifi credentials, raffle
winners, photos).

One important scoping note: the 2025 decks embedded every speaker's full slide
deck, which is why they run to 119 slides and 160MB. Our decks carry **only the
organizer-owned slides** plus the per-session intro and rate slides. Speaker
decks stay separate files, as they should.

- **Day 1 Opening** — welcome; Cloud Native Nordics; KCD Denmark → Cloud Native
  Denmark; charity total; the three cities; per-city organizer grids (Aalborg,
  Aarhus, Copenhagen); organizers; speakers; venue and breakout maps; wifi;
  workshops today and tomorrow; website shortcut; hashtags; swag; afterparty;
  reminders (rate sessions, reuse mugs); let's get started; then intro + rate
  pairs per session.
- **Day 1 Closing** — hashtags; lightning talk and panel intro/rate pairs; swag;
  afterparty; don't party too late.
- **Day 2 Opening** — what a first day it was (photo slides); remember to rate;
  hashtags; workshops; keynote intro/rate pairs; gold sponsor pitch slates;
  photos available; coffee break.
- **Day 2 Closing** — keynote intro/rate pairs; raffles (booth-dots challenge,
  next-edition ticket winners, social draw); rate the event; early blind bird
  for 2027; thank you organizers; see you in 2027.

## 8. Verification

Three checks, each runnable and each catching a distinct failure mode.

1. **Pixel regression against the designer.** Render each 1080×1350 frame with
   content slots empty, compare to the corresponding
   `brand/reference/CND-linkedin-template-*.png`, assert mean per-channel delta
   below threshold. Catches a tab 6px off or a wrong corner radius. Threshold is
   calibrated once at implementation time and recorded; anti-aliasing and the
   tab's outer glow mean it will not be zero.
2. **Slide overflow check.** Load each deck in headless Chrome and compare
   `scrollHeight` to `clientHeight` per slide, asserting every slide is exactly
   1920×1080 with no overflow. Catches text running off a slide before anyone is
   on stage with it.
3. **Token lint.** Grep templates and deck CSS for hex literals absent from
   `tokens.css`, and fail on any hit. Stops palette drift from creeping back —
   the exact failure the brand book's generated deck already exhibited.

`test/run.sh` runs all three.

## 9. The skill

`.claude/skills/cnd-graphics/SKILL.md` stays short and routes to the three
reference files, loading only what a given request needs. It states the
invariants that must not be violated regardless of request: the palette, the two
type families and their roles, use the vector lockup rather than typesetting it,
and run the verification before claiming a graphic is done.

Progressive disclosure matters here — a request for one speaker graphic should
not pull the full deck layout catalogue into context.

## 10. Implementation phases

This is a large spec, so the implementation plan should follow four phases.
Each ends somewhere useful, so work can stop between phases without leaving
anything half-built.

1. **Brand foundation** — `extract.py`, `tokens.css`/`tokens.json`,
   `geometry.json`, the three logo SVGs, self-hosted fonts, git scaffolding and
   `.gitignore`. Ends with the design system as data, verifiable by eye against
   the designer's PNGs.
2. **Graphics engine** — `render.mjs`, the three variant frames, the four
   categories, and checks 1 and 3 from §8. Ends with a working
   speaker-highlight graphic that passes pixel regression. This is the phase
   that proves the approach; if the frames cannot match the designer's
   overlays, we learn it here and not after building 20 templates.
3. **Remaining templates** — cover, extra aspect ratios, organizer/AV set.
   Mechanical once phase 2 lands.
4. **Decks and skill** — `cnd-deck.css`, the layout catalogue, the four deck
   scaffolds, check 2, then `SKILL.md` and its three reference files. The skill
   is written last so it documents what was actually built rather than what was
   planned.

## 11. Risks and open items

- **Font licensing.** Space Grotesk (SIL OFL) and Inter (SIL OFL) both permit
  self-hosting and embedding. No action needed, noted for the record.
- **The tab's outer glow.** A Photoshop layer effect. `extract.py` reads its
  parameters, but CSS `filter: drop-shadow` is not a pixel-identical
  reimplementation. If check 1 fails only around the tab, the glow is the likely
  cause and the threshold should be relaxed there rather than the geometry
  changed.
- **2026 content is largely unknown.** Speakers, sponsors, and schedule are not
  yet set. Decks ship as scaffolds with `TODO` markers; this is expected, not a
  defect.
- **Deck editing is developer-only.** Accepted consequence of the HTML choice.
  If other organizers need to edit decks directly during the event, the fallback
  is exporting to PDF in advance and treating the HTML as the source that only
  one person edits.
