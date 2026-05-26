import ExcelJS from 'exceljs';
import type { ParsedFile } from '../upload.types';

export async function parseXlsxBuffer(buffer: Buffer): Promise<ParsedFile> {
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

	const worksheet = workbook.worksheets[0];
	if (!worksheet || worksheet.rowCount === 0) {
		return { headers: [], rows: [] };
	}

	const headerRow = worksheet.getRow(1);
	const headers: string[] = [];
	headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
		headers[colNumber - 1] = String(cell.value ?? '').trim();
	});

	// Remove trailing empty headers
	while (headers.length > 0 && headers[headers.length - 1] === '') {
		headers.pop();
	}

	if (headers.length === 0) {
		return { headers: [], rows: [] };
	}

	const rows: Record<string, string>[] = [];
	for (let rowIdx = 2; rowIdx <= worksheet.rowCount; rowIdx++) {
		const row = worksheet.getRow(rowIdx);
		const record: Record<string, string> = {};
		let hasData = false;

		for (let colIdx = 0; colIdx < headers.length; colIdx++) {
			const cell = row.getCell(colIdx + 1);
			let value = '';

			if (cell.value !== null && cell.value !== undefined) {
				if (cell.value instanceof Date) {
					value = cell.value.toISOString().split('T')[0];
				} else if (typeof cell.value === 'object' && 'text' in cell.value) {
					value = String(cell.value.text ?? '').trim();
				} else {
					value = String(cell.value).trim();
				}
			}

			record[headers[colIdx]] = value;
			if (value.length > 0) hasData = true;
		}

		if (hasData) {
			rows.push(record);
		}
	}

	return { headers, rows };
}
