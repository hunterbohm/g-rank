#!/usr/bin/env python3
"""Generate the social preview image for G-Rank."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "episodes.json"
OUT = ROOT / "assets" / "og.png"
W, H = 1200, 630


def first_font(paths: list[str]) -> str:
    for path in paths:
        if Path(path).exists():
            return path
    raise FileNotFoundError(f"None of these font paths exist: {paths}")


BOLD = first_font([
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
])
REG = first_font([
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
])


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=fnt)[2] <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def main() -> int:
    episodes = json.loads(DATA.read_text())
    total_drops = sum(len(ep.get("mentions", [])) for ep in episodes)
    infected = sum(1 for ep in episodes if ep.get("mentions"))
    villain = max(episodes, key=lambda ep: len(ep.get("mentions", [])))

    bg = "#f6f1e8"
    paper = "#fffaf1"
    ink = "#17130f"
    muted = "#6f665b"
    line = "#ded2c0"
    red = "#c83b3b"
    blue = "#2563eb"
    amber = "#a16207"

    img = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(img)

    # Case-file grid.
    for x in range(0, W, 32):
        draw.line((x, 0, x, H), fill="#eee3d2", width=1)
    for y in range(0, H, 32):
        draw.line((0, y, W, y), fill="#eee3d2", width=1)

    draw.rounded_rectangle((42, 34, W - 42, H - 34), radius=28, fill=paper, outline=line, width=2)
    draw.line((42, 142, W - 42, 142), fill=line, width=2)

    title_font = font(BOLD, 86)
    sub_font = font(REG, 32)
    mono_font = font(BOLD, 24)
    label_font = font(REG, 22)
    card_num = font(BOLD, 58)
    card_title = font(BOLD, 26)

    draw.rounded_rectangle((72, 68, 112, 108), radius=12, fill=ink)
    draw.text((86, 76), "G", fill=paper, font=font(BOLD, 24))
    draw.text((128, 77), "G-RANK", fill=ink, font=mono_font)
    draw.text((838, 80), "NERD SNIPE CASE FILE", fill=muted, font=mono_font)

    draw.text((72, 182), "The GStack", fill=ink, font=title_font)
    draw.text((72, 270), "incident tracker", fill=ink, font=title_font)
    draw.text((76, 370), "first mention · drop density · spiral factor", fill=muted, font=sub_font)

    cards = [
        (76, 452, "episodes", str(len(episodes)), red),
        (300, 452, "with hits", f"{infected}/{len(episodes)}", blue),
        (524, 452, "drops", str(total_drops), amber),
    ]
    for x, y, label, value, color in cards:
        draw.rounded_rectangle((x, y, x + 188, y + 112), radius=18, fill="#fffdf8", outline=line, width=2)
        draw.text((x + 18, y + 17), label.upper(), fill=muted, font=label_font)
        draw.text((x + 18, y + 48), value, fill=color, font=card_num)

    draw.rounded_rectangle((748, 436, 1126, 574), radius=18, fill="#fffdf8", outline=line, width=2)
    draw.text((772, 455), "CURRENT VILLAIN", fill=muted, font=label_font)
    y = 488
    for line_text in wrap(draw, villain["title"], card_title, 320)[:2]:
        draw.text((772, y), line_text, fill=ink, font=card_title)
        y += 30
    draw.text((772, 542), f"{len(villain.get('mentions', []))} GStack drops", fill=red, font=label_font)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
