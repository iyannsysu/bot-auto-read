#!/usr/bin/env python3
"""Unduh HLS (AES-128) dari hanime streamrelay jadi MP4.

Kenapa tidak langsung ffmpeg -i <url>: koneksi ffmpeg yang persisten
sering putus lewat proxy worker ("Stream ends prematurely", TLS error).
Download per-segmen via requests jauh lebih stabil (retry per segmen).

Pakai: hv-dl.py <playlist_url_m3u8> <output.mp4> [max_segments]
"""
import re
import subprocess
import sys
import time

import requests
from Crypto.Cipher import AES

UA = {'User-Agent': 'Mozilla/5.0'}


def get(url, retries=5):
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, headers=UA, timeout=45)
            r.raise_for_status()
            return r.content
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f'gagal unduh {url[:80]}: {last}')


def main():
    pl_url, out_mp4 = sys.argv[1], sys.argv[2]
    max_seg = int(sys.argv[3]) if len(sys.argv) > 3 else 0

    pl = get(pl_url).decode('utf-8', 'replace')
    base_seq = int(re.search(r'#EXT-X-MEDIA-SEQUENCE:(\d+)', pl).group(1)) if '#EXT-X-MEDIA-SEQUENCE' in pl else 0
    segs = re.findall(r'^(https?://\S+)$', pl, re.M)
    if max_seg:
        segs = segs[:max_seg]
    mkey = re.search(r'#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)"(?:,IV=0x([0-9a-fA-F]+))?', pl)
    if not mkey:
        raise RuntimeError('playlist bukan AES-128 / tidak terenkripsi?')
    key = get(mkey.group(1))
    iv_hex = mkey.group(2)

    ts_path = out_mp4 + '.ts'
    n = len(segs)
    with open(ts_path, 'wb') as f:
        for i, s in enumerate(segs):
            data = get(s)
            iv = bytes.fromhex(iv_hex) if iv_hex else (base_seq + i).to_bytes(16, 'big')
            cipher = AES.new(key, AES.MODE_CBC, iv)
            f.write(cipher.decrypt(data))
            if (i + 1) % 20 == 0 or i + 1 == n:
                print(f'{i + 1}/{n}', flush=True)

    # Remux TS -> MP4 (file lokal, tanpa network)
    r = subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-i', ts_path, '-c', 'copy', out_mp4],
        capture_output=True, text=True, timeout=600,
    )
    if r.returncode != 0:
        raise RuntimeError('ffmpeg remux gagal: ' + r.stderr[:200])
    import os
    os.remove(ts_path)
    print('OK', out_mp4)


if __name__ == '__main__':
    main()
