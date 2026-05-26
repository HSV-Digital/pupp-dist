import { z } from 'zod';

const DEMO_FLAG_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const publicEnvSchema = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	NEXT_PUBLIC_APP_URL: z.string().url(),
	NEXT_PUBLIC_API_BASE_URL: z.string().url(),
	NEXT_PUBLIC_ASSET_BASE_URL: z.string().url().optional(),
	NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
	NEXT_PUBLIC_POSTHOG_HOST: z.string().url(),
	NEXT_PUBLIC_PLAUSIBLE_DOMAIN: z.string().min(1).optional(),
	NEXT_PUBLIC_PLAUSIBLE_API_HOST: z.string().url().optional(),
	NEXT_PUBLIC_HSV_DIGITAL_TENANT_ID: z.string().min(1).optional(),
	NEXT_PUBLIC_ENABLE_DEMO: z.boolean(),
	NEXT_PUBLIC_THEME: z.literal('brand-a').default('brand-a'),
});

export type PublicEnv = z.infer<typeof publicEnvSchema> & {
	isProduction: boolean;
};

function isValidationSkipped(env: NodeJS.ProcessEnv): boolean {
	return env.SKIP_ENV_VALIDATION?.trim().toLowerCase() === 'true';
}

function firstNonEmptyValue(...values: Array<string | undefined>): string | undefined {
	for (const value of values) {
		if (value && value.trim().length > 0) {
			return value.trim();
		}
	}

	return undefined;
}

function resolvePublicAppUrl(env: NodeJS.ProcessEnv): string {
	// NEXT_PUBLIC_* must be accessed via process.env directly so Next.js inlines them on the client.
	const candidate = firstNonEmptyValue(
		process.env.NEXT_PUBLIC_APP_URL,
		process.env.NEXT_PUBLIC_SITE_URL,
		env.SITE_URL,
		process.env.NEXT_PUBLIC_APP_ORIGIN,
		env.APP_ORIGIN,
		env.VERCEL_PROJECT_PRODUCTION_URL,
		env.VERCEL_URL,
	);

	if (!candidate) {
		return 'http://localhost:3000';
	}

	if (/^https?:\/\//i.test(candidate)) {
		return candidate;
	}

	const host = candidate.replace(/^\/+|\/+$/g, '');
	const protocol =
		host.startsWith('localhost') || host.startsWith('127.0.0.1')
			? 'http'
			: 'https';

	return `${protocol}://${host}`;
}

function resolveApiBaseUrl(env: NodeJS.ProcessEnv): string {
	// Access NEXT_PUBLIC_* vars directly so Next.js can inline them at build time.
	// Indirect access (e.g. env.NEXT_PUBLIC_API_BASE_URL via a parameter) is NOT
	// replaced by Next.js on the client, causing the fallback to kick in.
	return (
		firstNonEmptyValue(
			process.env.NEXT_PUBLIC_API_BASE_URL,
			process.env.NEXT_PUBLIC_API_URL,
			env.API_BASE_URL,
		) ?? 'http://localhost:3001'
	);
}

function resolvePostHogHost(_env: NodeJS.ProcessEnv): string {
	return process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';
}

function resolveAssetBaseUrl(_env: NodeJS.ProcessEnv): string | undefined {
	return firstNonEmptyValue(
		process.env.NEXT_PUBLIC_ASSET_BASE_URL,
		process.env.NEXT_PUBLIC_CDN_URL,
	);
}

function resolveDemoFlag(_env: NodeJS.ProcessEnv): boolean {
	return DEMO_FLAG_TRUE_VALUES.has(
		process.env.NEXT_PUBLIC_ENABLE_DEMO?.trim().toLowerCase() ?? '',
	);
}

function normalizePublicEnv(env: NodeJS.ProcessEnv): z.infer<typeof publicEnvSchema> {
	return {
		NODE_ENV:
			env.NODE_ENV === 'production' || env.NODE_ENV === 'test'
				? env.NODE_ENV
				: 'development',
		NEXT_PUBLIC_APP_URL: resolvePublicAppUrl(env),
		NEXT_PUBLIC_API_BASE_URL: resolveApiBaseUrl(env),
		NEXT_PUBLIC_ASSET_BASE_URL: resolveAssetBaseUrl(env),
		NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || undefined,
		NEXT_PUBLIC_POSTHOG_HOST: resolvePostHogHost(env),
		NEXT_PUBLIC_PLAUSIBLE_DOMAIN:
			process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim() || undefined,
		NEXT_PUBLIC_PLAUSIBLE_API_HOST:
			process.env.NEXT_PUBLIC_PLAUSIBLE_API_HOST?.trim() || undefined,
		NEXT_PUBLIC_HSV_DIGITAL_TENANT_ID:
			process.env.NEXT_PUBLIC_HSV_DIGITAL_TENANT_ID?.trim() || undefined,
		NEXT_PUBLIC_ENABLE_DEMO: resolveDemoFlag(env),
		NEXT_PUBLIC_THEME: 'brand-a',
	};
}

export function getPublicEnv(processEnv: NodeJS.ProcessEnv = process.env): PublicEnv {
	const normalized = normalizePublicEnv(processEnv);
	const parsed = isValidationSkipped(processEnv)
		? normalized
		: publicEnvSchema.parse(normalized);

	return {
		...parsed,
		isProduction: parsed.NODE_ENV === 'production',
	};
}

export function validatePublicEnv(
	processEnv: NodeJS.ProcessEnv = process.env,
): PublicEnv {
	return getPublicEnv(processEnv);
}

export function getConfiguredAssetOrigin(
	processEnv: NodeJS.ProcessEnv = process.env,
): string | null {
	const assetBaseUrl = getPublicEnv(processEnv).NEXT_PUBLIC_ASSET_BASE_URL;
	if (!assetBaseUrl) {
		return null;
	}

	return new URL(assetBaseUrl).origin;
}

export function resolvePublicAssetUrl(
	path: string,
	processEnv: NodeJS.ProcessEnv = process.env,
): string {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	const assetBaseUrl = getPublicEnv(processEnv).NEXT_PUBLIC_ASSET_BASE_URL;

	if (!assetBaseUrl) {
		return normalizedPath;
	}

	return new URL(normalizedPath, `${assetBaseUrl.replace(/\/+$/u, '')}/`).toString();
}

export function isDemoModeEnabled(
	processEnv: NodeJS.ProcessEnv = process.env,
): boolean {
	return getPublicEnv(processEnv).NEXT_PUBLIC_ENABLE_DEMO;
}

export function assertDemoModeEnabled(
	featureName = 'Demo mode',
	processEnv: NodeJS.ProcessEnv = process.env,
): void {
	if (isDemoModeEnabled(processEnv)) {
		return;
	}

	throw new Error(
		`${featureName} is disabled. Set NEXT_PUBLIC_ENABLE_DEMO=true to enable demo-only surfaces.`,
	);
}

export const env = new Proxy({} as PublicEnv, {
	get(_target, property) {
		return getPublicEnv()[property as keyof PublicEnv];
	},
});
