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


def b64_font(path: Path, tmp: Path) -> str:
    dst = tmp / (path.stem + ".woff2")
    subprocess.run(
        [
            str(ROOT / ".venv" / "bin" / "pyftsubset"), str(path),
            f"--unicodes={SUBSET}", "--flavor=woff2", f"--output-file={dst}",
        ],
        check=True, capture_output=True,
    )
    return base64.b64encode(dst.read_bytes()).decode()


def b64_svg(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


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

    lockups = {
        "cream": b64_svg(ROOT / "brand" / "logo" / "cnd-lockup-cream.svg"),
        "navy": b64_svg(ROOT / "brand" / "logo" / "cnd-lockup-navy.svg"),
    }
    mark_b64 = b64_svg(ROOT / "brand" / "logo" / "cnd-mark.svg")

    year_spec = next(
        v["2"]["year"] for v in geometry["frames"].values() if v.get("2")
    )

    def footer(overlay: dict, on_light: bool) -> str:
        lock = overlay["lockup"]
        mark = overlay["mark"]
        run = year_spec["runs"][0]
        size = run["size_px"]
        return (
            f'<img class="lockup" src="data:image/svg+xml;base64,'
            f'{lockups["navy"] if on_light else lockups["cream"]}" '
            f'style="left:{lock["x"]}px;top:{lock["y"]}px;'
            f'width:{lock["w"]}px;height:{lock["h"]}px" alt="Cloud Native Denmark">'
            f'<img class="mark" src="data:image/svg+xml;base64,{mark_b64}" '
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

    def page(label: str, inner: str) -> str:
        return (
            f'<div class="page" data-document-role="page" data-label="{esc(label)}">'
            f"{inner}</div>"
        )

    pages = [
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

    html = f"""<!doctype html>
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
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: #ddd; }}
  .page {{
    position: relative;
    width: {canvas_w}px;
    height: {canvas_h}px;
    overflow: hidden;
    margin: 0 auto 40px;
    font-family: "Space Grotesk", sans-serif;
  }}
  .ground, .rule {{ position: absolute; left: 0; right: 0; }}
  .ground {{ top: 0; bottom: 0; }}
  .window, .lockup, .mark {{ position: absolute; }}
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
  .display {{ font-weight: 700; letter-spacing: -0.01em; }}
  /* The outline device: fill matches the ground, stroke is red. Not a red
     glyph — this is how the designer built it, and it is why it separates
     correctly for print. */
  .year {{
    color: var(--stroke-ground);
    -webkit-text-stroke: 3px {color["red"]};
    font-weight: 500;
  }}
</style>
</head>
<body>
{chr(10).join(pages)}
</body>
</html>
"""

    target = OUT / "cnd-templates.html"
    target.write_text(html)
    size_kb = target.stat().st_size // 1024
    print(f"wrote {target.relative_to(ROOT)}  ({size_kb} KB, {len(pages)} pages)")
    print("\nNext: host it on a site you already run, then import with")
    print("  import-design-from-url  →  intended_design_type: instagram_post")
    return 0


if __name__ == "__main__":
    sys.exit(main())
