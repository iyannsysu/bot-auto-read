'use strict';

// TikTok Downloader v2 — metode alternatif dari v1.
// v1 (.tt): tikwm API primary, yt-dlp fallback.
// v2 (.tiktokv2): yt-dlp primary, tikwm fallback + slot API key eksternal.
//
// API key opsional via env TIKTOK_V2_API_KEY (misal dari TikHub.io).
// Kalau diisi dan TIKTOK_V2_API di-set, dipakai sebagai sumber utama.

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
import { YTDLP } from './paths.js';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const TIKWM_API = 'https://www.tikwm.com/api/';

/**
 * Ambil info TikTok via yt-dlp (tanpa watermark).
 */
async function viaYtDlp(rawUrl) {
	const args = [
		'--no-warnings', '--no-playlist',
		'--extractor-args', 'youtube:player_client=android',
		'-f', 'best[ext=mp4]/best',
		'--print', '%(title)s\n%(uploader)s\n%(duration)s',
		'--get-url',
		rawUrl,
	];
	const { stdout } = await execFileAsync(YTDLP, args, { timeout: 90000 });
	const lines = stdout.trim().split('\n');
	if (lines.length < 4) throw new Error('yt-dlp gagal parse.');
	const [title, author, duration, videoUrl] = lines;
	if (!videoUrl?.startsWith('http')) throw new Error('yt-dlp tidak dapat URL video.');
	return { type: 'video', title: (title || '').slice(0, 200), author: author || 'TikTok', videoUrl, duration: parseInt(duration) || 0, source: 'v2-ytdlp' };
}

/**
 * Fallback via tikwm (sama seperti v1).
 */
async function viaTikwm(rawUrl) {
	const r = await fetch(TIKWM_API + '?url=' + encodeURIComponent(rawUrl), {
		headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000),
	});
	if (!r.ok) throw new Error('tikwm sibuk.');
	const j = await r.json();
	if (j.code !== 0 || !j.data) throw new Error(j.msg || 'tikwm gagal.');
	const d = j.data;
	const videoUrl = d.hdplay || d.play || d.wmplay;
	if (!videoUrl) throw new Error('URL video tidak ditemukan.');
	return {
		type: 'video',
		title: (d.title || '').slice(0, 200),
		author: d.author?.nickname || d.author?.unique_id || 'TikTok',
		videoUrl, duration: d.duration, source: 'v2-tikwm',
	};
}

/**
 * API key eksternal via iyanapi.vercel.app.
 * Format: GET {api}?url=...&apikey=...
 * Respons: {status, result: {title, author:{nickname,unique_id}, play, wmplay, music, cover}}
 */
async function viaApiKey(rawUrl) {
	const key = process.env.TIKTOK_V2_API_KEY;
	const api = process.env.TIKTOK_V2_API;
	if (!key || !api) throw new Error('API key belum diset.');
	const r = await fetch(`${api}?url=${encodeURIComponent(rawUrl)}&apikey=${encodeURIComponent(key)}`, {
		headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000),
	});
	if (!r.ok) throw new Error('API v2 sibuk (HTTP ' + r.status + ').');
	const j = await r.json();
	if (!j.status || !j.result) throw new Error(j.message || 'API v2 gagal mengambil video.');
	const d = j.result;
	const videoUrl = d.play || d.wmplay;
	if (!videoUrl) throw new Error('API v2 tidak mengembalikan URL video.');
	return {
		type: 'video',
		title: (d.title || '').slice(0, 200),
		author: d.author?.nickname || d.author?.unique_id || 'TikTok',
		videoUrl, music: d.music || null, source: 'v2-iyanapi',
	};
}

/**
 * Ambil info TikTok v2: coba API key -> yt-dlp -> tikwm.
 */
export async function getTikTokV2(rawUrl) {
	const errors = [];
	// 1. API key (kalau diset)
	if (process.env.TIKTOK_V2_API_KEY && process.env.TIKTOK_V2_API) {
		try { return await viaApiKey(rawUrl); }
		catch (e) { errors.push('apikey: ' + e.message); }
	}
	// 2. yt-dlp (primary v2)
	try { return await viaYtDlp(rawUrl); }
	catch (e) { errors.push('ytdlp: ' + e.message); }
	// 3. tikwm fallback
	try { return await viaTikwm(rawUrl); }
	catch (e) { errors.push('tikwm: ' + e.message); }
	throw new Error('Semua metode v2 gagal: ' + errors.join(' | '));
}
