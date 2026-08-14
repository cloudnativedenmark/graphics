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

Four remarks decks at 1920×1080: `decks/day1-opening`, `day1-closing`,
`day2-opening`, `day2-closing`.

**[`decks/DESIGN-SYSTEM.md`](decks/DESIGN-SYSTEM.md) is the spec** — grid, type
scale, the eleven layouts, chrome, components, do/don't. Read it before editing a
slide.

Open `index.html` in Chrome and press `f`. Arrows or space to move, `p` to print.

```bash
"$CHROME_BIN" --headless --print-to-pdf=day1-opening.pdf \
  --no-pdf-header-footer decks/day1-opening/index.html
```

Speaker and sponsor slides are generated from the same content file as the
graphics. Everything still unknown is marked `TODO`, so the pre-flight is:

```bash
grep -rn TODO decks/
```

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
