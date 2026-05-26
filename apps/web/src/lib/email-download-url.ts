import { getClientApiBaseUrl } from '@/lib/api-base-url';

const API_HOST_OVERRIDES = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

const CSP_PARTNERS_PREFIX = '/csp-partners';

function buildCspPartnersPath(pathWithQuery: string): string {
	const normalized = pathWithQuery.startsWith('/')
		? pathWithQuery
		: `/${pathWithQuery}`;
	return `${CSP_PARTNERS_PREFIX}${normalized}`;
}

function isApiHost(hostname: string): boolean {
	if (API_HOST_OVERRIDES.has(hostname)) {
		return true;
	}
	try {
		const apiHost = new URL(getClientApiBaseUrl()).hostname;
		return hostname === apiHost;
	} catch {
		return false;
	}
}

/**
 * Normalises download URLs returned by the backend so the browser fetches them
 * through the same-origin `/csp-partners` proxy instead of hitting the API
 * domain directly. Non-API absolute URLs (e.g. Azure blob storage) are passed
 * through unchanged.
 */
export function resolveEmailDownloadUrl(rawUrl: string): string {
	const url = rawUrl.trim();
	if (url.length === 0) {
		return rawUrl;
	}

	if (url.startsWith('/')) {
		return buildCspPartnersPath(url);
	}

	try {
		const parsed = new URL(url);
		if (!isApiHost(parsed.hostname)) {
			return parsed.toString();
		}
		return buildCspPartnersPath(
			`${parsed.pathname}${parsed.search}${parsed.hash}`,
		);
	} catch {
		return rawUrl;
	}
}
