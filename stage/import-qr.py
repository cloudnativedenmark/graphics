#!/usr/bin/env python3
"""
Read QR codes out of PNGs into content/2026-qr.json, for the wall to redraw.

    .venv/bin/python stage/import-qr.py ~/Downloads/feedback-qr.zip
    .venv/bin/python stage/import-qr.py --as <name> code.png

Sessionize exports its session feedback codes as one PNG per session, named
<title>_<speakers>_<session id>_feedback-code.png; those are keyed by the
session id, which stage/build.mjs matches to the schedule. Any other PNG is
keyed by --as (or its file name).

The wall doesn't show the PNGs. They are black on white with a caption
underneath; the wall wants navy modules on a white brand hexagon at any size.
So this reads the module grid and the build draws it as one SVG path.

The centre logo Sessionize prints over the code is left blank: the code's
error correction already covers those modules. Every grid is checked against
the code's own fixed parts (finders, timing rows, both copies of the format
bits), which fail loudly if the grid is misread.
"""

import json
import re
import sys
import zipfile
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "content" / "2026-qr.json"
SESSION = re.compile(r"_(\d+)_feedback-code\.png$")


def read_grid(img):
    """The module matrix of the code in img, rows of 0/1, and the modules
    that are not one flat colour (the logo)."""
    g = img.convert("L")
    w, h = g.size
    px = g.load()
    dark = lambda x, y: px[x, y] < 128
    # The top-left finder's top edge is the first dark row; its width is 7 modules.
    y0 = next(y for y in range(h) if any(dark(x, y) for x in range(w)))
    xs = [x for x in range(w) if dark(x, y0)]
    x0 = xs[0]
    run = next(i for i, x in enumerate(xs) if x != x0 + i)
    m = run / 7
    n = round((xs[-1] + 1 - x0) / m)
    if (n - 17) % 4:
        raise ValueError(f"{n} modules across is not a QR size")
    rows, mixed = [], set()
    inset = max(1, int(m * 0.2))
    for r in range(n):
        row = ""
        for c in range(n):
            bx, by = int(x0 + c * m), int(y0 + r * m)
            block = [dark(x, y) for y in range(by + inset, int(by + m) - inset) for x in range(bx + inset, int(bx + m) - inset)]
            share = sum(block) / len(block)
            if 0.1 < share < 0.9:
                mixed.add((r, c))
            row += "1" if share >= 0.5 else "0"
        rows.append(row)
    return rows, mixed


def blank_logo(rows, mixed):
    """Clear the box around the mixed modules near the centre."""
    n = len(rows)
    near = [(r, c) for r, c in mixed if n * 0.25 < r < n * 0.75 and n * 0.25 < c < n * 0.75]
    if not near:
        return rows, 0
    r0, r1 = min(r for r, _ in near), max(r for r, _ in near)
    c0, c1 = min(c for _, c in near), max(c for _, c in near)
    out = [
        "".join("0" if r0 <= r <= r1 and c0 <= c <= c1 else ch for c, ch in enumerate(row))
        for r, row in enumerate(rows)
    ]
    return out, (r1 - r0 + 1) * (c1 - c0 + 1)


FORMAT_MASK = 0b101010000010010


def bch_ok(bits):
    """A format string is 5 data bits and a BCH(15,5) remainder."""
    v = bits ^ FORMAT_MASK
    rem = v
    for i in range(14, 9, -1):
        if rem >> i & 1:
            rem ^= 0b10100110111 << (i - 10)
    return rem == 0


def check(rows):
    n = len(rows)
    bit = lambda r, c: rows[r][c] == "1"
    finder = ["1111111", "1000001", "1011101", "1011101", "1011101", "1000001", "1111111"]
    for r0, c0 in [(0, 0), (0, n - 7), (n - 7, 0)]:
        for i in range(7):
            if rows[r0 + i][c0 : c0 + 7] != finder[i]:
                raise ValueError(f"finder at {r0},{c0} misread")
    for i in range(8, n - 8):
        if bit(6, i) != (i % 2 == 0) or bit(i, 6) != (i % 2 == 0):
            raise ValueError("timing pattern misread")
    # Format bits, copy one around the top-left finder, copy two split
    # between the other two.
    one = [(8, c) for c in (0, 1, 2, 3, 4, 5, 7, 8)] + [(r, 8) for r in (7, 5, 4, 3, 2, 1, 0)]
    two = [(r, 8) for r in range(n - 1, n - 8, -1)] + [(8, c) for c in range(n - 8, n)]
    a = int("".join("1" if bit(r, c) else "0" for r, c in one), 2)
    b = int("".join("1" if bit(r, c) else "0" for r, c in two), 2)
    if a != b or not bch_ok(a):
        raise ValueError("format bits misread")
    if not bit(n - 8, 8):
        raise ValueError("dark module misread")


def sources(args):
    for a in args:
        p = Path(a).expanduser()
        if p.suffix == ".zip":
            with zipfile.ZipFile(p) as z:
                for name in sorted(z.namelist()):
                    if name.lower().endswith(".png") and not name.startswith("__MACOSX"):
                        yield Path(name).name, Image.open(BytesIO(z.read(name)))
        elif p.is_dir():
            for f in sorted(p.glob("*.png")):
                yield f.name, Image.open(f)
        else:
            yield p.name, Image.open(p)


def main():
    argv = sys.argv[1:]
    key = None
    if "--as" in argv:
        i = argv.index("--as")
        key = argv[i + 1]
        del argv[i : i + 2]
    if not argv:
        sys.exit(__doc__)
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    codes = data.get("codes", {})
    for name, img in sources(argv):
        m = SESSION.search(name)
        k = m.group(1) if m else key or Path(name).stem
        rows, mixed = read_grid(img)
        rows, blanked = blank_logo(rows, mixed)
        try:
            check(rows)
        except ValueError as e:
            sys.exit(f"{name}: {e}")
        codes[k] = {"from": name, "rows": rows}
        print(f"  {k:>8}  {len(rows)}×{len(rows)}  logo {blanked:>2} modules blank  {name}")
    data = {
        "$comment": "GENERATED by stage/import-qr.py from the QR PNGs — do not edit; re-import. Keys are Sessionize session ids (feedback) or a name (photos). `rows` is the module grid, 1 = dark.",
        "codes": dict(sorted(codes.items())),
    }
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"content/2026-qr.json  {len(codes)} codes")


main()
