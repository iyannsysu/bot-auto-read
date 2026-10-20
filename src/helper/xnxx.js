'use strict';
// Helper: search video 18+ via XNXX (scrape-friendly, tanpa Cloudflare).
// - Search: https://www.xnxx.com/search/{keyword} -> daftar video
// - Halaman video: html5player.setVideoUrlHigh('...mp4...') -> direct mp4

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const BASE = 'https://www.xnxx.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function xnGet(url) {
	const res = await fetch(url, {
		headers: { 'User-Agent': UA, 'Referer': BASE + '/', 'Accept-Language': 'en-US,en;q=0.9' },
		signal: AbortSignal.timeout(25000),
	});
	if (!res.ok) throw new Error('HTTP ' + res.status);
	return res.text();
}

function unesc(s) {
	return (s || '').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim();
}

/** Cari video: [{ title, url, duration, quality, thumb }] */
export async function searchXNXX(keyword) {
	const q = encodeURIComponent(keyword.trim().toLowerCase().replace(/\s+/g, '_'));
	const html = await xnGet(`${BASE}/search/${q}`);
	const out = [];
	const re = /<div id="video_([a-z0-9]+)"[^>]*class="thumb-block[^"]*">([\s\S]*?)<p class="metadata">([\s\S]*?)<\/p>/g;
	let m;
	while ((m = re.exec(html)) && out.length < 20) {
		const block = m[2], meta = m[3];
		const a = block.match(/href="(\/video-[a-z0-9]+\/[^"]+)"[^>]*title="([^"]{5,120})"/);
		if (!a) continue;
		const img = block.match(/data-src="(https:\/\/[^"]+_t\.(?:jpg|avif))"/) || block.match(/data-src="(https:\/\/[^"]+)"/);
		const dur = meta.match(/(\d+\s*min(?:\s*\d+\s*sec)?)/);
		const qual = meta.match(/(\d{3,4}p)/);
		out.push({
			title: unesc(a[2]),
			url: BASE + a[1],
			duration: dur ? dur[1].replace(/\s+/g, ' ') : '?',
			quality: qual ? qual[1] : '',
			thumb: img ? img[1] : '',
		});
	}
	return out;
}

/** Ambil direct mp4 dari halaman video: { videoUrl, title } */
export async function getXNXXVideo(pageUrl) {
	const html = await xnGet(pageUrl);
	const hi = html.match(/html5player\.setVideoUrlHigh\('([^']+)'\)/);
	const lo = html.match(/html5player\.setVideoUrlLow\('([^']+)'\)/);
	const t = html.match(/setVideoTitle\('([^']+)'\)/);
	const videoUrl = hi?.[1] || lo?.[1];
	if (!videoUrl) throw new Error('URL video tidak ditemukan');
	return { videoUrl, title: unesc(t?.[1]) };
}

/** Kompres buffer mp4 via ffmpeg agar <= targetMB.
 *  480p, bitrate video dihitung dari durasi (ffprobe). Return Buffer. */
async function compressVideo(buf, targetMB) {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 's18-'));
	const inp = path.join(tmpDir, 'in.mp4');
	const out = path.join(tmpDir, 'out.mp4');
	try {
		fs.writeFileSync(inp, buf);
		// Durasi via ffprobe
		let duration = 0;
		try {
			const { stdout } = await execFileAsync('ffprobe', [
				'-v', 'error', '-show_entries', 'format=duration',
				'-of', 'default=noprint_wrappers=1:nokey=1', inp,
			], { timeout: 30000 });
			duration = parseFloat(stdout.trim()) || 0;
		} catch {}
		if (!duration || duration <= 0) throw new Error('Durasi video tidak terbaca');
		// Bitrate video (kbit/s): sisakan 96k untuk audio, margin 5%.
		const totalKbit = Math.floor((targetMB * 1024 * 8 * 0.95) / duration);
		const vbitrate = Math.max(totalKbit - 96, 250);
		await execFileAsync('ffmpeg', [
			'-y', '-v', 'error', '-i', inp,
			'-vf', 'scale=854:480:force_original_aspect_ratio=decrease',
			'-c:v', 'libx264', '-preset', 'veryfast',
			'-b:v', `${vbitrate}k`,
			'-maxrate', `${Math.floor(vbitrate * 1.5)}k`,
			'-bufsize', `${vbitrate * 2}k`,
			'-c:a', 'aac', '-b:a', '96k',
			'-movflags', '+faststart',
			out,
		], { timeout: 300000 });
		const compressed = fs.readFileSync(out);
		if (!compressed.length) throw new Error('Hasil kompresi kosong');
		if (compressed.length > targetMB * 1024 * 1024) {
			throw new Error('Kompresi gagal mengecilkan cukup (masih > ' + targetMB + 'MB)');
		}
		return compressed;
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
}

/** Download mp4 dengan batas ukuran (MB).
 *  opts.compress = true: kalau > maxMB, coba kompres via ffmpeg dulu
 *  (bukan langsung error). Hard cap download 400MB.
 *  Return { buffer, compressed }. */
export async function downloadXNXX(videoUrl, maxMB = 90, opts = {}) {
	const compress = !!opts.compress;
	const res = await fetch(videoUrl, {
		headers: { 'User-Agent': UA, 'Referer': BASE + '/' },
		signal: AbortSignal.timeout(180000),
	});
	if (!res.ok) throw new Error('HTTP ' + res.status);
	const maxBytes = maxMB * 1024 * 1024;
	const hardCap = 400 * 1024 * 1024;
	const chunks = [];
	let total = 0;
	for await (const chunk of res.body) {
		total += chunk.length;
		if (total > hardCap) throw new Error('Video > 400MB, kebesaran.');
		if (!compress && total > maxBytes) throw new Error(`Video > ${maxMB}MB, terlalu besar untuk dikirim.`);
		chunks.push(chunk);
	}
	const buf = Buffer.concat(chunks);
	if (buf.length <= maxBytes) return { buffer: buf, compressed: false };
	if (!compress) throw new Error(`Video > ${maxMB}MB, terlalu besar untuk dikirim.`);
	const out = await compressVideo(buf, maxMB);
	return { buffer: out, compressed: true };
}
