#!/usr/bin/env python3
"""Export the four remarks decks to editable PowerPoint, for Google Slides.

    python3 decks/export-pptx.py                 all four decks
    python3 decks/export-pptx.py day1-morning    just one (or several)

Writes graphics/out/slides/<deck>.pptx. Drag a file into Google Drive and
open it with Google Slides to get an editable, shareable copy.

The HTML decks stay the source of truth for the show (they share data,
logos and look with the LED wall). This is a collaboration copy: every word
is a real text box in Space Grotesk / Inter, so people can comment and
suggest edits in Slides, and the speaker notes come along. What is a picture
rather than a shape: the honeycomb field (the slide background), photos and
portraits already cut to the hexagon, logos on their white tiles, the QR
codes, the maps and the outline numerals.

Needs python-pptx, Pillow and beautifulsoup4, plus LibreOffice and
pdftocairo to rasterise the SVG logos. No Chrome: layouts are rebuilt from
the same numbers cnd-deck.css and deck.js use, so if you change a layout
there, change it here too.
"""

import hashlib
import json
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from bs4 import BeautifulSoup, NavigableString
from PIL import Image, ImageChops, ImageDraw, ImageFont
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml import parse_xml
from pptx.util import Emu, Pt

ROOT = Path(__file__).resolve().parent.parent
DECKS = ["day1-morning", "day1-afternoon", "day2-morning", "day2-afternoon"]
OUT = ROOT / "graphics" / "out" / "slides"
CACHE = Path(tempfile.gettempdir()) / "cnd-pptx-cache"
W, H = 1920, 1080
EMU = 6350  # one CSS px on a 13.333in-wide slide
SS = 2  # raster scale for pictures

# ── palette (brand/tokens.css, generated from brand/tokens.json) ──────────
def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def tok(name):
    css = (ROOT / "brand" / "tokens.css").read_text()
    m = re.search(rf"--cnd-{name}:\s*(#[0-9A-Fa-f]{{6}})", css)
    return hexrgb(m.group(1))


NAVY, RED, SAND, WHITE = tok("navy"), tok("red"), tok("sand"), tok("white")
ROSE, PEACH, SLATE, INK = tok("rose"), tok("peach"), tok("slate"), tok("ink-muted")


def mix(a, pct, ground=NAVY):
    """color-mix(in srgb, a pct%, transparent) over the navy ground."""
    return tuple(round(a[i] * pct + ground[i] * (1 - pct)) for i in range(3))


MUTED = mix(SAND, 0.8)

# ── fonts ─────────────────────────────────────────────────────────────────
FONTS = ROOT / "brand" / "fonts"
SG_B, SG_M = FONTS / "SpaceGrotesk-Bold.ttf", FONTS / "SpaceGrotesk-Medium.ttf"
INTER = FONTS / "Inter-Variable.ttf"
NATURAL = {"Space Grotesk": (984 + 292) / 1000, "Inter": (969 + 242) / 1000}
_fcache = {}


def font(path, size, weight=None):
    key = (str(path), round(size, 2), weight)
    if key not in _fcache:
        f = ImageFont.truetype(str(path), max(1, int(round(size))))
        if weight:
            try:
                f.set_variation_by_name(weight)
            except Exception:
                pass
        _fcache[key] = f
    return _fcache[key]


# A text style: CSS values in px, as cnd-deck.css has them.
def style(face="Space Grotesk", size=40, bold=False, color=WHITE, upper=False, track=0.0, lh=None, file=None, semibold=False):
    if file is None:
        file = SG_B if (face == "Space Grotesk" and bold) else SG_M if face == "Space Grotesk" else INTER
    return dict(face=face, size=size, bold=bold, color=color, upper=upper, track=track, lh=lh, file=file, semibold=semibold)


def S(base, **kw):
    d = dict(base)
    d.update(kw)
    return d


EYEBROW = style(size=34, color=ROSE, upper=True, track=0.08)
DISPLAY = style(size=168, bold=True, upper=True, track=-0.015, lh=0.948)
HEADING = style(size=101, bold=True, upper=True, track=-0.01, lh=1.0)
LEAD = style("Inter", 58, lh=1.216)
BODY = style("Inter", 40, color=MUTED, lh=1.346)
CREDIT = style(size=24, color=MUTED, upper=True, track=0.08)
COLHEAD = style(size=52, bold=True, upper=True, lh=1.05)
DT = style(size=30, color=ROSE, upper=True, track=0.08)
DD = style(size=44, bold=True)
NAME = style(size=44, bold=True, upper=True, lh=1.04)
ROLE = style("Inter", 30, color=MUTED, lh=1.3)
TIER = style(size=30, color=MUTED, upper=True, track=0.08)


def lh_px(st):
    return (st["lh"] or NATURAL[st["face"]]) * st["size"]


def measure(text, st):
    f = font(st["file"], st["size"], "Regular" if st["face"] == "Inter" else None)
    t = text.upper() if st["upper"] else text
    return f.getlength(t) + st["track"] * st["size"] * max(0, len(t) - 1)


def wrap(text, st, width):
    """Greedy line breaks, as a browser does. Explicit newlines are kept."""
    lines = []
    for chunk in text.split("\n"):
        words = chunk.split(" ")
        cur = ""
        for w_ in words:
            trial = (cur + " " + w_).strip()
            if cur and measure(trial, st) > width:
                lines.append(cur)
                cur = w_
            else:
                cur = trial
        lines.append(cur)
    return lines


def text_h(text, st, width):
    return len(wrap(text, st, width)) * lh_px(st)


# ── SVG paths → polygons ──────────────────────────────────────────────────
HEX_D = (
    "M 974.382812 895.261719 C 991.835938 885.179688 1005.988281 860.671875 1005.988281 840.515625 L 1005.988281 333.214844 "
    "C 1005.988281 313.058594 991.835938 288.550781 974.382812 278.46875 L 535.046875 24.820312 C 517.59375 14.742188 489.289062 "
    "14.742188 471.835938 24.820312 L 32.5 278.46875 C 15.042969 288.550781 0.894531 313.058594 0.894531 333.214844 L 0.894531 "
    "840.515625 C 0.894531 860.671875 15.042969 885.179688 32.5 895.261719 L 471.835938 1148.910156 C 489.289062 1158.988281 "
    "517.59375 1158.988281 535.046875 1148.910156 Z"
)
HEX_VB = (0.894, 17.3, 1005.1, 1139.1)
HEX_RATIO = HEX_VB[2] / HEX_VB[3]
SHAPE_D = (
    "M225.407 135.107L206.4 52.547a14.838 14.838 0 0 0-7.958-9.9l-76.935-36.73a14.825 14.825 0 0 0-12.771 0L31.808 42.669"
    "a14.838 14.838 0 0 0-7.961 9.895L4.873 135.129a14.668 14.668 0 0 0 1.995 11.185c.261.4.538.788.838 1.162l53.246 66.205"
    "a14.98 14.98 0 0 0 11.499 5.487l85.387-.02a14.986 14.986 0 0 0 11.5-5.48l53.227-66.211a14.72 14.72 0 0 0 2.842-12.347z"
)
SHAPE_VB = (4.49, 4.49, 221.15, 214.59)
SHAPE_RATIO = 221.15 / 214.59

_num = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


def _tokens_of(d):
    for m in re.finditer(r"[MmLlHhVvCcSsQqTtAaZz]|" + _num.pattern, d):
        yield m.group(0)


def _arc(x1, y1, rx, ry, phi, fa, fs, x2, y2, n=10):
    if rx == 0 or ry == 0:
        return [(x2, y2)]
    phi = math.radians(phi)
    c, s = math.cos(phi), math.sin(phi)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p, y1p = c * dx + s * dy, -s * dx + c * dy
    rx, ry = abs(rx), abs(ry)
    lam = x1p**2 / rx**2 + y1p**2 / ry**2
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx**2 * ry**2 - rx**2 * y1p**2 - ry**2 * x1p**2
    den = rx**2 * y1p**2 + ry**2 * x1p**2
    coef = math.sqrt(max(0, num / den)) if den else 0
    if fa == fs:
        coef = -coef
    cxp, cyp = coef * rx * y1p / ry, -coef * ry * x1p / rx
    cx, cy = c * cxp - s * cyp + (x1 + x2) / 2, s * cxp + c * cyp + (y1 + y2) / 2

    def ang(ux, uy, vx, vy):
        a = math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        return a

    t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not fs and dt > 0:
        dt -= 2 * math.pi
    elif fs and dt < 0:
        dt += 2 * math.pi
    pts = []
    for i in range(1, n + 1):
        t = t1 + dt * i / n
        pts.append((cx + rx * math.cos(t) * c - ry * math.sin(t) * s, cy + rx * math.cos(t) * s + ry * math.sin(t) * c))
    return pts


class Subpaths(list):
    """Polygons, with .closed saying which subpaths ended in Z."""

    closed: list


def path_polys(d, steps=12):
    """Flatten an SVG path into a list of polygons (see Subpaths)."""
    toks = list(_tokens_of(d))
    i, polys, cur = 0, Subpaths(), []
    polys.closed = []
    x = y = sx = sy = 0.0
    cmd = None
    last_c = None

    def num():
        nonlocal i
        v = float(toks[i])
        i += 1
        return v

    while i < len(toks):
        t = toks[i]
        if re.fullmatch(r"[A-Za-z]", t):
            cmd = t
            i += 1
            if cmd in "Zz":
                if cur:
                    polys.append(cur)
                    polys.closed.append(True)
                cur = []
                x, y = sx, sy
                last_c = None
                continue
        rel = cmd.islower()
        C = cmd.upper()
        if C == "M":
            nx, ny = num(), num()
            if rel:
                nx, ny = x + nx, y + ny
            if cur:
                polys.append(cur)
                polys.closed.append(False)
            cur = [(nx, ny)]
            x, y, sx, sy = nx, ny, nx, ny
            cmd = "l" if rel else "L"
            last_c = None
        elif C == "L":
            nx, ny = num(), num()
            if rel:
                nx, ny = x + nx, y + ny
            cur.append((nx, ny))
            x, y = nx, ny
            last_c = None
        elif C == "H":
            nx = num()
            x = x + nx if rel else nx
            cur.append((x, y))
            last_c = None
        elif C == "V":
            ny = num()
            y = y + ny if rel else ny
            cur.append((x, y))
            last_c = None
        elif C in "CS":
            if C == "C":
                x1, y1 = num(), num()
                if rel:
                    x1, y1 = x + x1, y + y1
            else:
                x1, y1 = (2 * x - last_c[0], 2 * y - last_c[1]) if last_c else (x, y)
            x2, y2, nx, ny = num(), num(), num(), num()
            if rel:
                x2, y2, nx, ny = x + x2, y + y2, x + nx, y + ny
            for k in range(1, steps + 1):
                t_ = k / steps
                mt = 1 - t_
                cur.append(
                    (
                        mt**3 * x + 3 * mt**2 * t_ * x1 + 3 * mt * t_**2 * x2 + t_**3 * nx,
                        mt**3 * y + 3 * mt**2 * t_ * y1 + 3 * mt * t_**2 * y2 + t_**3 * ny,
                    )
                )
            last_c = (x2, y2)
            x, y = nx, ny
        elif C == "Q":
            x1, y1, nx, ny = num(), num(), num(), num()
            if rel:
                x1, y1, nx, ny = x + x1, y + y1, x + nx, y + ny
            for k in range(1, steps + 1):
                t_ = k / steps
                mt = 1 - t_
                cur.append((mt**2 * x + 2 * mt * t_ * x1 + t_**2 * nx, mt**2 * y + 2 * mt * t_ * y1 + t_**2 * ny))
            x, y = nx, ny
            last_c = None
        elif C == "A":
            rx, ry, phi, fa, fs, nx, ny = num(), num(), num(), num(), num(), num(), num()
            if rel:
                nx, ny = x + nx, y + ny
            cur.extend(_arc(x, y, rx, ry, phi, int(fa), int(fs), nx, ny))
            x, y = nx, ny
            last_c = None
        else:
            i += 1
    if cur:
        polys.append(cur)
        polys.closed.append(False)
    return polys


def draw_svg_icon(svg_el, size, fill=None, stroke=None, stroke_w=0, evenodd=False):
    """A small inline SVG (paths, circles, polygons) as a transparent PNG.

    Enough SVG for the deck's own icons: fill, or stroke with round caps,
    and even-odd fill for logos cut out of a shape."""
    vb = [float(v) for v in re.split(r"[ ,]+", (svg_el.get("viewbox") or svg_el.get("viewBox")).strip())]
    k = 4
    W_, H_ = int(size[0] * SS * k), int(size[1] * SS * k)
    s = min(W_ / vb[2], H_ / vb[3])
    ox, oy = (W_ - vb[2] * s) / 2, (H_ - vb[3] * s) / 2

    def tr(p):
        return (ox + (p[0] - vb[0]) * s, oy + (p[1] - vb[1]) * s)

    shapes = []
    for el in svg_el.find_all(["path", "circle", "polygon"]):
        if el.name == "circle":
            cx, cy, r = float(el["cx"]), float(el["cy"]), float(el["r"])
            pts = [(cx + r * math.cos(a / 48 * 2 * math.pi), cy + r * math.sin(a / 48 * 2 * math.pi)) for a in range(48)]
            shapes.append(([pts], [True]))
        elif el.name == "polygon":
            nums = [float(v) for v in re.split(r"[ ,]+", el["points"].strip())]
            shapes.append(([list(zip(nums[::2], nums[1::2]))], [True]))
        else:
            sp = path_polys(el["d"])
            shapes.append((list(sp), sp.closed))
    im = Image.new("RGBA", (W_, H_), (0, 0, 0, 0))
    if fill is not None:
        m = Image.new("L", (W_, H_), 0)
        for polys, _ in shapes:
            for poly in polys:
                if len(poly) < 3:
                    continue
                layer = Image.new("L", (W_, H_), 0)
                ImageDraw.Draw(layer).polygon([tr(p) for p in poly], fill=255)
                m = ImageChops.logical_xor(m.convert("1"), layer.convert("1")).convert("L") if evenodd else ImageChops.lighter(m, layer)
        im.paste(Image.new("RGBA", (W_, H_), fill + (255,)), (0, 0), m)
    if stroke is not None:
        dr = ImageDraw.Draw(im)
        lw = max(1, round(stroke_w * s))
        for polys, closed in shapes:
            for poly, c in zip(polys, closed):
                pts = [tr(p) for p in poly] + ([tr(poly[0])] if c else [])
                dr.line(pts, fill=stroke + (255,), width=lw, joint="curve")
                for p in (pts[0], pts[-1]):
                    dr.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=stroke + (255,))
    return im.resize((int(size[0] * SS), int(size[1] * SS)), Image.LANCZOS)


HEX_POLY = path_polys(HEX_D)[0]
SHAPE_POLY = path_polys(SHAPE_D)[0]


def fit_poly(poly, vb, x, y, w, h):
    vx, vy, vw, vh = vb
    return [(x + (px_ - vx) / vw * w, y + (py_ - vy) / vh * h) for px_, py_ in poly]


def mask(kind, w, h, scale=SS):
    """An antialiased alpha mask of the hexagon or the brand silhouette."""
    poly, vb = (HEX_POLY, HEX_VB) if kind == "hex" else (SHAPE_POLY, SHAPE_VB)
    k = 4
    W_, H_ = int(round(w * scale)), int(round(h * scale))
    m = Image.new("L", (W_ * k, H_ * k), 0)
    ImageDraw.Draw(m).polygon(fit_poly(poly, vb, 0, 0, W_ * k, H_ * k), fill=255)
    return m.resize((W_, H_), Image.LANCZOS)


# ── assets ────────────────────────────────────────────────────────────────
CACHE.mkdir(parents=True, exist_ok=True)
_svg_png = {}


def _on_black(svg):
    """The same SVG with a black ground behind it, for matting."""
    m = re.search(r"<svg\b[^>]*>", svg)
    tag = m.group(0)
    vb = re.search(r'viewBox\s*=\s*["\']([^"\']+)["\']', tag, re.I)
    wm = re.search(r'\swidth\s*=\s*["\']([\d.]+)', tag)
    hm = re.search(r'\sheight\s*=\s*["\']([\d.]+)', tag)
    if vb:
        x, y, w, h = [float(v) for v in re.split(r"[ ,]+", vb.group(1).strip())]
    elif wm and hm:
        x, y, w, h = 0, 0, float(wm.group(1)), float(hm.group(1))
    else:
        # No size to match; these only ever sit on white tiles, so the
        # white render is the right one.
        return svg
    # Past the page on every side, so no antialiased edge survives as a line.
    rect = f'<rect x="{x - w * 0.1}" y="{y - h * 0.1}" width="{w * 1.2}" height="{h * 1.2}" fill="black"/>'
    return svg[: m.end()] + rect + svg[m.end() :]


def rasterise_svgs(paths):
    """SVG → PDF (LibreOffice) → PNG (pdftocairo), cached.

    LibreOffice paints a white page behind every SVG, so each one is
    rendered twice, on white and on black, and the alpha recovered from the
    difference. That keeps white type (the Nordics wordmark) and the white
    cross in the mark, which a colour key would eat."""
    todo = []
    for p in paths:
        key = hashlib.sha1(b"matte-v3" + Path(p).read_bytes()).hexdigest()[:12]
        out = CACHE / f"{Path(p).stem}-{key}.png"
        _svg_png[str(p)] = out
        if not out.exists():
            todo.append((p, out))
    if not todo:
        return
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        files = []
        for p, out in todo:
            src = Path(p).read_text()
            (tmp / f"{out.stem}.svg").write_text(src)
            (tmp / f"{out.stem}__k.svg").write_text(_on_black(src))
            files += [tmp / f"{out.stem}.svg", tmp / f"{out.stem}__k.svg"]
        subprocess.run(
            ["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(tmp / "pdf")] + [str(f) for f in files],
            check=True,
            capture_output=True,
            timeout=900,
        )
        for _, out in todo:
            ims = []
            for suffix in ("", "__k"):
                pdf = tmp / "pdf" / f"{out.stem}{suffix}.pdf"
                png = tmp / f"{out.stem}{suffix}"
                subprocess.run(["pdftocairo", "-png", "-singlefile", "-scale-to", "1600", str(pdf), str(png)], check=True)
                ims.append(Image.open(f"{png}.png").convert("RGB"))
            on_w, on_k = ims
            if on_k.size != on_w.size:
                on_k = on_k.resize(on_w.size)
            wa = np.asarray(on_w, dtype=np.float32)
            ka = np.asarray(on_k, dtype=np.float32)
            a = np.clip(255 - (wa - ka).mean(axis=2), 0, 255)
            safe = np.where(a > 0, a, 1)[..., None]
            rgb_ = np.clip(ka * 255 / safe, 0, 255)
            # The page edge rasterises as a solid one-pixel line in the
            # black render; drop any edge row or column that is solid.
            for _ in range(4):
                if (a[:, -1] > 20).mean() > 0.9:
                    a, rgb_ = a[:, :-1], rgb_[:, :-1]
                if (a[:, 0] > 20).mean() > 0.9:
                    a, rgb_ = a[:, 1:], rgb_[:, 1:]
                if (a[-1, :] > 20).mean() > 0.9:
                    a, rgb_ = a[:-1], rgb_[:-1]
                if (a[0, :] > 20).mean() > 0.9:
                    a, rgb_ = a[1:], rgb_[1:]
            im = Image.fromarray(np.dstack([rgb_, a]).astype(np.uint8), "RGBA")
            bb = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
            if bb:
                im = im.crop(bb)
            im.save(out)


def load(p):
    p = Path(p)
    if p.suffix.lower() == ".svg":
        return Image.open(_svg_png[str(p)]).convert("RGBA")
    return Image.open(p).convert("RGBA")


def cover(im, w, h, pos=(0.5, 0.5), inset=None):
    """object-fit: cover, with an optional object-view-box inset (t r b l, %)."""
    if inset:
        t, r, b, l_ = inset
        iw, ih = im.size
        im = im.crop((iw * l_ / 100, ih * t / 100, iw * (1 - r / 100), ih * (1 - b / 100)))
    iw, ih = im.size
    k = max(w / iw, h / ih)
    nw, nh = max(1, round(iw * k)), max(1, round(ih * k))
    im = im.resize((nw, nh), Image.LANCZOS)
    ox, oy = (nw - w) * pos[0], (nh - h) * pos[1]
    return im.crop((round(ox), round(oy), round(ox) + w, round(oy) + h))


def contain_box(iw, ih, x, y, w, h):
    k = min(w / iw, h / ih)
    nw, nh = iw * k, ih * k
    return x + (w - nw) / 2, y + (h - nh) / 2, nw, nh


_n = 0


def save(im, tag="img"):
    global _n
    _n += 1
    p = CACHE / f"{tag}-{_n}.png"
    im.save(p, optimize=True)
    return p


def clipped(src, kind, w, h, pos=(0.5, 0.5), inset=None, ground=None):
    w2, h2 = int(round(w * SS)), int(round(h * SS))
    if src is None:
        im = Image.new("RGBA", (w2, h2), ground + (255,))
    else:
        im = cover(load(src), w2, h2, pos, inset)
    m = mask(kind, w, h)
    out = Image.new("RGBA", m.size, (0, 0, 0, 0))
    out.paste(im.resize(m.size), (0, 0), m)
    return out


def logo_tile(logo, w, h, inset, ground=WHITE, kind="hex"):
    """A logo contained on a white hexagon: inset = (top, left) fractions."""
    m = mask(kind, w, h)
    tile = Image.new("RGBA", m.size, (0, 0, 0, 0))
    tile.paste(Image.new("RGBA", m.size, ground + (255,)), (0, 0), m)
    t, l_ = inset
    bw, bh = m.size[0] * (1 - 2 * l_), m.size[1] * (1 - 2 * t)
    im = load(logo)
    x, y, nw, nh = contain_box(im.size[0], im.size[1], m.size[0] * l_, m.size[1] * t, bw, bh)
    im = im.resize((max(1, round(nw)), max(1, round(nh))), Image.LANCZOS)
    tile.alpha_composite(im, (round(x), round(y)))
    return tile


# ── the field ─────────────────────────────────────────────────────────────
def rng(seed):
    state = [seed]

    def r():
        s = state[0]
        s = (s + 0x6D2B79F5) & 0xFFFFFFFF
        state[0] = s
        t = s
        t = _imul(t ^ (t >> 15), 1 | t)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return r


def _imul(a, b):
    return (a & 0xFFFFFFFF) * (b & 0xFFFFFFFF) & 0xFFFFFFFF


def _cells():
    rand = rng(2026)
    palette = [ROSE, PEACH, SLATE, SLATE, ROSE, PEACH]
    h, gap = 175, 15
    w = h * HEX_RATIO
    dx, dy = w + gap, h * 0.75 + gap * 0.87
    out = []
    r = -1
    while r * dy < H + h:
        off = dx / 2 if r % 2 else 0
        c = -1
        while c * dx < W + w:
            out.append(
                dict(cx=c * dx + off, cy=r * dy + h / 2 - 18, h=h, pick=rand(), tint=palette[math.floor(rand() * len(palette))], level=0.55 + rand() * 0.45)
            )
            rand(), rand()  # breathe, phase
            c += 1
        r += 1
    return out


CELLS = _cells()


def smooth(e0, e1, x):
    t = min(1, max(0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


DENSITY = {
    "right": lambda x: smooth(1240, 1640, x) * 0.7,
    "edges": lambda x: max(1 - smooth(60, 220, x), smooth(1700, 1860, x)) * 0.62,
    "quiet": lambda x: max(1 - smooth(20, 90, x), smooth(1830, 1900, x)) * 0.55,
    "none": lambda x: 0,
}
ALPHA = {"right": 0.9, "edges": 0.9, "quiet": 0.35, "none": 0}
DEFAULT_FIELD = {"title": "right", "section": "edges", "logistics": "right", "speaker": "edges", "quote": "edges", "photo": "none", "pitch": "edges"}
_fields = {}


def field(mode):
    if mode in _fields:
        return _fields[mode]
    k = 2
    bg = Image.new("RGBA", (W * k, H * k), NAVY + (255,))
    f, alpha = DENSITY.get(mode, DENSITY["quiet"]), ALPHA.get(mode, 0.35)
    for cell in CELLS:
        d = f(cell["cx"])
        if cell["pick"] >= d:
            continue
        o = alpha * cell["level"] * (0.45 + 0.55 * d)
        h = cell["h"]
        w = h * HEX_RATIO
        layer = Image.new("RGBA", bg.size, (0, 0, 0, 0))
        poly = fit_poly(HEX_POLY, HEX_VB, (cell["cx"] - w / 2) * k, (cell["cy"] - h / 2) * k, w * k, h * k)
        ImageDraw.Draw(layer).polygon(poly, fill=cell["tint"] + (round(255 * o),))
        bg.alpha_composite(layer)
    p = CACHE / f"field-{mode}.png"
    bg.resize((W, H), Image.LANCZOS).convert("RGB").save(p)
    _fields[mode] = p
    return p


# ── pptx helpers ──────────────────────────────────────────────────────────
def E(v):
    return Emu(int(round(v * EMU)))


def set_background(slide, png):
    _, rId = slide.part.get_or_add_image_part(str(png))
    bg = parse_xml(
        '<p:bg xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="{rId}"/><a:srcRect/>'
        "<a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>"
    )
    cSld = slide._element.cSld
    cSld.insert(0, bg)


def picture(slide, im_or_path, x, y, w, h, name=None):
    p = im_or_path if isinstance(im_or_path, (str, Path)) else save(im_or_path)
    pic = slide.shapes.add_picture(str(p), E(x), E(y), E(w), E(h))
    if name:
        pic.name = name
    return pic


def rgb(c):
    return RGBColor(*c)


def _run(p, text, st):
    r = p.add_run()
    r.text = text.upper() if st["upper"] else text
    f = r.font
    f.name = st["face"]
    f.size = Pt(st["size"] / 2)
    f.bold = bool(st["bold"] or st.get("semibold"))
    f.color.rgb = rgb(st["color"])
    if st["track"]:
        r._r.get_or_add_rPr().set("spc", str(int(round(st["track"] * st["size"] / 2 * 100))))
    return r


def para(tf, segments, align="l", before=0, lh=None, first=False, tabs=None):
    """segments: [(text, style)]. Newlines in text become line breaks."""
    p = tf.paragraphs[0] if first else tf.add_paragraph()
    p.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[align]
    st0 = segments[0][1]
    lhv = lh if lh is not None else st0["lh"]
    if lhv:
        p.line_spacing = lhv / NATURAL[st0["face"]]
    if before:
        p.space_before = Pt(before / 2)
    if tabs:
        pPr = p._p.get_or_add_pPr()
        pPr.append(parse_xml('<a:tabLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' + "".join(f'<a:tab pos="{int(t * EMU)}" algn="l"/>' for t in tabs) + "</a:tabLst>"))
    for text, st in segments:
        parts = text.split("\n")
        for j, part in enumerate(parts):
            if j:
                p.add_line_break()
            if part:
                _run(p, part, st)
    return p


def textbox(slide, x, y, w, h, anchor="t", wrap_=True, name=None):
    tb = slide.shapes.add_textbox(E(x), E(y), E(w), E(h))
    tf = tb.text_frame
    tf.word_wrap = wrap_
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
    tf.auto_size = None
    bodyPr = tf._txBody.bodyPr
    for el in bodyPr.findall("{http://schemas.openxmlformats.org/drawingml/2006/main}spAutoFit"):
        bodyPr.remove(el)
    if name:
        tb.name = name
    return tb, tf


def blocks_box(slide, x, y, w, h, blocks, anchor="t", align="l", name=None):
    """blocks: [(segments, before_px, extra)] laid out as paragraphs."""
    tb, tf = textbox(slide, x, y, w, h, anchor, name=name)
    for i, b in enumerate(blocks):
        segs, before = b[0], b[1]
        extra = b[2] if len(b) > 2 else {}
        para(tf, segs, align=extra.get("align", align), before=before if i else 0, first=(i == 0), tabs=extra.get("tabs"), lh=extra.get("lh"))
    return tb


def freeform(slide, poly, fill, alpha=None):
    ff = slide.shapes.build_freeform(E(poly[0][0]), E(poly[0][1]), scale=1.0)
    ff.add_line_segments([(E(px_), E(py_)) for px_, py_ in poly[1:]], close=True)
    shp = ff.convert_to_shape()
    shp.fill.solid()
    shp.fill.fore_color.rgb = rgb(fill)
    shp.line.fill.background()
    shp.shadow.inherit = False
    return shp


def hex_shape(slide, x, y, w, h, fill):
    return freeform(slide, fit_poly(HEX_POLY[::3], HEX_VB, x, y, w, h), fill)


def silhouette(slide, x, y, w, h, fill):
    return freeform(slide, fit_poly(SHAPE_POLY[::2], SHAPE_VB, x, y, w, h), fill)


def rounded(slide, x, y, w, h, r, fill=None, line=None, line_w=0):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, E(x), E(y), E(w), E(h))
    shp.adjustments[0] = min(0.5, r / min(w, h))
    if fill:
        shp.fill.solid()
        shp.fill.fore_color.rgb = rgb(fill)
    else:
        shp.fill.background()
    if line:
        shp.line.color.rgb = rgb(line)
        shp.line.width = E(line_w)
    else:
        shp.line.fill.background()
    shp.shadow.inherit = False
    return shp


# ── HTML helpers ──────────────────────────────────────────────────────────
def txt(el):
    """Text of an element, <br> as a newline, whitespace collapsed."""
    if el is None:
        return ""
    out = []
    for node in el.descendants:
        if isinstance(node, NavigableString):
            if node.parent.name in ("script", "style") or type(node).__name__ == "Comment":
                continue
            out.append(str(node))
        elif node.name == "br":
            out.append("\n")
    s = "".join(out)
    s = re.sub(r"[ \t\r\f\v]*\n[ \t\r\f\v]*", lambda m: "\n" if m.group(0).strip(" \t\r\f\v") == "\n" else " ", s)
    # Source newlines (indentation) are spaces; only <br> newlines survive.
    s = s.replace("\n", "\x00")
    return re.sub(r"\s+", " ", s.replace("\x00", "\n")).replace(" \n", "\n").replace("\n ", "\n").strip()


def txt_br(el):
    if el is None:
        return ""
    el = BeautifulSoup(str(el), "html.parser")
    for br in el.find_all("br"):
        br.replace_with("\x01")
    s = re.sub(r"\s+", " ", el.get_text()).strip()
    return s.replace(" \x01", "\x01").replace("\x01 ", "\x01").replace("\x01", "\n")


def rich(el, st):
    """An element's text as runs: <strong>/<b> bold, <br> a line break."""
    segs = []
    for node in el.children:
        if isinstance(node, NavigableString):
            if type(node).__name__ == "Comment":
                continue
            segs.append([re.sub(r"\s+", " ", str(node)), st])
        elif node.name == "br":
            segs.append(["\n", st])
        elif node.name in ("strong", "b"):
            segs.append([txt_br(node), S(st, bold=True, file=SG_B if st["face"] == "Space Grotesk" else st["file"])])
        else:
            segs.append([txt_br(node), st])
    out = []
    for t, s_ in segs:
        if out and out[-1][1] is s_:
            out[-1][0] += t
        else:
            out.append([t, s_])
    if out:
        out[0][0] = out[0][0].lstrip()
        out[-1][0] = out[-1][0].rstrip()
    return [(t.replace(" \n", "\n").replace("\n ", "\n"), s_) for t, s_ in out if t]


def css_px(style_attr, prop):
    m = re.search(rf"(?:^|;)\s*{prop}\s*:\s*(-?[\d.]+)px", style_attr or "")
    return float(m.group(1)) if m else None


def inset_of(style_attr):
    m = re.search(r"object-view-box:\s*inset\(([^)]*)\)", style_attr or "")
    if not m:
        return None
    return tuple(float(v.strip().rstrip("%")) for v in m.group(1).split())


def asset(src, deck_dir):
    return (deck_dir / src).resolve()


def show_asset(p):
    """show.data.js paths are relative to stage/."""
    return (ROOT / "stage" / p).resolve()


# ── show data ─────────────────────────────────────────────────────────────
def load_show():
    s = (ROOT / "stage" / "show.data.js").read_text()
    return json.loads(s[s.index("{") : s.rstrip().rindex("}") + 1])


def load_map(name):
    s = (ROOT / "decks" / "shared" / f"{name}.js").read_text()
    vb = re.search(r'viewBox:\s*"([^"]+)"', s).group(1)
    pins = json.loads(re.search(r"pins:\s*(\{.*?\})\s*,\n", s, re.S).group(1))
    d = re.search(r'\bd:\s*"([^"]+)"', s).group(1)
    return [float(v) for v in vb.split()], pins, d


SHOW = load_show()
NOT_TALKS = {"Welcome", "Wrap-up", "Remarks"}


def names_of(t):
    n = [s["name"] for s in t["speakers"]]
    return f"{', '.join(n[:-1])} & {n[-1]}" if len(n) > 1 else (n[0] if n else "")


def day_label(slug):
    for day in SHOW.get("days", {}).values():
        if any(c.get("talk") == slug for c in day.get("cues", [])):
            return day.get("label", "")
    return ""


# ── rendered pieces ───────────────────────────────────────────────────────
def qr_image(code, w, h, qr_size, qr_dy, ground=WHITE):
    """A Sessionize/gallery QR on the white brand silhouette."""
    m = mask("shape", w, h)
    tile = Image.new("RGBA", m.size, (0, 0, 0, 0))
    tile.paste(Image.new("RGBA", m.size, ground + (255,)), (0, 0), m)
    if not code:
        return tile
    n = code["n"] + 4
    k = 4
    side = int(qr_size * SS)
    big = Image.new("RGBA", (side * k, side * k), (0, 0, 0, 0))
    dr = ImageDraw.Draw(big)
    sc = side * k / n

    def tr(poly):
        return [((px_ + 2) * sc, (py_ + 2) * sc) for px_, py_ in poly]

    for poly in path_polys(code["d"]):
        if len(poly) > 2:
            dr.polygon(tr(poly), fill=NAVY + (255,))
    mark = code.get("mark") or ""
    for m_ in re.finditer(r'<path([^>]*)d="([^"]+)"', mark):
        fill = WHITE if "qr-star" in m_.group(1) else NAVY
        for poly in path_polys(m_.group(2)):
            dr.polygon(tr(poly), fill=fill + (255,))
    qr = big.resize((side, side), Image.LANCZOS)
    tile.alpha_composite(qr, (round((m.size[0] - side) / 2), round((m.size[1] - side) / 2 + qr_dy * SS)))
    return tile


def qr_code(name):
    """A link's QR from the stage file's qr (stage/build.mjs encodes them)."""
    return (SHOW.get("qrs") or {}).get(name) or (SHOW.get(name) if name == "photos" else None)


def outline_figure(text, size=247):
    """The outline numerals: navy fill, rose stroke (an image)."""
    k = SS
    f = font(SG_B, size * k)
    sw = round(2.5 * k)
    bbox = f.getbbox(text, stroke_width=sw)
    im = Image.new("RGBA", (bbox[2] + 4 * sw, round(size * 0.86 * k) + 4 * sw), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    asc = f.getmetrics()[0]
    # Centre the cap height in a 0.86em line box, as the CSS line does.
    cap = f.getbbox("H")
    y = (im.size[1] - (cap[3] - cap[1])) / 2 - cap[1]
    dr.text((sw * 2, y), text, font=f, fill=NAVY + (255,), stroke_width=sw, stroke_fill=ROSE + (255,))
    return im, im.size[0] / k, im.size[1] / k


def geomap_image(name, w, h, pin_img=None, pin=52, label=50):
    vb, pins, d = load_map(name)
    vx, vy, vw, vh = vb
    k = min(w / vw, h / vh)
    ox, oy = (w - vw * k) / 2, (h - vh * k) / 2
    # Labels can run past the map's box (overflow: visible); give room.
    padx = 260
    sc = SS
    im = Image.new("RGBA", (int((w + 2 * padx) * sc), int(h * sc)), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)

    def tr(x, y):
        return ((padx + ox + (x - vx) * k) * sc, (oy + (y - vy) * k) * sc)

    land = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ldr = ImageDraw.Draw(land)
    for poly in path_polys(d, steps=4):
        if len(poly) > 2:
            ldr.polygon([tr(*p) for p in poly], fill=SAND + (round(255 * 0.34),))
    im.alpha_composite(land)
    fnt = font(SG_B, label * k * sc)
    gap = pin * 0.5 + label * 0.35
    pin_png = load(pin_img) if pin_img else None
    for nm, (x, y, *side) in pins.items():
        side = side[0] if side else "r"
        if pin_png is not None:
            s = pin * k * sc
            pi = pin_png.copy()
            pi.thumbnail((round(s), round(s)), Image.LANCZOS)
            cx, cy = tr(x, y)
            im.alpha_composite(pi, (round(cx - pi.size[0] / 2), round(cy - pi.size[1] / 2)))
        else:
            hw = pin * HEX_RATIO
            poly = fit_poly(HEX_POLY, HEX_VB, x - hw / 2, y - pin / 2, hw, pin)
            dr.polygon([tr(*p) for p in poly], fill=ROSE + (255,))
        at = {"l": (x - gap, y + label * 0.35, "rs"), "r": (x + gap, y + label * 0.35, "ls"), "t": (x, y - gap, "ms"), "b": (x, y + gap + label * 0.7, "ms")}[side]
        dr.text(tr(at[0], at[1]), nm.upper(), font=fnt, fill=WHITE + (255,), anchor=at[2])
    return im, padx


SKYLINE = (
    "M0 70V40L20 22L40 40V70Z M48 70V30L57 0L66 30V70Z M66 70V48L83 36L100 48V70Z "
    "M108 70V48L129 40L150 48V70Z M158 70V54L170 42L182 54V70Z M190 70V28L211 10L232 28V70Z"
)


def skyline_image(w):
    h = w * 70 / 232
    k = 4
    im = Image.new("RGBA", (int(w * SS * k), int(h * SS * k)), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    s = w * SS * k / 232
    for poly in path_polys(SKYLINE):
        dr.polygon([(x * s, y * s) for x, y in poly], fill=NAVY + (255,))
    return im.resize((int(w * SS), int(h * SS)), Image.LANCZOS), h


def svg_inline_image(svg_el, w):
    """The Say-cheese camera: a small inline SVG, drawn with PIL."""
    vb = [float(v) for v in svg_el["viewbox"].split()] if svg_el.has_attr("viewbox") else [float(v) for v in svg_el["viewBox"].split()]
    h = w * vb[3] / vb[2]
    k = 4
    s = w * SS * k / vb[2]
    im = Image.new("RGBA", (int(w * SS * k), int(h * SS * k)), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    colors = {"body-shape": ROSE, "lens": NAVY, "glass": PEACH, "flash": WHITE}
    for el in svg_el.find_all(["path", "circle"]):
        c = colors.get((el.get("class") or [""])[0], NAVY)
        if el.name == "circle":
            cx, cy, r = float(el["cx"]), float(el["cy"]), float(el["r"])
            dr.ellipse([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], fill=c + (255,))
            continue
        tf = el.get("transform", "")
        ops = re.findall(r"(translate|scale)\(([^)]*)\)", tf)

        def apply(pt):
            x, y = pt
            for op, args in reversed(ops):
                a = [float(v) for v in re.split(r"[ ,]+", args.strip())]
                if op == "translate":
                    x, y = x + a[0], y + (a[1] if len(a) > 1 else 0)
                else:
                    x, y = x * a[0], y * (a[1] if len(a) > 1 else a[0])
            return x, y

        for poly in path_polys(el["d"]):
            dr.polygon([(apply(p)[0] * s, apply(p)[1] * s) for p in poly], fill=c + (255,))
    return im.resize((int(w * SS), int(h * SS)), Image.LANCZOS), h


# ── text blocks from the pad ──────────────────────────────────────────────
def kv_blocks(dl, before_first, dt_st=DT, dd_st=DD, x0=0):
    rows = list(zip(dl.find_all("dt"), dl.find_all("dd")))
    if not rows:
        return []
    col = max(measure(txt(dt), dt_st) for dt, _ in rows) + 54
    out = []
    for i, (dt, dd) in enumerate(rows):
        out.append(([(txt(dt), dt_st), ("\t", dd_st), (txt(dd), dd_st)], before_first if i == 0 else 20, {"tabs": [col], "lh": 1.25}))
    return out


def pad_blocks(pad, layout, display_size):
    """The pad's children as text paragraphs, with CSS margins between."""
    blocks = []
    prev = None
    for el in pad.find_all(recursive=False):
        cls = el.get("class") or []
        if el.name == "div" and not cls:  # rate: the left column wrapper
            blocks += pad_blocks(el, layout, display_size)
            prev = "display"
            continue
        if "eyebrow" in cls:
            blocks.append(([(txt_br(el), EYEBROW)], 0))
        elif "display" in cls:
            blocks.append(([(txt_br(el), S(DISPLAY, size=display_size))], 24 if prev == "eyebrow" else 0))
        elif "heading" in cls:
            blocks.append(([(txt_br(el), HEADING)], 24 if prev == "eyebrow" else 0))
        elif "body" in cls:
            mt = {"logistics": 44, "section": 44, "gallery": 40, "map": 40, "rate": 36}.get(layout, 30)
            blocks.append((rich(el, BODY), mt if prev in ("display", "heading") else 24))
        elif "credit" in cls:
            blocks.append(([(txt_br(el), CREDIT)], 40))
        elif el.name == "dl" and "kv" in cls:
            blocks += kv_blocks(el, 44)
        elif "when" in cls:
            blocks.append(([(txt_br(el), style(size=52, bold=True, upper=True))], 14))
        elif "quote-mark" in cls:
            blocks.append(([(txt(el), style(size=150, bold=True, color=PEACH, lh=0.9))], 0))
        elif "quote" in cls:
            blocks.append(([(txt_br(el), style(size=86, bold=True, track=-0.01, lh=1.16))], 20))
        elif "attribution" in cls:
            blocks.append(([(txt_br(el), style(size=30, color=ROSE, upper=True, track=0.08))], 54))
        else:
            continue
        prev = "eyebrow" if "eyebrow" in cls else "display" if "display" in cls else "heading" if "heading" in cls else "other"
    return blocks


def blocks_height(blocks, width):
    h = 0
    for i, b in enumerate(blocks):
        segs, before = b[0], b[1]
        text = "".join(t for t, _ in segs)
        st = segs[-1][1]
        lh = b[2].get("lh") if len(b) > 2 and b[2].get("lh") else None
        line = (lh * st["size"]) if lh else lh_px(st)
        h += (before if i else 0) + len(wrap(text.replace("\t", "    "), st, width)) * line
    return h


# ── layouts ───────────────────────────────────────────────────────────────
DISPLAY_SIZE = {"section": 186, "logistics": 140, "rate": 120, "gallery": 140, "title": 168}


def pad_box(sec):
    """Left, top, width, height of the .pad for this layout."""
    layout = sec["data-layout"]
    pad = sec.find(class_="pad", recursive=False)
    st = pad.get("style", "") if pad else ""
    right = css_px(st, "right")
    if layout == "logistics":
        r = right if right is not None else 560
        return 90, 90, W - 90 - r, 900
    if layout in ("gallery", "map"):
        return 90, 90, 560, 900
    return 90, 90, W - 180, 900


def lay_title(slide, sec, deck_dir):
    pad = sec.find(class_="pad")
    lk = pad.find(class_="lockup")
    w = css_px(lk.get("style"), "--w") or 760
    h = w * 870.581 / 1511.728
    eb, when = pad.find(class_="eyebrow"), pad.find(class_="when")
    eb_h, when_h = 34 * NATURAL["Space Grotesk"], 52 * NATURAL["Space Grotesk"]
    total = 60 + h + 90 + eb_h + 14 + when_h
    y0 = 90 + (900 - total) / 2 + 60
    word = lk.find(class_="wordmark")
    picture(slide, load(asset(word["src"], deck_dir)), 90, y0, w, h, name="Lockup")
    mk = load(asset(lk.find(class_="mark")["src"], deck_dir))
    bx, by, bw, bh = 90 + 0.8303 * w, y0 - 0.1875 * h, 0.4207 * w, 0.70 * h
    x, y, nw, nh = contain_box(mk.size[0], mk.size[1], bx, by, bw, bh)
    picture(slide, mk, x, y, nw, nh, name="Mark")
    ty = y0 + h + 90
    blocks_box(slide, 90, ty, 1200, eb_h + 14 + when_h + 10, [([(txt(eb), EYEBROW)], 0), ([(txt(when), style(size=52, bold=True, upper=True))], 14)])


def lay_centered(slide, sec, deck_dir, layout):
    pad = sec.find(class_="pad")
    blocks = pad_blocks(pad, layout, DISPLAY_SIZE.get(layout, 168))
    if layout == "quote":
        blocks_box(slide, 260, 90, 1400, 900, blocks, anchor="m", align="c")
    else:
        blocks_box(slide, 90, 90, W - 180, 900, blocks, anchor="m", align="c")


def top_heading(slide, sec):
    pad = sec.find(class_="pad", recursive=False)
    blocks = pad_blocks(pad, sec["data-layout"], 168)
    blocks_box(slide, 90, 90, W - 180, 230, blocks, anchor="t", name="Heading")


def lay_flow_left(slide, sec, deck_dir, layout):
    """logistics, gallery, map: a vertically centred text column."""
    x, y, w, h = pad_box(sec)
    pad = sec.find(class_="pad", recursive=False)
    blocks = pad_blocks(pad, layout, DISPLAY_SIZE.get(layout, 140))
    # A word longer than the column overflows it in the browser rather than
    # breaking; widen the box so Slides does the same.
    for b in blocks:
        for t, st in b[0]:
            for word in re.split(r"[\s]+", t):
                w = max(w, measure(word, st) + 12)
    cam = pad.find("svg", class_="cheese-cam")
    if cam is not None:
        th = blocks_height(blocks, w)
        cam_im, cam_h = svg_inline_image(cam, 300)
        total = th + 60 + cam_h
        top = y + (h - total) / 2
        blocks_box(slide, x, y, w, top + th - y + 8, blocks, anchor="b")
        picture(slide, cam_im, x, top + th + 60, 300, cam_h, name="Camera")
    else:
        blocks_box(slide, x, y, w, h, blocks, anchor="m")


def person(slide, x, y, colw, img, iw, who, what, who_st, what_st, who_mt, what_mt, pos=(0.5, 0.5), min_who=0):
    ih = iw / SHAPE_RATIO
    ix = x + (colw - iw) / 2
    if img:
        picture(slide, clipped(img, "shape", iw, ih, pos), ix, y, iw, ih, name=who)
    else:
        silhouette(slide, ix, y, iw, ih, mix(SAND, 0.18))
    blocks = [([(who, who_st)], 0)]
    if what:
        blocks.append(([(what, what_st)], what_mt))
    hh = max(min_who, blocks_height(blocks, colw))
    blocks_box(slide, x, y + ih + who_mt, colw, hh + 6, blocks, align="c")
    return ih + who_mt + hh


def people_for(source):
    orgs = SHOW.get("organizers", [])
    if source == "organizers":
        return orgs
    if source == "hosts":
        out = []
        for s in SHOW["talks"].get("d1-welcome", {}).get("speakers", []):
            role = s.get("role") or next((o.get("role", "") for o in orgs if o["name"] == s["name"]), "")
            out.append(dict(s, role=role))
        return out
    if source == "speakers":
        seen = {}
        for t in SHOW["talks"].values():
            if t["kind"] in NOT_TALKS:
                continue
            for s in t["speakers"]:
                seen.setdefault(s["name"], dict(s, role=""))
        return list(seen.values())
    return []


def lay_people(slide, sec, deck_dir):
    top_heading(slide, sec)
    grid = sec.find(class_="people")
    source = sec.get("data-source")
    ppl = people_for(source)
    size = grid.get("data-size")
    if size == "all":
        per, colw, iw, top, gap = 10, 174, 106, 280, 22
        who_st = style(size=19, bold=True, upper=True, lh=1.08)
        rows = [ppl[i : i + per] for i in range(0, len(ppl), per)]
        y = top
        for row in rows:
            x0 = 90 + (1740 - len(row) * colw) / 2
            hs = [person(slide, x0 + i * colw, y, colw, show_asset(p["portrait"]) if p.get("portrait") else None, iw, p["name"], "", who_st, None, 12, 0, min_who=41) for i, p in enumerate(row)]
            y += max(hs) + gap
        return
    if size == "hosts":
        per, gapx, gapy, iw = 3, 60, 40, 420
        who_st, what_st, who_mt, what_mt = style(size=44, bold=True, upper=True, lh=1.08), style("Inter", 28, color=MUTED, lh=1.3), 30, 10
    else:
        per = math.ceil(len(ppl) / 2) or 1
        gapx, gapy, iw = 30, 44, 186
        who_st, what_st, who_mt, what_mt = style(size=27, bold=True, upper=True, lh=1.08), style("Inter", 20, color=MUTED, lh=1.3), 20, 6
    colw = (1740 - (per - 1) * gapx) / per
    y = 330
    for r in range(0, len(ppl), per):
        row = ppl[r : r + per]
        hs = [
            person(slide, 90 + i * (colw + gapx), y, colw, show_asset(p["portrait"]) if p.get("portrait") else None, iw, p["name"], p.get("role", ""), who_st, what_st, who_mt, what_mt)
            for i, p in enumerate(row)
        ]
        y += max(hs) + gapy


def lay_crew(slide, grid, deck_dir):
    x0, top, width, gapx = W - 90 - 760, 250, 760, 30
    colw = (width - gapx) / 2
    for i, p in enumerate(grid.find_all(class_="person")):
        img = p.find("img")
        pos = (0.4, 0.5) if "40%" in (img.get("style") or "") else (0.5, 0.5)
        person(slide, x0 + i * (colw + gapx), top, colw, asset(img["src"], deck_dir), 330, txt(p.find(class_="who")), txt(p.find(class_="what")),
               style(size=36, bold=True, upper=True, lh=1.08), style("Inter", 28, color=MUTED, lh=1.3), 26, 6, pos)


def lay_speaker(slide, sec, deck_dir):
    t = SHOW["talks"].get(sec.get("data-talk"))
    if not t:
        return
    n = len(t["speakers"])
    shots = [(0, 0, 290), (311, 0, 290), (155, 280, 290)] if n >= 3 else [(0, 0, 368), (240, 212, 368)] if n == 2 else [(10, 0, 580)]
    for s, (sx, sy, sh) in zip(t["speakers"], shots):
        if not s.get("portrait"):
            continue
        pos = (0.5, 0.0) if s.get("align") == "xMidYMin" else (0.0, 0.5) if s.get("align") == "xMinYMid" else (0.5, 0.5)
        sw = round(sh * SHAPE_RATIO)
        picture(slide, clipped(show_asset(s["portrait"]), "shape", sw, sh, pos), 110 + sx, 250 + sy, sw, sh, name=s["name"])
    day = day_label(sec["data-talk"])
    eyebrow = t["kind"] + (f" · {day}" if day else "")
    w = 980
    size = 104
    disp = S(DISPLAY, size=size, lh=0.96)
    longest = max(t["title"].split(), key=lambda x: measure(x, disp))
    while (text_h(t["title"], disp, w) > 440 or measure(longest, disp) > w) and size > 40:
        size -= 2
        disp = S(DISPLAY, size=size, lh=0.96)
    blocks = [([(eyebrow, EYEBROW)], 0), ([(t["title"], disp)], 24)]
    for i, s in enumerate(t["speakers"]):
        blocks.append(([(s["name"], NAME)], 46 if i == 0 else 18))
        if s.get("role"):
            blocks.append(([(s["role"], ROLE)], 4))
    blocks_box(slide, 830, 150, w, 780, blocks, anchor="m", name="Talk")


def lay_rate(slide, sec, deck_dir):
    pad = sec.find(class_="pad")
    t = SHOW["talks"].get(sec.get("data-talk")) if sec.get("data-talk") else None
    if t:
        body = pad.find(class_="body")
        if body is not None:
            body.string = f"{t['title']} · {names_of(t)}"
    blocks = pad_blocks(pad, "rate", 120)
    blocks_box(slide, 90, 90, 1063, 900, blocks, anchor="m")
    code = t.get("feedback") if t else None
    im = qr_image(code, 577, 560, 380, 15)
    picture(slide, im, 1253, 260, 577, 560, name="Feedback QR")
    if not code:
        _, tf = textbox(slide, 1253, 260, 577, 560, anchor="m")
        para(tf, [("TODO — QR code", style(size=26, color=INK, upper=True, track=0.08))], align="c", first=True)


def hexlogo_tile(slide, img, x, y, w, h, round_=False, charity=False, name=None):
    if charity:
        inset = (0.15, 0.10) if round_ else (0.20, 0.14)
    else:
        inset = (0.15, 0.10) if round_ else (0.30, 0.14)
    picture(slide, logo_tile(img, w, h, inset), x, y, w, h, name=name)


def marked_list(slide, ul, x, y, w):
    colors = [ROSE, PEACH, SLATE]
    st = style("Inter", 40, lh=None)
    for i, li in enumerate(ul.find_all("li")):
        silhouette(slide, x, y + 12, 34, 33, colors[i % 3])
        t = txt(li)
        h = text_h(t, st, w - 70)
        blocks_box(slide, x + 70, y, w - 70, h + 4, [([(t, st)], 0)])
        y += h + 22
    return y


def lay_stat(slide, sec, deck_dir):
    top_heading(slide, sec)
    cols = sec.find(class_="cols").find_all("div", recursive=False)
    for ci, col in enumerate(cols):
        x, y = 90 + ci * (825 + 90), 380
        for el in col.find_all(recursive=False):
            cls = el.get("class") or []
            if "hexlogo" in cls:
                hw, hh = 210, 210 / HEX_RATIO
                hexlogo_tile(slide, asset(el.find("img")["src"], deck_dir), x, y, hw, hh, "round" in cls, charity=True, name=el.find("img").get("alt"))
                y += hh + 36
            elif "figure" in cls:
                im, fw, fh = outline_figure(txt(el))
                picture(slide, im, x - 5, y + (247 * 0.86 - fh) / 2, fw, fh, name=f"Figure {txt(el)}")
                y += 247 * 0.86
            elif "figure-caption" in cls:
                st = style(size=34, color=ROSE, upper=True, track=0.08)
                h = text_h(txt(el), st, 825)
                blocks_box(slide, x, y + 30, 825, h + 6, [([(txt(el), st)], 0)])
                y += 30 + h
            elif "col-heading" in cls:
                h = text_h(txt(el), COLHEAD, 825)
                blocks_box(slide, x, y, 825, h + 6, [([(txt(el), COLHEAD)], 0)])
                y += h
            elif el.name == "ul":
                y = marked_list(slide, el, x, y + 40, 825)


def sched(slide, dl, deck_dir, x, y, w):
    dt_st = style(size=36, color=ROSE, track=0.08)
    title_st = style(size=42, bold=True, lh=1.12)
    who_st = style("Inter", 28, color=MUTED, lh=None)
    tcol = max(measure(txt(dt), dt_st) for dt in dl.find_all("dt")) + 30
    for dt, dd in zip(dl.find_all("dt"), dl.find_all("dd")):
        blocks_box(slide, x, y + 4, tcol, 50, [([(txt(dt), dt_st)], 0)])
        faces = dd.find(class_="faces")
        fx = x + tcol
        fw = 0
        if faces is not None:
            imgs = faces.find_all("img")
            for k, im in enumerate(imgs):
                picture(slide, clipped(asset(im["src"], deck_dir), "shape", 104, 104 / SHAPE_RATIO), fx + k * (104 - 26), y, 104, 104 / SHAPE_RATIO)
            fw = 104 + (len(imgs) - 1) * 78 + 26
        div = dd.find("div", class_=False) or dd.find_all("div")[-1]
        span = div.find("span")
        who = txt(span) if span else ""
        if span:
            span.extract()
        title = txt(div)
        tw = w - tcol - fw
        blocks = [([(title, title_st)], 0)] + ([([(who, who_st)], 8)] if who else [])
        th = blocks_height(blocks, tw)
        blocks_box(slide, fx + fw, y, tw, th + 6, blocks)
        y += max(th, 104 / SHAPE_RATIO if faces else 0) + 44
    return y


def lay_split(slide, sec, deck_dir):
    top_heading(slide, sec)
    cols = sec.find(class_="cols")
    for ci, col in enumerate(cols.find_all("div", recursive=False)):
        x, y = 90 + ci * (825 + 90), 380
        cls = col.get("class") or []
        width = css_px(col.get("style"), "width") or 825
        if "stack" in cls:
            blocks = []
            for el in col.find_all(recursive=False):
                if "lead" in (el.get("class") or []):
                    blocks.append(([(txt_br(el), LEAD)], 40 if blocks else 0))
                elif el.name == "dl":
                    blocks += kv_blocks(el, 40)
            blocks_box(slide, x, y, width, blocks_height(blocks, width) + 20, blocks)
        elif "card" in cls:
            colors = [ROSE, PEACH, SLATE]
            silhouette(slide, x, y, 46, 45, colors[ci % 3])
            y += 45 + 26
            hd = col.find(class_="card-heading")
            st = style(size=49, bold=True, upper=True, lh=1.05)
            blocks_box(slide, x, y, 825, 60, [([(txt(hd), st)], 0)])
            y += 49 * 1.05 + 22
            for el in col.find_all(recursive=False):
                if el.name == "dl" and "sched" in (el.get("class") or []):
                    sched(slide, el, deck_dir, x, y, 825)
                elif "body" in (el.get("class") or []):
                    blocks_box(slide, x, y, 825, text_h(txt(el), BODY, 825) + 6, [([(txt_br(el), BODY)], 0)])


def lay_cities(slide, sec, deck_dir):
    top_heading(slide, sec)
    for i, city in enumerate(sec.find_all(class_="city")):
        x, y, w = 90 + i * 610, 330, 520
        h = w / 1.6
        rounded(slide, x, y, w, h, 30, fill=WHITE)
        rounded(slide, x + 16 + 3.5, y + 16 + 3.5, w - 32 - 7, h - 32 - 7, 18 - 3.5, line=NAVY, line_w=7)
        name = txt(city.find(class_="face"))
        sky, sh = skyline_image(w * 0.62 * 0.92)
        inner_h = h - 32 - 14
        content = 70 + 26 + sh
        cy = y + 16 + 7 + (inner_h - content) / 2
        blocks_box(slide, x, cy - 6, w, 84, [([(name, style(size=70, bold=True, color=NAVY, lh=1.0))], 0)], align="c")
        sw = w * 0.62 * 0.92
        picture(slide, sky, x + (w - sw) / 2, cy + 70 + 26, sw, sh, name="Skyline")
        body = city.find(class_="body")
        small = body.find("small")
        link = small.extract().get_text() if small else ""
        join = city.find(class_="join")
        if join is None:
            blocks_box(slide, x, y + h + 30, w, 100, [([(txt(body), style("Inter", 32, color=MUTED))], 0), ([(link, style("Inter", 26, color=MUTED))], 0)], align="c")
            continue
        # The group's QR on a small white silhouette, its link beside it,
        # the pair centred under the sign.
        main_st, small_st = style("Inter", 32, color=MUTED), style("Inter", 22, color=MUTED)
        tw = max(measure(txt(body), main_st), measure(link, small_st)) + 8
        qw, qh = 216, 210
        jx = x + (w - (qw + 20 + tw)) / 2
        jy = y + h + 36
        q = join.find(class_="qr")
        picture(slide, qr_image(qr_code(q.get("data-qr")), qw, qh, 138, 5), jx, jy, qw, qh, name=q.get("data-label") or "QR")
        blocks_box(slide, jx + qw + 20, jy, tw + 40, qh, [([(txt(body), main_st)], 0), ([(link, small_st)], 0)], anchor="m")


def lay_gallery(slide, sec, deck_dir):
    lay_flow_left(slide, sec, deck_dir, "gallery")
    small = sec.get("data-cells") == "small"
    cw, ch = (212, 240) if small else (282, 320)
    for el in sec.find_all(recursive=False):
        cls = el.get("class") or []
        st = el.get("style", "")
        if el.name == "img" and "photo" in cls:
            x, y = css_px(st, "left"), css_px(st, "top")
            picture(slide, clipped(asset(el["src"], deck_dir), "hex", cw, ch, inset=inset_of(st)), x, y, cw, ch, name=el.get("alt") or "Photo")
        elif el.name == "div" and "hexcell" in cls:
            x, y = css_px(st, "left"), css_px(st, "top")
            fill = ROSE if "rose" in cls else SAND if "sand" in cls else mix(SAND, 0.12)
            color = MUTED if "todo" in cls else NAVY
            shp = hex_shape(slide, x, y, cw, ch, fill)
            shp.name = "Photo placeholder" if "todo" in cls else "Cell"
            tf = shp.text_frame
            tf.word_wrap = True
            tf.margin_left = tf.margin_right = Emu(int(16 * EMU))
            tf.margin_top = tf.margin_bottom = 0
            tf.vertical_anchor = MSO_ANCHOR.MIDDLE
            first = True
            for part in el.find_all(recursive=False):
                if part.name == "b":
                    fs = css_px(part.get("style"), "font-size") or (112 if small else 150)
                    s_ = style(size=fs, bold=True, color=color, lh=0.9)
                    mt = 0
                elif part.name == "span":
                    s_ = style(size=19 if small else 24, color=color, upper=True, track=0.08, lh=1.2)
                    mt = 0
                else:
                    fs = css_px(part.get("style"), "font-size") or (27 if small else 34)
                    s_ = style(size=fs, bold=True, color=color, upper=True, lh=1.15)
                    mt = 6 if small else 10
                para(tf, [(txt_br(part), s_)], align="c", before=mt if not first else 0, first=first)
                first = False
        elif el.name == "figure" and "org" in cls:
            x, y = css_px(st, "left"), css_px(st, "top")
            w, h = css_px(st, "width") or 240, css_px(st, "height") or 272
            img = el.find("img")
            ini = el.find(class_="initials")
            if img is not None:
                picture(slide, clipped(asset(img["src"], deck_dir), "hex", w, h), x, y, w, h, name=txt(el.find("b")))
            elif ini is not None:
                shp = hex_shape(slide, x, y, w, h, SAND)
                tf = shp.text_frame
                tf.vertical_anchor = MSO_ANCHOR.MIDDLE
                para(tf, [(txt(ini), style(size=96, bold=True, color=NAVY, lh=1.0))], align="c", first=True)
            cap = el.find("figcaption")
            b, sp = cap.find("b"), cap.find("span")
            blocks = [([(txt(b), style(size=22, bold=True, upper=True, lh=1.05))], 0)]
            if sp:
                blocks.append(([(txt(sp), style("Inter", 17, color=MUTED, lh=1.25))], 4))
            blocks_box(slide, x - 6, y + h + 16, w + 12, blocks_height(blocks, w + 12) + 8, blocks, align="c")


def lay_map(slide, sec, deck_dir):
    lay_flow_left(slide, sec, deck_dir, "map")
    x, y, w, h = 720, 90, W - 90 - 720, 900
    rounded(slide, x, y, w, h, 28, fill=mix(SAND, 0.07))
    img = sec.find(class_="plan").find("img")
    im = load(asset(img["src"], deck_dir))
    bx, by, bw, bh = contain_box(im.size[0], im.size[1], x, y, w, h)
    picture(slide, asset(img["src"], deck_dir), bx, by, bw, bh, name="Venue map")


def lay_table(slide, sec, deck_dir):
    top_heading(slide, sec)
    tbl = sec.find("table")
    heads = [txt(th) for th in tbl.find("thead").find_all("th")]
    rows = tbl.find("tbody").find_all("tr")
    rh, hh = 88, 46
    shape = slide.shapes.add_table(len(rows) + 1, len(heads), E(90), E(340), E(1740), E(hh + rh * len(rows)))
    table = shape.table
    tblPr = table._tbl.tblPr
    tblPr.set("firstRow", "0")
    tblPr.set("bandRow", "0")
    style_id = tblPr.find("{http://schemas.openxmlformats.org/drawingml/2006/main}tableStyleId")
    if style_id is not None:
        style_id.text = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}"  # No Style, No Grid
    table.rows[0].height = E(hh)
    for c, head in enumerate(heads):
        cell = table.cell(0, c)
        cell.fill.background()
        cell.margin_left, cell.margin_right, cell.margin_top, cell.margin_bottom = E(34), E(34), 0, E(6)
        tf = cell.text_frame
        tf.paragraphs[0].text = ""
        para(tf, [(head, style(size=26, color=ROSE, upper=True, track=0.08))], first=True)
    for r, tr in enumerate(rows, start=1):
        table.rows[r].height = E(rh)
        live = tr.has_attr("data-live")
        for c, td in enumerate(tr.find_all("td")):
            cell = table.cell(r, c)
            cell.fill.solid()
            cell.fill.fore_color.rgb = rgb(mix(ROSE, 0.22) if live else mix(SAND, 0.07))
            cell.margin_left, cell.margin_right, cell.margin_top, cell.margin_bottom = E(34), E(34), E(22), E(22)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            para(cell.text_frame, [(txt(td), style("Inter", 36, semibold=live))], first=True)


def sponsor_tiles(slide):
    tiers = SHOW.get("tiers", [])
    spec = {"Platinum": (440, 1), "Gold": (250, 2), "Bronze": (190, 2)}
    gap, top = 14, 380
    party = next((t["sponsors"] for t in tiers if t["tier"] == "Afterparty"), [])
    main = [t for t in tiers if t["sponsors"] and t["tier"] not in ("Afterparty", "Community")]

    def width_at(k):
        s = -76 - gap
        for t in main:
            h, per = spec.get(t["tier"], (190, 2))
            w = h * k * HEX_RATIO
            rows = math.ceil(len(t["sponsors"]) / per)
            s += min(per, len(t["sponsors"])) * (w + gap) + ((w + gap) / 2 if rows > 1 else 0) + 76
        return s

    k = min(1, (W - 180) / width_at(1))
    x = 90
    for t in main:
        bh, per = spec.get(t["tier"], (190, 2))
        h = round(bh * k)
        w = h * HEX_RATIO
        rows = math.ceil(len(t["sponsors"]) / per)
        blocks_box(slide, x, top - 60, 400, 44, [([(t["tier"], TIER)], 0)])
        for n, s in enumerate(t["sponsors"]):
            r, c = divmod(n, per)
            lx = x + c * (w + gap) + ((w + gap) / 2 if r % 2 else 0)
            ly = top + r * (h * 0.75 + gap)
            hexlogo_tile(slide, show_asset(s["logo"]), lx, ly, w, h, name=s["name"])
        x += min(per, len(t["sponsors"])) * (w + gap) + ((w + gap) / 2 if rows > 1 else 0) + 76
    ph = 210
    pw = ph * HEX_RATIO
    for n, s in enumerate(party):
        hexlogo_tile(slide, show_asset(s["logo"]), W - 90 - pw - n * (pw + gap), 70, pw, ph, name=s["name"])
    if party:
        right = 90 + len(party) * (pw + gap) + 16
        blocks_box(slide, W - right - 400, 160, 400, 44, [([("Afterparty", TIER)], 0)], align="r")


def community_tiles(slide):
    tiers = SHOW.get("tiers", [])
    sponsors = next((t["sponsors"] for t in tiers if t["tier"] == "Community"), [])
    partners = SHOW.get("partners", [])
    gap, top, h, per = 14, 380, 230, 5
    w = h * HEX_RATIO
    x = 90
    if sponsors:
        blocks_box(slide, 90, top - 60, 500, 44, [([("Community", TIER)], 0)])
    for n, s in enumerate(sponsors):
        r, c = divmod(n, per)
        hexlogo_tile(slide, show_asset(s["logo"]), x + c * (w + gap) + ((w + gap) / 2 if r % 2 else 0), top + r * (h * 0.75 + gap), w, h, round_="round" in s["logo"], name=s["name"])
    rows = math.ceil(len(sponsors) / per)
    x += min(per, len(sponsors)) * (w + gap) + ((w + gap) / 2 if rows > 1 else 0) + 76
    if partners:
        blocks_box(slide, x, top - 60, 600, 44, [([("Partners & media", TIER)], 0)])
    for n, s in enumerate(partners):
        hexlogo_tile(slide, show_asset(s["logo"]), x + n * (w + gap), top, w, h, name=s["name"])


def lay_sponsors(slide, sec, deck_dir):
    top_heading(slide, sec)
    if sec.get("data-source") == "community":
        community_tiles(slide)
    else:
        sponsor_tiles(slide)


def lay_logistics(slide, sec, deck_dir):
    lay_flow_left(slide, sec, deck_dir, "logistics")
    for el in sec.find_all(recursive=False):
        cls = el.get("class") or []
        if "hyf-big" in cls:
            hexlogo_tile(slide, asset(el.find("img")["src"], deck_dir), W - 110 - 688, 150, 688, 780, round_=True, name=el.find("img").get("alt"))
        elif "photos-qr" in cls:
            im = qr_image(qr_code(el.find(class_="qr").get("data-qr", "photos")), 268, 260, 168, 7)
            picture(slide, im, 450, 690, 268, 260, name="Photos QR")
            p = el.find("p")
            st = style(size=34, color=ROSE, upper=True, track=0.08, lh=1.2)
            blocks_box(slide, 450 + 268 + 32, 690, 500, 260, [([(txt_br(p), st)], 0)], anchor="m")
        elif "crew" in cls:
            lay_crew(slide, el, deck_dir)
        elif "coc" in cls:
            lay_coc(slide, el)
        elif el.name == "svg" and "pacman" in cls:
            lay_pacman(slide, el)
        elif el.name == "svg" and "social-logo" in cls:
            picture(slide, draw_svg_icon(el, (400, 400), fill=WHITE, evenodd=True), W - 220 - 400, 340, 400, 400, name=el.get("aria-label") or "Logo")
        elif "card-preview" in cls:
            # The booth card fanned: front and back, rotated as in the CSS.
            x0, y0 = W - 120 - 640, 170
            for img in el.find_all("img"):
                p = asset(img["src"], deck_dir)
                iw, ih = Image.open(p).size
                w, h = 440, 440 * ih / iw
                front = "front" in (img.get("class") or [])
                x, y = (x0, y0 + 40) if front else (x0 + 640 - 440, y0 + 110)
                pic = picture(slide, p, x, y, w, h, name=img.get("alt") or "Card")
                pic.rotation = -7 if front else 5
    if sec.get("data-source") == "afterparty":
        party = next((t["sponsors"] for t in SHOW.get("tiers", []) if t["tier"] == "Afterparty"), [])
        h = 500
        w = h * HEX_RATIO
        x = W - 170 - w
        if party:
            blocks_box(slide, x - 100, 250, w + 200, 44, [([("Sponsored by", EYEBROW)], 0)], align="c")
        for n, s in enumerate(party):
            hexlogo_tile(slide, show_asset(s["logo"]), x, 250 + 44 + 26 + n * (h + 26), w, h, name=s["name"])


CSS_VAR_COLOURS = {"rose": ROSE, "peach": PEACH, "sand": SAND, "slate": SLATE, "navy": NAVY, "white": WHITE, "red": RED}


def css_colour(value, default=None):
    m = re.search(r"--cnd-([a-z-]+)", value or "")
    return CSS_VAR_COLOURS.get(m.group(1), default) if m else default


def lay_coc(slide, el):
    """The code of conduct's three points: hexagon, icon, caption."""
    figs = el.find_all("figure")
    cw, ch, gap = 240, 272, 48
    x = W - 120 - (len(figs) * cw + (len(figs) - 1) * gap)
    for fig in figs:
        hex_shape(slide, x, 300, cw, ch, css_colour(fig.get("style"), ROSE)).name = "Cell"
        svg = fig.find("svg")
        picture(slide, draw_svg_icon(svg, (120, 120), stroke=NAVY, stroke_w=3.5), x + (cw - 120) / 2, 300 + (ch - 120) / 2, 120, 120, name="Icon")
        cap = fig.find("figcaption")
        st = style(size=30, bold=True, upper=True, lh=1.1)
        blocks_box(slide, x - 20, 300 + ch + 28, cw + 40, 90, [([(txt_br(cap), st)], 0)], align="c")
        x += cw + gap


def lay_pacman(slide, svg):
    """The Pac-Man rule's ring of hexagons, as shapes people can move."""
    vb = [float(v) for v in re.split(r"[ ,]+", svg["viewbox" if svg.has_attr("viewbox") else "viewBox"].strip())]
    bx, by, bw, bh = W - 130 - 800, 140, 800, 800
    s = min(bw / vb[2], bh / vb[3])
    ox, oy = bx + (bw - vb[2] * s) / 2, by + (bh - vb[3] * s) / 2
    for poly in svg.find_all("polygon"):
        nums = [float(v) for v in re.split(r"[ ,]+", poly["points"].strip())]
        pts = [(ox + (px_ - vb[0]) * s, oy + (py_ - vb[1]) * s) for px_, py_ in zip(nums[::2], nums[1::2])]
        fill = css_colour(poly.get("fill"))
        stroke = css_colour(poly.get("stroke"))
        shp = freeform(slide, pts, fill or NAVY)
        if fill is None:
            shp.fill.background()
        if stroke is not None:
            shp.line.color.rgb = rgb(stroke)
            shp.line.width = E(float(poly.get("stroke-width", 1)) * s)
            shp.line.dash_style = MSO_LINE_DASH_STYLE.DASH


def lay_pitch(slide, sec, deck_dir):
    """A gold sponsor's breaker: their logo on a large white hexagon."""
    name = sec.get("data-sponsor")
    s = next((x for t in SHOW.get("tiers", []) for x in t["sponsors"] if x["name"] == name), None)
    if s is None:
        return
    h = 760
    w = h * HEX_RATIO
    hexlogo_tile(slide, show_asset(s["logo"]), (W - w) / 2, (H - h) / 2, w, h, name=s["name"])


def lay_split_extras(slide, sec, deck_dir):
    gm = sec.find(class_="geomap")
    if gm is not None:
        name = gm["data-map"]
        pin = gm.get("data-pin")
        # --pin and --label: the stylesheet's per-map values, or the slide's.
        st = gm.get("style", "")
        size = float((re.search(r"--pin:\s*([\d.]+)", st) or [None, None])[1] or (52 if name == "denmark" else 44))
        label = float((re.search(r"--label:\s*([\d.]+)", st) or [None, None])[1] or (50 if name == "denmark" else 27))
        if name == "denmark":
            w, h, top = 720, 724, 270
            x = W - 90 - w
        else:
            w, h, top = 1080, 980, 50
            x = W - 60 - w
        im, padx = geomap_image(name, w, h, pin_img=asset(pin, deck_dir) if pin else None, pin=size, label=label)
        picture(slide, im, x - padx, top, w + 2 * padx, h, name=f"Map: {name}")
    logo = sec.find("img", class_="cnn-logo")
    if logo is not None:
        im = load(asset(logo["src"], deck_dir))
        lw = 270
        lh = lw * im.size[1] / im.size[0]
        picture(slide, im, 90, H - 64 - lh, lw, lh, name="Cloud Native Nordics")


def build_note(sec, authored):
    if authored:
        return authored
    if sec.get("data-layout") == "pitch":
        return f"Gold sponsor pitch: {sec.get('data-sponsor')}. Put this up while they walk on."
    t = SHOW["talks"].get(sec.get("data-talk") or "")
    if not t:
        return ""
    when = f" {t['start']}–{t['end']}{', ' + t['room'] if t.get('room') else ''}." if t.get("start") else ""
    if sec["data-layout"] == "speaker":
        who = "\n".join(f"{s['name']}, {s['role']}" if s.get("role") else s["name"] for s in t["speakers"])
        return f"Introduce:\n{who}\n\n{t['kind']}: “{t['title']}”.{when}"
    if sec["data-layout"] == "rate":
        return f"Thank {names_of(t)}. Ask the room to rate “{t['title']}” with the QR code before they leave."
    return ""


def todos(sec):
    """TODO comments next to a slide, carried into its notes."""
    out = []
    node = sec.previous_sibling
    while node is not None and (isinstance(node, NavigableString)):
        if type(node).__name__ == "Comment" and "TODO" in node:
            out.append(re.sub(r"\s+", " ", node.strip()))
        node = node.previous_sibling
    for c in sec.find_all(string=lambda s: type(s).__name__ == "Comment" and "TODO" in s):
        out.append(re.sub(r"\s+", " ", c.strip()))
    return out


def svgs_needed(soups):
    paths = set()
    for deck, soup in soups.items():
        d = ROOT / "decks" / deck
        for img in soup.find_all("img"):
            p = asset(img["src"], d)
            if p.suffix == ".svg" and p.exists():
                paths.add(p)
        for gm in soup.find_all(class_="geomap"):
            if gm.get("data-pin"):
                paths.add(asset(gm["data-pin"], d))
    for t in SHOW.get("tiers", []):
        for s in t["sponsors"]:
            p = show_asset(s["logo"])
            if p.suffix == ".svg":
                paths.add(p)
    for s in SHOW.get("partners", []):
        p = show_asset(s["logo"])
        if p.suffix == ".svg":
            paths.add(p)
    return sorted(paths)


def build(deck, soup):
    deck_dir = ROOT / "decks" / deck
    prs = Presentation()
    prs.slide_width, prs.slide_height = E(W), E(H)
    blank = prs.slide_layouts[6]
    title = soup.find("title").get_text() if soup.find("title") else deck
    prs.core_properties.title = title
    for sec in soup.find_all("section", class_="slide"):
        layout = sec.get("data-layout", "")
        slide = prs.slides.add_slide(blank)
        aside = sec.find("aside", class_="notes")
        authored = ""
        if aside is not None:
            authored = "\n".join(l.strip() for l in aside.get_text().split("\n")).strip()
            authored = re.sub(r"([^\n])\n(?=[^\n])", r"\1 ", authored)
            aside.extract()
        mode = sec.get("data-field") or DEFAULT_FIELD.get(layout, "quiet")
        set_background(slide, field(mode))
        {
            "title": lay_title,
            "section": lambda s, e, d: lay_centered(s, e, d, "section"),
            "quote": lambda s, e, d: lay_centered(s, e, d, "quote"),
            "logistics": lay_logistics,
            "gallery": lay_gallery,
            "map": lay_map,
            "people": lay_people,
            "speaker": lay_speaker,
            "rate": lay_rate,
            "stat": lay_stat,
            "split": lambda s, e, d: (lay_split(s, e, d), lay_split_extras(s, e, d)),
            "cities": lay_cities,
            "sponsors": lay_sponsors,
            "table": lay_table,
            "pitch": lay_pitch,
        }.get(layout, lambda s, e, d: lay_centered(s, e, d, "section"))(slide, sec, deck_dir)
        note = build_note(sec, authored)
        td = todos(sec)
        if td:
            note = (note + "\n\n" if note else "") + "\n".join(td)
        if note:
            slide.notes_slide.notes_text_frame.text = note
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{deck}.pptx"
    prs.save(out)
    return out, len(prs.slides._sldIdLst)


def main():
    decks = sys.argv[1:] or DECKS
    soups = {d: BeautifulSoup((ROOT / "decks" / d / "index.html").read_text(), "html.parser") for d in decks}
    rasterise_svgs(svgs_needed(soups))
    for d in decks:
        out, n = build(d, soups[d])
        print(f"{d:16s} {n:3d} slides  {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
