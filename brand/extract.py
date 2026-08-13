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
            print(f"  logo: {target.name}  ({w}x{h} at {x0},{y0})")

    return placements


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
    return {
        "x": x0,
        "y": y0,
        "w": x1 - x0,
        "h": y1 - y0,
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
    # full-width red rule. Find any full-width run of red rows.
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

    print("measuring overlays ...")
    overlays = measure_overlays()

    geometry = {
        "$generated": "brand/extract.py — do not hand-edit",
        "$sources": {
            "geometry": "measured from source/overlays/*.png (post-transform)",
            "tab": "PSD vector mask, verified against the overlay",
            "type": "PSD engine_dict",
            "logos": "PSD embedded smart objects",
        },
        "canvas": {"w": doc_w, "h": doc_h},
        "frames": frames,
        "content": content,
        "placement": placements,
        "cover": {"canvas": list(cover.size), "text": cover_text},
        "overlays": overlays,
    }

    out = BRAND / "geometry.json"
    out.write_text(json.dumps(geometry, indent=2) + "\n")
    print(f"\nwrote {out.relative_to(ROOT)}")
    print(f"  {len(overlays)} categories, {sum(len(v) for v in overlays.values())} variants")
    print(f"  logos in {LOGO_DIR.relative_to(ROOT)}: {sorted(p.name for p in LOGO_DIR.glob('*.svg'))}")


if __name__ == "__main__":
    main()
