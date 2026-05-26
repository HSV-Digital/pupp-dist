import { describe, expect, it } from 'vitest';

import { config, proxy } from './proxy';

function makeRequest(url: string) {
	return {
		nextUrl: new URL(url),
		cookies: { get: () => undefined },
		headers: { get: () => null },
	} as never;
}

describe('proxy', () => {
	it('matches non-API page routes', () => {
		expect(config.matcher).toContain('/((?!api|_next|.*\\..*).*)');
	});

	it('passes through page requests', async () => {
		const response = await proxy(
			makeRequest('https://partner.example.com/csp-partners'),
		);

		expect(response?.status).toBe(200);
	});
});
