export const locales = ['en', 'da', 'nl', 'ms', 'de', 'nb', 'sv', 'fr'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const localeLabels: Record<Locale, string> = {
	en: 'English',
	da: 'Danish',
	nl: 'Dutch',
	ms: 'Malay',
	de: 'German',
	nb: 'Norwegian',
	sv: 'Swedish',
	fr: 'French',
};

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && (locales as readonly string[]).includes(value);
}
