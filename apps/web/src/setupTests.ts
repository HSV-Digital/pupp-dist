import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import enMessages from '../messages/en.json';

// Fluent UI MessageBar uses ResizeObserver which jsdom doesn't provide
if (typeof globalThis.ResizeObserver === 'undefined') {
	globalThis.ResizeObserver = class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof globalThis.ResizeObserver;
}

function lookup(messages: unknown, dottedKey: string): string {
	const parts = dottedKey.split('.');
	let cur: unknown = messages;
	for (const p of parts) {
		if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
			cur = (cur as Record<string, unknown>)[p];
		} else {
			return dottedKey;
		}
	}
	return typeof cur === 'string' ? cur : dottedKey;
}

vi.mock('next-intl', () => ({
	useTranslations: (namespace?: string) => {
		return (key: string, values?: Record<string, unknown>) => {
			const fullKey = namespace ? `${namespace}.${key}` : key;
			let value = lookup(enMessages, fullKey);
			if (values) {
				for (const [k, v] of Object.entries(values)) {
					value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
				}
			}
			return value;
		};
	},
	useLocale: () => 'en',
	NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));
