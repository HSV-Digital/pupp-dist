import { defaultLocale, locales, type Locale } from './config';

export function pickLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
	if (!header) return defaultLocale;

	const candidates = header
		.split(',')
		.map((part) => {
			const [tag, qPart] = part.trim().split(';');
			const q = qPart?.startsWith('q=') ? Number(qPart.slice(2)) : 1;
			return { tag: tag.toLowerCase(), q: Number.isFinite(q) ? q : 0 };
		})
		.filter((c) => c.tag.length > 0)
		.sort((a, b) => b.q - a.q);

	for (const { tag } of candidates) {
		const exact = locales.find((l) => l === tag);
		if (exact) return exact;
		const primary = tag.split('-')[0];
		const partial = locales.find((l) => l === primary);
		if (partial) return partial;
		if (primary === 'no') return 'nb';
	}

	return defaultLocale;
}
