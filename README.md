# Cloud Native Denmark — graphics

On-brand graphics and decks for Cloud Native Denmark 2026, without opening
Photoshop and without the brand drifting.

The palette, type specs, logo artwork and frame geometry were **extracted from
the designer's own source files**, not eyeballed. A pixel-diff test reproduces
all twelve of her LinkedIn frames and holds them there.

---

## Use it with Claude Code

The intended way in. Nothing to install — the skill is committed at
[`.claude/skills/cnd-graphics/`](.claude/skills/cnd-graphics/) and Claude Code
picks up project-scoped skills from the working directory.

```bash
git clone git@github.com:cloudnativedenmark/graphics.git
cd graphics
claude
```

Then ask for what you want:

> Make a keynote announcement for Paula Kennedy, "How Do You Explore When the
> Map Keeps Changing?", day two.

> Move Chainguard up to the gold tier and rebuild the sponsor graphics.

> Build the Canva import files for the countdowns.

The skill carries the routing and the brand invariants, so it picks the right
template and won't invent a colour or re-typeset the lockup. `/cnd-graphics`
invokes it explicitly.

**Work inside the repo** — the skill and content file use relative paths. Don't
copy the skill to `~/.claude/skills/`.

---

## Or run it yourself

You need **Node** and **Chrome**. That's all for making graphics.

```bash
node graphics/build-announcements.mjs          # everything for 2026
node graphics/build-announcements.mjs --scale 2 # retina
node graphics/build-stamp-card.mjs             # A6 sponsor booth stamp card, PDF for print
```

54 files in `graphics/out/` (gitignored — regenerate, don't commit): 27 per
surface, square and 4:5. Set `CHROME_BIN` if Chrome isn't in the usual place.

**Most changes are content, not code.** Keynotes, sponsors, countdowns and
announcements all live in
[`content/2026-announcements.json`](content/2026-announcements.json). Add a
keynote or move a sponsor between tiers there and re-run the build.

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

`|` is a line break, and display type shrinks to fit. `portrait2` adds a second
speaker as a matched pair. `align` / `align2` fix off-centre crops
(`xMinYMid`, `xMidYMin`). Grounds: `navy`, `sand`, `bone`, `red`. Countdowns
mark the big number with `^`.

### One-offs

```bash
# her four LinkedIn categories, in her three variants
node graphics/render.mjs speaker-highlight --variant 2 \
  --name "Name Lastname" --role "Role, organization" \
  --highlight "Three short|lines of|statement" \
  --portrait assets/speakers/name.jpg

# hexagon-style announcement
node graphics/render.mjs bulletin --ground navy --decor hexfield \
  --eyebrow "Keynote · day one" --headline "Whose code|is it anyways?"

# type-led poster; * marks a line for the outline treatment
node graphics/render.mjs poster --ground navy \
  --lines "The|schedule|is|*live" --meta "19–20 Nov · Scandic Copenhagen"

# LinkedIn page cover — the left 280px stays empty for the page logo
node graphics/render.mjs linkedin-cover --theme dark \
  --line1 "Schedule" --line2 "Is live"
```

`speaker-highlight` variants: `1` full-bleed photo, `2` navy card, `3` sand card.
`--surface square` gives 1080×1080 instead of her native 1080×1350.

---

## Documents

Guides, briefs and handouts as branded A4 PDFs, written in Markdown. The track
host guide is the first.

```bash
node graphics/build-documents.mjs                   # every document
node graphics/build-documents.mjs track-host-guide  # one
```

Sources live in [`content/documents/`](content/documents/), output in
`graphics/out/documents/` (a PDF, and the HTML to open in Chrome while
editing). The look is [`graphics/templates/document.css`](graphics/templates/document.css):
a navy cover card with the lockup and the field, numbered sections, white paper.

```markdown
---
title: Track host guide.
eyebrow: Cloud Native Denmark 2026 · Crew
lead: One or two sentences under the title.
meta: 19–20 November 2026 · Scandic Copenhagen
updated: 2026-11-13
---

## A section

- [ ] A task, printed with an empty hexagon to tick
- A bullet

> [!TIP] Callout title
> Sand callout. `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` go navy.
```

Tables, nested lists, `[links](#a-heading)` within the PDF and raw HTML
(`<div class="page-break"></div>`) work too. A `TODO` anywhere prints
highlighted, so a draft can't pass for final: `grep -rn TODO content/documents/`
before sending. Write links as their URL — half of these get printed.

A pull request that touches a document gets a comment linking its PDF,
rendered by CI ([`.github/workflows/documents.yml`](.github/workflows/documents.yml)).
The link opens in the browser for anyone with access to this repo.

On main, every document is rebuilt onto the
[`documents` release](https://github.com/cloudnativedenmark/graphics/releases/tag/documents),
so the latest PDF always has the same link:
`https://github.com/cloudnativedenmark/graphics/releases/download/documents/<slug>.pdf`.

---

## Importing into Canva

Canva is for **minor tweaks by hand**; this repo stays the source of truth for
anything print-bound.

```bash
.venv/bin/python graphics/build-canva-import.py   # needs the venv, see below
```

Ten self-contained HTML documents in `graphics/out/canva-import/` — keynotes,
sponsors, countdowns, announcements and blank templates, each in square and 4:5.

Three rules, each learned the hard way:

1. **Import the HTML, never the PDF.** PDF has no layers, so Canva flattens the
   design into one background image. HTML arrives as editable layers.
2. **Set up fonts first**, or Canva substitutes. Space Grotesk is a Google Font —
   search Canva's picker before uploading. Inter must be a **static** instance;
   Canva rejects variable fonts:
   ```bash
   .venv/bin/fonttools varLib.instancer -o Inter-Regular.ttf \
     brand/fonts/Inter-Variable.ttf wght=400 opsz=14
   ```
3. **Check the result.** Import behaviour is the one thing this repo cannot
   verify. Two failures found this way: pages arriving as a stock sky-and-grass
   background (Canva rejecting SVG data URIs — every asset is rasterised now),
   and everything welded to the background (a full-canvas transparent image
   intercepting clicks). If a page looks wrong, say so — it's a bug here, not
   something to fix by hand every time.

The existing Canva brand kit is **KCD Denmark 2024**, from before the rename.
Make a new one for 2026 from [`brand/tokens.json`](brand/tokens.json) and leave
the old one alone.

---

## The decks

Four remarks decks at 1920×1080, one per main-stage block:
`decks/day1-morning`, `day1-afternoon`, `day2-morning`, `day2-afternoon`.
They run on the projectors either side of the LED wall and wear its look.

**[`decks/DESIGN-SYSTEM.md`](decks/DESIGN-SYSTEM.md) is the spec** — grid, type
scale, the layouts, the field, do/don't. Read it before editing a slide.

```bash
node stage/build.mjs           # content → stage/show.data.js
decks/start.sh                 # lists the decks and the command for each
decks/start.sh day1-morning    # serves on :8026, opens that deck and its notes
decks/start.sh day1-morning day1-afternoon  # or name several
```

For each deck, `start.sh` opens two windows: the deck (press `f` on the
projector) and `decks/notes.html?deck=…`, the speaker-notes follower. The notes window shows
the current slide's note, the next slide, the time and a timer (`T` restarts
it), and its arrow keys move the deck, so you can drive from the laptop screen.
Notes are an `<aside class="notes">` inside a slide; talk and rate slides
write their own from the show data when they have none.

Arrows, space or a clicker to move, `p` to print. To export:

```bash
"$CHROME_BIN" --headless --print-to-pdf=day1-morning.pdf \
  --no-pdf-header-footer decks/day1-morning/index.html
```

For Google Slides (comments and suggestions from the team), export editable
PowerPoint files and drag them into Drive:

```bash
python3 decks/export-pptx.py   # → graphics/out/slides/<deck>.pptx; needs LibreOffice
```

Every word stays a text box and the speaker notes and TODOs come along; the
field, photos, logo tiles, QR codes and maps are pictures. The HTML stays
the source of truth for the show, so fold agreed changes back in here.

Talk, organizer and sponsor slides are filled from `stage/show.data.js`, the
same data the wall shows, so run the build after editing `content/`.
Everything still unknown is marked `TODO`, so the pre-flight is:

```bash
grep -rn TODO decks/
```

---

## The stage wall

The LED wall behind the main stage, 3696×1176 as the AV vendor gave it.
[`docs/stage-led-wall.md`](docs/stage-led-wall.md) has the rules and
scenes.

```bash
node stage/serve.mjs    # show server: prints the wall URL and the control URL
node stage/render.mjs   # stills of every cue → graphics/out/stage/
```

The control page runs on any machine on the same network, and the server
prints its URL with the key.

The run of show is `content/2026-stage.json`. Talk titles, names and portraits
come from the announcements file by slug.

---

## Checks

```bash
test/run.sh
```

- **Token lint** — fails on any colour outside `brand/tokens.json`.
- **Pixel regression** — renders her twelve frames empty and compares against her
  overlay PNGs. Catches a tab a few px off or a wrong corner radius. Skipped
  without the venv.
- **Slide overflow** — measures every slide against the stage. Catches text that
  would clip on the projector.

Thresholds are deliberately not zero: her tab carries a Photoshop outer glow that
a drop-shadow approximates, and text rasterises differently in Chrome. What
matters is that the numbers stay put.

---

## Full setup

Only needed to re-extract, run the pixel check, or build the Canva files.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
brew install librsvg poppler
```

`brand/geometry.json` and the logo SVGs are committed, so her source files aren't
needed day to day. To re-extract: put them in `source/` (gitignored, ~590MB), run
`.venv/bin/python brand/extract.py`, then `test/run.sh` — the pixel diff tells you
what moved.

Geometry is **measured from her flattened overlays**; the PSD supplies type specs
and vector artwork. That split is deliberate — PSD paths and radii live in
untransformed layer space and are wrong at face value. Her tab label and year sit
on layers with a 1.3032 scale, so `geometry.json` exposes `size_px` alongside
`size`. **Always read `size_px`.** The reasoning is in
[`docs/superpowers/specs/`](docs/superpowers/specs/).

---

## House rules

- **Never re-typeset the lockup.** Use `brand/logo/`. The wordmark leads, the mark
  sits at its upper right. `DENMARK.` and the year are outlines — a
  ground-coloured fill with a red stroke, which is why they separate for print.
- **`sand` and `bone` are not interchangeable.** Sand is the social ground, bone
  the deck ground. No check catches the wrong choice.
- **Social copy is Space Grotesk Medium, uppercase, tracking 0.02em.** No Bold, no
  Inter. Decks and the bulletin layouts use Bold display at tighter tracking —
  that's her deck's own treatment, not a licence to mix elsewhere.
- **Sponsor logos are contained, never cropped**, on white. Use transparent files.
- **Run `test/run.sh` before saying something is done.**

Known gap: the mark is a red flag with a white cross, so on a red ground it
collapses to a white plus. Red currently uses the wordmark alone, and a knockout
version is a decision for the designer.
