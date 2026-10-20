'use strict';

// ===== Pengambil TikTok via tikdownloader.io =====
// Situs ini mengembalikan link "Unduh MP4 HD" yang kualitasnya 1080p asli
// (terverifikasi 2026-10-20: 1080x1920 untuk video vertikal), jauh di atas
// hasil tikwm hdplay (576px). Alur situs (dari JS resminya):
//   POST https://tikdownloader.io/api/ajaxSearch { q: <url>, lang: 'id' }
//   -> JSON { status: 'ok', data: '<html hasil>' }
// HTML hasil sudah berisi link unduh berlabel: "Unduh MP4 HD", "Unduh MP4",
// "Unduh MP3" — jadi tidak perlu putaran convert/token sama sekali.

const SEARCH_API = 'https://tikdownloader.io/api/ajaxSearch';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function decodeEntities(s) {
	return String(s || '')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripTags(s) {
	return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function fetchRetry(url, opts = {}, tries = 3) {
	let lastErr;
	for (let i = 0; i < tries; i++) {
		try {
			return await fetch(url, { signal: AbortSignal.timeout(45000), ...opts });
		} catch (err) {
			lastErr = err;
			if (i < tries - 1) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
		}
	}
	throw lastErr || new Error('Koneksi ke tikdownloader.io gagal.');
}

async function resolveUrl(url) {
	try {
		const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
		return r.url || url;
	} catch { return url; }
}

/**
 * Ambil link unduh TikTok kualitas HD dari tikdownloader.io.
 * @returns {Promise<{title, hdUrl, mp4Url, mp3Url}>}
 */
export async function getTikTokHD(rawUrl) {
	let url = String(rawUrl || '').trim();
	if (!/tiktok\.com/i.test(url)) throw new Error('Bukan link TikTok.');
	if (/v[mt]\.tiktok\.com/i.test(url)) url = await resolveUrl(url);

	const body = new URLSearchParams({ q: url, lang: 'id' });
	const r = await fetchRetry(SEARCH_API, {
		method: 'POST',
		headers: {
			'User-Agent': UA,
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			'X-Requested-With': 'XMLHttpRequest',
			'Referer': 'https://tikdownloader.io/id',
		},
		body,
	});
	if (!r.ok) throw new Error('tikdownloader.io sibuk (HTTP ' + r.status + ').');
	const j = await r.json().catch(() => null);
	if (!j || j.status !== 'ok' || !j.data) throw new Error('Video tidak ditemukan di tikdownloader.io.');

	const html = decodeEntities(j.data);
	const title = stripTags((html.match(/<h3>([\s\S]*?)<\/h3>/i) || [])[1] || '').slice(0, 200);

	// Kumpulkan link unduh berlabel dari HTML hasil.
	const links = [];
	const re = /href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
	let mm;
	while ((mm = re.exec(html)) !== null) {
		links.push({ url: mm[1], label: stripTags(mm[2]) });
	}
	const hd = links.find(l => /mp4\s*hd/i.test(l.label));
	const mp4 = links.find(l => /unduh mp4/i.test(l.label) && !/hd/i.test(l.label));
	const mp3 = links.find(l => /mp3/i.test(l.label));

	if (!hd && !mp4) throw new Error('Link unduh tidak ditemukan (mungkin video privat / slideshow foto).');
	return {
		title,
		hdUrl: hd?.url || null,
		mp4Url: mp4?.url || null,
		mp3Url: mp3?.url || null,
	};
}

/** Unduh file ke Buffer (maks 100MB default). */
export async function downloadBuffer(url, maxMB = 100) {
	const r = await fetchRetry(url, {
		headers: { 'User-Agent': UA, 'Referer': 'https://tikdownloader.io/' },
	});
	if (!r.ok) throw new Error('Download gagal (HTTP ' + r.status + ').');
	const buf = Buffer.from(await r.arrayBuffer());
	if (buf.length > maxMB * 1024 * 1024) throw new Error('File kebesaran (> ' + maxMB + 'MB).');
	return buf;
}
