"""Marketplace screenshots: fits window screenshots of Google Docs onto 1280x800 canvases, the size the listing
wants, without stretching them. Writes store/screenshot-1.png, -2.png, ... in the order given.

    python dev/store-shots.py path/to/first.png path/to/second.png

Needs Pillow. Crop the browser's own tab strip and address bar off first if they're in the shot.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
W, H = 1280, 800

if len(sys.argv) < 2:
    sys.exit(__doc__)

(ROOT / 'store').mkdir(exist_ok=True)
for n, src in enumerate(sys.argv[1:], 1):
    shot = Image.open(src).convert('RGB')
    shot.thumbnail((W, H), Image.LANCZOS)  # only ever shrinks, keeping the aspect ratio
    canvas = Image.new('RGB', (W, H), '#f8f9fa')  # Docs' own grey around the page
    canvas.paste(shot, ((W - shot.width) // 2, (H - shot.height) // 2))
    out = ROOT / 'store' / f'screenshot-{n}.png'
    canvas.save(out, optimize=True)
    print(out.relative_to(ROOT))
