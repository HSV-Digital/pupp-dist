import { getClientApiBaseUrl } from '@/lib/api-base-url';

export async function apiFetch(
	path: string,
	options: RequestInit = {},
): Promise<Response> {
	const headers = new Headers(options.headers);

	if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}

	const normalizedPath = path.startsWith('/') ? path : `/${path}`;

	return fetch(`/api/proxy${normalizedPath}`, {
		...options,
		headers,
		cache: 'no-store',
	});
}

export async function publicApiFetch(
	path: string,
	options: RequestInit = {},
): Promise<Response> {
	const headers = new Headers(options.headers);

	if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}

	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	const baseUrl = getClientApiBaseUrl();
	return fetch(`${baseUrl}${normalizedPath}`, { ...options, headers });
}

/**
 * Public fetch routed via the Next.js proxy under the `/csp-partners` surface
 * so the browser-visible URL (Network tab, logs) matches the calling page
 * (e.g. /csp-partners/api/email/proposal-assets/load-public). The next.config
 * rewrite maps /csp-partners/api/:path* to /api/:path*, where the catch-all
 * proxy route forwards to the backend without requiring auth.
 *
 * @param path Backend path including the /api prefix
 *             (e.g. '/api/email/proposal-assets/load-public').
 */
export async function cspPartnerPublicApiFetch(
	path: string,
	options: RequestInit = {},
): Promise<Response> {
	const headers = new Headers(options.headers);

	if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}

	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	return fetch(`/csp-partners${normalizedPath}`, {
		...options,
		headers,
		cache: 'no-store',
	});
}
