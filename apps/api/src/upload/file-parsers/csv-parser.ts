import type { ParsedFile } from '../upload.types';

// Matches the upload controllers' multer fileSize limit.
const MAX_CSV_BYTES = 50 * 1024 * 1024;

function normalizeCsvText(buffer: Buffer): string {
	const text = buffer.toString('utf-8');
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseCsvText(text: string): string[][] {
	let index = 0;
	let inQuotes = false;
	let field = '';
	let row: string[] = [];
	const rows: string[][] = [];

	while (index < text.length) {
		const current = text[index];

		if (inQuotes) {
			if (current === '"') {
				const next = text[index + 1];
				if (next === '"') {
					field += '"';
					index += 2;
					continue;
				}
				inQuotes = false;
				index++;
				continue;
			}
			field += current;
			index++;
			continue;
		}

		if (current === '"') {
			inQuotes = true;
			index++;
			continue;
		}

		if (current === ',') {
			row.push(field);
			field = '';
			index++;
			continue;
		}

		if (current === '\r') {
			index++;
			continue;
		}

		if (current === '\n') {
			row.push(field);
			field = '';
			if (row.some((cell) => cell.trim().length > 0)) {
				rows.push(row);
			}
			row = [];
			index++;
			continue;
		}

		field += current;
		index++;
	}

	// Handle last row
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		if (row.some((cell) => cell.trim().length > 0)) {
			rows.push(row);
		}
	}

	return rows;
}

export function parseCsvBuffer(buffer: Buffer): ParsedFile {
	if (!Buffer.isBuffer(buffer)) {
		throw new TypeError('CSV input must be a Buffer');
	}
	if (buffer.length > MAX_CSV_BYTES) {
		throw new RangeError(
			`CSV file exceeds the ${MAX_CSV_BYTES / (1024 * 1024)}MB limit`,
		);
	}

	const text = normalizeCsvText(buffer);
	const rawRows = parseCsvText(text);

	if (rawRows.length === 0) {
		return { headers: [], rows: [] };
	}

	const headers = rawRows[0].map((h) => h.trim());
	const rows: Record<string, string>[] = [];

	for (let i = 1; i < rawRows.length; i++) {
		const rawRow = rawRows[i];
		const record: Record<string, string> = {};
		for (let j = 0; j < headers.length; j++) {
			record[headers[j]] = rawRow[j]?.trim() ?? '';
		}
		rows.push(record);
	}

	return { headers, rows };
}
