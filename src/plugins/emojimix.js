'use strict';
// Command: emojimix — gabung 2 emoji jadi 1 stiker (Emoji Kitchen).
//   .emojimix 😂 😭   atau   .emojimix 😂+😭
// Kategori: STIKER

import * as shared from './_shared.js';

const { fs, path, os, execFileAsync } = shared;

// Versi Emoji Kitchen yang dicoba berurutan (baru -> lama).
const VERSIONS = ['20201001', '20210831', '20211101', '20220401'];

/** Ubah 1 emoji jadi codepoint hex ala Emoji Kitchen (u1f602). */
function emojiToCode(emoji) {
	const cps = [...emoji].map((ch) => ch.codePointAt(0).toString(16)).filter(Boolean);
	// buang variation selector FE0F
	const filtered = cps.filter((c) => c !== 'fe0f');
	return 'u' + filtered.join('_u');
}

function extractEmojis(text) {
	// ambil 2 emoji pertama dari teks (abaikan spasi/+/-)
	const cleaned = text.replace(/[\s+×x,-]+/g, ' ').trim();
	const matches = [...cleaned.matchAll(/\p{Extended_Pictographic}/gu)].map((m) => m[0]);
	return matches.slice(0, 2);
}

async function fetchMix(e1, e2) {
	const c1 = emojiToCode(e1);
	const c2 = emojiToCode(e2);
	const pairs = [
		[`${c1}/${c1}_${c2}`, `${c2}/${c2}_${c1}`],
	];
	for (const v of VERSIONS) {
		for (const [p1, p2] of pairs) {
			for (const p of [p1, p2]) {
				try {
					const url = `https://www.gstatic.com/android/keyboard/emojikitchen/${v}/${p}.png`;
					const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
					if (res.ok) {
						const buf = Buffer.from(await res.arrayBuffer());
						if (buf.length > 3000) return buf; // 404 page hanya ~1.6KB
					}
				} catch {}
			}
		}
	}
	return null;
}

export default {
	name: 'emojimix',
	aliases: ['emix', 'mixemoji'],
	category: 'STIKER',
	desc: 'Gabung 2 emoji jadi stiker. Contoh: .emojimix 😂 😭',
	async run(ctx) {
		const { hisoka, m, query } = ctx;
		const raw = (query || '').trim();
		const [e1, e2] = extractEmojis(raw);
		if (!e1 || !e2) {
			await m.reply('Kasih 2 emoji. Contoh: `.emojimix 😂 😭`');
			return;
		}
		await m.reply(`🧪 Mencampur ${e1} + ${e2}...`);
		const buf = await fetchMix(e1, e2);
		if (!buf) {
			await m.reply('❌ Kombinasi itu tidak tersedia di Emoji Kitchen. Coba emoji lain.');
			return;
		}
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emix-'));
		const png = path.join(tmpDir, 'mix.png');
		const webp = path.join(tmpDir, 'mix.webp');
		try {
			fs.writeFileSync(png, buf);
			await execFileAsync('/usr/bin/ffmpeg', [
				'-y', '-i', png,
				'-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
				'-vcodec', 'libwebp', '-qscale', '75', '-preset', 'default',
				'-loop', '0', '-an', '-vsync', '0', webp,
			], { timeout: 60000 });
			await hisoka.sendMessage(m.from, { sticker: fs.readFileSync(webp) }, { quoted: m });
		} catch {
			await m.reply('❌ Gagal membuat stiker.');
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	},
};
