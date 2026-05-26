'use client';

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useRouter } from 'next/navigation';
import {
	CURRENCY_COOKIE,
	defaultCurrency,
	isCurrency,
	type Currency,
} from '@/i18n/currency-config';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

interface SetCurrencyOptions {
	persist?: boolean;
	/**
	 * Skip `router.refresh()` after persisting. Useful when the caller is
	 * resetting the currency programmatically (e.g. on proposal page mount)
	 * and the page is fully client-rendered, so a server refresh is unnecessary.
	 */
	silent?: boolean;
}

interface CurrencyContextValue {
	currency: Currency;
	isUserOverride: boolean;
	setCurrency: (next: Currency, options?: SetCurrencyOptions) => void;
	isLocked: boolean;
	lockReason: string | null;
	setLock: (locked: boolean, reason?: string | null) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({
	initialCurrency,
	children,
}: {
	initialCurrency: Currency | null;
	children: React.ReactNode;
}) {
	const router = useRouter();
	const [currency, setCurrencyState] = useState<Currency>(
		initialCurrency ?? defaultCurrency,
	);
	const isUserOverrideRef = useRef<boolean>(initialCurrency !== null);
	const [isUserOverride, setIsUserOverride] = useState<boolean>(
		initialCurrency !== null,
	);
	const [isLocked, setIsLocked] = useState(false);
	const [lockReason, setLockReason] = useState<string | null>(null);

	const setCurrency = useCallback(
		(next: Currency, options?: SetCurrencyOptions) => {
			if (!isCurrency(next)) return;
			const persist = options?.persist ?? true;
			const silent = options?.silent ?? false;
			setCurrencyState(next);
			if (persist) {
				if (typeof document !== 'undefined') {
					document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
				}
				isUserOverrideRef.current = true;
				setIsUserOverride(true);
				if (!silent) {
					router.refresh();
				}
			}
		},
		[router],
	);

	const setLock = useCallback(
		(locked: boolean, reason: string | null = null) => {
			setIsLocked(locked);
			setLockReason(locked ? reason : null);
		},
		[],
	);

	const value = useMemo<CurrencyContextValue>(
		() => ({
			currency,
			isUserOverride,
			setCurrency,
			isLocked,
			lockReason,
			setLock,
		}),
		[currency, isUserOverride, setCurrency, isLocked, lockReason, setLock],
	);

	return (
		<CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
	);
}

export function useCurrency(): CurrencyContextValue {
	const ctx = useContext(CurrencyContext);
	if (!ctx) {
		return {
			currency: defaultCurrency,
			isUserOverride: false,
			setCurrency: () => {},
			isLocked: false,
			lockReason: null,
			setLock: () => {},
		};
	}
	return ctx;
}

export function useCurrencyDefault(regionDerivedCurrency: Currency | null) {
	const { currency, isUserOverride, setCurrency } = useCurrency();
	useEffect(() => {
		if (
			!isUserOverride &&
			regionDerivedCurrency &&
			regionDerivedCurrency !== currency
		) {
			setCurrency(regionDerivedCurrency, { persist: false });
		}
	}, [regionDerivedCurrency, isUserOverride, currency, setCurrency]);
}
