'use strict';
// Command: play — cari lagu/video YouTube, tampilkan thumbnail + info,
// lalu owner balas 1 = MP3 atau 2 = MP4. (adaptasi fitur WilyKun)

import * as shared from './_shared.js';

const {
	fs, path, os,
	searchYouTube, downloadYouTubeAudio, downloadYouTubeAudioById, downloadYouTubeVideo, cleanupYouTubeAudio,
} = shared;

// sender -> { videoId, title, duration, ts }
const playChoices = new Map();
const CHOICE_TTL = 5 * 60 * 1000;
const MAX_VIDEO_SEC = 300; // 5 menit untuk MP4

function fmtDuration(sec) {
	if (!sec || sec <= 0) return '?';
	const mnt = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${mnt}:${String(s).padStart(2, '0')}`;
}

function safeName(title) {
	return (title || 'audio').replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'audio';
}

/**
 * Handler balasan angka polos owner (1 = MP3, 2 = MP4).
 * Dipanggil dari message.js sebelum dispatcher plugin.
 * @returns {boolean} true jika pesan sudah diproses
 */
export async function handlePlayChoice({ hisoka, m }) {
	const sender = m.sender;
	const entry = playChoices.get(sender);
	if (!entry) return false;
	if (Date.now() - entry.ts > CHOICE_TTL) {
		playChoices.delete(sender);
		return false;
	}

	const choice = (m.text || '').trim();
	if (choice !== '1' && choice !== '2') return false;

	const { startLoading } = await import('../helper/loading.js');

	if (choice === '2' && entry.duration > MAX_VIDEO_SEC) {
		// Pilihan tidak valid untuk video ini — pending tetap hidup biar bisa pilih 1
		await m.reply(`❌ Durasi kepanjangan (${fmtDuration(entry.duration)}).\nMaksimal 5 menit untuk MP4.\n\nBalas *1* aja buat versi MP3-nya 🎧`);
		return true;
	}

	playChoices.delete(sender); // klaim — cegah double-tap

	if (choice === '1') {
		const load = await startLoading(hisoka, m, 'Mengunduh MP3');
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'play-'));
		let fallback = null;
		try {
			let file;
			try {
				// 1. Exact video by ID (yt-dlp multi-client)
				file = await downloadYouTubeAudioById(entry.videoId, tmpDir);
			} catch {
				// 2. Fallback: cara lama via Neoxr/yt-dlp pakai query teks
				// (bisa beda upload, tapi lagunya sama)
				try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
				fallback = await downloadYouTubeAudio(entry.query);
				file = fallback.file;
			}
			const data = fs.readFileSync(file);
			const content = data.length > 100 * 1024 * 1024
				? { document: data, fileName: `${safeName(entry.title)}.mp3` }
				: { audio: data, mimetype: 'audio/mpeg', fileName: `${safeName(entry.title)}.mp3`, ptt: false };
			await load.stop();
			await hisoka.sendMessage(m.from, content, { quoted: m });
		} catch (err) {
			await load.fail('❌ ' + (err?.message || 'Gagal mengunduh audio.'));
		} finally {
			try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
			if (fallback && !fallback.cached) {
				try { cleanupYouTubeAudio(fallback.file); } catch {}
			}
		}
	} else {
		const load = await startLoading(hisoka, m, 'Mengunduh MP4');
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'play-'));
		try {
			const file = await downloadYouTubeVideo(entry.videoId, tmpDir);
			const data = fs.readFileSync(file);
			await load.stop();
			if (data.length > 100 * 1024 * 1024) {
				await hisoka.sendMessage(m.from, {
					document: data, fileName: `${safeName(entry.title)}.mp4`,
					mimetype: 'video/mp4', caption: `🎬 *${entry.title}*`,
				}, { quoted: m });
			} else {
				await hisoka.sendMessage(m.from, {
					video: data, mimetype: 'video/mp4',
					caption: `🎬 *${entry.title}*`,
				}, { quoted: m });
			}
		} catch (err) {
			await load.fail('❌ ' + (err?.message || 'Gagal mengunduh video.'));
		} finally {
			try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
		}
	}
	return true;
}

export default {
	name: 'play',
	aliases: ['playvid'],
	category: 'other',
	desc: 'Cari & download lagu/video YouTube — pilih MP3 atau MP4',
	async run(ctx) {
		const { hisoka, m, query } = ctx;
		const q = (query || '').trim();
		if (!q) {
			await m.reply('Kasih judul lagunya. Contoh: .play dj indo terbaru');
			return;
		}

		const { startLoading } = await import('../helper/loading.js');
		const load = await startLoading(hisoka, m, 'Mencari lagu');
		try {
			const v = await searchYouTube(q);
			await load.stop();

			playChoices.set(m.sender, {
				videoId: v.id,
				title: v.title,
				duration: v.duration,
				query: q,
				ts: Date.now(),
			});

			await hisoka.sendMessage(m.from, {
				image: { url: v.thumbnail },
				caption: `🎵 *${v.title}*\n⏱️ Durasi: ${fmtDuration(v.duration)}\n\nBalas pesan ini:\n*1* — Audio MP3 🎧\n*2* — Video MP4 🎬\n\n_(pilihan berlaku 5 menit)_`,
			}, { quoted: m });
		} catch (err) {
			await load.fail('❌ ' + (err?.message || 'Gagal mencari.'));
		}
	},
};
