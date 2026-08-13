#!/usr/bin/env python3
"""Sweep the tab-glow parameters to minimise disagreement with the reference.

The tab carries a Photoshop outer-glow layer effect. A CSS/SVG drop-shadow
has a different falloff curve, so the blur radius and opacity that best
approximate it have to be found empirically rather than read out of the PSD.

    .venv/bin/python test/calibrate_glow.py

Prints a grid of mean RGB error over the tab's neighbourhood and reports the
best pair. Feed the winner back into the defaults in graphics/render.mjs.
"""
from __future__ import annotations
import json, os, subprocess, sys, tempfile
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "brand" / "reference" / "CND-linkedin-template-speaker-highlights-2.png"
GEOM = json.loads((ROOT / "brand" / "geometry.json").read_text())

def score(blur: float, opacity: float, tmp: Path) -> float:
    env = dict(os.environ, CND_TAB_GLOW_BLUR=str(blur), CND_TAB_GLOW_OPACITY=str(opacity))
    subprocess.run(
        ["node", str(ROOT / "graphics" / "render.mjs"), "speaker-highlight",
         "--variant", "2", "--frame", "--out", str(tmp)],
        check=True, capture_output=True, env=env,
    )
    a = np.array(Image.open(tmp).convert("RGBA")).astype(float)
    b = np.array(Image.open(REF).convert("RGBA")).astype(float)
    # Restrict to the tab's neighbourhood, where the glow lives, and to
    # pixels the reference paints opaquely.
    tab = GEOM["overlays"]["speaker-highlights"]["2"]["tab"]
    y0, y1 = 0, tab["y"] + tab["h"] + 120
    x0, x1 = max(0, tab["x"] - 120), tab["x"] + tab["w"] + 120
    a, b = a[y0:y1, x0:x1], b[y0:y1, x0:x1]
    ink = b[:, :, 3] > 250
    if not ink.any():
        return 0.0
    d = np.sqrt(((a[:, :, :3] - b[:, :, :3]) ** 2).sum(axis=2))
    return float(d[ink].mean())

def main() -> int:
    blurs = [0, 8, 14, 20, 26, 32, 40]
    opacities = [0.25, 0.4, 0.5, 0.65, 0.8]
    best = (1e9, None)
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "probe.png"
        print("blur \\ opacity  " + "  ".join(f"{o:>6}" for o in opacities))
        for blur in blurs:
            row = []
            for op in opacities:
                s = score(blur, op, tmp)
                row.append(s)
                if s < best[0]:
                    best = (s, (blur, op))
            print(f"{blur:>13}  " + "  ".join(f"{v:6.2f}" for v in row))
    print(f"\nbest: blur={best[1][0]} opacity={best[1][1]}  (tab-region dE {best[0]:.2f})")
    return 0

if __name__ == "__main__":
    sys.exit(main())
