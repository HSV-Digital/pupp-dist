import { z } from 'zod';
import { getPublicEnv } from './env';

const serverEnvSchema = z.object({
	API_BASE_URL: z.string().url(),
	AUTH_TRUST_HOST: z.enum(['true', 'false']).optional(),
	AUTH_SECRET: z.string().min(1).optional(),
	NEXTAUTH_SECRET: z.string().min(1).optional(),
	AZURE_AD_CLIENT_ID: z.string().min(1).optional(),
	AZURE_AD_CLIENT_SECRET: z.string().min(1).optional(),
	AZURE_AD_RESELLER_CLIENT_ID: z.string().min(1).optional(),
	AZURE_AD_RESELLER_CLIENT_SECRET: z.string().min(1).optional(),
	GOOGLE_CLIENT_ID: z.string().min(1).optional(),
	GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
	PPT_TOKEN_SECRET: z.string().min(1).optional(),
	PPT_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(600),
});

export type ServerEnv = z.infer<typeof serverEnvSchema> & {
	NODE_ENV: 'development' | 'production' | 'test';
	isProduction: boolean;
};

function normalizeServerEnv(env: NodeJS.ProcessEnv) {
	const publicEnv = getPublicEnv(env);

	return {
		API_BASE_URL: env.API_BASE_URL?.trim() || publicEnv.NEXT_PUBLIC_API_BASE_URL,
		AUTH_TRUST_HOST: env.AUTH_TRUST_HOST?.trim().toLowerCase() || undefined,
		AUTH_SECRET: env.AUTH_SECRET?.trim() || undefined,
		NEXTAUTH_SECRET: env.NEXTAUTH_SECRET?.trim() || undefined,
		AZURE_AD_CLIENT_ID: env.AZURE_AD_CLIENT_ID?.trim() || undefined,
		AZURE_AD_CLIENT_SECRET: env.AZURE_AD_CLIENT_SECRET?.trim() || undefined,
		AZURE_AD_RESELLER_CLIENT_ID:
			env.AZURE_AD_RESELLER_CLIENT_ID?.trim() || undefined,
		AZURE_AD_RESELLER_CLIENT_SECRET:
			env.AZURE_AD_RESELLER_CLIENT_SECRET?.trim() || undefined,
		GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID?.trim() || undefined,
		GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET?.trim() || undefined,
		PPT_TOKEN_SECRET: env.PPT_TOKEN_SECRET?.trim() || undefined,
		PPT_TOKEN_TTL_SECONDS: env.PPT_TOKEN_TTL_SECONDS ?? '600',
		NODE_ENV: publicEnv.NODE_ENV,
	};
}

export function getServerEnv(
	processEnv: NodeJS.ProcessEnv = process.env,
): ServerEnv {
	const normalized = normalizeServerEnv(processEnv);
	const parsed = serverEnvSchema.parse(normalized);

	return {
		...parsed,
		NODE_ENV: normalized.NODE_ENV,
		isProduction: normalized.NODE_ENV === 'production',
	};
}

export function validateServerEnv(
	processEnv: NodeJS.ProcessEnv = process.env,
): ServerEnv {
	return getServerEnv(processEnv);
}

export function getRequiredServerEnv(
	name:
		| 'AUTH_SECRET'
		| 'NEXTAUTH_SECRET'
		| 'AZURE_AD_CLIENT_ID'
		| 'AZURE_AD_CLIENT_SECRET'
		| 'AZURE_AD_RESELLER_CLIENT_ID'
		| 'AZURE_AD_RESELLER_CLIENT_SECRET'
		| 'GOOGLE_CLIENT_ID'
		| 'GOOGLE_CLIENT_SECRET'
		| 'PPT_TOKEN_SECRET',
): string {
	const value = process.env[name]?.trim();

	if (!value) {
		throw new Error(`${name} environment variable is required`);
	}

	return value;
}
