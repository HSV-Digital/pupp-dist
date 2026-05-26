import type { NextRequest } from 'next/server';
import { getServerApiBaseUrl } from './api-base-url';

const PASSTHROUGH_HEADER_NAMES = new Set([
	'accept',
	'accept-language',
	'content-type',
	'if-match',
	'if-none-match',
	'if-modified-since',
	'if-unmodified-since',
	'range',
]);

function buildUpstreamHeaders(
	request: NextRequest,
	accessToken: string | null,
): Headers {
	const headers = new Headers();

	for (const [key, value] of request.headers.entries()) {
		if (PASSTHROUGH_HEADER_NAMES.has(key.toLowerCase())) {
			headers.set(key, value);
		}
	}

	if (accessToken) {
		headers.set('Authorization', `Bearer ${accessToken}`);
	}
	return headers;
}

export async function proxyBackendRequest(params: {
	request: NextRequest;
	pathSegments: string[];
	accessToken: string | null;
}): Promise<Response> {
	const upstreamPath = `/${params.pathSegments.join('/')}`;
	const upstreamUrl = new URL(upstreamPath, getServerApiBaseUrl());
	upstreamUrl.search = params.request.nextUrl.search;

	const requestInit: RequestInit & { duplex?: 'half' } = {
		method: params.request.method,
		headers: buildUpstreamHeaders(params.request, params.accessToken),
		cache: 'no-store',
		redirect: 'manual',
	};

	if (
		params.request.method !== 'GET' &&
		params.request.method !== 'HEAD' &&
		params.request.body
	) {
		requestInit.body = params.request.body;
		requestInit.duplex = 'half';
	}

	const upstreamResponse = await fetch(upstreamUrl, requestInit);
	return new Response(upstreamResponse.body, {
		status: upstreamResponse.status,
		headers: upstreamResponse.headers,
	});
}
