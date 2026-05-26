import { describe, expect, it } from 'vitest';
import {
	assertDemoModeEnabled,
	getConfiguredAssetOrigin,
	getPublicEnv,
	resolvePublicAssetUrl,
} from './env';

describe('getPublicEnv', () => {
	it('normalizes canonical partner-facing public env values', () => {
		const result = getPublicEnv({
			NODE_ENV: 'production',
			NEXT_PUBLIC_APP_URL: 'https://partner.example.com',
			NEXT_PUBLIC_API_BASE_URL: 'https://api.partner.example.com',
			NEXT_PUBLIC_ASSET_BASE_URL: 'https://assets.partner.example.com',
			NEXT_PUBLIC_POSTHOG_KEY: 'phc_test',
			NEXT_PUBLIC_ENABLE_DEMO: 'true',
		});

		expect(result).toMatchObject({
			NODE_ENV: 'production',
			NEXT_PUBLIC_APP_URL: 'https://partner.example.com',
			NEXT_PUBLIC_API_BASE_URL: 'https://api.partner.example.com',
			NEXT_PUBLIC_ASSET_BASE_URL: 'https://assets.partner.example.com',
			NEXT_PUBLIC_POSTHOG_KEY: 'phc_test',
			NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com',
			NEXT_PUBLIC_ENABLE_DEMO: true,
			isProduction: true,
		});
	});

	it('supports legacy aliases while exposing canonical values', () => {
		const result = getPublicEnv({
			SITE_URL: 'partner.example.com',
			NEXT_PUBLIC_API_URL: 'https://legacy-api.partner.example.com',
			NEXT_PUBLIC_CDN_URL: 'https://legacy-assets.partner.example.com',
		});

		expect(result).toMatchObject({
			NEXT_PUBLIC_APP_URL: 'https://partner.example.com',
			NEXT_PUBLIC_API_BASE_URL: 'https://legacy-api.partner.example.com',
			NEXT_PUBLIC_ASSET_BASE_URL: 'https://legacy-assets.partner.example.com',
		});
	});
});

describe('demo mode helpers', () => {
	it('throws when demo mode is disabled', () => {
		expect(() =>
			assertDemoModeEnabled(
				'Demo feature',
				{
					NEXT_PUBLIC_APP_URL: 'https://partner.example.com',
					NEXT_PUBLIC_API_BASE_URL: 'https://api.partner.example.com',
				},
			),
		).toThrow(
			'Demo feature is disabled. Set NEXT_PUBLIC_ENABLE_DEMO=true to enable demo-only surfaces.',
		);
	});

	it('does not throw when demo mode is enabled', () => {
		expect(() =>
			assertDemoModeEnabled(
				'Demo feature',
				{
					NEXT_PUBLIC_APP_URL: 'https://partner.example.com',
					NEXT_PUBLIC_API_BASE_URL: 'https://api.partner.example.com',
					NEXT_PUBLIC_ENABLE_DEMO: 'true',
				},
			),
		).not.toThrow();
	});
});

describe('asset url helpers', () => {
	it('returns the configured asset origin', () => {
		expect(
			getConfiguredAssetOrigin({
				NEXT_PUBLIC_APP_URL: 'https://partner.example.com',
				NEXT_PUBLIC_API_BASE_URL: 'https://api.partner.example.com',
				NEXT_PUBLIC_ASSET_BASE_URL: 'https://assets.partner.example.com',
			}),
		).toBe('https://assets.partner.example.com');
	});

	it('builds asset urls against the configured asset base', () => {
		expect(
			resolvePublicAssetUrl('/dashboard-bg.png', {
				NEXT_PUBLIC_APP_URL: 'https://partner.example.com',
				NEXT_PUBLIC_API_BASE_URL: 'https://api.partner.example.com',
				NEXT_PUBLIC_ASSET_BASE_URL: 'https://assets.partner.example.com',
			}),
		).toBe(
			'https://assets.partner.example.com/dashboard-bg.png',
		);
	});
});
