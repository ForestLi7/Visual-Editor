"""Generate raster favicons (diamond shape, same as UI accent)."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "editor" / "public"
BG = (20, 23, 28, 255)
FG = (62, 207, 142, 255)  # matches --ve-accent; SVG uses #3ecf8e


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    pad = max(2, size // 8)
    cx = cy = size // 2
    r = (size - pad * 2) // 2
    draw.polygon(
        [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)],
        fill=FG,
    )
    return img


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    img32 = draw_icon(32)
    img32.save(ROOT / "favicon-32.png", format="PNG")
    img32.save(ROOT / "favicon.ico", format="ICO", sizes=[(32, 32)])
    draw_icon(180).save(ROOT / "apple-touch-icon.png", format="PNG")
    print("Wrote favicon.ico, favicon-32.png, apple-touch-icon.png")


if __name__ == "__main__":
    main()
