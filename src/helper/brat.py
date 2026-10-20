#!/usr/bin/env python3
"""Generator stiker ala 'brat' (Charli XCX): background hijau limau,
teks hitam blur ala cover album. Output: PNG 512x512.
Usage: brat.py "teksnya" /path/output.png
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

TEXT = sys.argv[1] if len(sys.argv) > 1 else "brat"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/brat.png"

W, H = 512, 512
BG = (138, 206, 0)  # brat green

img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# Font tebal mirip Arial Narrow Bold
for fp in [
    "/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]:
    try:
        font = ImageFont.truetype(fp, 90)
        break
    except Exception:
        continue
else:
    font = ImageFont.load_default()

# Bungkus teks max 2 baris
words, lines, cur = TEXT.split(), [], ""
for w in words:
    t = (cur + " " + w).strip()
    if draw.textlength(t, font=font) > W - 60:
        lines.append(cur)
        cur = w
    else:
        cur = t
lines.append(cur)
lines = lines[:3]

# Ukuran font menyesuaikan jumlah baris
size = 90 if len(lines) == 1 else (70 if len(lines) == 2 else 55)
for fp in [
    "/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]:
    try:
        font = ImageFont.truetype(fp, size)
        break
    except Exception:
        continue

# Posisi: tengah agak ke bawah (ala cover brat)
line_h = size + 14
total_h = line_h * len(lines)
y = (H - total_h) // 2 + 40
for line in lines:
    lw = draw.textlength(line, font=font)
    draw.text(((W - lw) / 2, y), line, font=font, fill=(20, 20, 20))
    y += line_h

# Blur halus = ciri khas brat
img = img.filter(ImageFilter.GaussianBlur(1.2))
img.save(OUT)
print(OUT)
