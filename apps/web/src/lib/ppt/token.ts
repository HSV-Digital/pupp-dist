import crypto from 'node:crypto';
import { getRequiredServerEnv, getServerEnv } from '@/env.server';
import type { SignedPptTokenPayload } from '@/lib/ppt-types';

const DEFAULT_TTL_SECONDS = 600;

function getSecret(): string {
	const secret = getServerEnv().PPT_TOKEN_SECRET;

	if (secret && secret.length > 0) {
		return secret;
	}

	if (!getServerEnv().isProduction) {
		return 'agent-b-dev-ppt-token-secret';
	}

	return getRequiredServerEnv('PPT_TOKEN_SECRET');
}

function sign(encodedPayload: string): string {
	return crypto
		.createHmac('sha256', getSecret())
		.update(encodedPayload)
		.digest('base64url');
}

export function createSignedToken(
	input: Omit<SignedPptTokenPayload, 'version' | 'issuedAt' | 'expiresAt'>,
): string {
	const issuedAt = Math.floor(Date.now() / 1000);
	const ttl = getServerEnv().PPT_TOKEN_TTL_SECONDS ?? DEFAULT_TTL_SECONDS;
	const normalizedTtl =
		Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : DEFAULT_TTL_SECONDS;

	const payload: SignedPptTokenPayload = {
		version: 1,
		mode: input.mode,
		fileName: input.fileName,
		items: input.items,
		issuedAt,
		expiresAt: issuedAt + normalizedTtl,
	};

	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
		'base64url',
	);
	const signature = sign(encodedPayload);

	return `${encodedPayload}.${signature}`;
}

export function verifySignedToken(token: string): SignedPptTokenPayload {
	const [encodedPayload, signature] = token.split('.');

	if (!encodedPayload || !signature) {
		throw new Error('Invalid token format');
	}

	const expectedSignature = sign(encodedPayload);
	const actual = Buffer.from(signature);
	const expected = Buffer.from(expectedSignature);

	if (actual.length !== expected.length) {
		throw new Error('Invalid token signature');
	}

	if (!crypto.timingSafeEqual(actual, expected)) {
		throw new Error('Invalid token signature');
	}

	const parsed = JSON.parse(
		Buffer.from(encodedPayload, 'base64url').toString('utf8'),
	) as SignedPptTokenPayload;

	if (parsed.version !== 1) {
		throw new Error('Unsupported token version');
	}

	if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
		throw new Error('Invalid token payload');
	}

	const now = Math.floor(Date.now() / 1000);
	if (parsed.expiresAt < now) {
		throw new Error('Token expired');
	}

	return parsed;
}
