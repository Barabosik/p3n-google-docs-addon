"""Marketplace screenshots: fits window screenshots of Google Docs onto 1280x800 canvases, the size the listing
wants, without stretching them. Writes store/screenshot-1.png, -2.png, ... in the order given.

    python dev/store-shots.py path/to/first.png path/to/second.png
    python dev/store-shots.py --crop 608,0,1952,1220 first.png second.png

--crop LEFT,TOP,WIDTH,HEIGHT cuts the same area out of each screenshot first. A 16:10 area, such as the selected
text and the sidebar, fills the canvas with no bands and stays readable.

Needs Pillow. Crop the browser's own tab strip and address bar off first if they're in the shot.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
W, H = 1280, 800

args = sys.argv[1:]
crop = None
if args[:1] == ['--crop'] and len(args) > 1:
    left, top, width, height = map(int, args[1].split(','))
    crop = (left, top, left + width, top + height)
    args = args[2:]
if not args:
    sys.exit(__doc__)

(ROOT / 'store').mkdir(exist_ok=True)
for n, src in enumerate(args, 1):
    shot = Image.open(src).convert('RGB')
    if crop:
        shot = shot.crop(crop)
    shot.thumbnail((W, H), Image.LANCZOS)  # only ever shrinks, keeping the aspect ratio
    canvas = Image.new('RGB', (W, H), '#f8f9fa')  # Docs' own grey around the page
    canvas.paste(shot, ((W - shot.width) // 2, (H - shot.height) // 2))
    out = ROOT / 'store' / f'screenshot-{n}.png'
    canvas.save(out, optimize=True)
    print(out.relative_to(ROOT))
