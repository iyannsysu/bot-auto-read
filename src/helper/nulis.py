#!/usr/bin/env python3
"""Generator 'nulis di buku': teks dengan font tulisan tangan di atas
kertas bergaris ala buku tulis. Output: PNG.
Usage: nulis.py "teks..." /path/output.png
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

TEXT = sys.argv[1] if len(sys.argv) > 1 else "halo"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/nulis.png"
BASE = os.path.dirname(os.path.abspath(__file__))

W, H = 800, 1000
BG = (255, 255, 250)
LINE = (150, 180, 220)   # garis biru buku
MARGIN = (255, 120, 120)  # garis tepi merah

img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# garis horizontal tiap 56px
for y in range(80, H, 56):
    draw.line([(40, y), (W - 30, y)], fill=LINE, width=2)
# garis tepi merah
draw.line([(90, 0), (90, H)], fill=MARGIN, width=3)

def get_font(size):
    local = os.path.join(BASE, "..", "..", "assets", "fonts", "Caveat-Bold.ttf")
    local = os.path.normpath(local)
    if not os.path.exists(local):
        # unduh sekali kalau belum ada (repo tidak menyimpan binary font)
        try:
            import urllib.request
            os.makedirs(os.path.dirname(local), exist_ok=True)
            urllib.request.urlretrieve(
                "https://github.com/google/fonts/raw/main/ofl/caveat/Caveat%5Bwght%5D.ttf",
                local,
            )
        except Exception:
            pass
    try:
        return ImageFont.truetype(local, size)
    except Exception:
        return ImageFont.load_default()

font = get_font(44)

# bungkus teks per kata
words, lines, cur = TEXT.split(), [], ""
for w in words:
    t = (cur + " " + w).strip()
    if draw.textlength(t, font=font) > W - 160:
        lines.append(cur)
        cur = w
    else:
        cur = t
if cur:
    lines.append(cur)

y = 96
for line in lines:
    if y > H - 60:
        break
    draw.text((110, y), line, font=font, fill=(30, 40, 90))
    y += 56

img.save(OUT)
print(OUT)
