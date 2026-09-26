from pathlib import Path

from PIL import Image


ICONS = Path(r"C:\Users\Matheus\Desktop\Icons")
OUTPUT = ICONS / "AI Style References"
OUTPUT.mkdir(exist_ok=True)

ANCHORS = {
    "warrior": [
        ICONS / "Warrior v3" / "02-double-slash.png",
        ICONS / "Warrior v3" / "03-battle-cry.png",
        ICONS / "Warrior v3" / "08-ground-slam.png",
        ICONS / "Warrior v3" / "13-execute.png",
        ICONS / "Warrior v3" / "18-cleave.png",
        ICONS / "Warrior v3" / "22-blade-prison.png",
    ],
    "mage": [
        ICONS / "Mage Arcane v3" / "01-arcane-bolt.png",
        ICONS / "Mage Arcane v3" / "02-mana-shield.png",
        ICONS / "Mage Arcane v3" / "05-mana-beam.png",
        ICONS / "Mage Arcane v3" / "08-arcane-explosion.png",
        ICONS / "Mage Arcane v3" / "21-arcane-wave.png",
        ICONS / "Mage Arcane v3" / "25-heal.png",
    ],
    "archer": [
        ICONS / "Archer" / "01-quick-shot.png",
        ICONS / "Archer" / "02-hunters-mark.png",
        ICONS / "Archer" / "04-multishot.png",
        ICONS / "Archer" / "07-eagle-eye.png",
        ICONS / "Archer" / "18-disarming-shot.png",
        ICONS / "Archer" / "40-hunting-horn.png",
    ],
}

TILE = 256
GAP = 16
COLS = 3
ROWS = 2

for family, paths in ANCHORS.items():
    canvas = Image.new("RGB", (COLS * TILE + (COLS + 1) * GAP, ROWS * TILE + (ROWS + 1) * GAP), (8, 9, 10))
    for index, path in enumerate(paths):
        with Image.open(path) as image:
            tile = image.convert("RGB").resize((TILE, TILE), Image.Resampling.NEAREST)
        x = GAP + (index % COLS) * (TILE + GAP)
        y = GAP + (index // COLS) * (TILE + GAP)
        canvas.paste(tile, (x, y))
    canvas.save(OUTPUT / f"{family}-style-anchor.png", optimize=True)

PALETTES = {
    "juggernaut": ["#0B0702", "#2B1204", "#A83D05", "#E56D09", "#F6B94D", "#FFF0C2"],
    "lifebinder": ["#000A0A", "#003B32", "#00A86B", "#20E394", "#8FFFD0", "#E7FFF7", "#18A9D6"],
}

for name, colors in PALETTES.items():
    width = 448
    height = 64
    swatch = Image.new("RGB", (width, height))
    for index, color in enumerate(colors):
        left = round(index * width / len(colors))
        right = round((index + 1) * width / len(colors))
        swatch.paste(color, (left, 0, right, height))
    swatch.save(OUTPUT / f"{name}-palette.png", optimize=True)
