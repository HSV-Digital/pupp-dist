import fs from 'node:fs';
import path from 'node:path';

let envLoaded = false;

function parseEnvLine(line: string): [string, string] | null {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith('#')) {
		return null;
	}

	const normalized = trimmed.startsWith('export ')
		? trimmed.slice('export '.length).trim()
		: trimmed;
	const equalsIndex = normalized.indexOf('=');
	if (equalsIndex <= 0) {
		return null;
	}

	const key = normalized.slice(0, equalsIndex).trim();
	let value = normalized.slice(equalsIndex + 1).trim();

	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}

	return [key, value];
}

function loadFromFile(filePath: string): void {
	if (!fs.existsSync(filePath)) {
		return;
	}

	const contents = fs.readFileSync(filePath, 'utf8');
	for (const line of contents.split(/\r?\n/u)) {
		const parsed = parseEnvLine(line);
		if (!parsed) {
			continue;
		}

		const [key, value] = parsed;
		const existingValue = process.env[key];
		if (!existingValue || existingValue.trim().length === 0) {
			process.env[key] = value;
		}
	}
}

export function ensureAppEnvLoaded(): void {
	if (envLoaded) {
		return;
	}
	envLoaded = true;

	const candidates = [
		process.env.APP_ENV_FILE?.trim(),
		path.resolve(process.cwd(), '.env'),
		path.resolve(process.cwd(), 'apps/api/.env'),
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const filePath of candidates) {
		loadFromFile(filePath);
	}
}
