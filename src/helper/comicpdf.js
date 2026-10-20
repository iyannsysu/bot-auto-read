'use strict';
// Helper: gabung gambar-gambar komik jadi SATU file PDF.
// Dipakai .komik dan .manhwa biar nggak spam puluhan pesan gambar.
// (.bokep sengaja TIDAK pakai ini — video tetap dikirim biasa.)

import PDFDocument from 'pdfkit';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

/** Deteksi tipe gambar dari magic bytes. */
function detectType(buf) {
	if (!buf || buf.length < 4) return 'other';
	if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
	if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
	return 'other'; // webp, gif, dll -> konversi via ffmpeg
}

/** Konversi gambar non-jpg/png ke JPEG via ffmpeg. */
async function toJpg(buf) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfconv-'));
	try {
		const inp = path.join(tmp, 'in.bin');
		const out = path.join(tmp, 'out.jpg');
		fs.writeFileSync(inp, buf);
		await execFileAsync('ffmpeg', ['-y', '-v', 'error', '-i', inp, '-q:v', '3', out]);
		return fs.readFileSync(out);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

/**
 * @param {Buffer[]} buffers - array buffer gambar (halaman komik, urut)
 * @param {object} opts - { title }
 * @returns {Promise<Buffer>} buffer PDF (satu halaman per gambar, ukuran asli)
 */
export async function imagesToPdf(buffers, opts = {}) {
	const doc = new PDFDocument({ autoFirstPage: false, info: { Title: opts.title || 'komik' } });
	const chunks = [];
	doc.on('data', (c) => chunks.push(c));
	const done = new Promise((res) => doc.on('end', res));

	for (const raw of buffers) {
		let buf = raw;
		const type = detectType(raw);
		if (type === 'other') {
			try {
				buf = await toJpg(raw);
			} catch {
				continue; // halaman gagal konversi -> lewati
			}
		}
		try {
			const img = doc.openImage(buf);
			doc.addPage({ size: [img.width, img.height], margin: 0 });
			doc.image(img, 0, 0);
		} catch {
			// halaman rusak -> lewati
		}
	}
	doc.end();
	await done;
	return Buffer.concat(chunks);
}

/** Nama file yang aman untuk dikirim via WhatsApp. */
export function safePdfName(name) {
	return String(name || 'komik')
		.replace(/[\\/:*?"<>|]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 60) + '.pdf';
}
