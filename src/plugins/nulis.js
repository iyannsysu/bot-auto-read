'use strict';
// Command: nulis — tulis teks dengan efek tulisan tangan di buku.
//   .nulis hari ini aku belajar
// Kategori: FUN

import * as shared from './_shared.js';

const { fs, path, os, execFileAsync, PROJECT_ROOT } = shared;

export default {
	name: 'nulis',
	aliases: ['tulis', 'nulisbuku'],
	category: 'FUN',
	desc: 'Tulis teks ala tulisan tangan di buku. Contoh: .nulis halo dunia',
	async run(ctx) {
		const { hisoka, m, query } = ctx;
		const text = (query || '').trim();
		if (!text) {
			await m.reply('Kasih teksnya. Contoh: `.nulis halo dunia`');
			return;
		}
		if (text.length > 500) {
			await m.reply('❌ Teks maksimal 500 karakter.');
			return;
		}

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nulis-'));
		const png = path.join(tmpDir, 'nulis.png');
		try {
			await m.reply('✍️ Menulis di buku...');
			await execFileAsync('python3',
				[path.join(PROJECT_ROOT, 'src', 'helper', 'nulis.py'), text, png],
				{ timeout: 30000 });
			await hisoka.sendMessage(m.from, {
				image: fs.readFileSync(png),
				caption: '✍️ Selesai nulis!',
			}, { quoted: m });
		} catch (err) {
			await m.reply('❌ Gagal menulis: ' + (err?.message || 'error'));
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	},
};
