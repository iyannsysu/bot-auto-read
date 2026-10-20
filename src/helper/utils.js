import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { extractMessageContent, getContentType } from 'baileys';
import { PYTHON } from './paths.js';

const HELPER_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Menjalankan skrip Python (brat.py, nulis.py, hv-dl.py) dengan aman dan timeout.
 * Adaptasi ESM dari snippet user: pakai PYTHON terpusat dari paths.js,
 * path helper via import.meta.url (karena __dirname tidak ada di ESM).
 */
export function runPythonHelper(scriptName, args = [], timeoutMs = 30000) {
	return new Promise((resolve, reject) => {
		const scriptPath = path.join(HELPER_DIR, scriptName);
		execFile(
			PYTHON,
			[scriptPath, ...args],
			{ timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (error) {
					return reject(new Error(`Python Error (${scriptName}): ${stderr || error.message}`));
				}
				resolve(stdout.trim());
			}
		);
	});
}

/**
 * Pasang handler global agar bot tidak pernah mati karena UnhandledRejection.
 * Adaptasi: updater.js tidak punya method reportError, jadi panggil hanya
 * kalau tersedia (typeof === 'function'), selebihnya cukup log.
 * Guard anti-duplikat: kalau sudah terpasang, jangan pasang lagi.
 */
export function registerGlobalErrorHandlers(updaterInstance) {
	if (global.__readswGlobalHandlers) return;
	global.__readswGlobalHandlers = true;
	const report = (err, kind) => {
		try {
			if (updaterInstance && typeof updaterInstance.reportError === 'function') {
				updaterInstance.reportError(err, kind);
			}
		} catch {}
	};
	process.on('uncaughtException', err => {
		console.error('[GLOBAL-UNCAUGHT-EXCEPTION]:', err);
		report(err, 'uncaughtException');
	});
	process.on('unhandledRejection', reason => {
		console.error('[GLOBAL-UNHANDLED-REJECTION]:', reason);
		report(reason, 'unhandledRejection');
	});
}

/**
 *
 * @param {import('baileys').WAMessage} content
 * @returns {import('baileys').proto.IMessage}
 */
export function parseMessage(content) {
	let extract = extractMessageContent(content);

	if (extract && extract.viewOnceMessageV2Extension) {
		extract = extract.viewOnceMessageV2Extension.message;
	}
	if (extract && extract.protocolMessage && [14, 5, 9, 0].includes(extract.protocolMessage.type)) {
		const type = getContentType(extract.protocolMessage);
		extract = extract.protocolMessage[type];
	}
	if (extract && extract.message) {
		const type = getContentType(extract.message);
		extract = extract.message[type];
	}

	return extract || content || {};
}

/**
 *
 * @param {string} text
 * @param {boolean} isGroup
 * @returns {string[]}
 */
export function parseMention(text = '', isGroup = false) {
	if (!text) return [];

	if (typeof text == 'object' && (text.mentionedJid || text.groupMentions)) {
		const mentions = [];
		if (Array.isArray(text.mentionedJid)) mentions.push(...text.mentionedJid);
		if (Array.isArray(text.groupMentions)) text.groupMentions.forEach(v => mentions.push(v.groupJid));
		return mentions;
	}

	const regGroup = /@((\d+)-?(\d+)@g\.us)/g;
	const regUser = /@([0-9]{5,16}|0)/g;
	if (isGroup || regGroup.test(text)) {
		return Array.from(new Set([...text.match(regGroup)]))
			.filter(Boolean)
			.map(v => v.replace(/^@/, ''));
	}

	if (regUser.test(text)) {
		return Array.from(new Set([...text.matchAll(/@([0-9]{5,16}|0)/g)]?.map(v => v?.[1] + '@s.whatsapp.net'))).filter(
			Boolean
		);
	}

	return [];
}

/**
 *
 * @param {number} milliseconds
 * @returns {string}
 */
export function msToTime(milliseconds) {
	const roundTowardsZero = milliseconds > 0 ? Math.floor : Math.ceil;
	const res = {
		day: roundTowardsZero(milliseconds / 86400000),
		hour: roundTowardsZero(milliseconds / 3600000) % 24,
		minute: roundTowardsZero(milliseconds / 60000) % 60,
		second: roundTowardsZero(milliseconds / 1000) % 60,
		// millisecond: roundTowardsZero(milliseconds) % 1000,
		// microsecond: roundTowardsZero(milliseconds * 1000) % 1000,
		// nanosecond: roundTowardsZero(milliseconds * 1e6) % 1000,
	};

	const result = [];
	for (const key in res) {
		result.push(`${res[key]} ${key.length < 1 ? key : key + 's'}`);
	}

	return result.join(', ');
}

/**
 *
 * @param {string} string
 * @returns {string}
 */
export function escapeRegExp(string = '') {
	return string.replace(/[.*=+:\-?^${}()|[\]\\]|\s/g, '\\$&').replace(/-/g, '\\x2d');
}

/**
 *
 * @param {string} fileOrCode
 * @returns {Promise<string[]>}
 */
export const getCaseName = fileOrCode => {
	return new Promise((resolve, reject) => {
		const regex = /case\s+['"`]?(.*?)['"`]?\s*:/g;
		let matches = [];

		// If input is not a file, treat it as code string
		if (!fs.existsSync(fileOrCode)) {
			let match;
			while ((match = regex.exec(fileOrCode)) !== null) {
				matches.push(match[1]);
			}

			return resolve(matches);
		}

		const readStream = fs.createReadStream(fileOrCode);

		readStream.on('data', chunk => {
			let match;
			while ((match = regex.exec(chunk)) !== null) {
				matches.push(match[1]);
			}
		});

		readStream.on('end', () => {
			readStream.destroy();
			resolve(Array.from(new Set(matches)));
		});
	});
};
