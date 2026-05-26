import { getServerEnv } from '@/env.server';

export function shouldUseSecureAuthCookies(): boolean {
	return getServerEnv().isProduction;
}

function getResellerCookiePrefix(): string {
	return shouldUseSecureAuthCookies() ? '__Secure-' : '';
}

export function buildResellerCookies() {
	const secure = shouldUseSecureAuthCookies();
	const securePrefix = getResellerCookiePrefix();

	return {
		sessionToken: {
			name: `${securePrefix}reseller-authjs.session-token`,
			options: {
				httpOnly: true,
				sameSite: 'lax' as const,
				path: '/',
				secure,
			},
		},
		callbackUrl: {
			name: `${securePrefix}reseller-authjs.callback-url`,
			options: {
				httpOnly: true,
				sameSite: 'lax' as const,
				path: '/',
				secure,
			},
		},
		csrfToken: {
			name: `${secure ? '__Host-' : ''}reseller-authjs.csrf-token`,
			options: {
				httpOnly: true,
				sameSite: 'lax' as const,
				path: '/',
				secure,
			},
		},
		pkceCodeVerifier: {
			name: `${securePrefix}reseller-authjs.pkce.code_verifier`,
			options: {
				httpOnly: true,
				sameSite: 'lax' as const,
				path: '/',
				secure,
				maxAge: 60 * 15,
			},
		},
		state: {
			name: `${securePrefix}reseller-authjs.state`,
			options: {
				httpOnly: true,
				sameSite: 'lax' as const,
				path: '/',
				secure,
				maxAge: 60 * 15,
			},
		},
		nonce: {
			name: `${securePrefix}reseller-authjs.nonce`,
			options: {
				httpOnly: true,
				sameSite: 'lax' as const,
				path: '/',
				secure,
			},
		},
	};
}

export function getResellerSessionTokenCookieName(): string {
	return buildResellerCookies().sessionToken.name;
}
