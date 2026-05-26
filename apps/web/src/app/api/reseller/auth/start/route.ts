import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
	signIn as resellerSignIn,
	signOut as resellerSignOut,
} from '@/lib/reseller-auth';

function resolveRedirectTo(request: NextRequest, fallback: string): string {
	const callbackUrl = request.nextUrl.searchParams.get('callbackUrl')?.trim();
	if (
		!callbackUrl ||
		!callbackUrl.startsWith('/') ||
		callbackUrl.startsWith('//')
	) {
		return fallback;
	}

	return callbackUrl;
}

export async function GET(request: NextRequest) {
	const redirectTo = resolveRedirectTo(request, '/csp-partners/dashboard');

	try {
		await resellerSignOut({ redirect: false });
	} catch {}

	const url = await resellerSignIn('azure-ad', {
		redirect: false,
		redirectTo,
	});

	return NextResponse.redirect(url ?? new URL(redirectTo, request.url));
}
