#!/usr/bin/env python3
"""Convert the break decks (decks/breaks/*.pdf) to editable PowerPoint.

    python3 decks/breaks-to-pptx.py                     all of them
    python3 decks/breaks-to-pptx.py day1-main-1025      just one (or several)
    python3 decks/breaks-to-pptx.py --src DIR --out DIR other PDFs (the room signs)

Writes graphics/out/slides/breaks/<name>.pptx, for Google Slides.

The break decks only exist as PDFs, so this reads the PDF rather than HTML:
every slide becomes a background picture (the page with its text taken
out: the field, photos, logos and QR codes) with the text laid back on top
as real text boxes in Space Grotesk and Inter, same size, colour and place.
So titles, times and names can be edited in Slides; pictures cannot.

Needs pdfplumber, pikepdf, python-pptx and Pillow, plus pdftocairo.
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

import pdfplumber
import pikepdf
from PIL import ImageFont
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml import parse_xml
from pptx.util import Emu, Pt

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "decks" / "breaks"
OUT = ROOT / "graphics" / "out" / "slides" / "breaks"
PAGE_W, PAGE_H = 1440.0, 810.0  # PDF points; the slide is 1920x1080 CSS px
SLIDE_W, SLIDE_H = 12192000, 6858000  # EMU, 13.333in x 7.5in
K = SLIDE_W / PAGE_W  # EMU per PDF point

# Ascent and descent of each family, as a fraction of the font size.
# How a text box lays out lines (measured on LibreOffice renders; it is the
# PowerPoint model too): single spacing is 1.2 x the font size for any
# font, a proportional spacing scales that, and the change in height comes
# off or goes on above the first line. At single spacing the first
# baseline sits 0.99 x the size below the box's top edge.
LINE = 1.2
FIRST_BASELINE = 0.99


def tokens():
    css = (ROOT / "brand" / "tokens.css").read_text()
    out = {}
    for name, hx in re.findall(r"--cnd-([a-z-]+):\s*#([0-9A-Fa-f]{6})", css):
        out[name] = tuple(int(hx[i : i + 2], 16) for i in (0, 2, 4))
    return out


TOK = tokens()
NAVY, SAND = TOK["navy"], TOK["sand"]
# Body copy is sand at 80% over navy; the PDF carries the 80% as an alpha
# that pdfplumber does not report, so sand text is drawn as that mix.
MUTED = tuple(round(SAND[i] * 0.8 + NAVY[i] * 0.2) for i in range(3))


def colour(c):
    if not c:
        return TOK["white"]
    if len(c) == 1:
        c = (c[0], c[0], c[0])
    rgb = tuple(round(v * 255) for v in c[:3])
    name = min(TOK, key=lambda n: sum((a - b) ** 2 for a, b in zip(TOK[n], rgb)))
    return MUTED if name == "sand" else TOK[name]


FONTS = ROOT / "brand" / "fonts"
_fonts = {}


def font_for(fontname, size):
    """The brand font file behind a PDF font name, for measuring."""
    f = fontname.split("+")[-1]
    if "SpaceGrotesk" in f:
        w = next((w for w in ("Bold", "SemiBold", "Medium", "Light") if w in f), "Regular")
        path, var = FONTS / f"SpaceGrotesk-{w}.ttf", None
    else:
        path = FONTS / "Inter-Variable.ttf"
        var = next((w for w in ("SemiBold", "Bold", "Medium") if w in f), "Regular")
    key = (path, var, round(size * 4))
    if key not in _fonts:
        ft = ImageFont.truetype(str(path), 400)
        if var:
            ft.set_variation_by_name(var)
        _fonts[key] = ft
    ft = _fonts[key]

    class Scaled:
        def getlength(self, t):
            return ft.getlength(t) * size / 400

    return Scaled()


def family(fontname):
    f = fontname.split("+")[-1]
    if "SpaceGrotesk" in f:
        return "Space Grotesk", ("Bold" in f), f
    return "Inter", ("Bold" in f or "SemiBold" in f), f


# ── background: the page with its text removed ────────────────────────────
TEXT_OPS = {"Tj", "TJ", "'", '"'}


def strip_text(pdf_in, pdf_out):
    pdf = pikepdf.open(pdf_in)
    seen = set()

    def clean(obj):
        if obj.objgen in seen and obj.objgen != (0, 0):
            return
        seen.add(obj.objgen)
        ops = [(o, op) for o, op in pikepdf.parse_content_stream(obj) if str(op) not in TEXT_OPS]
        obj.write(pikepdf.unparse_content_stream(ops))
        res = obj.get("/Resources") or {}
        for _, xo in (res.get("/XObject") or {}).items():
            if xo.get("/Subtype") == "/Form":
                clean(xo)

    for page in pdf.pages:
        page.contents_coalesce()
        ops = [(o, op) for o, op in pikepdf.parse_content_stream(page) if str(op) not in TEXT_OPS]
        page.Contents.write(pikepdf.unparse_content_stream(ops))
        for _, xo in (page.Resources.get("/XObject") or {}).items():
            if xo.get("/Subtype") == "/Form":
                clean(xo)
    pdf.save(pdf_out)


# ── text: words → lines → blocks ──────────────────────────────────────────
def style_key(w):
    return (w["fontname"].split("+")[-1], round(w["size"], 1), colour(w["non_stroking_color"]))


def lines_of(words):
    """Words on one baseline in one style, close enough to be one run."""
    words = sorted(words, key=lambda w: (round(w["bottom"]), w["x0"]))
    lines = []
    for w in words:
        for ln in lines:
            last = ln["words"][-1]
            if (
                style_key(w) == ln["key"]
                and abs(w["bottom"] - last["bottom"]) < w["size"] * 0.25
                and 0 <= w["x0"] - last["x1"] < w["size"] * 0.9
            ):
                ln["words"].append(w)
                break
        else:
            lines.append({"key": style_key(w), "words": [w]})
    for ln in lines:
        ws = ln["words"]
        ln.update(
            text=" ".join(w["text"] for w in ws),
            x0=min(w["x0"] for w in ws),
            x1=max(w["x1"] for w in ws),
            top=min(w["top"] for w in ws),
            bottom=max(w["bottom"] for w in ws),
            size=ws[0]["size"],
            baseline=ws[0].get("baseline", ws[0]["top"] + ws[0]["size"]),
            fontname=ws[0]["fontname"],
            color=ln["key"][2],
        )
    return lines


def blocks_of(lines):
    """Stack lines of one style that share a left edge or a centre."""
    lines = sorted(lines, key=lambda l: (l["top"], l["x0"]))
    blocks = []
    for ln in lines:
        for b in blocks:
            last = b["lines"][-1]
            pitch = ln["top"] - last["top"]
            if ln["key"] != b["key"] or not (0 < pitch < ln["size"] * 1.7):
                continue
            left = abs(ln["x0"] - last["x0"]) < 3
            centre = abs((ln["x0"] + ln["x1"]) / 2 - (last["x0"] + last["x1"]) / 2) < 3
            if left or centre:
                b["lines"].append(ln)
                b["align"] = "l" if left and b.get("align") != "c" else "c"
                break
        else:
            blocks.append({"key": ln["key"], "lines": [ln], "align": None})
    return blocks


def add_text(slide, b):
    ls = b["lines"]
    face, bold, _ = family(ls[0]["fontname"])
    size = ls[0]["size"]
    pitch = (ls[-1]["baseline"] - ls[0]["baseline"]) / (len(ls) - 1) if len(ls) > 1 else size * LINE
    x0, x1 = min(l["x0"] for l in ls), max(l["x1"] for l in ls)
    align = b["align"] or "l"
    # Letter spacing: what the PDF's line measures against the font's own
    # advance widths (eyebrows are tracked open, display type tight).
    track = 0.0
    longest = max(ls, key=lambda l: len(l["text"]))
    if len(longest["text"]) > 3:
        natural_w = font_for(ls[0]["fontname"], size).getlength(longest["text"])
        track = (longest["x1"] - longest["x0"] - natural_w) / (len(longest["text"]) - 1)
        if abs(track) < size * 0.005:
            track = 0.0
    # Room to edit, and for Slides' metrics differing a hair from Chrome's.
    slack = max(16, (x1 - x0) * 0.12)
    if align == "c":
        x0, x1 = x0 - slack / 2, x1 + slack / 2
    else:
        x1 += slack
    spacing = pitch / (size * LINE)
    top = ls[0]["baseline"] - (FIRST_BASELINE - (1 - spacing) * LINE) * size
    height = pitch * len(ls) + size * 0.3
    tb = slide.shapes.add_textbox(Emu(int(x0 * K)), Emu(int(top * K)), Emu(int((x1 - x0) * K)), Emu(int(height * K)))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.TOP
    tf.auto_size = None
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER if align == "c" else PP_ALIGN.LEFT
    p.line_spacing = spacing
    for i, ln in enumerate(ls):
        if i:
            p.add_line_break()
        r = p.add_run()
        r.text = ln["text"]
        r.font.name = face
        r.font.size = Pt(round(size * K / 12700 * 2) / 2)
        r.font.bold = bold
        r.font.color.rgb = RGBColor(*ln["color"])
        if track:
            r._r.get_or_add_rPr().set("spc", str(int(round(track * K / 12700 * 100))))
    tb.name = ls[0]["text"][:40]
    return tb


def set_background(slide, png):
    _, rId = slide.part.get_or_add_image_part(str(png))
    bg = parse_xml(
        '<p:bg xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="{rId}"/><a:srcRect/>'
        "<a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>"
    )
    slide._element.cSld.insert(0, bg)


def convert(name, tmp):
    src = SRC / f"{name}.pdf"
    bare = tmp / f"{name}-bare.pdf"
    strip_text(src, bare)
    subprocess.run(["pdftocairo", "-png", "-scale-to-x", "1920", "-scale-to-y", "1080", str(bare), str(tmp / name)], check=True)
    pngs = sorted(tmp.glob(f"{name}-*.png"), key=lambda p: int(p.stem.rsplit("-", 1)[1]))
    prs = Presentation()
    prs.slide_width, prs.slide_height = SLIDE_W, SLIDE_H
    with pdfplumber.open(src) as pdf:
        for page, png in zip(pdf.pages, pngs):
            slide = prs.slides.add_slide(prs.slide_layouts[6])
            set_background(slide, png)
            words = page.extract_words(extra_attrs=["fontname", "size", "non_stroking_color"])
            # Baselines from the text matrix: the fonts' descriptors are
            # incomplete, so top and bottom alone put Inter a descent off.
            base = {(round(c["x0"], 1), round(c["top"], 1)): page.height - c["matrix"][5] for c in page.chars}
            for w in words:
                b_ = base.get((round(w["x0"], 1), round(w["top"], 1)))
                if b_ is not None:
                    w["baseline"] = b_
            for b in blocks_of(lines_of(words)):
                add_text(slide, b)
            slide.notes_slide.notes_text_frame.text = f"Converted from {(SRC / name).relative_to(ROOT)}.pdf."
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{name}.pptx"
    prs.save(out)
    return out, len(pngs)


def main():
    global SRC, OUT
    args = sys.argv[1:]
    for flag in ("--src", "--out"):
        if flag in args:
            i = args.index(flag)
            path = Path(args[i + 1]).resolve()
            if flag == "--src":
                SRC = path
            else:
                OUT = path
            del args[i : i + 2]
    names = args or sorted(p.stem for p in SRC.glob("*.pdf"))
    with tempfile.TemporaryDirectory() as tmp:
        for n in names:
            out, k = convert(n, Path(tmp))
            print(f"{n:22s} {k:3d} slides  {out.relative_to(ROOT)}")


if __name__ == "__main__":
    import logging

    logging.getLogger("pdfminer").setLevel(logging.ERROR)
    main()
