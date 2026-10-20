'use strict';
// Command: brat — stiker teks ala "brat" (Charli XCX): background hijau limau,
// teks hitam blur. Contoh: .brat halo sayang
// Kategori: STIKER

import * as shared from './_shared.js';

const { fs, path, os, execFileAsync, PROJECT_ROOT } = shared;

export default {
	name: 'brat',
	aliases: ['bratsticker'],
	category: 'STIKER',
	desc: 'Bikin stiker teks ala brat. Contoh: .brat halo sayang',
	async run(ctx) {
		const { hisoka, m, query } = ctx;
		const text = (query || '').trim();
		if (!text) {
			await m.reply('Kasih teksnya. Contoh: `.brat halo sayang`');
			return;
		}
		if (text.length > 100) {
			await m.reply('❌ Teks maksimal 100 karakter.');
			return;
		}

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brat-'));
		const png = path.join(tmpDir, 'brat.png');
		const webp = path.join(tmpDir, 'brat.webp');
		try {
			await m.reply('🟢 Bikin stiker brat...');
			await execFileAsync('python3',
				[path.join(PROJECT_ROOT, 'src', 'helper', 'brat.py'), text, png],
				{ timeout: 30000 });
			await execFileAsync('/usr/bin/ffmpeg', [
				'-y', '-i', png,
				'-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
				'-vcodec', 'libwebp', '-qscale', '75', '-preset', 'default',
				'-loop', '0', '-an', '-vsync', '0', webp,
			], { timeout: 60000 });
			await hisoka.sendMessage(m.from, { sticker: fs.readFileSync(webp) }, { quoted: m });
		} catch (err) {
			await m.reply('❌ Gagal bikin stiker: ' + (err?.message || 'error'));
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	},
};
