#!/usr/bin/env python3
"""Compare our rendered frames against the designer's own overlay PNGs.

This is the regression gate for the graphics engine. For every category and
variant the designer shipped, render the frame furniture with the content
window empty and compare it to her flattened overlay.

    .venv/bin/python test/pixel_diff.py            # all categories
    .venv/bin/python test/pixel_diff.py --category speaker-highlights
    .venv/bin/python test/pixel_diff.py --write-diff   # emit diff images

Two numbers are reported per frame, because they fail for different reasons:

  ink dE   Mean RGB distance over pixels the reference paints opaquely. This
           is the one that catches real geometry drift — a tab a few pixels
           off, a wrong corner radius, a mispositioned lockup.

  alpha    Mean alpha difference over the whole canvas. This catches the
           content window being the wrong size or shape, since that region
           is transparent in both images.

The thresholds are deliberately not zero. The tab carries a Photoshop
outer-glow layer effect which a CSS drop-shadow approximates rather than
reproduces, and text rasterises slightly differently in Chrome than in
Photoshop. What matters is that the numbers stay put; a jump means something
moved.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REF_DIR = ROOT / "brand" / "reference"
OUT_DIR = ROOT / "graphics" / "out" / "diff"

# Calibrated against the current renderer, with headroom over the worst
# observed values (v1 frames sit at 14.5 dE, alpha at 0.42). Tight enough
# that a moved element trips it. Raise only with a stated reason.
INK_DE_MAX = 16.0
ALPHA_MAX = 1.5

# The cover is checked whole rather than frame-only: the designer shipped a
# finished 1128x191 artwork, so we re-render her exact copy and compare
# everything. Floor is 1.41 dE from a colour-profile offset in her export
# (#F3E6D6 where the palette says #F2E6D5), so this cannot reach zero.
COVER_REF = "cloud_native_denmark_cover_2026.png"
COVER_DE_MAX = 12.0

# Category -> the template that draws it.
TEMPLATE_FOR = {
    "speaker-highlights": "speaker-highlight",
    "sponsor-highlights": "sponsor-highlight",
    "schedule-announcements": "schedule-announcement",
    "CFP-notifications": "cfp-notification",
}


def render_frame(category: str, variant: str, out: Path) -> None:
    subprocess.run(
        [
            "node",
            str(ROOT / "graphics" / "render.mjs"),
            TEMPLATE_FOR[category],
            "--variant",
            variant,
            "--category",
            category,
            "--frame",
            "--out",
            str(out),
        ],
        check=True,
        capture_output=True,
    )


def compare(ours: Path, reference: Path, write_diff: bool) -> tuple[float, float]:
    a = np.array(Image.open(ours).convert("RGBA")).astype(float)
    b = np.array(Image.open(reference).convert("RGBA")).astype(float)
    if a.shape != b.shape:
        sys.exit(f"size mismatch: {ours.name} {a.shape} vs {reference.name} {b.shape}")

    alpha_mae = float(np.abs(a[:, :, 3] - b[:, :, 3]).mean())

    ink = b[:, :, 3] > 250
    if not ink.any():
        return 0.0, alpha_mae
    delta = np.sqrt(((a[:, :, :3] - b[:, :, :3]) ** 2).sum(axis=2))
    ink_de = float(delta[ink].mean())

    if write_diff:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        heat = np.zeros(a.shape[:2] + (3,), dtype=np.uint8)
        scaled = np.clip(delta / 3.0, 0, 255).astype(np.uint8)
        heat[:, :, 0] = scaled  # red channel = magnitude of disagreement
        heat[:, :, 2] = (ink * 60).astype(np.uint8)  # blue tint = compared area
        Image.fromarray(heat).save(OUT_DIR / f"diff-{reference.stem}.png")

    return ink_de, alpha_mae


def check_cover(write_diff: bool) -> tuple[float, bool] | None:
    """Re-render the designer's own cover copy and compare the whole canvas."""
    reference = REF_DIR / COVER_REF
    if not reference.exists():
        return None
    out = ROOT / "graphics" / "out" / "frames" / "cover-check.png"
    subprocess.run(
        ["node", str(ROOT / "graphics" / "render.mjs"), "linkedin-cover",
         "--theme", "light", "--line1", "Copen", "--line2", "Hagen",
         "--out", str(out)],
        check=True, capture_output=True,
    )
    a = np.array(Image.open(out).convert("RGB")).astype(float)
    b = np.array(Image.open(reference).convert("RGB")).astype(float)
    if a.shape != b.shape:
        sys.exit(f"cover size mismatch: {a.shape} vs {b.shape}")
    delta = np.sqrt(((a - b) ** 2).sum(axis=2))
    if write_diff:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        Image.fromarray(np.clip(delta / 2, 0, 255).astype(np.uint8)).save(
            OUT_DIR / "diff-cover.png"
        )
    mean = float(delta.mean())
    return mean, mean <= COVER_DE_MAX


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", help="limit to one category")
    ap.add_argument("--write-diff", action="store_true")
    args = ap.parse_args()

    categories = [args.category] if args.category else sorted(TEMPLATE_FOR)
    tmp = ROOT / "graphics" / "out" / "frames"
    tmp.mkdir(parents=True, exist_ok=True)

    print(f"{'frame':44} {'ink dE':>8} {'alpha':>7}   verdict")
    print("-" * 74)
    failures = 0
    for category in categories:
        for variant in ("1", "2", "3"):
            reference = REF_DIR / f"CND-linkedin-template-{category}-{variant}.png"
            if not reference.exists():
                continue
            ours = tmp / f"{category}-{variant}-frame.png"
            render_frame(category, variant, ours)
            ink_de, alpha_mae = compare(ours, reference, args.write_diff)
            ok = ink_de <= INK_DE_MAX and alpha_mae <= ALPHA_MAX
            failures += not ok
            print(
                f"{category + ' v' + variant:44} {ink_de:8.2f} {alpha_mae:7.2f}   "
                f"{'ok' if ok else 'FAIL'}"
            )

    cover = check_cover(args.write_diff)
    if cover is not None:
        mean, ok = cover
        failures += not ok
        print(f"{'linkedin cover (whole canvas)':44} {mean:8.2f} {'—':>7}   "
              f"{'ok' if ok else 'FAIL'}")

    print("-" * 74)
    print(f"thresholds: ink dE <= {INK_DE_MAX}, alpha <= {ALPHA_MAX}, "
          f"cover dE <= {COVER_DE_MAX}")
    if failures:
        print(f"\n{failures} frame(s) outside threshold")
        print("re-run with --write-diff and inspect graphics/out/diff/")
        return 1
    print("\nall frames within threshold")
    return 0


if __name__ == "__main__":
    sys.exit(main())
