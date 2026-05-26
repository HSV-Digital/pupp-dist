import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import Credentials from 'next-auth/providers/credentials';
import type { JWT } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import isEmail from 'validator/lib/isEmail';
import { getRequiredServerEnv, getServerEnv } from '@/env.server';
import { resolveTrustHost } from '@/lib/auth-runtime';
import { buildResellerCookies } from '@/lib/reseller-auth-cookies';
import { bootstrapResellerUser } from '@/lib/reseller-user-provisioning';

const AZURE_AD_RESELLER_CLIENT_ID = getRequiredServerEnv(
	'AZURE_AD_RESELLER_CLIENT_ID',
);
const AZURE_AD_RESELLER_CLIENT_SECRET = getRequiredServerEnv(
	'AZURE_AD_RESELLER_CLIENT_SECRET',
);
const { API_BASE_URL = 'http://localhost:4000' } = getServerEnv();
const API_SCOPE = `api://${AZURE_AD_RESELLER_CLIENT_ID}/access_as_user`;
const RESELLER_API_AUTH_SCOPE = `openid profile email offline_access ${API_SCOPE}`;

// Login scope: Partner Center + openid (single resource API).
// Our own API token is obtained separately via refresh token exchange.
const PARTNER_CENTER_SCOPE =
	'https://api.partnercenter.microsoft.com/user_impersonation';
const RESELLER_LOGIN_SCOPE = `openid profile email offline_access ${PARTNER_CENTER_SCOPE}`;

// Emails that bypass Partner Center MPN verification (case-insensitive).
const PARTNER_VERIFICATION_BYPASS_EMAILS = [
	'erwin.visser@microsoft.com',
	'frebla@microsoft.com',
	'shubham.choudhary@microsoft.com',
];

function isPartnerVerificationBypassed(email: string): boolean {
	return PARTNER_VERIFICATION_BYPASS_EMAILS.includes(email.toLowerCase());
}

interface ResellerBootstrapAccount extends Record<string, unknown> {
	resellerBootstrap?: Awaited<ReturnType<typeof bootstrapResellerUser>>;
}

function isProtectedResellerPath(pathname: string): boolean {
	return (
		pathname.startsWith('/reseller/') ||
		pathname.startsWith('/csp-partners/')
	);
}

function readProfileClaim(profile: unknown, claim: string): string | null {
	if (!profile || typeof profile !== 'object') {
		return null;
	}

	const value = (profile as Record<string, unknown>)[claim];
	return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

async function exchangeRefreshTokenForScope(
	refreshToken: string,
	scope: string,
): Promise<{
	accessToken: string;
	refreshToken?: string;
	expiresIn?: number;
}> {
	const response = await fetch(
		'https://login.microsoftonline.com/common/oauth2/v2.0/token',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				client_id: AZURE_AD_RESELLER_CLIENT_ID,
				client_secret: AZURE_AD_RESELLER_CLIENT_SECRET,
				grant_type: 'refresh_token',
				refresh_token: refreshToken,
				scope,
			}),
			cache: 'no-store',
		},
	);

	const tokenResult = (await response.json()) as Record<string, unknown>;
	if (!response.ok || !tokenResult.access_token) {
		console.error(
			`[reseller-auth] Token exchange failed for scope "${scope}"`,
			{
				status: response.status,
				error: tokenResult.error,
				errorDescription: tokenResult.error_description,
				errorCodes: tokenResult.error_codes,
			},
		);
		throw new Error(
			`Reseller token exchange failed for scope "${scope}" with status ${response.status}: ${tokenResult.error_description || tokenResult.error || 'unknown'}`,
		);
	}

	return {
		accessToken: tokenResult.access_token as string,
		refreshToken: tokenResult.refresh_token as string | undefined,
		expiresIn: tokenResult.expires_in as number | undefined,
	};
}

async function getResellerApiAccessToken(refreshToken: string) {
	return exchangeRefreshTokenForScope(refreshToken, RESELLER_API_AUTH_SCOPE);
}

async function bootstrapResellerSession(params: {
	apiAccessToken: string;
	providerSubject: string;
	email: string;
	displayName?: string | null;
	issuer?: string | null;
	tenantId?: string | null;
	mpnId?: string | null;
}) {
	return bootstrapResellerUser({
		apiAccessToken: params.apiAccessToken,
		provider: 'entra',
		providerSubject: params.providerSubject,
		email: params.email,
		displayName: params.displayName ?? null,
		issuer: params.issuer ?? null,
		tenantId: params.tenantId ?? null,
		mpnId: params.mpnId ?? null,
	});
}

function clearResellerSessionToken(token: JWT, error: string): JWT {
	return {
		...token,
		userType: undefined,
		accessToken: undefined,
		expiresAt: undefined,
		orgId: undefined,
		resellerUserId: undefined,
		roles: [],
		error,
	};
}

async function resolveBootstrapApiAccessToken(
	account: Record<string, unknown>,
) {
	// account.access_token is Partner Center-scoped, not our API.
	// Always exchange the refresh token for an API-scoped token.
	const refreshToken =
		typeof account.refresh_token === 'string'
			? account.refresh_token.trim()
			: '';
	if (refreshToken.length === 0) {
		return null;
	}

	const exchanged = await getResellerApiAccessToken(refreshToken);
	return {
		accessToken: exchanged.accessToken,
		refreshToken: exchanged.refreshToken ?? refreshToken,
	};
}

async function refreshResellerSessionToken(token: JWT): Promise<JWT> {
	if (!token.refreshToken || typeof token.refreshToken !== 'string') {
		return clearResellerSessionToken(token, 'MissingRefreshToken');
	}

	if (
		typeof token.providerSubject !== 'string' ||
		typeof token.appEmail !== 'string'
	) {
		return clearResellerSessionToken(token, 'MissingResellerIdentity');
	}

	try {
		const refreshedProvider = await getResellerApiAccessToken(
			token.refreshToken,
		);
		const bootstrapped = await bootstrapResellerSession({
			apiAccessToken: refreshedProvider.accessToken,
			providerSubject: token.providerSubject,
			email: token.appEmail,
			displayName:
				typeof token.displayName === 'string' ? token.displayName : null,
			issuer: typeof token.issuer === 'string' ? token.issuer : null,
			tenantId:
				typeof token.externalTenantId === 'string'
					? token.externalTenantId
					: null,
			mpnId: typeof token.mpnId === 'string' ? token.mpnId : null,
		});

		return {
			...token,
			userType: 'reseller',
			accessToken: bootstrapped.accessToken,
			refreshToken: refreshedProvider.refreshToken ?? token.refreshToken,
			expiresAt: bootstrapped.accessTokenExpiresAt,
			appEmail: bootstrapped.user.email,
			displayName: bootstrapped.user.displayName,
			orgId: bootstrapped.user.orgId,
			resellerUserId: bootstrapped.user.userId,
			roles: [],
			error: undefined,
		};
	} catch (error) {
		console.error('Error refreshing reseller session token', error);
		return clearResellerSessionToken(token, 'RefreshAccessTokenError');
	}
}

export const { handlers, signIn, signOut, auth } = NextAuth({
	basePath: '/api/reseller/auth',
	trustHost: resolveTrustHost(),
	cookies: buildResellerCookies(),
	session: {
		strategy: 'jwt',
		maxAge: 7 * 24 * 60 * 60, // 7 days
	},
	providers: [
		MicrosoftEntraID({
			id: 'azure-ad',
			clientId: AZURE_AD_RESELLER_CLIENT_ID,
			clientSecret: AZURE_AD_RESELLER_CLIENT_SECRET,
			issuer: 'https://login.microsoftonline.com/common/v2.0',
			authorization: {
				params: {
					scope: RESELLER_LOGIN_SCOPE,
				},
			},
		}),
		Credentials({
			id: 'reseller-otp',
			name: 'Email OTP',
			credentials: {
				email: { label: 'Email', type: 'email' },
				code: { label: 'Verification Code', type: 'text' },
			},
			authorize: async (credentials) => {
				const email =
					typeof credentials?.email === 'string'
						? credentials.email.trim()
						: '';
				const code =
					typeof credentials?.code === 'string'
						? credentials.code.trim()
						: '';

				if (!email || !code) return null;

				try {
					const response = await fetch(
						`${API_BASE_URL}/api/reseller/auth/otp/verify`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ email, code }),
							cache: 'no-store',
						},
					);

					if (!response.ok) return null;

					const data = await response.json();

					return {
						id: data.user.userId,
						email: data.user.email,
						name: data.user.displayName ?? data.user.email,
						accessToken: data.accessToken,
						accessTokenExpiresAt: data.accessTokenExpiresAt,
						orgId: data.user.orgId,
						resellerUserId: data.user.userId,
					};
				} catch (error) {
					console.error('[reseller-auth] OTP verify failed', error);
					return null;
				}
			},
		}),
	],
	callbacks: {
		authorized({ auth, request }) {
			if (!isProtectedResellerPath(request.nextUrl.pathname)) {
				return true;
			}

			if (auth?.user && auth.userType === 'reseller') {
				return true;
			}

			return NextResponse.redirect(new URL('/csp-partners', request.nextUrl));
		},
		async signIn({ account, profile }) {
			// OTP sign-in — no additional validation needed
			if (account?.provider === 'reseller-otp') {
				return true;
			}

			// Entra ID sign-in — validate and bootstrap
			const providerSubject = readProfileClaim(profile, 'sub');
			const candidateEmail =
				readProfileClaim(profile, 'email') ??
				readProfileClaim(profile, 'preferred_username');

			if (!providerSubject || !candidateEmail || !isEmail(candidateEmail)) {
				console.error(
					'[reseller-auth:signIn] rejected sign-in: missing subject or email',
					{
						providerSubject,
						candidateEmail,
					},
				);
				return false;
			}

			const refreshToken =
				typeof account?.refresh_token === 'string'
					? account.refresh_token.trim()
					: '';

			if (!refreshToken) {
				console.error(
					'[reseller-auth:signIn] rejected sign-in: no refresh token',
				);
				return false;
			}

			// ── MPN verification first (sets account.mpnId before bootstrap) ──

			// Partner Center MPN verification — bypass for allowed emails
			if (isPartnerVerificationBypassed(candidateEmail)) {
				console.info(
					'[reseller-auth:signIn] bypassing MPN verification for',
					candidateEmail,
				);
				(account as Record<string, unknown>).mpnId = 'BYPASS';
				(account as Record<string, unknown>).partnerName = 'BYPASS';
			} else {
				// Verify Partner Center MPN profile — block login if mpnId not found
				const pcToken =
					typeof account?.access_token === 'string'
						? account.access_token
						: '';
				if (!pcToken) {
					console.error(
						'[reseller-auth:signIn] no Partner Center token available for MPN verification',
					);
					return '/csp-partners?error=no_mpn_access';
				}

				try {
					const pcRes = await fetch(
						'https://api.partnercenter.microsoft.com/v1/profiles/mpn',
						{
							headers: {
								Authorization: `Bearer ${pcToken}`,
								Accept: 'application/json',
							},
						},
					);

					if (pcRes.ok) {
						const pcData = await pcRes.json();
						if (pcData.mpnId) {
							(account as Record<string, unknown>).mpnId = pcData.mpnId;
							(account as Record<string, unknown>).partnerName =
								pcData.partnerName ?? undefined;
							console.info(
								'[reseller-auth:signIn] Partner verified',
								{ mpnId: pcData.mpnId, partnerName: pcData.partnerName },
							);
						} else {
							console.warn(
								'[reseller-auth:signIn] MPN verification failed — no mpnId in response',
							);
							return '/csp-partners?error=no_mpn_access';
						}
					} else {
						console.warn(
							`[reseller-auth:signIn] MPN verification failed (status: ${pcRes.status})`,
						);
						return '/csp-partners?error=no_mpn_access';
					}
				} catch (pcError) {
					console.error(
						'[reseller-auth:signIn] MPN verification error',
						pcError,
					);
					return '/csp-partners?error=no_mpn_access';
				}
			}

			// ── Bootstrap (account.mpnId is now set) ──

			// Exchange refresh token for our API-scoped token for bootstrapping.
			let apiAccessToken: string;
			try {
				const exchanged = await getResellerApiAccessToken(refreshToken);
				apiAccessToken = exchanged.accessToken;
			} catch (error) {
				console.error(
					'[reseller-auth:signIn] reseller API token exchange failed',
					error,
				);
				return false;
			}

			try {
				const bootstrap = await bootstrapResellerSession({
					apiAccessToken,
					providerSubject,
					email: candidateEmail,
					displayName: readProfileClaim(profile, 'name'),
					issuer: readProfileClaim(profile, 'iss'),
					tenantId: readProfileClaim(profile, 'tid'),
					mpnId: typeof (account as Record<string, unknown>).mpnId === 'string'
						? (account as Record<string, unknown>).mpnId as string
						: null,
				});
				(account as ResellerBootstrapAccount).resellerBootstrap = bootstrap;
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes('Generic email domains')
				) {
					console.info(
						'[reseller-auth:signIn] rejected: generic email domain',
					);
					return '/csp-partners?error=generic_email';
				}
				console.error(
					'[reseller-auth:signIn] reseller bootstrap failed',
					error,
				);
				return false;
			}

			return true;
		},
		async jwt({ token, user, account, profile }) {
			// OTP sign-in — user object has fields from authorize()
			if (user && account?.provider === 'reseller-otp') {
				const u = user as Record<string, unknown>;
				token.userType = 'reseller';
				token.accessToken = u.accessToken as string;
				token.expiresAt = u.accessTokenExpiresAt as number;
				token.appEmail = u.email as string;
				token.displayName = u.name as string;
				token.orgId = u.orgId as string;
				token.resellerUserId = u.resellerUserId as string;
				token.roles = [];
				token.error = undefined;
				return token;
			}

			// Entra ID sign-in
			if (account) {
				token.refreshToken =
					typeof account.refresh_token === 'string'
						? account.refresh_token
						: token.refreshToken;
				token.userType = 'reseller';

				// account.access_token is Partner Center-scoped — save it
				if (typeof account.access_token === 'string') {
					token.partnerCenterToken = account.access_token;
				}

				// Read mpnId/partnerName set by signIn callback (already verified there)
				const acct = account as Record<string, unknown>;
				if (typeof acct.mpnId === 'string') {
					token.mpnId = acct.mpnId;
				}
				if (typeof acct.partnerName === 'string') {
					token.partnerName = acct.partnerName;
				}

				const providerSubject =
					readProfileClaim(profile, 'sub') ??
					(typeof token.providerSubject === 'string'
						? token.providerSubject
						: null);
				const email =
					readProfileClaim(profile, 'email') ??
					readProfileClaim(profile, 'preferred_username') ??
					(typeof token.appEmail === 'string' ? token.appEmail : null);
				const issuer =
					readProfileClaim(profile, 'iss') ??
					(typeof token.issuer === 'string' ? token.issuer : null);
				const externalTenantId =
					readProfileClaim(profile, 'tid') ??
					(typeof token.externalTenantId === 'string'
						? token.externalTenantId
						: null);
				const displayName =
					readProfileClaim(profile, 'name') ??
					(typeof token.displayName === 'string' ? token.displayName : null);

				token.providerSubject = providerSubject ?? undefined;
				token.appEmail = email ?? token.appEmail;
				token.displayName = displayName;
				token.issuer = issuer ?? undefined;
				token.externalTenantId = externalTenantId ?? undefined;
				token.roles = [];

				let bootstrap = (account as ResellerBootstrapAccount)
					.resellerBootstrap;
				if (!bootstrap && providerSubject && email && isEmail(email)) {
					try {
						const apiToken =
							await resolveBootstrapApiAccessToken(account);
						if (apiToken) {
							token.refreshToken =
								apiToken.refreshToken ?? token.refreshToken;
							bootstrap = await bootstrapResellerSession({
								apiAccessToken: apiToken.accessToken,
								providerSubject,
								email,
								displayName,
								issuer,
								tenantId: externalTenantId,
								mpnId: typeof (account as Record<string, unknown>).mpnId === 'string'
									? (account as Record<string, unknown>).mpnId as string
									: typeof token.mpnId === 'string' ? token.mpnId : null,
							});
						}
					} catch (error) {
						console.error(
							'[reseller-auth:jwt] fallback bootstrap failed',
							error,
						);
						return clearResellerSessionToken(
							token,
							'ResellerBootstrapError',
						);
					}
				}

				if (bootstrap) {
					token.accessToken = bootstrap.accessToken;
					token.expiresAt = bootstrap.accessTokenExpiresAt;
					token.appEmail = bootstrap.user.email;
					token.displayName = bootstrap.user.displayName;
					token.orgId = bootstrap.user.orgId;
					token.resellerUserId = bootstrap.user.userId;
					token.roles = [];
					token.error = undefined;
				} else if (
					token.userType === 'reseller' &&
					(!token.accessToken ||
						typeof token.orgId !== 'string' ||
						typeof token.resellerUserId !== 'string')
				) {
					console.error(
						'[reseller-auth:jwt] missing reseller bootstrap state after sign-in',
						{
							hasAccessToken: Boolean(token.accessToken),
							hasOrgId: typeof token.orgId === 'string',
							hasResellerUserId:
								typeof token.resellerUserId === 'string',
						},
					);
					return clearResellerSessionToken(
						token,
						'ResellerBootstrapError',
					);
				}
			}

			// Token refresh
			if (
				token.userType === 'reseller' &&
				token.expiresAt &&
				typeof token.expiresAt === 'number' &&
				Date.now() >= token.expiresAt * 1000
			) {
				return refreshResellerSessionToken(token);
			}

			return token;
		},
		async session({ session, token }) {
			session.userType = token.userType;
			session.roles = [];
			session.accessToken = token.accessToken;
			session.orgId =
				typeof token.orgId === 'string' ? token.orgId : undefined;
			session.resellerUserId =
				typeof token.resellerUserId === 'string'
					? token.resellerUserId
					: undefined;
			session.externalTenantId =
				typeof token.externalTenantId === 'string'
					? token.externalTenantId
					: undefined;
			session.mpnId =
				typeof token.mpnId === 'string' ? token.mpnId : undefined;
			session.partnerName =
				typeof token.partnerName === 'string'
					? token.partnerName
					: undefined;
			if (session.user) {
				if (typeof token.appEmail === 'string') {
					session.user.email = token.appEmail;
				}

				if (typeof token.displayName === 'string') {
					session.user.name = token.displayName;
				}
			}

			return session;
		},
	},
	pages: {
		signIn: '/csp-partners',
		error: '/csp-partners',
	},
});
