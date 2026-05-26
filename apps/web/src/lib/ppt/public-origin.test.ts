import { describe, expect, it } from 'vitest';
import { resolvePublicOrigin } from '@/lib/ppt/public-origin';

describe('resolvePublicOrigin', () => {
	it('uses configured public origin from environment', () => {
		const request = new Request('http://localhost:3000/api/ppt/session');
		const origin = resolvePublicOrigin(request, {
			PPT_PUBLIC_ORIGIN: 'https://app.example.com',
		});

		expect(origin).toBe('https://app.example.com');
	});

	it('adds https protocol when configured origin has only hostname', () => {
		const request = new Request('http://localhost:3000/api/ppt/session');
		const origin = resolvePublicOrigin(request, {
			APP_ORIGIN: 'sales.example.com',
		});

		expect(origin).toBe('https://sales.example.com');
	});

	it('uses forwarded host and protocol headers when available', () => {
		const request = new Request('http://localhost:3000/api/ppt/session', {
			headers: {
				'x-forwarded-host': 'portal.example.com',
				'x-forwarded-proto': 'https',
			},
		});
		const origin = resolvePublicOrigin(request, {});

		expect(origin).toBe('https://portal.example.com');
	});

	it('falls back to host header and infers https for non-local hosts', () => {
		const request = new Request('http://localhost:3000/api/ppt/session', {
			headers: {
				host: 'demo.example.com',
			},
		});
		const origin = resolvePublicOrigin(request, {});

		expect(origin).toBe('https://demo.example.com');
	});

	it('infers http for localhost hosts', () => {
		const request = new Request('http://localhost:3000/api/ppt/session', {
			headers: {
				host: 'localhost:3000',
			},
		});
		const origin = resolvePublicOrigin(request, {});

		expect(origin).toBe('http://localhost:3000');
	});

	it('falls back to request origin when headers are unavailable', () => {
		const request = new Request('https://fallback.example.com/api/ppt/session');
		const origin = resolvePublicOrigin(request, {});

		expect(origin).toBe('https://fallback.example.com');
	});
});
