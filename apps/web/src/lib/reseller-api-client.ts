export async function resellerApiFetch(
	path: string,
	options: RequestInit = {},
): Promise<Response> {
	const headers = new Headers(options.headers);

	if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
		headers.set('Content-Type', 'application/json');
	}

	const normalizedPath = path.startsWith('/') ? path : `/${path}`;

	return fetch(`/csp-partners/api/reseller/proxy${normalizedPath}`, {
		...options,
		headers,
		cache: 'no-store',
	});
}
