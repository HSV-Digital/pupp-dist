import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, isLocale } from '@/i18n/config';
import { pickLocaleFromAcceptLanguage } from '@/i18n/detect';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const GEO_TIMEOUT_MS = 3000;

function extractIp(request: NextRequest): string | null {
	const forwardedFor = request.headers.get('x-forwarded-for');
	if (forwardedFor) {
		const first = forwardedFor.split(',')[0]?.trim();
		if (first) return first;
	}
	return request.headers.get('x-real-ip')?.trim() ?? null;
}

async function resolveQuebecLocale(ip: string): Promise<'fr' | null> {
	try {
		const apiKey = process.env.FREEIPAPI_KEY?.trim();
		const headers: Record<string, string> = {};
		const url = apiKey
			? `https://freeipapi.com/api/json/${encodeURIComponent(ip)}`
			: `https://free.freeipapi.com/api/json/${encodeURIComponent(ip)}`;
		if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
		const res = await fetch(url, {
			headers,
			signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			countryName?: string;
			regionName?: string;
		};
		if (data.countryName?.trim().toLowerCase() !== 'canada') return null;
		const region = data.regionName?.trim().toLowerCase();
		return region === 'quebec' || region === 'québec' ? 'fr' : null;
	} catch {
		return null;
	}
}

async function ensureLocaleCookie(request: NextRequest, response: NextResponse) {
	const existing = request.cookies.get(LOCALE_COOKIE)?.value;
	if (existing === 'fr') return response;

	const hasValidExisting = isLocale(existing);
	const ip = extractIp(request);
	const geoLocale = ip ? await resolveQuebecLocale(ip) : null;
	if (geoLocale) {
		response.cookies.set(LOCALE_COOKIE, geoLocale, {
			path: '/',
			maxAge: ONE_YEAR_SECONDS,
			sameSite: 'lax',
		});
		return response;
	}
	if (hasValidExisting) return response;

	const detected = pickLocaleFromAcceptLanguage(request.headers.get('accept-language'));
	response.cookies.set(LOCALE_COOKIE, detected, {
		path: '/',
		maxAge: ONE_YEAR_SECONDS,
		sameSite: 'lax',
	});
	return response;
}

export function proxy(request: NextRequest) {
	return ensureLocaleCookie(request, NextResponse.next());
}

export const config = {
	matcher: ['/((?!api|_next|.*\\..*).*)'],
};
