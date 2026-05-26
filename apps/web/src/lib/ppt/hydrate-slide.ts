interface TextRun {
	text: string;
	start: number;
	end: number;
}

const PLACEHOLDER_KEYS = [
	'numberOfSeats',
	'actualCost',
	'promoPricing',
	'promoCostSaving',
] as const;

type PlaceholderKey = (typeof PLACEHOLDER_KEYS)[number];

export interface PlaceholderValues {
	numberOfSeats: string | number;
	actualCost: string | number;
	promoPricing: string | number;
	promoCostSaving: string | number;
}

export function hydrateSlideXml(
	slideXml: string,
	values: PlaceholderValues,
): string {
	const runs = collectTextRuns(slideXml);
	if (runs.length === 0) return slideXml;

	for (let i = 0; i < runs.length; i++) {
		if (!runs[i].text.includes('{{')) continue;

		let j = i;
		let combined = runs[i].text;
		while (j < runs.length - 1 && !combined.includes('}}')) {
			j += 1;
			combined += runs[j].text;
		}

		const key = extractPlaceholderKey(combined);
		if (!key) continue;

		runs[i].text = String(values[key]);
		for (let cursor = i + 1; cursor <= j; cursor++) {
			runs[cursor].text = '';
		}
		i = j;
	}

	let cursor = 0;
	let output = '';
	for (const run of runs) {
		output += slideXml.slice(cursor, run.start);
		output += escapeXml(run.text);
		cursor = run.end;
	}
	output += slideXml.slice(cursor);

	return output;
}

function collectTextRuns(xml: string): TextRun[] {
	const pattern = /<a:t>([\s\S]*?)<\/a:t>/g;
	const runs: TextRun[] = [];

	let match = pattern.exec(xml);
	while (match) {
		const fullMatch = match[0];
		const innerText = match[1] ?? '';
		const fullStart = match.index;
		const textStart = fullStart + fullMatch.indexOf(innerText);
		const textEnd = textStart + innerText.length;

		runs.push({
			text: decodeXml(innerText),
			start: textStart,
			end: textEnd,
		});

		match = pattern.exec(xml);
	}

	return runs;
}

function extractPlaceholderKey(text: string): PlaceholderKey | null {
	const start = text.indexOf('{{');
	const end = text.indexOf('}}');

	if (start === -1 || end === -1 || end <= start + 2) {
		return null;
	}

	const rawKey = text.slice(start + 2, end).trim();
	const normalized = rawKey.replace(/\s+/g, '');

	return PLACEHOLDER_KEYS.includes(normalized as PlaceholderKey)
		? (normalized as PlaceholderKey)
		: null;
}

function decodeXml(value: string): string {
	return value
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'");
}

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}
