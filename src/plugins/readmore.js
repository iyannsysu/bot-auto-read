'use strict';
// Command: readmore — sembunyikan teks di balik "baca selengkapnya".
//   .readmore judul | isi rahasia
//   .readmore isi rahasia   (tanpa judul)
// Trik: selipkan 4000x U+200E (LEFT-TO-RIGHT MARK) agar WhatsApp melipat pesan.
// Kategori: TOOLS

import * as shared from './_shared.js';

const FILLER = '\u200e'.repeat(4000);

export default {
	name: 'readmore',
	aliases: ['rm', 'spoiler', 'readmoretext'],
	category: 'TOOLS',
	desc: 'Sembunyikan teks di balik "baca selengkapnya". .readmore judul | isi',
	async run(ctx) {
		const { m, query } = ctx;
		const raw = (query || '').trim();
		if (!raw) {
			await m.reply(
				'🙈 *READMORE*\n\n' +
				'• `.readmore judul | isi rahasia`\n' +
				'• `.readmore isi rahasia` (tanpa judul)'
			);
			return;
		}
		const sep = raw.indexOf('|');
		let head, tail;
		if (sep > 0) {
			head = raw.slice(0, sep).trim();
			tail = raw.slice(sep + 1).trim();
		} else {
			head = '';
			tail = raw;
		}
		if (!tail) {
			await m.reply('❌ Isi rahasianya kosong.');
			return;
		}
		const msg = (head ? head + '\n' : '') + FILLER + '\n' + tail;
		await m.reply(msg);
	},
};
