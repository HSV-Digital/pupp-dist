const PUBLIC_ORIGIN_ENV_KEYS = [
	'NEXT_PUBLIC_APP_URL',
	'PPT_PUBLIC_ORIGIN',
	'APP_ORIGIN',
	'NEXT_PUBLIC_APP_ORIGIN',
	'SITE_URL',
	'NEXT_PUBLIC_SITE_URL',
	'VERCEL_PROJECT_PRODUCTION_URL',
	'VERCEL_URL',
] as const;

export function resolvePublicOrigin(
	request: Request,
	env: NodeJS.ProcessEnv = process.env,
): string {
	const configuredOrigin = getConfiguredOrigin(env);
	if (configuredOrigin) {
		return configuredOrigin;
	}

	const forwardedHost = getFirstHeaderValue(
		request.headers,
		'x-forwarded-host',
	);
	const host = normalizeHost(forwardedHost ?? request.headers.get('host'));
	if (!host) {
		return new URL(request.url).origin;
	}

	const forwardedProto = normalizeProtocol(
		getFirstHeaderValue(request.headers, 'x-forwarded-proto'),
	);
	const protocol =
		forwardedProto ??
		inferProtocolFromHost(host) ??
		new URL(request.url).protocol.replace(':', '');

	return `${protocol}://${host}`;
}

function getConfiguredOrigin(env: NodeJS.ProcessEnv): string | null {
	for (const key of PUBLIC_ORIGIN_ENV_KEYS) {
		const value = env[key];
		if (!value) continue;

		const normalized = normalizeConfiguredOrigin(value);
		if (normalized) {
			return normalized;
		}
	}

	return null;
}

function normalizeConfiguredOrigin(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;

	const withProtocol = /^https?:\/\//i.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	try {
		const url = new URL(withProtocol);
		const protocol = normalizeProtocol(url.protocol) ?? 'https';
		return `${protocol}://${url.host}`;
	} catch {
		return null;
	}
}

function getFirstHeaderValue(headers: Headers, key: string): string | null {
	const raw = headers.get(key);
	if (!raw) return null;

	const first = raw
		.split(',')
		.map((part) => part.trim())
		.find((part) => part.length > 0);

	return first ?? null;
}

function normalizeProtocol(value: string | null): 'http' | 'https' | null {
	if (!value) return null;
	const normalized = value.trim().replace(/:$/, '').toLowerCase();

	if (normalized === 'http' || normalized === 'https') {
		return normalized;
	}

	return null;
}

function normalizeHost(value: string | null): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
	const hostOnly = withoutProtocol.split('/')[0]?.trim() ?? '';
	if (!hostOnly) return null;

	return hostOnly;
}

function inferProtocolFromHost(host: string): 'http' | 'https' {
	const normalizedHost = host.toLowerCase();
	if (
		normalizedHost.startsWith('localhost') ||
		normalizedHost.startsWith('127.0.0.1') ||
		normalizedHost.endsWith('.local')
	) {
		return 'http';
	}

	return 'https';
}
