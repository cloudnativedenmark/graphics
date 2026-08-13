#!/usr/bin/env python3
"""Build a PPTX of the CND templates, so Canva imports them as real layers.

    .venv/bin/python graphics/build-canva-pptx.py

Writes graphics/out/canva-import/cnd-templates.pptx — one slide per template,
every element a separate object.

Why PPTX and not PDF
--------------------
PDF has no concept of layers. Chrome writes the ground, the card and the tab as
a continuous run of vector drawing operations, and Canva's importer collapses
that into a single background image — which is exactly what happened: one flat
layer instead of a background, a white box and a red tab.

PPTX stores each element as its own shape, and Canva maps those to native
layers. So the ground is a rectangle you can recolour, the card is a rounded
rectangle you can resize, and each block of copy is its own text box.

What is a shape and what is a picture
-------------------------------------
    ground, card, red rule    native rectangles — recolour and resize freely
    all copy                  native text boxes in Space Grotesk
    the year                  native text with a real outline (see below)
    tab, lockup, flag mark    transparent PNGs, one layer each

The tab is a bezier heptagon and the lockup is fine vector lettering; PPTX
freeform shapes only take straight segments, so redrawing them would degrade
them. They ship as their own picture layers instead — still separately
movable, still deletable, and pixel-exact.

The outline year is native text, not a picture: PPTX supports a text outline
via `a:ln` on the run properties, which python-pptx does not expose, so it is
injected as XML. That keeps the designer's actual mechanism — ground-coloured
fill, red stroke — as editable text rather than baking it into an image.

Units
-----
The canvas is 1080x1350 css px at 96dpi, so 11.25in x 14.0625in. PPTX measures
in EMU (914400 per inch) and type in points (px * 0.75).
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Pt

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "graphics" / "out" / "canva-import"

DPI = 96
EMU_PER_PX = 914400 / DPI
CAP_RATIO = 0.700
A = "http://schemas.openxmlformats.org/drawingml/2006/main"

TEMPLATE_FOR = {
    "speaker-highlights": "speaker-highlight",
    "sponsor-highlights": "sponsor-highlight",
    "schedule-announcements": "schedule-announcement",
    "CFP-notifications": "cfp-notification",
}

# category, variant, tab label, name, role, statement, slide name
SLIDES = [
    ("speaker-highlights", "2", "Speaker highlights", "Name Lastname",
     "Role, organization", "Highlight lorem|ipsum dolores|lorem ipsum",
     "Speaker highlight - navy card"),
    ("speaker-highlights", "3", "Speaker highlights", "Name Lastname",
     "Role, organization", "Highlight lorem|ipsum dolores|lorem ipsum",
     "Speaker highlight - sand card"),
    ("speaker-highlights", "1", "Speaker highlights", "Name Lastname",
     "Role, organization", "Highlight lorem|ipsum dolores|lorem ipsum",
     "Speaker highlight - navy photo"),
    ("sponsor-highlights", "2", "Sponsor highlights", "Sponsor name",
     "Gold sponsor", "What they do,|in three|short lines",
     "Sponsor highlight - navy card"),
    ("schedule-announcements", "3", "Schedule is live", "The full schedule",
     "19-20 Nov / Scandic Copenhagen", "Two days,|four tracks,|one community",
     "Schedule announcement - sand card"),
    ("CFP-notifications", "3", "CFP notifications", "Call for papers",
     "Closes 31 August", "Share what|you learned|the hard way",
     "CFP notification - sand card"),
]


def px(v: float) -> Emu:
    return Emu(int(round(v * EMU_PER_PX)))


def rgb(hex_color: str) -> RGBColor:
    return RGBColor.from_string(hex_color.lstrip("#").upper())


def svg_to_png(svg: str, out: Path, width: int) -> None:
    """Rasterise an SVG string to a transparent PNG."""
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as fh:
        fh.write(svg)
        tmp = Path(fh.name)
    try:
        subprocess.run(
            ["rsvg-convert", "-w", str(width), str(tmp), "-o", str(out)],
            check=True, capture_output=True,
        )
    finally:
        tmp.unlink(missing_ok=True)


def add_rect(slide, x, y, w, h, fill_hex, shape=MSO_SHAPE.RECTANGLE, name=None,
             radius_px=None):
    box = slide.shapes.add_shape(shape, px(x), px(y), px(w), px(h))
    box.fill.solid()
    box.fill.fore_color.rgb = rgb(fill_hex)
    box.line.fill.background()
    box.shadow.inherit = False
    if name:
        box.name = name
    if radius_px is not None:
        # roundRect's adjustment is the radius as a fraction of the shorter side.
        box.adjustments[0] = radius_px / min(w, h)
    return box


def add_text(slide, *, x, baseline, size_px, color_hex, text, name,
             tracking_em=0.02, leading_px=None, bold=False, width_px=900,
             align=PP_ALIGN.LEFT, outline_hex=None):
    """Add a text box whose first baseline lands on `baseline`.

    PowerPoint anchors a text frame by its box, so the box top is derived from
    the baseline the same way the HTML build does it: ascent minus half-leading
    for Space Grotesk, 0.846em at line-height 1.
    """
    lines = [l.strip().upper() for l in text.split("|")]
    line_px = leading_px or size_px
    top = baseline - 0.846 * size_px
    height = line_px * len(lines) + size_px * 0.4

    box = slide.shapes.add_textbox(px(x), px(top), px(width_px), px(height))
    box.name = name
    tf = box.text_frame
    tf.word_wrap = False
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.TOP

    for i, line in enumerate(lines):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = align
        run = para.add_run()
        run.text = line
        font = run.font
        font.name = "Space Grotesk"
        font.size = Pt(size_px * 0.75)
        font.bold = bold
        font.color.rgb = rgb(color_hex)

        rPr = run._r.get_or_add_rPr()
        # Letter spacing, in 1/100 pt.
        rPr.set("spc", str(int(round(tracking_em * size_px * 0.75 * 100))))
        if outline_hex:
            ln = etree.SubElement(rPr, f"{{{A}}}ln")
            ln.set("w", str(int(3 * 0.75 * 12700)))  # 3px stroke
            solid = etree.SubElement(ln, f"{{{A}}}solidFill")
            clr = etree.SubElement(solid, f"{{{A}}}srgbClr")
            clr.set("val", outline_hex.lstrip("#").upper())
            rPr.insert(0, ln)
        # Exact leading, as a fixed point size rather than a multiplier.
        if leading_px:
            pPr = para._p.get_or_add_pPr()
            spc = etree.SubElement(pPr, f"{{{A}}}lnSpc")
            pts = etree.SubElement(spc, f"{{{A}}}spcPts")
            pts.set("val", str(int(round(leading_px * 0.75 * 100))))
            pPr.insert(0, spc)
    return box


def main() -> int:
    geometry = json.loads((ROOT / "brand" / "geometry.json").read_text())
    tokens = json.loads((ROOT / "brand" / "tokens.json").read_text())
    color = tokens["color"]
    canvas_w = geometry["canvas"]["w"]
    canvas_h = geometry["canvas"]["h"]
    OUT.mkdir(parents=True, exist_ok=True)

    art = OUT / "_layers"
    art.mkdir(exist_ok=True)

    # One transparent PNG per tab, drawn from the extracted vector path.
    tab_png: dict[tuple[str, str], Path] = {}
    for category in TEMPLATE_FOR:
        for variant in ("1", "2", "3"):
            spec = geometry["frames"].get(category, {}).get(variant)
            if not spec:
                continue
            out = art / f"tab-{category}-v{variant}.png"
            svg_to_png(
                f'<svg xmlns="http://www.w3.org/2000/svg" '
                f'viewBox="0 0 {canvas_w} {canvas_h}" '
                f'width="{canvas_w}" height="{canvas_h}">'
                f'<path d="{spec["tab"]["path"]}" fill="{color["red"]}"/></svg>',
                out, canvas_w * 2,
            )
            tab_png[(category, variant)] = out

    logo_png = {}
    for name in ("cnd-lockup-cream", "cnd-lockup-navy", "cnd-mark"):
        src = (ROOT / "brand" / "logo" / f"{name}.svg").read_text()
        out = art / f"{name}.png"
        svg_to_png(src, out, 1200)
        logo_png[name] = out

    prs = Presentation()
    prs.slide_width = px(canvas_w)
    prs.slide_height = px(canvas_h)
    blank = prs.slide_layouts[6]

    year_spec = next(v["2"]["year"] for v in geometry["frames"].values() if v.get("2"))

    for category, variant, label, name, role, statement, slide_name in SLIDES:
        overlay = geometry["overlays"][category][variant]
        content = geometry["content"]["1" if variant == "1" else "2"]
        box = overlay["content"]
        ground = overlay["ground"]
        on_light = ground.upper() == color["sand"].upper()
        slide = prs.slides.add_slide(blank)

        add_rect(slide, 0, 0, canvas_w, canvas_h, ground, name="Background")

        if variant == "1":
            add_rect(slide, box["x"], box["y"], box["w"], box["h"],
                     color["slate"], name="Photo area")
            if rule := overlay.get("rule"):
                add_rect(slide, 0, rule["y"], canvas_w, rule["h"],
                         color["red"], name="Red rule")
        else:
            add_rect(slide, box["x"], box["y"], box["w"], box["h"],
                     color["white"], shape=MSO_SHAPE.ROUNDED_RECTANGLE,
                     name="White card", radius_px=box["r"])

        if tab := tab_png.get((category, variant)):
            slide.shapes.add_picture(
                str(tab), 0, 0, px(canvas_w), px(canvas_h)
            ).name = "Red tab"

        tab_spec = geometry["frames"].get(category, {}).get(variant)
        if tab_spec:
            lab = tab_spec["label"]
            run = lab["runs"][0]
            words = label.split()
            add_text(
                slide, x=0, baseline=lab["baseline"], size_px=run["size_px"],
                color_hex=color["white"],
                text=f"{' '.join(words[:-1])}|{words[-1]}" if len(words) > 1 else label,
                name="Tab label", leading_px=lab["leading_derived_px"],
                width_px=canvas_w, align=PP_ALIGN.CENTER,
            )

        keys = list(content)
        for key, text, slot in zip(
            keys[:3], (name, role, statement), ("Speaker name", "Role", "Statement")
        ):
            spec = content[key]
            run = spec["runs"][0]
            add_text(
                slide, x=spec["x"], baseline=spec["baseline"],
                size_px=run["size_px"], color_hex=run["color"], text=text,
                name=slot, tracking_em=run["tracking_em"],
                leading_px=spec["leading_derived_px"],
            )

        lock = overlay["lockup"]
        slide.shapes.add_picture(
            str(logo_png["cnd-lockup-navy" if on_light else "cnd-lockup-cream"]),
            px(lock["x"]), px(lock["y"]), px(lock["w"]), px(lock["h"]),
        ).name = "Wordmark"
        mark = overlay["mark"]
        slide.shapes.add_picture(
            str(logo_png["cnd-mark"]),
            px(mark["x"]), px(mark["y"]), px(mark["w"]), px(mark["h"]),
        ).name = "Flag mark"

        run = year_spec["runs"][0]
        add_text(
            slide, x=year_spec["x"], baseline=year_spec["baseline"],
            size_px=run["size_px"], color_hex=ground,
            text=tokens["event"]["year"], name="Year (outline)",
            tracking_em=run["tracking_em"], outline_hex=color["red"],
            width_px=400,
        )

    target = OUT / "cnd-templates.pptx"
    prs.save(str(target))
    print(f"wrote {target.relative_to(ROOT)}  "
          f"({target.stat().st_size // 1024} KB, {len(SLIDES)} slides)")
    print("\nEvery element is its own layer. Drag into Canva > Uploads.")
    print("Upload Space Grotesk as a Canva brand font first, or it will")
    print("substitute.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
