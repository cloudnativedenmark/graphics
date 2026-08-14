#!/usr/bin/env python3
"""Extract brand facts from the designer's source files into code.

Reads    source/CND-linkedin-template-1.psd      (master social template)
         source/cloud_native_denmark_cover_2026.psd
         source/overlays/*.png                    (flattened frames)
Writes   brand/logo/cnd-lockup-cream.svg
         brand/logo/cnd-lockup-navy.svg
         brand/logo/cnd-mark.svg
         brand/geometry.json
         brand/reference/*.png                    (regression targets)

Why two sources rather than one
-------------------------------
PSD vector-mask paths and `origination` radii live in the layer's
*untransformed* space, and several layers carry a scale transform. Taken at
face value they are wrong: the content card's path implies x -3..1084 with a
91px radius, while the exported overlay's real window is x 38..1042 at r=51.

So the split is deliberate:

  frame geometry  -> measured from the overlay PNGs (post-transform truth)
  tab outline     -> PSD vector mask, then verified against the overlay
  type specs      -> PSD engine_dict
  logo artwork    -> PSD embedded smart objects

Setup:  python3 -m venv .venv && .venv/bin/pip install psd-tools pillow numpy
Run:    .venv/bin/python brand/extract.py
Needs:  pdftocairo on PATH (poppler) for the vector conversions.
"""

from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "source"
BRAND = ROOT / "brand"
LOGO_DIR = BRAND / "logo"
REF_DIR = BRAND / "reference"

MASTER_PSD = SOURCE / "CND-linkedin-template-1.psd"
COVER_PSD = SOURCE / "cloud_native_denmark_cover_2026.psd"
OVERLAY_DIR = SOURCE / "overlays"

# Cap-height ratio of Space Grotesk, read from the font's OS/2 sCapHeight
# (700 / 1000 unitsPerEm). Used to turn an ink bbox into a text baseline.
CAP_RATIO = 0.700

# The sand ground the designer composed the hexagon overlay against.
SAND = "#F2E6D5"

# Overlay categories the designer shipped, and the variant suffixes.
CATEGORIES = [
    "speaker-highlights",
    "sponsor-highlights",
    "schedule-announcements",
    "CFP-notifications",
    "clean",
]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def need(path: Path) -> Path:
    if not path.exists():
        sys.exit(f"missing required source file: {path}\nsee the docstring for setup")
    return path


def run(cmd: list[str]) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.exit(f"command failed: {' '.join(cmd)}\n{proc.stderr}")


def pdf_to_svg(pdf_bytes: bytes, out_svg: Path) -> None:
    """Convert an embedded Illustrator payload (PDF-compatible) to SVG."""
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
        fh.write(pdf_bytes)
        tmp = Path(fh.name)
    try:
        run(["pdftocairo", "-svg", str(tmp), str(out_svg)])
    finally:
        tmp.unlink(missing_ok=True)


def pdf_mean_color(pdf_bytes: bytes) -> tuple[float, float, float]:
    """Render a payload and return the mean color of its non-white pixels.

    Used to tell the cream lockup from the navy one without relying on
    byte length or layer order, either of which the designer could change.
    """
    with tempfile.TemporaryDirectory() as td:
        pdf = Path(td) / "x.pdf"
        pdf.write_bytes(pdf_bytes)
        run(["pdftocairo", "-png", "-r", "40", "-singlefile", str(pdf), str(Path(td) / "x")])
        arr = np.array(Image.open(Path(td) / "x.png").convert("RGB")).reshape(-1, 3)
    ink = arr[arr.sum(axis=1) < 720]  # drop near-white background
    if len(ink) == 0:
        return (255.0, 255.0, 255.0)
    return tuple(ink.mean(axis=0))


# --------------------------------------------------------------------------
# logo artwork, from embedded smart objects
# --------------------------------------------------------------------------


def extract_logos(psd: PSDImage) -> dict:
    """Pull the vector lockups and flag mark out of the PSD's smart objects."""
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    seen: dict[int, bytes] = {}
    placements: dict[str, dict] = {}

    for layer in psd.descendants():
        if layer.kind != "smartobject":
            continue
        try:
            data = layer.smart_object.data
        except Exception:
            continue
        if not data.startswith(b"%PDF"):
            continue  # jpg photos and the generative-fill psb
        x0, y0, x1, y1 = layer.bbox
        w, h = x1 - x0, y1 - y0
        seen.setdefault(len(data), data)

        # Classify by footprint. The lockup is a wide block; the mark is
        # roughly square and much smaller.
        if 250 <= w <= 400 and 140 <= h <= 200:
            mean = pdf_mean_color(data)
            name = "cnd-lockup-navy" if sum(mean) < 400 else "cnd-lockup-cream"
            placements.setdefault(
                "lockup", {"x": x0, "y": y0, "w": w, "h": h}
            )
        elif 90 <= w <= 140 and 90 <= h <= 140:
            name = "cnd-mark"
            placements.setdefault("mark", {"x": x0, "y": y0, "w": w, "h": h})
        else:
            continue

        target = LOGO_DIR / f"{name}.svg"
        if not target.exists():
            pdf_to_svg(data, target)
            tighten_svg(target)
            print(f"  logo: {target.name}")

    return placements


def extract_cover_art(psd: PSDImage) -> dict:
    """Pull the cover's own artwork: the hexagon cluster and its lockup.

    The cover uses a different lockup from the social frames — wordmark and
    flag mark combined into one placed object — plus the hexagon cluster that
    also appears on the roll-ups and beachflag.

    Placement comes from the smart-object layer bounds here rather than from
    pixel measurement, because the hexagons are semi-transparent and overlap:
    colour masking cannot separate them. Those bounds are safe to use because
    they are ink bounds, not the padded canvas — the lockup's bbox aspect
    (1.801) matches its ink-cropped artwork, and the whole cover is checked
    against the designer's flattened PNG afterwards.
    """
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    placement: dict[str, dict] = {}

    for layer in psd.descendants():
        if layer.kind != "smartobject" or not layer.visible:
            continue
        try:
            data = layer.smart_object.data
        except Exception:
            continue
        if not data.startswith(b"%PDF"):
            continue
        x0, y0, x1, y1 = layer.bbox
        w, h = x1 - x0, y1 - y0
        name = "cnd-hexagons" if w > h * 1.05 and h > 200 else "cnd-lockup-cover"
        key = "hexagons" if name == "cnd-hexagons" else "lockup"
        placement[key] = {"x": x0, "y": y0, "w": w, "h": h}

        target = LOGO_DIR / f"{name}.svg"
        if not target.exists():
            pdf_to_svg(data, target)
            tighten_svg(target)
            print(f"  cover art: {target.name}  ({w}x{h} at {x0},{y0})")
        # The hexagons are a darkening overlay, so they need a ground-baked
        # twin to survive on navy. See bake_over_ground.
        if name == "cnd-hexagons":
            baked = LOGO_DIR / "cnd-hexagons-solid.svg"
            if not baked.exists():
                bake_over_ground(target, baked, SAND)

    return placement


def bake_over_ground(src: Path, dst: Path, ground_hex: str) -> None:
    """Flatten an SVG's semi-transparent fills against a known ground.

    The hexagon cluster is built as a *darkening overlay*: four shapes at
    fill-opacity 0.5, two of them plain black. Over sand that composites to
    the warm grey, rose and peach in the palette — those three tokens are
    literally the result of this blend. Over navy the same file just darkens
    navy and the cluster disappears.

    Baking the composite against sand once produces artwork that carries its
    intended colours onto any ground, which is what the dark cover needs. It
    is the same picture, not a recolouring: on sand the baked file is
    indistinguishable from the original.

    The transparency does not live on the artwork. pdftocairo renders each
    hexagon as an opaque <path> drawn through a <mask> containing a 50%-alpha
    rect, so baking has two halves: composite each path's fill against the
    ground at the mask's alpha, then neutralise the masks to fully opaque.
    Rewriting fill-opacity alone silently edits the mask rects and changes
    nothing visible — which is exactly the wrong-looking result it replaced.
    """
    ground = np.array([int(ground_hex[i : i + 2], 16) for i in (1, 3, 5)], dtype=float)
    text = src.read_text()

    mask_rect = re.compile(r'(<rect\b[^>]*?fill-opacity=")([\d.]+)(")')
    alphas = {float(m.group(2)) for m in mask_rect.finditer(text)}
    if len(alphas) != 1:
        sys.exit(
            f"{src.name}: expected one mask alpha, found {sorted(alphas)} — "
            "the artwork's structure changed and the bake needs revisiting"
        )
    alpha = alphas.pop()

    def composite(match: re.Match) -> str:
        src_rgb = (
            np.array([float(match["r"]), float(match["g"]), float(match["b"])])
            * 255.0
            / 100.0
        )
        out = alpha * src_rgb + (1.0 - alpha) * ground
        return '{}"{}"'.format(
            match["lead"], "#%02X%02X%02X" % tuple(int(round(v)) for v in out)
        )

    path_fill = re.compile(
        r'(?P<lead><path\b[^>]*?fill=)"rgb\((?P<r>[\d.]+)%,\s*(?P<g>[\d.]+)%,'
        r'\s*(?P<b>[\d.]+)%\)"'
    )
    baked, n_paths = path_fill.subn(composite, text)
    baked, n_masks = mask_rect.subn(r"\g<1>1\g<3>", baked)

    dst.write_text(baked)
    print(
        f"    baked {dst.name}: {n_paths} fills composited at alpha {alpha} "
        f"over {ground_hex}, {n_masks} masks opened"
    )


def extract_metrics() -> dict:
    """Per-character advance widths, so layout code can measure text.

    Without this, nothing downstream knows how wide a line is, and the only
    options are guessing a size or letting long copy collide with artwork —
    which is exactly what happened when a speaker's name overran into the
    portrait hexagon. Advances are in 1/1000 em, so:

        width_px = sum(advances) / 1000 * size_px
                 + tracking_em * size_px * (len(text) - 1)
    """
    from fontTools.ttLib import TTFont

    faces = {
        "SpaceGrotesk-Medium": "SpaceGrotesk-Medium.ttf",
        "SpaceGrotesk-Bold": "SpaceGrotesk-Bold.ttf",
        "Inter-Regular": "Inter-Variable.ttf",
    }
    chars = [chr(c) for c in range(32, 127)] + list("–—’‘“”·°×…")
    out: dict[str, dict] = {}
    for name, filename in faces.items():
        font = TTFont(BRAND / "fonts" / filename)
        upm = font["head"].unitsPerEm
        cmap = font.getBestCmap()
        hmtx = font["hmtx"]
        advances = {}
        for ch in chars:
            glyph = cmap.get(ord(ch))
            if glyph is None:
                continue
            advances[ch] = round(hmtx[glyph][0] * 1000 / upm, 1)
        out[name] = {
            "unitsPerEm": 1000,
            "capHeight": round(font["OS/2"].sCapHeight * 1000 / upm, 1),
            "advances": advances,
        }
        print(f"    metrics: {name}  {len(advances)} glyphs")
    return out


def extract_single_hexagon(cluster: Path, dst: Path) -> dict:
    """Pull one hexagon out of her 4-hexagon cluster, tightened to its own box.

    The cluster ships as one asset, but a scatter and a photo mask both need a
    single hexagon. Taking one of hers rather than drawing a fresh one keeps the
    corner radius and the slightly-off-regular proportions she actually used —
    a generated hexagon reads subtly wrong beside the real cluster.

    Returns the path and viewBox so templates can use it as a clipPath too.
    """
    text = cluster.read_text()
    head = re.search(r"<svg[^>]*>", text).group(0)
    paths = re.findall(
        r'<path[^>]*?fill="(#[0-9A-Fa-f]{6})"[^>]*?d="([^"]+)"', text
    )
    if not paths:
        sys.exit(f"{cluster.name}: no solid-filled paths to take a hexagon from")

    def area(d: str) -> float:
        nums = [float(n) for n in re.findall(r"-?\d+\.?\d*", d)]
        xs, ys = nums[0::2], nums[1::2]
        return (max(xs) - min(xs)) * (max(ys) - min(ys)) if xs else 0.0

    _fill, d = max(paths, key=lambda pf: area(pf[1]))
    vb = re.search(r'viewBox="([\d.\- ]+)"', head)
    view = vb.group(1) if vb else "0 0 100 100"

    probe = dst.with_name("_hexprobe.svg")
    probe.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}">'
        f'<path d="{d}" fill="#000"/></svg>'
    )
    try:
        tighten_svg(probe)
        tight = re.search(r'viewBox="([\d.\- ]+)"', probe.read_text()).group(1)
    finally:
        probe.unlink(missing_ok=True)

    dst.write_text(
        "<!-- GENERATED by brand/extract.py from cnd-hexagons-solid.svg -->\n"
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{tight}">\n'
        f'  <path d="{d}" fill="currentColor"/>\n'
        "</svg>\n"
    )
    print(f"    hexagon: {dst.name}  viewBox {tight}")
    return {"path": d, "viewBox": tight}


def measure_cover(png: Path, left_bound: int, ground_hex: str = SAND) -> dict:
    """Measure the cover's wordmark and mark from the designer's flattened PNG.

    Replaces an earlier attempt that derived these by transferring the social
    footer's internal proportions onto the cover's fused lockup box. That put
    the wordmark 8px low: the cover spaces wordmark and mark slightly
    differently from the social footer, so the ratios do not carry over.
    Measuring the artefact directly avoids the assumption entirely.

    Wordmark and mark cannot be separated by position: "DENMARK." runs on
    underneath the flag, so cutting at the mark's left edge reads the wordmark
    ~37px narrow, and aspect-fit then shrinks the whole lockup. They separate
    by colour instead — every pixel is classified to the nearest of sand,
    navy, red and white, and the wordmark is the navy class. Nearest-colour
    rather than a tolerance band because the hairline "DENMARK." outline is
    mostly antialiased blend: a tight navy match loses it, a loose one starts
    collecting the flag's white.

    A left bound past the hexagon cluster is still needed, since the cluster's
    slate hexagons also classify as navy-ish.
    """
    arr = np.array(Image.open(png).convert("RGB")).astype(int)
    h, w = arr.shape[:2]
    ground = [int(ground_hex[i : i + 2], 16) for i in (1, 3, 5)]

    def denoised_bbox(mask: np.ndarray) -> dict | None:
        pad = np.pad(mask.astype(np.uint8), 1)
        neighbours = sum(
            pad[1 + dy : 1 + dy + mask.shape[0], 1 + dx : 1 + dx + mask.shape[1]]
            for dy in (-1, 0, 1)
            for dx in (-1, 0, 1)
            if (dy, dx) != (0, 0)
        )
        keep = mask & (neighbours >= 2)
        ys, xs = np.where(keep)
        if len(ys) == 0:
            return None
        return {
            "x": int(xs.min()),
            "y": int(ys.min()),
            "w": int(xs.max() - xs.min() + 1),
            "h": int(ys.max() - ys.min() + 1),
        }

    SAND_I, NAVY_I, RED_I = 0, 1, 2
    palette = np.array(
        [ground, [0x19, 0x21, 0x3C], [0xFF, 0x28, 0x1E], [0xFF, 0xFF, 0xFF]],
        dtype=float,
    )
    nearest = np.argmin(
        ((arr[:, :, None, :] - palette[None, None, :, :]) ** 2).sum(axis=3), axis=2
    )

    band = np.zeros((h, w), bool)
    band[:, left_bound:] = True

    mark = denoised_bbox((nearest == RED_I) & band)
    if mark is None:
        sys.exit(f"{png.name}: could not find the flag mark")
    wordmark = denoised_bbox((nearest == NAVY_I) & band)
    if wordmark is None:
        sys.exit(f"{png.name}: could not find the wordmark")

    return {"wordmark": wordmark, "mark": mark}


# --------------------------------------------------------------------------
# tab outline, from the PSD vector mask
# --------------------------------------------------------------------------


def knots_to_path(layer, doc_w: int, doc_h: int) -> str:
    """Convert a shape layer's bezier knots to an SVG path.

    psd-tools gives each knot as (y, x) fractions of document height and
    width, plus incoming ("preceding") and outgoing ("leaving") control
    handles in the same space. A closed path is emitted as cubic segments.
    """

    def pt(v) -> tuple[float, float]:
        y, x = v
        return (round(x * doc_w, 2), round(y * doc_h, 2))

    out: list[str] = []
    for sub in layer.vector_mask.paths:
        ks = list(sub)
        if not ks:
            continue
        start = pt(ks[0].anchor)
        out.append(f"M{start[0]},{start[1]}")
        for i in range(len(ks)):
            cur, nxt = ks[i], ks[(i + 1) % len(ks)]
            c1, c2, end = pt(cur.leaving), pt(nxt.preceding), pt(nxt.anchor)
            out.append(f"C{c1[0]},{c1[1]} {c2[0]},{c2[1]} {end[0]},{end[1]}")
        out.append("Z")
    return " ".join(out)


def tighten_svg(svg: Path) -> None:
    """Crop an extracted SVG's viewBox to the artwork's ink bounds.

    The smart-object canvases carry a lot of empty space — the lockup ink
    fills only about 76% x 59% of its own canvas. Left alone, drawing that
    SVG into an <image> of the lockup's size aspect-fits the whole padded
    canvas, so the artwork lands noticeably smaller and higher than the
    designer placed it. Rasterise once, find the ink, and rewrite the
    viewBox so the file's box *is* the artwork.
    """
    head = svg.read_text()
    m = re.search(r'viewBox="([\d.\-]+) ([\d.\-]+) ([\d.\-]+) ([\d.\-]+)"', head)
    if not m:
        return
    vx, vy, vw, vh = (float(g) for g in m.groups())

    with tempfile.TemporaryDirectory() as td:
        png = Path(td) / "probe.png"
        raster_w = 1600
        run(["rsvg-convert", "-w", str(raster_w), str(svg), "-o", str(png)])
        arr = np.array(Image.open(png).convert("RGBA"))

    ys, xs = np.where(arr[:, :, 3] > 10)
    if len(xs) == 0:
        return
    raster_h = arr.shape[0]
    sx, sy = vw / raster_w, vh / raster_h
    nx = vx + xs.min() * sx
    ny = vy + ys.min() * sy
    nw = (xs.max() - xs.min() + 1) * sx
    nh = (ys.max() - ys.min() + 1) * sy

    out = re.sub(
        r'viewBox="[^"]+"',
        f'viewBox="{nx:.3f} {ny:.3f} {nw:.3f} {nh:.3f}"',
        head,
        count=1,
    )
    out = re.sub(r'width="[^"]+"', f'width="{nw:.3f}pt"', out, count=1)
    out = re.sub(r'height="[^"]+"', f'height="{nh:.3f}pt"', out, count=1)
    svg.write_text(out)
    print(f"    tightened {svg.name}: viewBox -> {nw:.0f}x{nh:.0f}pt")


def path_bbox(path: str) -> dict:
    """Bounding box of the anchor points in an SVG path string.

    Only used to sanity-check an extracted path against the overlay, so
    ignoring control points (which can overshoot) is fine here.
    """
    nums = [float(n) for n in re.findall(r"-?\d+\.?\d*", path)]
    xs, ys = nums[0::2], nums[1::2]
    return {
        "x0": round(min(xs), 1),
        "x1": round(max(xs), 1),
        "y0": round(min(ys), 1),
        "y1": round(max(ys), 1),
    }


# --------------------------------------------------------------------------
# type specs, from engine_dict
# --------------------------------------------------------------------------


def type_specs(layer) -> dict:
    """Font family, size, tracking, leading, caps and fill for a text layer.

    Photoshop stores tracking in 1/1000 em, so 20 -> 0.02em.

    Two things here are easy to get wrong and both matter:

    * The layer's affine transform may scale the type. Body copy in this file
      is unscaled, but the tab label and the year carry a 1.3032 scale, so
      their raw FontSize of 33 and 50 render at 43.0 and 65.2. Always use
      `size_px`, never `size`.
    * The transform may also rotate it. The v1 tab label sits at 30 degrees.
    """
    # psd-tools returns its own String/Integer wrappers here, which json
    # cannot serialize — coerce to plain types. The String repr also carries
    # literal quotes ("'SpaceGrotesk-Medium'"), so strip them.
    fonts = [
        str(f["Name"]).strip("'\"") for f in layer.resource_dict.get("FontSet", [])
    ]
    runs = []
    for run_ in layer.engine_dict["StyleRun"]["RunArray"]:
        d = run_["StyleSheet"]["StyleSheetData"]
        idx = d.get("Font", 0)
        fill = d.get("FillColor", {}).get("Values")
        color = (
            "#%02X%02X%02X" % tuple(round(float(c) * 255) for c in fill[1:4])
            if fill
            else None
        )
        spec = {
            "font": str(fonts[idx]) if idx < len(fonts) else None,
            "size": round(float(d.get("FontSize", 0)), 2),
            "tracking_em": round(int(d.get("Tracking", 0)) / 1000, 4),
            "leading": round(float(d.get("Leading", 0)), 2),
            "uppercase": int(d.get("FontCaps", 0)) == 2,
            "color": color,
        }
        if spec not in runs:
            runs.append(spec)

    xx, xy, _yx, yy, tx, ty = layer.transform
    scale = round(math.hypot(xx, xy), 4)
    rotation = round(math.degrees(math.atan2(xy, xx)), 2)
    for spec in runs:
        spec["size_px"] = round(spec["size"] * scale, 2)
        spec["leading_px"] = round(spec["leading"] * scale, 2)

    x0, y0, x1, y1 = layer.bbox
    w, h = x1 - x0, y1 - y0

    # How many lines the designer's own placeholder occupies. Point text
    # carries explicit returns; box text (the tab label) wraps, so fall back
    # to inferring from the ink height.
    try:
        # Photoshop marks paragraph breaks with ETX (\x03), not \r.
        raw = layer.text.replace("\x03", "\r")
    except Exception:
        raw = ""
    size_px = runs[0]["size_px"] if runs else 0
    cap = CAP_RATIO * size_px
    lines = max(1, raw.count("\r") + 1) if raw else 1
    if lines == 1 and size_px and h > cap * 1.6:
        lines = max(1, round((h - cap) / (size_px * 1.16)) + 1)

    # Leading derived from the designer's block rather than trusted from the
    # PSD. The stored Leading is the same 33.76 on layers of 40, 29 and 49px,
    # so it is a stale auto value and cannot be used for body copy. Ink height
    # of n lines is (n-1)*leading + capHeight, which inverts cleanly.
    leading_derived = (
        round((h - cap) / (lines - 1), 2) if lines > 1 and size_px else None
    )

    return {
        "x": x0,
        "y": y0,
        "w": w,
        "h": h,
        # SVG positions text by baseline. Photoshop's layer transform is the
        # text-box origin, not the baseline, so derive it: the ink top plus
        # one cap height. Verified against the 3-line highlight block, where
        # this and (ink bottom - 2*leading) agree exactly.
        "baseline": round(y0 + cap, 2),
        "lines": lines,
        "leading_derived_px": leading_derived,
        "origin": [round(tx, 2), round(ty, 2)],
        "scale": scale,
        "rotation": rotation,
        "runs": runs,
    }


# The master PSD names its groups in prose; the overlay PNGs use slugs.
# Map explicitly rather than guessing, so a rename fails loudly.
CATEGORY_GROUPS = {
    "Speaker highlights": "speaker-highlights",
    "sponsor highlights": "sponsor-highlights",
    "CFP notifications": "CFP-notifications",
    "schedule announcements": "schedule-announcements",
}

# The two content layouts: v1 places text over a full-bleed photo, v2/v3
# place it inside the card window.
CONTENT_GROUPS = {"Indhold1": "1", "Indhold2": "2"}


def extract_frames(psd: PSDImage) -> tuple[dict, dict]:
    """Per-category, per-variant tab path plus label and year type specs."""
    w, h = psd.size
    frames: dict[str, dict] = {}

    for group in psd:
        if not group.is_group():
            continue
        base, _, suffix = group.name.rpartition(" ")
        if suffix in {"2", "3"} and base in CATEGORY_GROUPS:
            category, variant = CATEGORY_GROUPS[base], suffix
        elif group.name in CATEGORY_GROUPS:
            category, variant = CATEGORY_GROUPS[group.name], "1"
        else:
            continue

        entry: dict = {}
        for layer in group:
            if layer.kind == "shape" and layer.name.startswith("Polygon"):
                path = knots_to_path(layer, w, h)
                entry["tab"] = {"path": path, "bbox": path_bbox(path)}
            elif layer.kind == "type":
                key = "year" if layer.name.strip() == "2026" else "label"
                entry[key] = type_specs(layer)
        frames.setdefault(category, {})[variant] = entry

    content: dict[str, dict] = {}
    for group in psd:
        if group.is_group() and group.name in CONTENT_GROUPS:
            content[CONTENT_GROUPS[group.name]] = {
                layer.name: type_specs(layer)
                for layer in group
                if layer.kind == "type"
            }

    return frames, content


# --------------------------------------------------------------------------
# frame geometry, measured from the overlay PNGs
# --------------------------------------------------------------------------


def measure_overlay(path: Path) -> dict:
    """Measure one flattened overlay. This is the post-transform truth."""
    img = Image.open(path).convert("RGBA")
    arr = np.array(img)
    alpha, rgb = arr[:, :, 3], arr[:, :, :3].astype(int)
    h, w = alpha.shape

    window = alpha < 5
    ys, xs = np.where(window)
    if len(ys) == 0:
        return {"size": [w, h], "content": None}
    cx0, cx1, cy0, cy1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())

    # Corner radius from the bottom-left corner of the window. The top
    # corners are unusable: the tab overlaps them.
    #
    # Measured at the 45-degree crossing rather than by "first row that
    # reaches full width". On a circular corner of radius r the horizontal
    # inset equals the vertical offset exactly when dy = r(1 - 1/sqrt2),
    # i.e. r = dy / 0.2929. That point sits mid-arc where the boundary is
    # steepest and least affected by antialiasing, whereas the tangent end
    # of the arc approaches the edge asymptotically and reads several pixels
    # short.
    radius = 0
    for dy in range(1, 160):
        row = np.where(window[cy1 - dy])[0]
        if len(row) == 0:
            continue
        inset = row.min() - cx0
        if inset <= dy:
            radius = round(dy / (1 - 1 / np.sqrt(2)))
            break

    def mask_for(hex_color: str, tol: int = 12) -> np.ndarray:
        target = [int(hex_color[i : i + 2], 16) for i in (1, 3, 5)]
        close = np.all(np.abs(rgb - target) < tol, axis=2)
        return close & (alpha > 250)

    def ink_bbox(mask: np.ndarray) -> dict | None:
        """Bounding box of a mask, after dropping isolated pixels.

        A plain min/max is at the mercy of antialiasing speckle: one stray
        pixel where the mark's white cross blends toward cream widened the
        lockup box by 22px. But discarding sparse *rows and columns* is too
        blunt — the outlined "DENMARK." is drawn in hairline strokes with
        only one or two pixels per column, and thresholding on column counts
        ate its trailing period.

        Neighbour counting threads between the two: a speckle has no
        neighbours and goes, while a hairline stroke pixel always has
        neighbours along the stroke and stays.
        """
        m = mask.astype(np.uint8)
        padded = np.pad(m, 1)
        neighbours = sum(
            padded[1 + dy : 1 + dy + m.shape[0], 1 + dx : 1 + dx + m.shape[1]]
            for dy in (-1, 0, 1)
            for dx in (-1, 0, 1)
            if (dy, dx) != (0, 0)
        )
        keep = mask & (neighbours >= 2)
        ys_k, xs_k = np.where(keep)
        if len(ys_k) == 0:
            return None
        return {
            "x": int(xs_k.min()),
            "y": int(ys_k.min()),
            "w": int(xs_k.max() - xs_k.min() + 1),
            "h": int(ys_k.max() - ys_k.min() + 1),
        }

    result: dict = {
        "size": [w, h],
        "content": {
            "x": cx0,
            "y": cy0,
            "w": cx1 - cx0 + 1,
            "h": cy1 - cy0 + 1,
            "r": radius,
        },
        "opaque_fraction": round(float((alpha > 250).sum()) / alpha.size, 4),
    }

    # The red tab: red pixels in the top third only, so the outline year
    # near the bottom does not contaminate the measurement.
    red = mask_for("#FF281E")
    top = red[: h // 3]
    ys_t, xs_t = np.where(top)
    if len(ys_t):
        result["tab"] = {
            "x": int(xs_t.min()),
            "y": int(ys_t.min()),
            "w": int(xs_t.max() - xs_t.min() + 1),
            "h": int(ys_t.max() - ys_t.min() + 1),
        }

    # Ground colour: the most common fully-opaque pixel.
    op = rgb[alpha > 250]
    if len(op):
        vals, counts = np.unique(op, axis=0, return_counts=True)
        r, g, b = vals[counts.argmax()]
        result["ground"] = "#%02X%02X%02X" % (r, g, b)

    # The v1 layout separates the photo from the footer band with a
    # full-width red rule. Detected before the footer artwork below, because
    # the rule is itself red and left of centre and would otherwise be
    # swallowed into the mark's bounding box.
    full_red_rows = [
        int(y) for y in range(h) if red[y].sum() >= w - 2 and y > cy1 - 40
    ]
    if full_red_rows:
        result["rule"] = {
            "y": full_red_rows[0],
            "h": full_red_rows[-1] - full_red_rows[0] + 1,
        }
        band_top = full_red_rows[-1] + 1
        result["band"] = {"y": band_top, "h": h - band_top}

    # Footer artwork, measured rather than taken from the PSD layer bounds
    # (which describe the placed canvas, padding included, not the ink).
    #
    # The three footer elements separate cleanly by colour and position:
    #   lockup  the only ink in the *opposite* tone to the ground — cream on
    #           the navy variants, navy on the sand variant. The year's fill
    #           matches the ground by design, so it contributes nothing here.
    #   mark    red, and always left of centre; the year's red stroke is right
    #           of centre, so an x split separates them.
    footer_top = (
        result["rule"]["y"] + result["rule"]["h"] if "rule" in result else cy1 + 1
    )
    ground_is_dark = result.get("ground", "").upper() == "#19213C"
    lockup_ink = mask_for("#F2E6D5" if ground_is_dark else "#19213C", tol=14)
    lockup_ink[:footer_top] = False
    if box := ink_bbox(lockup_ink):
        result["lockup"] = box

    mark_ink = red.copy()
    mark_ink[:footer_top] = False
    mark_ink[:, w // 2 :] = False
    if box := ink_bbox(mark_ink):
        result["mark"] = box

    return result


def measure_overlays() -> dict:
    REF_DIR.mkdir(parents=True, exist_ok=True)
    out: dict[str, dict] = {}
    for png in sorted(OVERLAY_DIR.glob("CND-linkedin-template-*.png")):
        m = re.match(r"CND-linkedin-template-(.+)-(\d)\.png$", png.name)
        if not m:
            continue
        category, variant = m.group(1), m.group(2)
        shutil.copy2(png, REF_DIR / png.name)
        out.setdefault(category, {})[variant] = measure_overlay(png)
        print(f"  measured: {category} v{variant}")
    return out


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def main() -> None:
    for p in (MASTER_PSD, COVER_PSD, OVERLAY_DIR):
        need(p)

    print("reading master template PSD ...")
    master = PSDImage.open(MASTER_PSD)
    doc_w, doc_h = master.size

    print("extracting logo artwork ...")
    placements = extract_logos(master)

    print("extracting tab outlines and type specs ...")
    frames, content = extract_frames(master)

    print("reading cover PSD ...")
    cover = PSDImage.open(COVER_PSD)
    cover_text = {
        layer.name: type_specs(layer)
        for layer in cover.descendants()
        if layer.kind == "type"
    }
    cover_placement = extract_cover_art(cover)
    cover_ref = SOURCE / "cloud_native_denmark_cover_2026.png"
    if cover_ref.exists():
        REF_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(cover_ref, REF_DIR / cover_ref.name)

    print("extracting font metrics ...")
    metrics = extract_metrics()

    print("extracting a single hexagon ...")
    hexagon = extract_single_hexagon(
        LOGO_DIR / "cnd-hexagons-solid.svg", LOGO_DIR / "cnd-hexagon.svg"
    )

    print("measuring overlays ...")
    overlays = measure_overlays()

    # Wordmark and mark are measured off the designer's flattened cover so the
    # cover can use per-theme colourways of the separate assets.
    if cover_ref.exists():
        hexes = cover_placement["hexagons"]
        cover_placement.update(
            measure_cover(cover_ref, left_bound=hexes["x"] + hexes["w"])
        )

    geometry = {
        "$generated": "brand/extract.py — do not hand-edit",
        "$sources": {
            "geometry": "measured from source/overlays/*.png (post-transform)",
            "tab": "PSD vector mask, verified against the overlay",
            "type": "PSD engine_dict",
            "logos": "PSD embedded smart objects",
        },
        "canvas": {"w": doc_w, "h": doc_h},
        "metrics": metrics,
        "hexagon": hexagon,
        "frames": frames,
        "content": content,
        "placement": placements,
        "cover": {
            "canvas": list(cover.size),
            "text": cover_text,
            "placement": cover_placement,
        },
        "overlays": overlays,
    }

    out = BRAND / "geometry.json"
    out.write_text(json.dumps(geometry, indent=2) + "\n")
    print(f"\nwrote {out.relative_to(ROOT)}")
    print(f"  {len(overlays)} categories, {sum(len(v) for v in overlays.values())} variants")
    print(f"  logos in {LOGO_DIR.relative_to(ROOT)}: {sorted(p.name for p in LOGO_DIR.glob('*.svg'))}")


if __name__ == "__main__":
    main()
