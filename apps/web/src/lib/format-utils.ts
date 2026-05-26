export interface CurrencyDisplayOptions {
	currency?: string;
	locale?: string;
	currencySymbol?: string;
}

const DEFAULT_LOCALE = 'en-US';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_SYMBOL_BY_CURRENCY: Record<string, string> = {
	USD: '$',
	CAD: 'CA$',
	BRL: 'R$',
	MXN: 'MX$',
};

function resolveCurrencyParts(
	options?: CurrencyDisplayOptions,
): { locale: string; symbol: string } {
	const locale = options?.locale ?? DEFAULT_LOCALE;
	const normalizedCurrency = (options?.currency ?? DEFAULT_CURRENCY).toUpperCase();
	const symbol =
		options?.currencySymbol ??
		DEFAULT_SYMBOL_BY_CURRENCY[normalizedCurrency] ??
		DEFAULT_SYMBOL_BY_CURRENCY[DEFAULT_CURRENCY];

	return { locale, symbol };
}

const numberFormatter = new Intl.NumberFormat(DEFAULT_LOCALE);

export function formatCurrency(
	value: number,
	options?: CurrencyDisplayOptions,
): string {
	const normalized = Number.isFinite(value) ? value : 0;
	const { locale, symbol } = resolveCurrencyParts(options);
	const formatted = normalized.toLocaleString(locale, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	return `${symbol}${formatted}`;
}

export function formatNumber(value: number): string {
	return numberFormatter.format(value);
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
});
const monthYearFormatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'long',
});

export function formatCurrencyCompact(
	value: number,
	options?: CurrencyDisplayOptions,
): string {
	const normalized = Number.isFinite(value) ? value : 0;
	const { locale, symbol } = resolveCurrencyParts(options);
	const formatted = Math.round(normalized).toLocaleString(locale, {
		maximumFractionDigits: 0,
	});
	return `${symbol}${formatted}`;
}

export function formatCurrencyAbbreviated(
	value: number,
	options?: CurrencyDisplayOptions,
): string {
	const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
	const { symbol } = resolveCurrencyParts(options);

	if (normalized >= 1_000_000) {
		const millions = normalized / 1_000_000;
		return `${symbol}${millions.toFixed(2)} Million`;
	}
	return formatCurrencyCompact(normalized, options);
}

export function formatDate(value: string): string {
	const date = new Date(value.includes('T') ? value : value + 'T00:00:00');
	if (isNaN(date.getTime())) return value;
	return dateFormatter.format(date);
}

export function formatMonthYear(value: string | null | undefined): string {
	if (!value) return 'N/A';
	const date = new Date(value.includes('T') ? value : value + 'T00:00:00');
	if (isNaN(date.getTime())) return 'N/A';
	return monthYearFormatter.format(date);
}

export function formatDaysToRenewal(value: string | null | undefined): string {
	if (!value) return 'N/A';
	const renewalDate = new Date(value.includes('T') ? value : value + 'T00:00:00');
	if (isNaN(renewalDate.getTime())) return 'N/A';
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const diffMs = renewalDate.getTime() - today.getTime();
	const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
	if (days === 0) return 'Today';
	if (days === 1) return '1 Day';
	return `${days} Days`;
}
