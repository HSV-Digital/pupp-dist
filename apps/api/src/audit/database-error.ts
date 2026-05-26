interface DatabaseErrorLike {
	cause?: unknown;
	code?: unknown;
	column?: unknown;
	constraint?: unknown;
	detail?: unknown;
	hint?: unknown;
	schema?: unknown;
	severity?: unknown;
	table?: unknown;
}

function readString(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function addToken(tokens: string[], key: string, value: unknown): void {
	const normalized = readString(value);
	if (!normalized) {
		return;
	}

	tokens.push(`${key}=${normalized}`);
}

export function formatDatabaseErrorDetails(error: unknown): string | null {
	const tokens: string[] = [];
	const visited = new Set<unknown>();
	let current: unknown = error;

	while (current && typeof current === 'object' && !visited.has(current)) {
		visited.add(current);
		const candidate = current as DatabaseErrorLike;

		addToken(tokens, 'code', candidate.code);
		addToken(tokens, 'severity', candidate.severity);
		addToken(tokens, 'schema', candidate.schema);
		addToken(tokens, 'table', candidate.table);
		addToken(tokens, 'column', candidate.column);
		addToken(tokens, 'constraint', candidate.constraint);
		addToken(tokens, 'detail', candidate.detail);
		addToken(tokens, 'hint', candidate.hint);

		current = candidate.cause;
	}

	if (tokens.length === 0) {
		return null;
	}

	return [...new Set(tokens)].join(' ');
}
