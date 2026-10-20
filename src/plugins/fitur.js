'use strict';
// Command: fitur — daftar status semua fitur bot.
//   .fitur          -> semua fitur per kategori: ✓ aktif, ✗ rusak
//   .fitur <nama>   -> cek status satu command
// Status "rusak" diambil dari plugin yang GAGAL load + daftar manual RUSAK_MANUAL
// (untuk command yang ke-load tapi diketahui error saat dijalankan).

import * as shared from './_shared.js';
import { getPluginRegistry } from './_loader.js';

/** Command yang ke-load tapi diketahui rusak saat dijalankan — tampil sebagai ✗.
 *  Tambahkan nama command di sini kalau ada fitur yang error (huruf kecil). */
const RUSAK_MANUAL = [
	// contoh: 'namacommand',
];

const CAT_ICON = {
	'STATUS': '📊',
	'STIKER': '🖼️',
	'GAME': '🎮',
	'FUN': '🎭',
	'TOOLS': '🛠️',
	'ISLAMI & PRIMBON': '🕌',
	'downloader': '📥',
	'owner': '👑',
	'OWNER & SISTEM': '⚙️',
	'other': '📦',
};

export default {
	name: 'fitur',
	aliases: ['fiturstatus', 'statusfitur'],
	category: 'TOOLS',
	desc: 'Lihat status semua fitur: ✓ aktif, ✗ rusak.',
	async run(ctx) {
		const { m, query } = ctx;
		const { list, failed } = getPluginRegistry();
		const q = (query || '').trim().toLowerCase().replace(/^[./]/, '');

		const isRusak = (name) => RUSAK_MANUAL.includes(String(name).toLowerCase());

		// Mode cek satu command: .fitur <nama>
		if (q) {
			const found = list.find((p) =>
				p.name.toLowerCase() === q || (p.aliases || []).map((a) => a.toLowerCase()).includes(q)
			);
			const failHit = (failed || []).find((f) => f.name.toLowerCase() === q);
			if (found && !isRusak(found.name)) {
				await m.reply(
					`✅ *Fitur aktif*\n\n` +
					`• Command: .${found.name}\n` +
					`• Kategori: ${found.category}\n` +
					(found.aliases?.length ? `• Alias: ${found.aliases.map((a) => '.' + a).join(', ')}\n` : '') +
					(found.desc ? `• ${found.desc.split('\n')[0]}` : '')
				);
				return;
			}
			if (found && isRusak(found.name)) {
				await m.reply(`✗ *Fitur rusak*\n\n• Command: .${found.name}\n• Status: diketahui error saat dijalankan.`);
				return;
			}
			if (failHit) {
				await m.reply(`✗ *Fitur rusak*\n\n• File: ${failHit.file}\n• Sebab: ${failHit.reason || 'gagal dimuat'}`);
				return;
			}
			await m.reply(`❓ Command *${q}* tidak ditemukan.`);
			return;
		}

		// Mode daftar semua
		const byCat = {};
		let aktifCount = 0;
		let rusakCount = 0;
		for (const p of list) {
			const rusak = isRusak(p.name);
			if (rusak) rusakCount++;
			else aktifCount++;
			const cat = p.category || 'other';
			(byCat[cat] ||= []).push({ name: p.name, rusak, desc: (p.desc || '').split('\n')[0] });
		}
		for (const f of failed || []) rusakCount++;

		let txt = `📋 *STATUS FITUR*\n✅ ${aktifCount} aktif   ✗ ${rusakCount} rusak\n`;
		const cats = Object.keys(byCat).sort((a, b) => byCat[b].length - byCat[a].length);
		for (const cat of cats) {
			const icon = CAT_ICON[cat] || '📦';
			txt += `\n${icon} *${cat.toUpperCase()}*\n`;
			for (const f of byCat[cat]) {
				txt += `${f.rusak ? '✗' : '✓'} .${f.name}${f.desc ? ' — ' + f.desc.slice(0, 45) : ''}\n`;
			}
		}
		if ((failed || []).length) {
			txt += `\n✗ *GAGAL DIMUAT*\n`;
			for (const f of failed) {
				txt += `✗ .${f.name} — ${f.reason || 'gagal dimuat'}\n`;
			}
		}
		const manualRusak = list.filter((p) => isRusak(p.name));
		if (manualRusak.length) {
			txt += `\n✗ *RUSAK (diketahui error)*\n`;
			for (const p of manualRusak) txt += `✗ .${p.name}\n`;
		}
		txt += `\n_cek satu fitur: .fitur <nama>_`;
		await m.reply(txt);
	},
};
