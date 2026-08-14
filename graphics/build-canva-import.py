#!/usr/bin/env python3
"""Build a self-contained HTML file for Canva's import-design-from-url.

    .venv/bin/python graphics/build-canva-import.py

Writes graphics/out/canva-import/cnd-templates.html — one page per template,
each marked with data-document-role="page" as Canva's importer expects.

Why HTML rather than the PNG kit
--------------------------------
Canva's editing API cannot create a text element and cannot set font family,
so a design assembled through it is neither laid out nor typeset correctly.
The importer is the way around that: it turns HTML into *native* Canva
elements, so headlines arrive as real text boxes somebody can retype.

Everything is inlined — fonts as base64 woff2, logos as base64 SVG — so the
file works from any URL with no sibling assets. Nothing here is a flattened
screenshot; the frame is real shapes and the copy is real text.

Positioning
-----------
geometry.json stores text *baselines*, because that is what Photoshop and SVG
both use. CSS positions a box by its top edge, so each baseline is converted:
with line-height 1, the baseline sits 0.846em below the box top, from Space
Grotesk's own metrics (ascent 984, descent 292, per 1000 em):

    half-leading = (1 - (984 + 292)/1000) / 2 = -0.138em
    baseline     = half-leading + ascent      =  0.846em

Getting this wrong is a silent few-pixel drift, which is exactly the class of
error the pixel diff exists to catch on the rendering side.

Hosting
-------
The importer needs an already-public HTTPS URL and this script does not upload
anywhere. Put the file on a site you already run — cloudnativedenmark.dk —
then hand the URL to import-design-from-url.
"""

from __future__ import annotations

import base64
import io
import sys
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "graphics" / "out" / "canva-import"

# Space Grotesk metrics, from the font's own OS/2 and hhea tables.
BASELINE_EM = 0.846
CAP_RATIO = 0.700

# Latin-1 plus the punctuation the templates actually use.
SUBSET = "U+0020-007E,U+00A0-00FF,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+00B7,U+00B0,U+00AA"


def b64_font(path: Path, tmp: Path, instance: str | None = None) -> str:
    """Subset to woff2, optionally pinning a variable font to one instance.

    Inter ships variable-only. Canva substitutes variable fonts, so it is
    pinned to a static weight before subsetting.
    """
    src = path
    if instance:
        src = tmp / (path.stem + "-static.ttf")
        subprocess.run(
            [
                str(ROOT / ".venv" / "bin" / "fonttools"), "varLib.instancer",
                "-o", str(src), str(path), *instance.split(),
            ],
            check=True, capture_output=True,
        )
    dst = tmp / (path.stem + ".woff2")
    subprocess.run(
        [
            str(ROOT / ".venv" / "bin" / "pyftsubset"), str(src),
            f"--unicodes={SUBSET}", "--flavor=woff2", f"--output-file={dst}",
        ],
        check=True, capture_output=True,
    )
    return base64.b64encode(dst.read_bytes()).decode()


def svg_as_png_uri(path: Path, width: int = 700) -> str:
    """Rasterise an SVG and return it as a PNG data URI.

    Canva's importer does not handle `data:image/svg+xml` inside an <image>.
    When it hits one it drops the *entire* enclosing <svg> — so a sponsor page
    lost its hexagons and its logo together and Canva substituted a stock
    background. The only sponsor pages that survived the first import were the
    two whose logos happened to be PNG.

    So every SVG that ends up in an <img> or <image> is rasterised here. The
    renderer still uses the vector originals; this is a Canva-only concession.
    """
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "asset.png"
        subprocess.run(
            ["rsvg-convert", "-w", str(width), str(path), "-o", str(out)],
            check=True, capture_output=True,
        )
        return (
            "data:image/png;base64,"
            + base64.b64encode(out.read_bytes()).decode()
        )


def image_uri(path: Path, width: int = 700) -> str:
    """Data URI for any asset, always in a raster format Canva accepts."""
    if path.suffix.lower() == ".svg":
        return svg_as_png_uri(path, width)
    return b64_image(path)


def b64_svg(path: Path) -> str:
    """Kept for callers that need the raw SVG; prefer svg_as_png_uri."""
    return base64.b64encode(path.read_bytes()).decode()


# Photos are inlined, so they must be sized for their slot rather than shipped
# at source resolution. The largest hexagon is 430px wide, so 900px covers a 2x
# export with room to spare. Skipping this put 2048px headshots in the file and
# took it to 17MB, which is not something to hand to an importer.
MAX_PHOTO_PX = 900


def b64_image(path: Path) -> str:
    """Inline an image as a data URI, downscaling rasters to their slot.

    Everything ships inside the one HTML file, so an import needs no sibling
    assets and no hosting. Vector stays vector; rasters are resampled and
    re-encoded.
    """
    if path.suffix.lower() == ".svg":
        return (
            "data:image/svg+xml;base64,"
            + base64.b64encode(path.read_bytes()).decode()
        )

    from PIL import Image

    img = Image.open(path)
    if max(img.size) > MAX_PHOTO_PX:
        scale = MAX_PHOTO_PX / max(img.size)
        img = img.resize(
            (round(img.width * scale), round(img.height * scale)),
            Image.LANCZOS,
        )
    buf = io.BytesIO()
    if img.mode in ("RGBA", "LA", "P"):
        # Keep transparency for logos that rely on it.
        img.convert("RGBA").save(buf, "PNG", optimize=True)
        mime = "image/png"
    else:
        img.convert("RGB").save(buf, "JPEG", quality=86, optimize=True)
        mime = "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(buf.getvalue()).decode()}"


def text_width(metrics: dict, face: str, text: str, size: float,
               tracking: float = 0.0) -> float:
    """Width of a line in px, from the extracted advance widths."""
    table = metrics.get(face)
    if not table:
        return len(text) * size * 0.55
    advances = table["advances"]
    em = sum(advances.get(ch, 550) for ch in text)
    return em / 1000 * size + tracking * size * max(0, len(text) - 1)


def fit_size(metrics: dict, face: str, lines: list[str], start: float,
             max_width: float, tracking: float) -> float:
    """Largest size at or below `start` whose longest line fits.

    Mirrors fitSize in render.mjs. Without it the HTML pages would collide
    where the PNGs do not, because only the renderer was measuring text.
    """
    size = start
    while size > 24:
        widest = max(text_width(metrics, face, l, size, tracking) for l in lines)
        if widest <= max_width:
            break
        size -= 2
    return size


def mark_for(box: dict) -> dict:
    """Place the flag mark against a wordmark box, per her measured lockup.

    The mark sits to the *upper right* of the wordmark, overlapping the "CLOUD
    NATIVE" lines — it does not lead the lockup. Ratios come from the measured
    footer: wordmark 271x160 at (86, 1111), mark 114x112 at (311, 1081).
    """
    return {
        "x": box["x"] + 0.8303 * box["w"],
        "y": box["y"] - 0.1875 * box["h"],
        "w": 0.4207 * box["w"],
        "h": 0.7 * box["h"],
    }


def top_for(baseline: float, size: float) -> float:
    """CSS top edge of a line-height:1 text box whose baseline is `baseline`."""
    return round(baseline - BASELINE_EM * size, 2)


def esc(s: str) -> str:
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )


def main() -> int:
    geometry = json.loads((ROOT / "brand" / "geometry.json").read_text())
    tokens = json.loads((ROOT / "brand" / "tokens.json").read_text())
    color = tokens["color"]
    canvas_w = geometry["canvas"]["w"]
    canvas_h = geometry["canvas"]["h"]
    OUT.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        sg_medium = b64_font(ROOT / "brand" / "fonts" / "SpaceGrotesk-Medium.ttf", tmp)
        sg_bold = b64_font(ROOT / "brand" / "fonts" / "SpaceGrotesk-Bold.ttf", tmp)
        inter = b64_font(
            ROOT / "brand" / "fonts" / "Inter-Variable.ttf", tmp,
            instance="wght=400 opsz=14",
        )

    lockups = {
        "cream": svg_as_png_uri(ROOT / "brand" / "logo" / "cnd-lockup-cream.svg", 600),
        "navy": svg_as_png_uri(ROOT / "brand" / "logo" / "cnd-lockup-navy.svg", 600),
    }
    mark_uri = svg_as_png_uri(ROOT / "brand" / "logo" / "cnd-mark.svg", 300)
    hexagons_uri = svg_as_png_uri(
        ROOT / "brand" / "logo" / "cnd-hexagons-solid.svg", 1300
    )

    year_spec = next(
        v["2"]["year"] for v in geometry["frames"].values() if v.get("2")
    )

    def footer(overlay: dict, on_light: bool) -> str:
        lock = overlay["lockup"]
        mark = overlay["mark"]
        run = year_spec["runs"][0]
        size = run["size_px"]
        return (
            f'<img class="lockup" src="'
            f'{lockups["navy"] if on_light else lockups["cream"]}" '
            f'style="left:{lock["x"]}px;top:{lock["y"]}px;'
            f'width:{lock["w"]}px;height:{lock["h"]}px" alt="Cloud Native Denmark">'
            f'<img class="mark" src="{mark_uri}" '
            f'style="left:{mark["x"]}px;top:{mark["y"]}px;'
            f'width:{mark["w"]}px;height:{mark["h"]}px" alt="">'
            f'<div class="t year" style="left:{year_spec["x"]}px;'
            f'top:{top_for(year_spec["baseline"], size)}px;font-size:{size}px;'
            f'--stroke-ground:{overlay["ground"]}">{tokens["event"]["year"]}</div>'
        )

    def tab(category: str, variant: str, label_text: str) -> str:
        spec = geometry["frames"].get(category, {}).get(variant)
        if not spec or "tab" not in spec:
            return ""
        label = spec["label"]
        run = label["runs"][0]
        cx = round(label["x"] + label["w"] / 2, 2)
        cy = round(label["y"] + label["h"] / 2, 2)
        rot = label["rotation"]
        lines = label_text.split("|")
        lead = label["leading_derived_px"] or run["size_px"] * 1.16
        block_top = top_for(label["baseline"], run["size_px"])
        transform = (
            f"transform:rotate({rot}deg);transform-origin:{cx}px {cy}px;"
            if rot
            else ""
        )
        return (
            f'<svg class="tab" viewBox="0 0 {canvas_w} {canvas_h}" '
            f'width="{canvas_w}" height="{canvas_h}">'
            f'<path d="{spec["tab"]["path"]}" fill="{color["red"]}"/></svg>'
            f'<div class="t tab-label" style="left:0;right:0;'
            f'top:{block_top}px;font-size:{run["size_px"]}px;'
            f'line-height:{round(lead / run["size_px"], 4)};'
            f'text-align:center;{transform}">'
            + "<br>".join(esc(l.strip().upper()) for l in lines)
            + "</div>"
        )

    def statement_page(
        category: str, variant: str, label_text: str, name: str, role: str,
        highlight: str, page_label: str,
    ) -> str:
        overlay = geometry["overlays"][category][variant]
        content = geometry["content"]["1" if variant == "1" else "2"]
        box = overlay["content"]
        on_light = overlay["ground"].upper() == color["sand"].upper()
        keys = list(content)
        name_s, role_s, high_s = (content[k] for k in keys[:3])

        parts = [f'<div class="ground" style="background:{overlay["ground"]}"></div>']
        if variant == "1":
            parts.append(
                f'<div class="window photo" style="left:{box["x"]}px;top:{box["y"]}px;'
                f'width:{box["w"]}px;height:{box["h"]}px"></div>'
            )
            rule = overlay.get("rule")
            if rule:
                parts.append(
                    f'<div class="rule" style="top:{rule["y"]}px;'
                    f'height:{rule["h"]}px;background:{color["red"]}"></div>'
                )
        else:
            parts.append(
                f'<div class="window card" style="left:{box["x"]}px;top:{box["y"]}px;'
                f'width:{box["w"]}px;height:{box["h"]}px;'
                f'border-radius:{box["r"]}px"></div>'
            )
        parts.append(tab(category, variant, label_text))

        for spec, text, weight in (
            (name_s, name.upper(), 500),
            (role_s, role.upper(), 500),
        ):
            run = spec["runs"][0]
            parts.append(
                f'<div class="t" style="left:{spec["x"]}px;'
                f'top:{top_for(spec["baseline"], run["size_px"])}px;'
                f'font-size:{run["size_px"]}px;font-weight:{weight};'
                f'color:{run["color"]};'
                f'letter-spacing:{run["tracking_em"]}em">{esc(text)}</div>'
            )
        run = high_s["runs"][0]
        lead = high_s["leading_derived_px"] or run["size_px"] * 1.21
        parts.append(
            f'<div class="t" style="left:{high_s["x"]}px;'
            f'top:{top_for(high_s["baseline"], run["size_px"])}px;'
            f'font-size:{run["size_px"]}px;color:{run["color"]};'
            f'letter-spacing:{run["tracking_em"]}em;'
            f'line-height:{round(lead / run["size_px"], 4)}">'
            + "<br>".join(esc(l.strip().upper()) for l in highlight.split("|"))
            + "</div>"
        )
        parts.append(footer(overlay, on_light))
        return page(page_label, "".join(parts))

    def poster_page(ground_name: str, lines: str, meta: str, page_label: str) -> str:
        overlay = geometry["overlays"]["clean"]["3" if ground_name == "sand" else "2"]
        ground = color[ground_name]
        on_light = ground_name == "sand"
        solid = color["navy"] if on_light else color["white"]
        size = 190
        lead = round(size * 0.948, 2)
        raw = lines.split("|")
        last = overlay["mark"]["y"] - 190
        first = round(last - (len(raw) - 1) * lead, 2)
        x = overlay["lockup"]["x"]

        parts = [f'<div class="ground" style="background:{ground}"></div>']
        parts.append(
            f'<div class="t" style="left:{x}px;'
            f'top:{top_for(first - round(size * 0.7) - 44, 34)}px;font-size:34px;'
            f'color:{color["red"]};letter-spacing:0.08em">{esc(meta.upper())}</div>'
        )
        for i, line in enumerate(raw):
            outline = line.strip().startswith("*")
            text = line.strip().lstrip("*").upper()
            baseline = first + i * lead
            style = (
                f'--stroke-ground:{ground};'
                if outline
                else f"color:{solid};"
            )
            parts.append(
                f'<div class="t display{" year" if outline else ""}" '
                f'style="left:{x}px;top:{top_for(baseline, size)}px;'
                f'font-size:{size}px;{style}">{esc(text)}</div>'
            )
        parts.append(footer(overlay, on_light))
        return page(page_label, "".join(parts))

    hexagon = geometry["hexagon"]

    def hex_box(w: float, cx: float, cy: float) -> dict:
        """Place the extracted hexagon in a box of a given width."""
        vx, vy, vw, vh = (float(n) for n in hexagon["viewBox"].split())
        scale = w / vw
        h = vh * scale
        return {
            "w": w, "h": h, "x": cx - w / 2, "y": cy - h / 2,
            "transform": (
                f"translate({cx - w / 2:.2f} {cy - h / 2:.2f}) "
                f"scale({scale:.5f}) translate({-vx} {-vy})"
            ),
        }

    # Same arrangements the renderer uses, so the HTML and the PNG agree.
    HEX_SPOTS = [
        (430, 862, 372), (214, 1064, 656), (286, 792, 790), (156, 1020, 216),
        (200, 966, 1010), (132, 660, 986), (108, 604, 690),
    ]
    PAIR_SPOTS = [
        (340, 790, 340), (340, 930, 616), (196, 620, 616), (150, 1046, 300),
        (236, 790, 892), (124, 606, 900),
    ]

    def hexfield_svg(
        dark: bool, media: Path | None, is_logo: bool,
        second: Path | None = None, align: str = "xMidYMid",
        align2: str = "xMidYMid", on_red: bool = False,
    ) -> str:
        """The scatter, with an optional photo or logo in the largest cell.

        With a second portrait it switches to the matched interlocking pair,
        the same as --portrait2 does in the renderer.
        """
        # On red the rose and peach accents sit too close to the ground and go
        # muddy, so the field tints with white instead.
        fills = (
            [color["white"]] * 3 if on_red
            else [color["rose"], color["peach"], color["slate"]]
        )
        layout = PAIR_SPOTS if second else HEX_SPOTS
        media_count = 2 if second else (1 if media else 0)
        defs, body = [], []
        for i, (w, cx, cy) in enumerate(layout):
            box = hex_box(w, cx, cy)
            if i == 1 and second is not None:
                defs.append(
                    f'<clipPath id="hexclip2"><path d="{hexagon["path"]}" '
                    f'transform="{box["transform"]}"/></clipPath>'
                )
                body.append(
                    f'<g clip-path="url(#hexclip2)">'
                    f'<image href="{image_uri(second)}" '
                    f'x="{box["x"]:.2f}" y="{box["y"]:.2f}" '
                    f'width="{box["w"]:.2f}" height="{box["h"]:.2f}" '
                    f'preserveAspectRatio="{align2} slice"/></g>'
                )
                continue
            if i == 0 and media is not None:
                if is_logo:
                    pad = box["w"] * 0.22
                    body.append(
                        f'<path d="{hexagon["path"]}" transform="{box["transform"]}" '
                        f'fill="{color["white"]}"/>'
                        f'<image href="{image_uri(media)}" '
                        f'x="{box["x"] + pad:.2f}" y="{box["y"] + pad:.2f}" '
                        f'width="{box["w"] - pad * 2:.2f}" '
                        f'height="{box["h"] - pad * 2:.2f}" '
                        f'preserveAspectRatio="xMidYMid meet"/>'
                    )
                else:
                    defs.append(
                        f'<clipPath id="hexclip"><path d="{hexagon["path"]}" '
                        f'transform="{box["transform"]}"/></clipPath>'
                    )
                    body.append(
                        f'<g clip-path="url(#hexclip)">'
                        f'<image href="{image_uri(media)}" '
                        f'x="{box["x"]:.2f}" y="{box["y"]:.2f}" '
                        f'width="{box["w"]:.2f}" height="{box["h"]:.2f}" '
                        f'preserveAspectRatio="{align} slice"/></g>'
                    )
                continue
            fill = fills[max(0, i - media_count) % len(fills)]
            body.append(
                f'<path d="{hexagon["path"]}" transform="{box["transform"]}" '
                f'fill="{fill}" fill-opacity="{0.16 if on_red else (0.92 if dark else 1)}"/>'
            )
        inner = (f"<defs>{''.join(defs)}</defs>" if defs else "") + "".join(body)
        return (
            f'<svg class="decor" viewBox="0 0 1080 1080" width="1080" height="1080" '
            f'style="left:0;top:0">{inner}</svg>'
        )

    def sponsors_svg(logos: list[Path], per_row: int, top: float) -> str:
        """A honeycomb row of logos, each in a white hexagon."""
        # Same lattice the renderer uses: alternate rows shift half a pitch
        # right and step down 0.8 of a cell. Staggering columns downward
        # instead merges same-column hexagons into a blob.
        gap = 20
        rows = -(-len(logos) // per_row)
        ROW_STEP = 0.8
        stack = 1 + (rows - 1) * ROW_STEP
        cell_h = min(
            ((1080 - 86 * 2 - gap * per_row) / per_row) * (1090.11 / 1005.874),
            (1080 - top - 60) / stack,
        )
        cell_w = round(cell_h * 1005.874 / 1090.11)
        draw_w = round(cell_w * 0.94)
        body = []
        for i, logo in enumerate(logos):
            row, col = divmod(i, per_row)
            in_row = min(per_row, len(logos) - row * per_row)
            pitch = cell_w + gap
            row_w = in_row * pitch - gap
            x0 = (1080 - row_w) / 2 + (pitch / 2 if row % 2 else 0)
            cx = x0 + col * pitch + cell_w / 2
            cy = top + row * cell_h * ROW_STEP + cell_h / 2
            box = hex_box(draw_w, cx, cy)
            pad = draw_w * 0.2
            body.append(
                f'<path d="{hexagon["path"]}" transform="{box["transform"]}" '
                f'fill="{color["white"]}"/>'
                f'<image href="{image_uri(logo)}" '
                f'x="{box["x"] + pad:.2f}" y="{box["y"] + pad:.2f}" '
                f'width="{box["w"] - pad * 2:.2f}" '
                f'height="{box["h"] - pad * 2:.2f}" '
                f'preserveAspectRatio="xMidYMid meet"/>'
            )
        return (
            f'<svg class="decor" viewBox="0 0 1080 1080" width="1080" height="1080" '
            f'style="left:0;top:0">{"".join(body)}</svg>'
        )

    def bulletin_page(
        ground_name: str, eyebrow: str, headline: str, body: str,
        decor: str, at: str, page_label: str,
        portrait: Path | None = None, logo: Path | None = None,
        sponsor_logos: list[Path] | None = None, head_size: int | None = None,
        portrait2: Path | None = None, align: str = "xMidYMid",
        align2: str = "xMidYMid", per_row: int = 4,
    ) -> str:
        """The announcement layout: lockup, eyebrow, sentence-case headline,
        body, one corner-bleeding device, and air below."""
        grounds = {
            "sand": color["sand"], "bone": color["bone"],
            "navy": color["navy"], "red": color["red"],
        }
        ground = grounds[ground_name]
        dark = ground_name in ("navy", "red")
        on_red = ground_name == "red"
        ink = color["white"] if dark else color["navy"]
        M = 86
        # "^" marks a countdown figure, set far larger than its label — same
        # convention and ratio the renderer uses.
        FIGURE_RATIO = 1.95
        raw_lines = [l.strip() for l in headline.split("|")]
        is_figure = [l.startswith("^") for l in raw_lines]
        head_lines_pre = [l.lstrip("^") for l in raw_lines]

        # Same column budget the renderer uses: hexfield puts a portrait
        # hexagon at x 647, so display type has 560px before it collides.
        column_w = 560 if decor in ("hexfield",) else (
            1080 - M * 2 if decor == "none" else 800
        )
        metrics = geometry["metrics"]
        plain = [t for t, f in zip(head_lines_pre, is_figure) if not f]
        figs = [t for t, f in zip(head_lines_pre, is_figure) if f]
        fit_plain = fit_size(
            metrics, "SpaceGrotesk-Bold", plain, 132, column_w, -0.015,
        ) if plain else 132
        fit_fig = (
            fit_size(
                metrics, "SpaceGrotesk-Bold", figs, 132 * FIGURE_RATIO,
                column_w, -0.02,
            ) / FIGURE_RATIO
        ) if figs else 132
        head_size = head_size or min(fit_plain, fit_fig)

        def size_of(i: int) -> float:
            return head_size * (FIGURE_RATIO if is_figure[i] else 1)

        def lead_of(i: int) -> float:
            return size_of(i) * (0.72 if is_figure[i] else 0.95)
        body_lines_pre = [l.strip() for l in body.split("|")] if body else [""]
        fitted_body = fit_size(
            geometry["metrics"], "Inter-Regular", body_lines_pre, 34,
            column_w, 0.0,
        )
        head_lead = round(head_size * 0.95, 2)
        eyebrow_base = 200
        # A figure's cap reaches far above its baseline and would strike through
        # the eyebrow, so push the block down by the extra cap height.
        head_first = eyebrow_base + 112 + (
            0.7 * (head_size * FIGURE_RATIO - head_size) if is_figure[0] else 0
        )
        head_lines = head_lines_pre
        baselines = []
        y = head_first
        for i in range(len(head_lines)):
            baselines.append(y)
            y += lead_of(i)
        head_bottom_line = baselines[-1]
        body_first = head_bottom_line + 84
        body_size = fitted_body

        parts = [f'<div class="ground" style="background:{ground}"></div>']

        if decor == "hexfield":
            parts.append(
                hexfield_svg(
                    dark, portrait or logo, logo is not None,
                    second=portrait2, align=align, align2=align2,
                    on_red=on_red,
                )
            )
        elif decor == "sponsors":
            # Below the *last* headline baseline, not the first — using
            # head_first put the honeycomb 125px high, into the descenders.
            head_bottom = head_bottom_line
            parts.append(
                sponsors_svg(sponsor_logos or [], per_row, head_bottom + 118)
            )
        elif decor == "shape":
            # The mark's own silhouette, scaled large and bled off an edge.
            side = 470
            vx, vy, vw, vh = (float(n) for n in tokens["shape"]["viewBox"].split())
            scale = side / vw
            spot = {
                "top-right": (1080 - 40, -20),
                "top-left": (M + 40, -30),
                "bottom-left": (M + 20, 1080 + 40),
                "bottom-right": (1080 - 40, 1080 + 40),
            }[at]
            tx = spot[0] - side / 2
            ty = spot[1] - vh * scale / 2
            fill_hex = color["white"] if dark else color["slate"]
            parts.append(
                f'<svg class="decor" viewBox="0 0 1080 1080" width="1080" '
                f'height="1080" style="left:0;top:0">'
                f'<path d="{tokens["shape"]["path"]}" fill="{fill_hex}" '
                f'fill-opacity="{0.16 if dark else 1}" '
                f'transform="translate({tx:.2f} {ty:.2f}) scale({scale:.5f}) '
                f'translate({-vx} {-vy})"/></svg>'
            )
        elif decor == "hexagons":
            w = 620
            h = round(w * 270 / 321, 2)
            spot = {
                "top-right": (1080 - w * 0.4, -h * 0.34),
                "top-left": (-w * 0.52, -h * 0.34),
                "bottom-left": (-w * 0.48, 1080 - h * 0.62),
                "bottom-right": (1080 - w * 0.52, 1080 - h * 0.62),
            }[at]
            parts.append(
                f'<img class="decor" src="{hexagons_uri}" '
                f'style="left:{spot[0]:.2f}px;top:{spot[1]:.2f}px;'
                f'width:{w}px;height:{h}px" alt="">'
            )

        wordmark = {"x": M, "y": 58, "w": 150, "h": 89}
        mk = mark_for(wordmark)
        parts.append(
            f'<img class="lockup" src="{lockups["cream"] if dark else lockups["navy"]}" '
            f'style="left:{wordmark["x"]}px;top:{wordmark["y"]}px;'
            f'width:{wordmark["w"]}px;height:{wordmark["h"]}px" '
            f'alt="Cloud Native Denmark">'
        )
        if not on_red:
            parts.append(
                f'<img class="mark" src="{mark_uri}" '
                f'style="left:{mk["x"]:.2f}px;top:{mk["y"]:.2f}px;'
                f'width:{mk["w"]:.2f}px;height:{mk["h"]:.2f}px" alt="">'
            )
        parts.append(
            f'<div class="t" style="left:{M}px;'
            f'top:{top_for(eyebrow_base, 30)}px;font-size:30px;'
            f'letter-spacing:0.18em;'
            f'color:{color["white"] if dark else color["red"]}">'
            f'{esc(eyebrow.upper())}</div>'
        )
        # One absolutely-positioned line per baseline, because the sizes differ
        # and a single block cannot carry two leadings.
        for i, line in enumerate(head_lines):
            parts.append(
                f'<div class="t display" style="left:{M}px;'
                f'top:{top_for(baselines[i], size_of(i)):.2f}px;'
                f'font-size:{size_of(i):.2f}px;color:{ink};'
                + (f"letter-spacing:-0.02em;" if is_figure[i] else "")
                + f'">{esc(line)}</div>'
            )
        parts.append(
            f'<div class="t body" style="left:{M}px;'
            f'top:{top_for(body_first, body_size)}px;font-size:{body_size}px;'
            f'color:{color["white"] if dark else color["ink-muted"]};'
            f'line-height:1.5">'
            + "<br>".join(esc(l.strip()) for l in body.split("|"))
            + "</div>"
        )
        return page(page_label, "".join(parts), square=True)

    def page(label: str, inner: str, square: bool = False) -> str:
        cls = "page square" if square else "page"
        return (
            f'<div class="{cls}" data-document-role="page" data-label="{esc(label)}">'
            f"{inner}</div>"
        )

    portrait_pages = [
        statement_page(
            "speaker-highlights", "2", "Speaker|highlights", "Name Lastname",
            "Role, organization", "Highlight lorem|ipsum dolores|lorem ipsum",
            "Speaker highlight — navy card",
        ),
        statement_page(
            "speaker-highlights", "3", "Speaker|highlights", "Name Lastname",
            "Role, organization", "Highlight lorem|ipsum dolores|lorem ipsum",
            "Speaker highlight — sand card",
        ),
        statement_page(
            "speaker-highlights", "1", "Speaker|highlights", "Name Lastname",
            "Role, organization", "Highlight lorem|ipsum dolores|lorem ipsum",
            "Speaker highlight — navy photo",
        ),
        statement_page(
            "sponsor-highlights", "2", "Sponsor|highlights", "Sponsor name",
            "Gold sponsor", "What they|do, in three|short lines",
            "Sponsor highlight — navy card",
        ),
        statement_page(
            "schedule-announcements", "3", "Schedule|is live", "The full schedule",
            "19–20 Nov · Scandic Copenhagen", "Two days,|four tracks,|one community",
            "Schedule announcement — sand card",
        ),
        statement_page(
            "CFP-notifications", "3", "CFP|notifications", "Call for papers",
            "Closes 31 August", "Share what|you learned|the hard way",
            "CFP notification — sand card",
        ),
        poster_page(
            "navy", "The|schedule|is|*live", "19–20 Nov · Scandic Copenhagen",
            "Poster — navy",
        ),
        poster_page(
            "sand", "The|schedule|is|*live", "19–20 Nov · Scandic Copenhagen",
            "Poster — sand",
        ),
    ]

    square_pages = [
        bulletin_page(
            "sand", "Track 02 · announced", "Platform|engineering.",
            "12 sessions on building golden paths, managing drift,|"
            "and paying down the platform debt you've accumulated.",
            "shape", "top-right", "Bulletin — sand, track",
        ),
        bulletin_page(
            "bone", "CFP · open now", "Talk to|your people.",
            "40-minute talks, 90-minute workshops, and lightning|"
            "rounds. Submit by 1 February.",
            "hexagons", "top-left", "Bulletin — bone, CFP",
        ),
        bulletin_page(
            "navy", "Tickets · on sale", "Blind bird|is open.",
            "1.499 DKK until 18 November.|All profits go to charity.",
            "hexagons", "bottom-left", "Bulletin — navy, tickets",
        ),
        bulletin_page(
            "red", "Early bird ends", "07|days left.",
            "Blind bird pricing closes Sunday.|After that it is 1.999 DKK.",
            "none", "top-right", "Bulletin — red, countdown",
        ),
    ]

    # The real 2026 line-up, straight from the same content file the renderer
    # uses, so an import matches graphics/out/announcements/ exactly rather
    # than carrying stale demo pages.
    announcements = json.loads(
        (ROOT / "content" / "2026-announcements.json").read_text()
    )
    keynote_pages: list[str] = []
    sponsor_pages: list[str] = []

    for k in announcements["keynotes"]:
        keynote_pages.append(
            bulletin_page(
                k.get("ground", "navy"), k["eyebrow"], k["headline"], k["body"],
                "hexfield", "top-right", k["slug"],
                portrait=ROOT / k["portrait"] if k.get("portrait") else None,
                portrait2=ROOT / k["portrait2"] if k.get("portrait2") else None,
                align=k.get("align", "xMidYMid"),
                align2=k.get("align2", "xMidYMid"),
            )
        )
    countdown_pages: list[str] = []
    for c in announcements.get("countdowns", []):
        figure = f"0{c['days']}" if c["days"] < 10 else str(c["days"])
        unit = "day" if c["days"] == 1 else "days"
        countdown_pages.append(
            bulletin_page(
                c.get("ground", "navy"), c["eyebrow"],
                f"^{figure}|{unit} to go.", c["body"],
                "hexfield", "top-right", f"countdown-{c['days']:02d}",
            )
        )

    # Every sponsor gets its own graphic, then each multi-sponsor tier gets a
    # honeycomb. A tier of one is skipped — that is just its single.
    tier_of = {t["tier"]: t for t in announcements["tiers"]}
    for sp in announcements["sponsors"]:
        tier = tier_of.get(sp["tier"], {})
        sponsor_pages.append(
            bulletin_page(
                tier.get("ground", "navy"), f"{sp['tier']} sponsor",
                f"Thank you,|{sp['name']}.",
                f"{sp['tier']} sponsor of|Cloud Native Denmark 2026.",
                "hexfield", "top-right", f"sponsor-{sp['slug']}",
                logo=ROOT / sp["logo"],
            )
        )
    for t in announcements["tiers"]:
        logos = [s for s in announcements["sponsors"] if s["tier"] == t["tier"]]
        if len(logos) < 2:
            continue
        plural = "sponsors"
        sponsor_pages.append(
            bulletin_page(
                t.get("ground", "navy"), f"{t['tier']} {plural} · 2026",
                f"Thank you,|{t['tier'].lower()} {plural}.", "",
                "sponsors", "top-right", f"tier-{t['tier'].lower()}",
                sponsor_logos=[ROOT / s["logo"] for s in logos],
                per_row=t.get("perRow", 4),
            )
        )

    def document(pages: list[str], height: int) -> str:
        return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cloud Native Denmark 2026 — templates</title>
<style>
  @font-face {{
    font-family: "Space Grotesk";
    src: url(data:font/woff2;base64,{sg_medium}) format("woff2");
    font-weight: 500; font-style: normal;
  }}
  @font-face {{
    font-family: "Space Grotesk";
    src: url(data:font/woff2;base64,{sg_bold}) format("woff2");
    font-weight: 700; font-style: normal;
  }}
  @font-face {{
    font-family: "Inter";
    src: url(data:font/woff2;base64,{inter}) format("woff2");
    font-weight: 400; font-style: normal;
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: #ddd; }}
  .page {{
    position: relative;
    width: {canvas_w}px;
    height: {height}px;
    overflow: hidden;
    margin: 0 auto 40px;
    font-family: "Space Grotesk", sans-serif;
  }}
  .ground, .rule {{ position: absolute; left: 0; right: 0; }}
  .ground {{ top: 0; bottom: 0; }}
  .window, .lockup, .mark, .decor {{ position: absolute; }}
  .card {{ background: {color["white"]}; }}
  /* v1's content area is a photo slot — mid grey so it is obvious in Canva
     that something belongs here. */
  .photo {{ background: #6f7482; }}
  .tab {{ position: absolute; left: 0; top: 0; pointer-events: none; }}
  .t {{
    position: absolute;
    line-height: 1;
    white-space: pre;
    letter-spacing: 0.02em;
    font-weight: 500;
    margin: 0;
  }}
  .tab-label {{ color: {color["white"]}; white-space: normal; }}
  .display {{ font-weight: 700; letter-spacing: -0.015em; }}
  .body {{ font-family: "Inter", sans-serif; letter-spacing: 0; font-weight: 400; }}
  /* The outline device: fill matches the ground, stroke is red. Not a red
     glyph — this is how the designer built it, and it is why it separates
     correctly for print. */
  .year {{
    color: var(--stroke-ground);
    -webkit-text-stroke: 3px {color["red"]};
    font-weight: 500;
  }}

  @page {{ size: 11.25in {height / 96}in; margin: 0; }}
  @media print {{
    body {{ background: none; }}
    .page {{ margin: 0; break-after: page; }}
    .page:last-of-type {{ break-after: auto; }}
  }}
</style>
</head>
<body>
{chr(10).join(pages)}
</body>
</html>
"""

    chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    written = []
    for name, pages, height in (
        ("cnd-templates-4x5", portrait_pages, canvas_h),
        ("cnd-templates-square", square_pages, canvas_w),
        ("cnd-keynotes", keynote_pages, canvas_w),
        ("cnd-sponsors", sponsor_pages, canvas_w),
        ("cnd-countdowns", countdown_pages, canvas_w),
    ):
        if not pages:
            continue
        html_path = OUT / f"{name}.html"
        html_path.write_text(document(pages, height))
        pdf_path = OUT / f"{name}.pdf"
        subprocess.run(
            [
                chrome, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                "--virtual-time-budget=8000", f"--print-to-pdf={pdf_path}",
                f"file://{html_path}",
            ],
            check=True, capture_output=True,
        )
        written.append((name, len(pages), html_path, pdf_path))

    for name, count, html_path, pdf_path in written:
        print(f"{name}: {count} pages")
        print(f"  {html_path.relative_to(ROOT)}  ({html_path.stat().st_size // 1024} KB)")
        print(f"  {pdf_path.relative_to(ROOT)}  ({pdf_path.stat().st_size // 1024} KB)")
    print("\nHTML is the one that imports as separate layers — use that.")
    print("Canva > Uploads, or File > Import.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
