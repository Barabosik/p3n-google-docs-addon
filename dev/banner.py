"""The Marketplace card banner (220x140): the p3n logo and name on p3n paper. Writes store/card-banner-220x140.png.

    python dev/banner.py

Needs Pillow. Uses Segoe UI where it exists (Windows), else Pillow's default font.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PAPER, INK, MUTED, ACCENT = '#fbfaf7', '#16130f', '#6b645a', '#c2410c'
SCALE = 4  # draw large, then shrink, for smooth edges
W, H = 220 * SCALE, 140 * SCALE


def font(names, size):
    for name in names:
        for folder in (Path('C:/Windows/Fonts'), Path('/usr/share/fonts/truetype/dejavu')):
            if (folder / name).exists():
                return ImageFont.truetype(str(folder / name), size)
    return ImageFont.load_default(size)


img = Image.new('RGB', (W, H), PAPER)
draw = ImageDraw.Draw(img)

logo = Image.open(ROOT / 'dev/icons/logo-512.png').convert('RGBA').resize((66 * SCALE, 66 * SCALE), Image.LANCZOS)
img.paste(logo, (22 * SCALE, (H - logo.height) // 2 - 8 * SCALE), logo)

bold = font(['segoeuib.ttf', 'DejaVuSans-Bold.ttf'], 44 * SCALE)
small = font(['segoeui.ttf', 'DejaVuSans.ttf'], 12 * SCALE)
x = 98 * SCALE
draw.text((x, 30 * SCALE), 'p', font=bold, fill=INK)
x2 = x + draw.textlength('p', font=bold)
draw.text((x2, 30 * SCALE), '3', font=bold, fill=ACCENT)
x3 = x2 + draw.textlength('3', font=bold)
draw.text((x3, 30 * SCALE), 'n', font=bold, fill=INK)
draw.text((x, 88 * SCALE), 'AI check and rewrite', font=small, fill=MUTED)

out = ROOT / 'store/card-banner-220x140.png'
out.parent.mkdir(exist_ok=True)
img.resize((220, 140), Image.LANCZOS).save(out, optimize=True)
print(out.relative_to(ROOT))
