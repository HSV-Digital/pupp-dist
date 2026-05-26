import { headers } from 'next/headers';
import { getToken } from 'next-auth/jwt';
import { auth } from '@/lib/reseller-auth';
import {
	getResellerSessionTokenCookieName,
	shouldUseSecureAuthCookies,
} from '@/lib/reseller-auth-cookies';
import { getServerEnv } from '@/env.server';

const PARTNER_CENTER_BASE = 'https://api.partnercenter.microsoft.com';

function resolveAuthSecret(): string {
	const { AUTH_SECRET, NEXTAUTH_SECRET } = getServerEnv();
	return AUTH_SECRET ?? NEXTAUTH_SECRET ?? '';
}

export async function GET() {
	const session = await auth();

	if (!session?.user || session.userType !== 'reseller') {
		return Response.json(
			{ verified: false, error: 'Not authenticated' },
			{ status: 401 },
		);
	}

	// Read partnerCenterToken from JWT (server-side only, not exposed in session)
	const requestHeaders = await headers();
	const token = await getToken({
		req: { headers: requestHeaders },
		secret: resolveAuthSecret(),
		secureCookie: shouldUseSecureAuthCookies(),
		cookieName: getResellerSessionTokenCookieName(),
	});

	const partnerCenterToken =
		typeof token?.partnerCenterToken === 'string'
			? token.partnerCenterToken
			: undefined;

	if (!partnerCenterToken) {
		return Response.json(
			{
				verified: false,
				error: 'No Partner Center token. Please sign in with Microsoft.',
			},
			{ status: 400 },
		);
	}

	try {
		const response = await fetch(`${PARTNER_CENTER_BASE}/v1/profiles/mpn`, {
			headers: {
				Authorization: `Bearer ${partnerCenterToken}`,
				Accept: 'application/json',
			},
		});

		if (response.ok) {
			const data = await response.json();

			return Response.json({
				verified: true,
				profile: {
					data: data
				},
			});
		}

		if (response.status === 404) {
			return Response.json({
				verified: false,
				error: 'No partner profile found for this account.',
			});
		}

		if (response.status === 401 || response.status === 403) {
			return Response.json({
				verified: false,
				error: 'Partner Center token expired. Please sign in again.',
			});
		}

		const errorBody = await response.text().catch(() => '');
		console.error(
			`[verify-partner] Partner Center API returned ${response.status}`,
			errorBody,
		);
		return Response.json({
			verified: false,
			error: `Verification failed (${response.status})`,
		});
	} catch (error) {
		console.error('[verify-partner] Partner verification error:', error);
		return Response.json(
			{ verified: false, error: 'Verification service unavailable' },
			{ status: 500 },
		);
	}
}
