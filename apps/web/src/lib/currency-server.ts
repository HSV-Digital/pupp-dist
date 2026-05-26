import 'server-only';
import { cookies } from 'next/headers';
import { CURRENCY_COOKIE, isCurrency, type Currency } from '@/i18n/currency-config';

export async function getCurrencyFromCookie(): Promise<Currency | null> {
	const store = await cookies();
	const value = store.get(CURRENCY_COOKIE)?.value;
	return isCurrency(value) ? value : null;
}
