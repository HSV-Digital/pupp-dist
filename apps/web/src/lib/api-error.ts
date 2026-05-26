export async function parseJsonSafely(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

export function parseApiErrorMessage(
	payload: unknown,
	fallback: string,
): string {
	if (!payload || typeof payload !== 'object') {
		return fallback;
	}

	if ('message' in payload) {
		const message = (payload as { message?: unknown }).message;

		if (typeof message === 'string' && message.trim().length > 0) {
			return message;
		}

		if (Array.isArray(message)) {
			const joined = message
				.filter((value): value is string => typeof value === 'string')
				.join(', ');
			if (joined.trim().length > 0) {
				return joined;
			}
		}
	}

	return fallback;
}
