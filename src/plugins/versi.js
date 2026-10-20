'use strict';
// Command: versi — info versi & status bot.
// Kategori: other

import * as shared from './_shared.js';

// Update tanggal ini setiap rilis/update besar.
const BUILD_DATE = '2026-10-08';
const BUILD_NOTE = 'ppic aman, play2 tanpa login, s18 auto-kompres';

export default {
	name: 'versi',
	aliases: ['version', 'ver'],
	category: 'other',
	desc: 'Lihat versi & status bot. Contoh: .versi',
	async run(ctx) {
		const { hisoka, m } = ctx;
		const cmdCount = hisoka.loadedCommands?.length || '-';
		const upSec = Math.floor(process.uptime());
		const upH = Math.floor(upSec / 3600);
		const upM = Math.floor((upSec % 3600) / 60);
		const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
		await m.reply(
			`🤖 *READSW SELF-BOT*\n\n` +
			`📦 Build: ${BUILD_DATE}\n` +
			`📝 ${BUILD_NOTE}\n` +
			`⚙️ Command aktif: ${cmdCount}\n` +
			`⏱️ Uptime: ${upH}j ${upM}m\n` +
			`💾 RAM: ${memMB} MB\n` +
			`🟢 Status: online`
		);
	},
};
