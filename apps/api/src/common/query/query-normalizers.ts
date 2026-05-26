export function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((entry) => `${entry}`.trim())
			.filter((entry) => entry.length > 0);
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			return [];
		}

		return [trimmed];
	}

	return [];
}
