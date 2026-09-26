from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


def luminance(rgb: tuple[int, int, int]) -> float:
    red, green, blue = rgb
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def validate(path: Path) -> list[str]:
    failures: list[str] = []
    with Image.open(path) as image:
        if image.size != (32, 32):
            failures.append(f"size is {image.size[0]}x{image.size[1]}, expected 32x32")
        if image.mode != "RGB":
            failures.append(f"mode is {image.mode}, expected opaque RGB")

        rgb = image.convert("RGB")
        width, height = rgb.size
        pixels = [rgb.getpixel((x, y)) for y in range(height) for x in range(width)]

        corners = [
            rgb.getpixel((0, 0)),
            rgb.getpixel((width - 1, 0)),
            rgb.getpixel((0, height - 1)),
            rgb.getpixel((width - 1, height - 1)),
        ]
        maximum_corner = max(luminance(pixel) for pixel in corners)
        if maximum_corner >= 24:
            failures.append(f"maximum corner luminance is {maximum_corner:.1f}, expected < 24")

        bright_percent = 100 * sum(luminance(pixel) > 235 for pixel in pixels) / len(pixels)
        if bright_percent > 4:
            failures.append(f"{bright_percent:.1f}% of pixels are brighter than 235, expected <= 4%")

        edge_positions = set()
        for x in range(width):
            edge_positions.add((x, 0))
            edge_positions.add((x, height - 1))
        for y in range(height):
            edge_positions.add((0, y))
            edge_positions.add((width - 1, y))
        dark_edge_percent = 100 * sum(
            luminance(rgb.getpixel(position)) < 64 for position in edge_positions
        ) / len(edge_positions)
        if dark_edge_percent < 70:
            failures.append(f"only {dark_edge_percent:.1f}% of the outer edge is dark, expected >= 70%")

    return failures


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: validate_spell_icon.py ICON.png [ICON2.png ...]")
        return 2

    status = 0
    for raw_path in sys.argv[1:]:
        path = Path(raw_path)
        failures = validate(path)
        if failures:
            status = 1
            print(f"FAIL {path}")
            for failure in failures:
                print(f"  - {failure}")
        else:
            print(f"PASS {path}")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
