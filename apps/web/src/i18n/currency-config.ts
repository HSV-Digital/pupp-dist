import {
	SUPPORTED_CURRENCIES,
	isRegionalCurrencyCode,
	getCurrencySymbol,
	type RegionalCurrencyCode,
} from '@repo/shared';

export type Currency = RegionalCurrencyCode;

export const currencies = SUPPORTED_CURRENCIES;

export const defaultCurrency: Currency = 'USD';

export const CURRENCY_COOKIE = 'NEXT_CURRENCY';

const CURRENCY_NAMES: Record<Currency, string> = {
	USD: 'US Dollar',
	CAD: 'Canadian Dollar',
	BRL: 'Brazilian Real',
	NZD: 'New Zealand Dollar',
	AUD: 'Australian Dollar',
	NOK: 'Norwegian Krone',
	GBP: 'British Pound',
	DKK: 'Danish Krone',
	SEK: 'Swedish Krona',
	EUR: 'Euro',
	INR: 'Indian Rupee',
};

export const currencyLabels: Record<Currency, string> = Object.fromEntries(
	currencies.map((code) => [
		code,
		`${CURRENCY_NAMES[code]} (${getCurrencySymbol(code)} ${code})`,
	]),
) as Record<Currency, string>;

export function isCurrency(value: unknown): value is Currency {
	return isRegionalCurrencyCode(value);
}
