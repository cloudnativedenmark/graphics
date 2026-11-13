---
name: cnd-graphics
description: Use when creating any Cloud Native Denmark visual — LinkedIn or social graphics, speaker and keynote announcements, sponsor thanks, countdowns, schedule or CFP announcements, page covers, posters, the four remarks decks, or Canva hand-off files. Also use when asked about the CND palette, fonts, logo usage, or why a graphic looks off-brand.
---

# Cloud Native Denmark graphics

Render on-brand graphics and decks from code. The palette, type specs, logo
artwork and frame geometry were extracted from the designer's own PSD and
Illustrator files, so output matches what she drew rather than approximating it.

**Read [`README.md`](../../../README.md) for setup and the full command
reference.** This file is the operating rules.

## Before you start

Making graphics needs only **Node and Chrome**. Extraction, the pixel checks
and the Canva builds additionally need the venv from `requirements.txt` plus
`rsvg-convert` and `pdftocairo`.

If Chrome is not found, set `CHROME_BIN`.

## Pick the right surface

| Asking for | Use |
|---|---|
| Keynote, sponsor, countdown, general announcement for 2026 | edit `content/2026-announcements.json`, run `node graphics/build-announcements.mjs` |
| One of the designer's four categories | `render.mjs speaker-highlight` / `sponsor-highlight` / `schedule-announcement` / `cfp-notification` |
| Announcement in the newer hexagon style | `render.mjs bulletin` |
| Type-only, no card or tab | `render.mjs poster` |
| Sponsor tier honeycomb | `render.mjs sponsors` |
| LinkedIn page cover | `render.mjs linkedin-cover` |
| Slides | edit the deck HTML in `decks/`; talk, team and sponsor slides fill from `stage/show.data.js` (`node stage/build.mjs`) |
| LED wall behind the stage | edit `content/2026-stage.json`, run `node stage/render.mjs`; read `docs/stage-led-wall.md` |
| Something to tweak in Canva | `graphics/build-canva-import.py` |
| Guide, brief, handout or any printable document (PDF) | write `content/documents/<slug>.md`, run `node graphics/build-documents.mjs <slug>` |

**Prefer the content file over one-off commands** when the thing being made is
part of the 2026 set. It keeps the PNGs and the Canva HTML in step, and it means
the next person changes JSON rather than remembering flags.

## Invariants

These are not preferences. Breaking them puts the brand out of step with print.

1. **Palette is `brand/tokens.json`.** Nine colours. Never introduce another —
   the token lint fails on it, and should.
2. **`sand` is the social ground; `navy` is the stage ground.** The decks
   run on the projectors beside the LED wall, so they wear the wall's look:
   navy, the honeycomb field, rose eyebrows, no straight lines. `bone` is
   the brand book's paper deck and is no longer used on stage. No check can
   catch the wrong ground.
3. **Social copy is Space Grotesk Medium, uppercase, tracking 0.02em.** No Bold,
   no Inter. Verified against every text layer in her PSDs. Decks and the
   bulletin layouts use Bold display at tighter tracking — that is her deck's
   own treatment, not a licence to mix elsewhere.
4. **Never re-typeset the lockup.** Use `brand/logo/*.svg`. The wordmark comes
   first with the mark to its **upper right** — not leading it.
5. **`DENMARK.` and the year are outlines**: a ground-coloured fill with a red
   stroke. Not red glyphs. That is how she built them and why they separate for
   print.
6. **Read `size_px`, never `size`,** from `geometry.json`. Her tab label and
   year sit on layers with a 1.3032 scale, so the stored FontSize is not the
   rendered size.
7. **Sponsor logos are contained, never cropped,** always on a white hexagon.
8. **Run `test/run.sh` before claiming anything is done.**

## Writing copy for these layouts

- `|` is a line break, and **you choose where lines break** — on a three-word
  hero statement a human beats greedy wrapping. Display type shrinks to fit, so
  long copy will not break the layout.
- Headlines in the bulletin and poster layouts are **sentence case ending in a
  full stop**, echoing the lockup's `DENMARK.` Her framed social templates are
  uppercase. Keep a series internally consistent.
- For a talk, put the punchy part of the title in the headline and the full
  title, speakers and slot in the body. A whole conference-talk title rarely
  works as display type.

## Verifying

`test/run.sh` runs three checks: token lint, pixel regression against her
twelve overlay PNGs, and deck slide overflow.

**Look at what you rendered.** Every real bug this system has had was found by
opening the image, not by reading the code: a doubled lockup, a headline
colliding with a portrait, a honeycomb merging into a white blob, hexagons
clipped by a hardcoded canvas height. The pixel gate only guards the twelve
frames that have a reference; everything else is judged by eye.

Be careful with ad-hoc pixel checks — counting white pixels per row cannot tell
white text from a white shape on a dark ground. If a check would pass on a
broken render, it is not a check.

## Documents

Printable documents are Markdown with front matter (`title`, `eyebrow`, `lead`,
`meta`, `updated`) in `content/documents/`; README has the syntax. The
template owns the look, so write content, not HTML or CSS.

- **Keep the author's words.** Restructure into sections, lists, tables and
  callouts; fix typos; don't rewrite the voice.
- **Write links as their URL** (`[cloudnativedenmark.dk/schedule](https://…)`),
  because people print these. Link to headings with `#slug`, GitHub-style.
- **Mark what you don't know `TODO`** rather than guessing a link, name or
  number. It prints highlighted. `grep -rn TODO content/documents/` before
  anyone sends one.
- Bump `updated` when the content changes; it goes in every page's footer.
- **Look at the PDF** (`pdftocairo -png -r 80`) before calling it done: page
  breaks and table widths are judged by eye.

## Canva

Canva is for minor tweaks. This repo is the source of truth for anything final
or print-bound, because Canva cannot set font family through its API and has no
way to create a text element.

- **Import the HTML, never the PDF.** PDF has no layers; Canva flattens it into
  one background image. HTML arrives as editable layers.
- **No SVG data URIs.** Canva drops the entire enclosing `<svg>` when it meets
  one, taking artwork with it. `build-canva-import.py` rasterises every asset —
  keep it that way.
- **Crop picture layers to their ink.** A full-canvas transparent image sits on
  top and intercepts every click, making everything beneath unselectable.
- Import behaviour cannot be verified from here. A local render proving correct
  does **not** prove Canva accepts it — say so rather than implying otherwise.

## When the designer ships new files

Put them in `source/`, run `.venv/bin/python brand/extract.py`, then
`test/run.sh`. The pixel diff tells you what moved.

Geometry is **measured from her flattened overlay PNGs**; the PSD supplies type
specs and vector artwork. This split is deliberate — PSD vector paths and radii
sit in untransformed layer space and are wrong at face value. `extract.py`
explains each case at the point it handles it.
