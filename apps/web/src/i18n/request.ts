import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isLocale, LOCALE_COOKIE } from './config';
import { pickLocaleFromAcceptLanguage } from './detect';

export default getRequestConfig(async () => {
	const cookieStore = await cookies();
	const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value;

	let locale = isLocale(cookieValue) ? cookieValue : null;

	if (!locale) {
		const headerStore = await headers();
		locale = pickLocaleFromAcceptLanguage(headerStore.get('accept-language'));
	}

	if (!locale) locale = defaultLocale;

	const messages = (await import(`../../messages/${locale}.json`)).default;

	return { locale, messages };
});
