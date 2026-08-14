# Cloud Native Denmark — graphics

Everything needed to produce on-brand graphics and decks for Cloud Native
Denmark 2026, without opening Photoshop and without the brand drifting.

The palette, type specs, logo artwork and frame geometry were **extracted from
the designer's own source files**, not eyeballed — so what this repo renders is
what she drew. A pixel-diff test reproduces all twelve of her LinkedIn frames
and holds them there.

---

## Quick start

You need **Node** and **Google Chrome**. That's it for making graphics.

```bash
git clone git@github.com:cloudnativedenmark/graphics.git
cd graphics

# one speaker announcement
node graphics/render.mjs bulletin --ground navy --decor hexfield \
  --portrait assets/speakers/adriana.jpg \
  --eyebrow "Keynote · day one" \
  --headline "Whose code|is it anyways?" \
  --body "Adriana Villela & Josh Lee.|Day one, main hall."

# or everything for 2026, in both square and 4:5
node graphics/build-announcements.mjs
```

Output lands in `graphics/out/`, which is gitignored — regenerate, don't commit.

If Chrome isn't in the usual place, set `CHROME_BIN=/path/to/chrome`.

---

## The two ways to work

**Change the content, re-run the build.** Everything for 2026 — keynotes,
sponsors, countdowns, announcements — lives in
[`content/2026-announcements.json`](content/2026-announcements.json). Add a
keynote or move a sponsor between tiers there and re-run
`build-announcements.mjs`. No code.

**Render one-offs with `render.mjs`.** For something not in the content file.

---

## Making graphics

### Announcements, keynotes, countdowns, sponsors

```bash
node graphics/build-announcements.mjs              # square + 4:5
node graphics/build-announcements.mjs --scale 2    # retina
node graphics/build-announcements.mjs --surface post  # 4:5 only
```

54 files in `graphics/out/announcements/` — 27 of each surface: 6 keynotes,
7 countdowns, 11 sponsor singles, 2 tier honeycombs and 1 general announcement.

To add a keynote, append to `keynotes` in the content file:

```json
{
  "slug": "d1-my-talk",
  "eyebrow": "Keynote · day one",
  "headline": "The punchy|part of the title.",
  "body": "Speaker Name.|Day one, main hall.",
  "ground": "sand",
  "portrait": "assets/speakers/name.jpg"
}
```

- `|` is a line break. Display type **shrinks to fit**, so a long name will not
  break the layout.
- `portrait2` adds a second speaker and switches to a matched pair of hexagons.
- `align` / `align2` set crop alignment for photos whose subject is off-centre
  — `xMinYMid` favours the left, `xMidYMin` the top. Useful for wide stage
  shots.
- Grounds: `navy`, `sand`, `bone`, `red`.

Countdowns use a `^` prefix to mark the big number:

```json
{ "days": 7, "ground": "red", "eyebrow": "One week out",
  "body": "Late bird closes this weekend.|Doors at 08:30." }
```

Every sponsor in `sponsors` gets its own graphic, and `tiers` groups them into
honeycombs. A tier with one sponsor is skipped, since that is just its single.

### The designer's four LinkedIn categories

Her own templates — speaker, sponsor, schedule and CFP — in her three variants
(navy photo, navy card, sand card):

```bash
node graphics/render.mjs speaker-highlight --variant 2 \
  --name "Name Lastname" --role "Role, organization" \
  --highlight "Three short|lines of|statement" \
  --portrait assets/speakers/name.jpg
```

`--variant 1` is the full-bleed photo layout, `2` navy card, `3` sand card.
`--surface square` gives 1080×1080 instead of her native 1080×1350.

### LinkedIn page cover

```bash
node graphics/render.mjs linkedin-cover --theme dark \
  --line1 "Schedule" --line2 "Is live" --scale 2
```

1128×191. The **left 280px stays empty on purpose** — LinkedIn covers it with
the page logo.

### Type-led posters

```bash
node graphics/render.mjs poster --ground navy \
  --lines "The|schedule|is|*live" --meta "19–20 Nov · Scandic Copenhagen"
```

A `*` prefix gives a line the outline treatment, the way the lockup sets
`DENMARK.`

---

## Importing into Canva

Canva is for **minor tweaks by hand**. This repo stays the source of truth for
anything final or print-bound.

### 1. Build the import files

```bash
.venv/bin/python graphics/build-canva-import.py   # needs the venv, see below
```

Ten self-contained HTML documents in `graphics/out/canva-import/`:

| Square | 4:5 | Contents |
|---|---|---|
| `cnd-keynotes.html` | `cnd-keynotes-4x5.html` | the keynotes |
| `cnd-sponsors.html` | `cnd-sponsors-4x5.html` | 11 singles + 2 tiers |
| `cnd-countdowns.html` | `cnd-countdowns-4x5.html` | 90 → 1 days |
| `cnd-announcements.html` | `cnd-announcements-4x5.html` | general announcements |
| `cnd-templates-square.html` | `cnd-templates-4x5.html` | reusable blanks |

### 2. Set up fonts in Canva first

Otherwise Canva substitutes and the type goes wrong. **Space Grotesk is a
Google Font — search Canva's font picker before uploading anything.** If it is
not there: Brand Hub → your kit → Fonts → Upload, using the TTFs in
`brand/fonts/`.

Inter must be a **static** instance; Canva rejects variable fonts. Generate
them with:

```bash
.venv/bin/fonttools varLib.instancer -o Inter-Regular.ttf \
  brand/fonts/Inter-Variable.ttf wght=400 opsz=14
```

### 3. Import

**Use the HTML, not the PDF.** PDF has no concept of layers, so Canva collapses
the whole design into one flat background image. HTML imports as separate,
editable layers — background, card, tab, each block of text.

Canva → **Uploads**, or **File → Import**, and drop the HTML in.

### 4. Check it

Import behaviour is the one thing this repo cannot verify. Two failure modes
have already been found this way:

- Pages arriving as a stock **sky-and-grass background** with artwork missing.
  That was Canva rejecting SVG data URIs; every asset is rasterised now.
- Everything appearing **welded to the background** and unselectable. That was
  a full-canvas transparent image on top intercepting clicks.

If a page looks wrong, say so rather than working around it — it is a bug here,
not something to fix by hand in Canva every time.

### Brand kit

The existing Canva kit is **KCD Denmark 2024**, from before the rename. Make a
new one for 2026 with the nine colours in
[`brand/tokens.json`](brand/tokens.json), and leave the old one alone.

---

## Using this with Claude Code

There is nothing to install. The skill lives in the repo at
[`.claude/skills/cnd-graphics/`](.claude/skills/cnd-graphics/), and Claude Code
discovers project-scoped skills automatically from the working directory.

```bash
git clone git@github.com:cloudnativedenmark/graphics.git
cd graphics
claude
```

Then just ask:

> Make a keynote announcement for Paula Kennedy, "How Do You Explore When the
> Map Keeps Changing?", day two.

> Move Chainguard up to the gold tier and rebuild the sponsor graphics.

> Build the Canva import files for the countdowns.

The skill carries the routing and the brand invariants, so it picks the right
template and won't quietly invent a colour or re-typeset the lockup. Type
`/cnd-graphics` to invoke it explicitly.

**Work inside the repo.** The skill and the content file use relative paths, so
running Claude from elsewhere won't find the assets — and don't copy the skill
to `~/.claude/skills/` for the same reason.

Everything works without Claude too; the commands in this README are the whole
interface.

---

## The decks

Four remarks decks at 1920×1080: `decks/day1-opening`, `day1-closing`,
`day2-opening`, `day2-closing`.

**Present:** open `index.html` in Chrome, press `f` for fullscreen. Arrow keys
or space to move, `p` to print.

**Export to PDF:**

```bash
"$CHROME_BIN" --headless --print-to-pdf=day1-opening.pdf \
  --no-pdf-header-footer decks/day1-opening/index.html
```

One page per slide at exactly 1920×1080.

**Before presenting, run the pre-flight:**

```bash
grep -rn TODO decks/
```

Every unknown is marked — 2026 speakers, sponsors, wifi credentials, floor
plan, raffle winners. The decks are scaffolds built from the 2025 structure,
carrying only organiser-owned slides plus one intro/rate pair per session.
Speaker decks stay separate files.

---

## Checks

```bash
test/run.sh
```

Three checks, each catching a different failure:

- **Token lint** — fails on any colour not in `brand/tokens.json`. The drift it
  catches has happened before: the brand book's generated deck had wandered to
  a different navy and picked up an off-brand blue and green.
- **Pixel regression** — renders all twelve of the designer's frames with the
  content empty and compares them to her overlay PNGs. Catches a tab a few
  pixels off or a wrong corner radius.
- **Slide overflow** — measures every deck slide against the 1920×1080 stage.
  Catches text that would clip on the projector.

The pixel thresholds are deliberately not zero: her tab carries a Photoshop
outer-glow that a drop-shadow approximates, and text rasterises differently in
Chrome. What matters is that the numbers stay put.

---

## Full setup, for extraction and Canva builds

Only needed to re-extract from the designer's files, run the pixel checks, or
build the Canva hand-off. Not needed to make graphics.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
brew install librsvg poppler          # rsvg-convert and pdftocairo
```

### Re-extracting when the designer ships new files

`brand/geometry.json` and the logo SVGs are **committed**, so you do not need
her source files day to day. To re-extract:

1. Put her files in `source/` — `CND-linkedin-template-1.psd`,
   `cloud_native_denmark_cover_2026.psd`, the flattened overlays in
   `source/overlays/`, and `cloud_native_denmark_cover_2026.png`.
2. `.venv/bin/python brand/extract.py`
3. `test/run.sh` — if her layout changed, the pixel diff tells you where.

`source/` is gitignored; it is around 590MB.

### Why extraction is split two ways

PSD vector paths and corner radii live in the layer's *untransformed* space,
and several layers carry a scale. Taken at face value they are wrong: the
content card's path claims `x -3..1084` at radius 91, while her exported
overlay's real window is `x 38..1042` at radius 51. Her tab label and year sit
on layers with a **1.3032 scale**, so their stored `FontSize` of 33 and 50
render at 43 and 65.

So geometry is **measured from the flattened overlays**, and the PSD supplies
type specs and vector artwork. `geometry.json` exposes `size_px` alongside
`size` — always read `size_px`.

---

## What lives where

```
brand/          tokens, extracted geometry, logo SVGs, fonts
                extract.py — the bridge from her files to code
content/        2026 content: keynotes, sponsors, countdowns, announcements
assets/         speaker photos and sponsor logos
graphics/       render.mjs and the templates; the build scripts
decks/          the four remarks decks
test/           the three checks
docs/           the design spec, and why things are the way they are
```

---

## House rules

- **Never re-typeset the lockup.** Use the SVGs in `brand/logo/`. `DENMARK.`
  and the year are outlines — a ground-coloured fill with a red stroke, which
  is how she built them and why they separate correctly for print.
- **`sand` and `bone` are not interchangeable.** Sand is the social ground,
  bone is the deck ground. No check can catch the wrong choice.
- **Social copy is Space Grotesk Medium, uppercase, tracking 0.02em.** No Bold,
  no Inter. Verified against every text layer in her PSDs. The deck and the
  newer bulletin layouts use Bold display type at tighter tracking, which is
  her deck's own treatment.
- **Sponsor logos are contained, never cropped**, and always on a white
  hexagon so any logo colour stays legible. Use transparent logo files — one
  with its own opaque background shows as a box.
- **Run `test/run.sh` before saying something is done.**

Known gaps, in [`docs/superpowers/specs/`](docs/superpowers/specs/): the flag
mark is red with a white cross, so on a red ground it collapses to a white plus
— red currently uses the wordmark alone, and a knockout version is a decision
for the designer.
