// Scraper XNXX — search + download video dewasa
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const BASE = 'https://www.xnxx.com';

async function getHtml(url) {
	const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(30000) });
	if (!r.ok) throw new Error('XNXX sibuk (HTTP ' + r.status + ').');
	return r.text();
}

/**
 * Cari video. @returns {Promise<Array<{title, url, duration, thumb}>>}
 */
export async function searchBokep(query) {
	const html = await getHtml(BASE + '/search/' + encodeURIComponent(query));
	const results = [];
	const seen = new Set();
	// link judul ada di <div class="thumb-under">: <a href="/video-xxx/slug" title="...">
	const re = /<a href="(\/video-[a-z0-9]+\/[^"]+)" title="([^"]{3,150})"/g;
	let m;
	while ((m = re.exec(html)) && results.length < 10) {
		if (seen.has(m[1])) continue;
		seen.add(m[1]);
		results.push({
			title: m[2].replace(/&[^;]+;/g, ' ').trim().slice(0, 80),
			url: BASE + m[1],
			duration: '?',
			thumb: null,
		});
	}
	if (!results.length) throw new Error('Tidak ketemu. Coba keyword lain.');
	return results;
}

/**
 * Ambil URL video langsung (kualitas tertinggi) dari halaman video.
 * @returns {Promise<{videoUrl, title}>}
 */
export async function getBokepVideo(pageUrl) {
	const html = await getHtml(pageUrl);
	// kualitas tertinggi dulu
	let m = html.match(/html5player\.setVideoUrlHigh\('([^']+)'\)/);
	if (!m) m = html.match(/html5player\.setVideoUrlLow\('([^']+)'\)/);
	if (!m) throw new Error('URL video tidak ditemukan.');
	const t = html.match(/<title>([^<]{5,120})<\/title>/);
	return { videoUrl: m[1], title: t ? t[1].replace(/ - XNXX\.COM.*$/i, '').trim().slice(0, 80) : 'Video' };
}

export async function downloadBokep(url, maxMB = 100) {
	const r = await fetch(url, { headers: { 'User-Agent': UA, 'Referer': BASE + '/' }, signal: AbortSignal.timeout(180000) });
	if (!r.ok) throw new Error('Download gagal (HTTP ' + r.status + ').');
	const buf = Buffer.from(await r.arrayBuffer());
	if (buf.length > maxMB * 1024 * 1024) throw new Error('Video kebesaran (> ' + maxMB + 'MB).');
	if (buf.length < 100 * 1024) throw new Error('File terlalu kecil, mungkin gagal.');
	return buf;
}
