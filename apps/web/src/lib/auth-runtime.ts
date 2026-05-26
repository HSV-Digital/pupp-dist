import type { JWT } from 'next-auth/jwt';
import { getToken } from 'next-auth/jwt';
import { getServerEnv } from '@/env.server';
import {
	getResellerSessionTokenCookieName,
	shouldUseSecureAuthCookies,
} from './reseller-auth-cookies';

type AuthRequestLike =
	| Request
	| {
			headers: Headers | Record<string, string>;
	  };

type AppJwt = JWT & {
	accessToken?: string;
};

export function resolveTrustHost(): boolean {
	const rawValue = getServerEnv().AUTH_TRUST_HOST;

	if (rawValue === 'true') {
		return true;
	}

	if (rawValue === 'false') {
		return false;
	}

	return !getServerEnv().isProduction;
}

function resolveAuthSecret(): string {
	const { AUTH_SECRET, NEXTAUTH_SECRET } = getServerEnv();
	const secret = AUTH_SECRET ?? NEXTAUTH_SECRET;
	if (!secret || secret.trim().length === 0) {
		throw new Error(
			'AUTH_SECRET or NEXTAUTH_SECRET environment variable is required',
		);
	}

	return secret;
}

export async function getResellerAccessToken(
	request: AuthRequestLike,
): Promise<string | null> {
	const token = (await getToken({
		req: request,
		secret: resolveAuthSecret(),
		secureCookie: shouldUseSecureAuthCookies(),
		cookieName: getResellerSessionTokenCookieName(),
	})) as AppJwt | null;

	return typeof token?.accessToken === 'string' ? token.accessToken : null;
}
