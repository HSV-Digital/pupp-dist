import type { EndingSku } from '@repo/types';

export type RegionalPricingCountry =
	| 'US'
	| 'CA'
	| 'BR'
	| 'NZ'
	| 'AU'
	| 'NO'
	| 'GB'
	| 'DK'
	| 'SE'
	| 'IE'
	| 'IN'
	| 'DE'
	| 'NL'
	| 'MY'
	| 'SG';
export type RegionalCurrencyCode =
	| 'USD'
	| 'CAD'
	| 'BRL'
	| 'NZD'
	| 'AUD'
	| 'NOK'
	| 'GBP'
	| 'DKK'
	| 'SEK'
	| 'EUR'
	| 'INR';
export type PricingFallbackReason =
	| 'none'
	| 'missing_region'
	| 'unknown_region'
	| 'mixed_regions';

export interface RegionalPricingContext {
	country: RegionalPricingCountry;
	/**
	 * The country resolved from the source region BEFORE any currency override
	 * flip is applied. Use this — not `country` — for region-bound business
	 * logic (e.g. the strategic accelerator rate) that must NOT change when the
	 * partner toggles the display currency.
	 */
	regionCountry: RegionalPricingCountry;
	currency: RegionalCurrencyCode;
	currencySymbol: string;
	locale: string;
	sourceRegion: string | null;
	fallbackApplied: boolean;
	fallbackReason: PricingFallbackReason;
}

export interface RegionalEndingSkuPrice {
	listPrice: number;
	promoPrice: number;
}

export const DEFAULT_CURRENT_SKU_MARGIN_PERCENT = 20;

const STRATEGIC_ACCELERATOR_RATE_BY_COUNTRY: Record<
	RegionalPricingCountry,
	number
> = {
	US: 0.03,
	CA: 0.03,
	BR: 0.03,
	NZ: 0.03,
	AU: 0.03,
	NO: 0.03,
	GB: 0.03,
	DK: 0.03,
	SE: 0.03,
	IE: 0.03,
	IN: 0.04,
	DE: 0.03,
	NL: 0.03,
	MY: 0.04,
	SG: 0.04,
};

export function getStrategicAcceleratorRate(
	country: RegionalPricingCountry,
): number {
	return STRATEGIC_ACCELERATOR_RATE_BY_COUNTRY[country];
}

export const DEFAULT_TARGET_SKU_MARGIN_PERCENT_BY_ENDING_SKU_ID: Readonly<
	Record<string, number>
> = {
	bp_purview: 20,
	bp_defender: 20,
	bp_defender_purview: 20,
	bp_cb: 15.1,
	bs_cb: 13.7,
	bp_cb_purview: 16,
};

const DEFAULT_COUNTRY: RegionalPricingCountry = 'US';

const CURRENCY_BY_COUNTRY: Record<
	RegionalPricingCountry,
	RegionalCurrencyCode
> = {
	US: 'USD',
	CA: 'CAD',
	BR: 'BRL',
	NZ: 'NZD',
	AU: 'AUD',
	NO: 'NOK',
	GB: 'GBP',
	DK: 'DKK',
	SE: 'SEK',
	IE: 'EUR',
	IN: 'INR',
	DE: 'EUR',
	NL: 'EUR',
	MY: 'USD',
	SG: 'USD',
};

const SYMBOL_BY_COUNTRY: Record<RegionalPricingCountry, string> = {
	US: '$',
	CA: 'CA$',
	BR: 'R$',
	NZ: 'NZ$',
	AU: 'A$',
	NO: 'kr',
	GB: '£',
	DK: 'kr',
	SE: 'kr',
	IE: '€',
	IN: '₹',
	DE: '€',
	NL: '€',
	MY: '$',
	SG: '$',
};

const LOCALE_BY_COUNTRY: Record<RegionalPricingCountry, string> = {
	US: 'en-US',
	CA: 'en-CA',
	BR: 'pt-BR',
	NZ: 'en-NZ',
	AU: 'en-AU',
	NO: 'nb-NO',
	GB: 'en-GB',
	DK: 'da-DK',
	SE: 'sv-SE',
	IE: 'en-IE',
	IN: 'en-IN',
	DE: 'de-DE',
	NL: 'nl-NL',
	MY: 'en-MY',
	SG: 'en-SG',
};

export const SUPPORTED_CURRENCIES: readonly RegionalCurrencyCode[] = [
	'USD',
	'CAD',
	'BRL',
	'NZD',
	'AUD',
	'NOK',
	'GBP',
	'DKK',
	'SEK',
	'EUR',
	'INR',
];

const SYMBOL_BY_CURRENCY: Record<RegionalCurrencyCode, string> = {
	USD: '$',
	CAD: 'CA$',
	BRL: 'R$',
	NZD: 'NZ$',
	AUD: 'A$',
	NOK: 'kr',
	GBP: '£',
	DKK: 'kr',
	SEK: 'kr',
	EUR: '€',
	INR: '₹',
};

const LOCALE_BY_CURRENCY: Record<RegionalCurrencyCode, string> = {
	USD: 'en-US',
	CAD: 'en-CA',
	BRL: 'pt-BR',
	NZD: 'en-NZ',
	AUD: 'en-AU',
	NOK: 'nb-NO',
	GBP: 'en-GB',
	DKK: 'da-DK',
	SEK: 'sv-SE',
	EUR: 'en-IE',
	INR: 'en-IN',
};

const COUNTRY_BY_CURRENCY: Record<RegionalCurrencyCode, RegionalPricingCountry> = {
	USD: 'US',
	CAD: 'CA',
	BRL: 'BR',
	NZD: 'NZ',
	AUD: 'AU',
	NOK: 'NO',
	GBP: 'GB',
	DKK: 'DK',
	SEK: 'SE',
	EUR: 'IE',
	INR: 'IN',
};

export function isRegionalCurrencyCode(
	value: unknown,
): value is RegionalCurrencyCode {
	return (
		typeof value === 'string' &&
		(SUPPORTED_CURRENCIES as readonly string[]).includes(value)
	);
}

export function getCurrencySymbol(currency: RegionalCurrencyCode): string {
	return SYMBOL_BY_CURRENCY[currency];
}

export function getCurrencyLocale(currency: RegionalCurrencyCode): string {
	return LOCALE_BY_CURRENCY[currency];
}

// Rates are derived from the static regional SKU price tables (each local price ÷
// the matching US price). Keep them in sync with STARTING_SKU_PRICE_BY_COUNTRY /
// ENDING_SKU_PRICE_BY_COUNTRY — otherwise USD-bridged conversion of user-edited
// prices drifts from the static list prices for the same SKU.
const USD_TO_COUNTRY_RATE: Record<RegionalPricingCountry, number> = {
	US: 1,
	CA: 1.356,
	BR: 5.725,
	NZ: 1.7,
	AU: 1.39,
	NO: 9.33,
	GB: 0.74,
	DK: 6.4,
	SE: 9.23,
	IE: 0.86,
	IN: 94.1,
	DE: 0.86,
	NL: 0.86,
	MY: 1,
	SG: 1,
};

/**
 * Full any-to-any conversion rate matrix.
 * `CONVERSION_RATES[from][to]` = how many `to` units per 1 `from` unit.
 * Computed once via USD as bridge: rate(from→to) = USD_TO_COUNTRY_RATE[toCountry] / USD_TO_COUNTRY_RATE[fromCountry].
 */
export const CONVERSION_RATES: Record<
	RegionalCurrencyCode,
	Record<RegionalCurrencyCode, number>
> = (() => {
	const matrix = {} as Record<
		RegionalCurrencyCode,
		Record<RegionalCurrencyCode, number>
	>;
	const codes = Object.keys(COUNTRY_BY_CURRENCY) as RegionalCurrencyCode[];
	for (const from of codes) {
		matrix[from] = {} as Record<RegionalCurrencyCode, number>;
		const fromUsdRate = USD_TO_COUNTRY_RATE[COUNTRY_BY_CURRENCY[from]];
		for (const to of codes) {
			if (from === to) {
				matrix[from][to] = 1;
				continue;
			}
			const toUsdRate = USD_TO_COUNTRY_RATE[COUNTRY_BY_CURRENCY[to]];
			matrix[from][to] = toUsdRate / fromUsdRate;
		}
	}
	return matrix;
})();

export function getConversionRate(
	from: RegionalCurrencyCode | string | null | undefined,
	to: RegionalCurrencyCode | string | null | undefined,
): number | null {
	if (!isRegionalCurrencyCode(from) || !isRegionalCurrencyCode(to)) return null;
	const rate = CONVERSION_RATES[from][to];
	return Number.isFinite(rate) && rate > 0 ? rate : null;
}

const COUNTRY_BY_REGION_NORMALIZED: Record<string, RegionalPricingCountry> = {
	us: 'US',
	usa: 'US',
	'united states': 'US',
	canada: 'CA',
	ca: 'CA',
	brazil: 'BR',
	br: 'BR',
	mexico: 'US',
	'antigua and barbuda': 'US',
	argentina: 'US',
	bahamas: 'US',
	barbados: 'US',
	bolivia: 'US',
	chile: 'US',
	colombia: 'US',
	'costa rica': 'US',
	cuba: 'US',
	dominica: 'US',
	'dominican republic': 'US',
	'el salvador': 'US',
	ecuador: 'US',
	grenada: 'US',
	guatemala: 'US',
	haiti: 'US',
	honduras: 'US',
	jamaica: 'US',
	nicaragua: 'US',
	panama: 'US',
	paraguay: 'US',
	peru: 'US',
	'st. kitts and nevis': 'US',
	'st. lucia': 'US',
	'st. vincent and the grenadines': 'US',
	'trinidad and tobago': 'US',
	uruguay: 'US',
	venezuela: 'US',
	nz: 'NZ',
	'new zealand': 'NZ',
	au: 'AU',
	australia: 'AU',
	no: 'NO',
	norway: 'NO',
	gb: 'GB',
	uk: 'GB',
	'united kingdom': 'GB',
	'great britain': 'GB',
	dk: 'DK',
	denmark: 'DK',
	se: 'SE',
	sweden: 'SE',
	ie: 'IE',
	ireland: 'IE',
	in: 'IN',
	india: 'IN',
	my: 'MY',
	malaysia: 'MY',
	sg: 'SG',
	singapore: 'SG',
	de: 'DE',
	germany: 'DE',
	nl: 'NL',
	netherlands: 'NL',
	netherland: 'NL',
};

const STARTING_SKU_PRICE_BY_COUNTRY: Record<
	RegionalPricingCountry,
	Record<string, number>
> = {
	US: {
		bb: 6,
		bp: 22,
		bs: 12.5,
	},
	CA: {
		bb: 8.14,
		bp: 29.83,
		bs: 16.95,
	},
	BR: {
		bb: 34.35,
		bp: 125.95,
		bs: 71.56,
	},
	NZ: {
		bb: 9.7,
		bp: 35.6,
		bs: 20.2,
	},
	AU: {
		bb: 9,
		bp: 32.9,
		bs: 18.7,
	},
	NO: {
		bb: 61,
		bp: 224.08,
		bs: 126.7,
	},
	GB: {
		bb: 4.62,
		bp: 16.95,
		bs: 9.58,
	},
	DK: {
		bb: 38.81,
		bp: 142.55,
		bs: 80.61,
	},
	SE: {
		bb: 57.36,
		bp: 210.7,
		bs: 119.14,
	},
	IE: {
		bb: 5.2,
		bp: 19.1,
		bs: 10.8,
	},
	IN: {
		bb: 145,
		bp: 1830,
		bs: 770,
	},
	DE: {
		bb: 5.2,
		bp: 19.1,
		bs: 10.8,
	},
	NL: {
		bb: 5.2,
		bp: 19.1,
		bs: 10.8,
	},
	MY: {
		bb: 6,
		bp: 22,
		bs: 12.5,
	},
	SG: {
		bb: 6,
		bp: 22,
		bs: 12.5,
	},
};

/** Ending SKU regional prices supplied by business rules. */
const ENDING_SKU_PRICE_BY_COUNTRY: Record<
	RegionalPricingCountry,
	Record<string, RegionalEndingSkuPrice>
> = {
	US: {
		bp_purview: { listPrice: 32, promoPrice: 32 },
		bp_defender: { listPrice: 32, promoPrice: 32 },
		bp_defender_purview: { listPrice: 37, promoPrice: 37 },
		bp_cb: { listPrice: 43, promoPrice: 32 },
		bs_cb: { listPrice: 33.5, promoPrice: 22 },
		bp_cb_purview: { listPrice: 53, promoPrice: 37 },
	},
	CA: {
		bp_purview: { listPrice: 43.39, promoPrice: 43.39 },
		bp_defender: { listPrice: 43.39, promoPrice: 43.39 },
		bp_defender_purview: { listPrice: 50.17, promoPrice: 50.17 },
		bp_cb: { listPrice: 58.31, promoPrice: 43.39 },
		bs_cb: { listPrice: 45.43, promoPrice: 29.83 },
		bp_cb_purview: { listPrice: 71.87, promoPrice: 50.17 },
	},
	BR: {
		bp_defender: { listPrice: 183.2, promoPrice: 183.2 },
		bp_purview: { listPrice: 183.2, promoPrice: 183.2 },
		bp_defender_purview: { listPrice: 211.83, promoPrice: 211.83 },
		bp_cb: { listPrice: 246.18, promoPrice: 183.2 },
		bs_cb: { listPrice: 191.79, promoPrice: 125.95 },
		bp_cb_purview: { listPrice: 303.43, promoPrice: 211.83 },
	},
	NZ: {
		bp_purview: { listPrice: 51.8, promoPrice: 51.8 },
		bp_defender: { listPrice: 51.8, promoPrice: 51.8 },
		bp_defender_purview: { listPrice: 59.9, promoPrice: 59.9 },
		bp_cb: { listPrice: 69.6, promoPrice: 51.5 },
		bs_cb: { listPrice: 54.2, promoPrice: 35.77 },
		bp_cb_purview: { listPrice: 85.8, promoPrice: 60.06 },
	},
	AU: {
		bp_purview: { listPrice: 47.9, promoPrice: 47.9 },
		bp_defender: { listPrice: 47.9, promoPrice: 47.9 },
		bp_defender_purview: { listPrice: 55.3, promoPrice: 55.3 },
		bp_cb: { listPrice: 64.4, promoPrice: 47.66 },
		bs_cb: { listPrice: 50.1, promoPrice: 33.07 },
		bp_cb_purview: { listPrice: 79.3, promoPrice: 55.51 },
	},
	NO: {
		bp_purview: { listPrice: 326.14, promoPrice: 326.14 },
		bp_defender: { listPrice: 326.14, promoPrice: 326.14 },
		bp_defender_purview: { listPrice: 376.59, promoPrice: 376.59 },
		bp_cb: { listPrice: 437.59, promoPrice: 323.82 },
		bs_cb: { listPrice: 340.22, promoPrice: 224.55 },
		bp_cb_purview: { listPrice: 539.66, promoPrice: 377.76 },
	},
	GB: {
		bp_purview: { listPrice: 24.67, promoPrice: 24.67 },
		bp_defender: { listPrice: 24.67, promoPrice: 24.67 },
		bp_defender_purview: { listPrice: 28.49, promoPrice: 28.49 },
		bp_cb: { listPrice: 33.1, promoPrice: 24.5 },
		bs_cb: { listPrice: 25.74, promoPrice: 16.99 },
		bp_cb_purview: { listPrice: 40.82, promoPrice: 28.58 },
	},
	DK: {
		bp_purview: { listPrice: 207.49, promoPrice: 207.49 },
		bp_defender: { listPrice: 207.49, promoPrice: 207.49 },
		bp_defender_purview: { listPrice: 239.58, promoPrice: 239.58 },
		bp_cb: { listPrice: 278.39, promoPrice: 206.01 },
		bs_cb: { listPrice: 216.44, promoPrice: 142.85 },
		bp_cb_purview: { listPrice: 343.32, promoPrice: 240.33 },
	},
	SE: {
		bp_purview: { listPrice: 306.68, promoPrice: 306.68 },
		bp_defender: { listPrice: 306.68, promoPrice: 306.68 },
		bp_defender_purview: { listPrice: 354.12, promoPrice: 354.12 },
		bp_cb: { listPrice: 411.48, promoPrice: 304.5 },
		bs_cb: { listPrice: 319.92, promoPrice: 211.15 },
		bp_cb_purview: { listPrice: 507.46, promoPrice: 355.22 },
	},
	IE: {
		bp_purview: { listPrice: 27.8, promoPrice: 27.8 },
		bp_defender: { listPrice: 27.8, promoPrice: 27.8 },
		bp_defender_purview: { listPrice: 32.1, promoPrice: 32.1 },
		bp_cb: { listPrice: 37.3, promoPrice: 27.6 },
		bs_cb: { listPrice: 29, promoPrice: 19.14 },
		bp_cb_purview: { listPrice: 46, promoPrice: 32.2 },
	},
	IN: {
		bp_purview: { listPrice: 2660, promoPrice: 2660 },
		bp_defender: { listPrice: 2660, promoPrice: 2660 },
		bp_defender_purview: { listPrice: 3080, promoPrice: 3080 },
		bp_cb: { listPrice: 3575, promoPrice: 2645.5 },
		bs_cb: { listPrice: 2785, promoPrice: 1838.1 },
		bp_cb_purview: { listPrice: 4405, promoPrice: 3083.5 },
	},
	DE: {
		bp_purview: { listPrice: 27.8, promoPrice: 27.8 },
		bp_defender: { listPrice: 27.8, promoPrice: 27.8 },
		bp_defender_purview: { listPrice: 32.1, promoPrice: 32.1 },
		bp_cb: { listPrice: 37.3, promoPrice: 27.6 },
		bs_cb: { listPrice: 29, promoPrice: 19.14 },
		bp_cb_purview: { listPrice: 46, promoPrice: 32.2 },
	},
	NL: {
		bp_purview: { listPrice: 27.8, promoPrice: 27.8 },
		bp_defender: { listPrice: 27.8, promoPrice: 27.8 },
		bp_defender_purview: { listPrice: 32.1, promoPrice: 32.1 },
		bp_cb: { listPrice: 37.3, promoPrice: 27.6 },
		bs_cb: { listPrice: 29, promoPrice: 19.14 },
		bp_cb_purview: { listPrice: 46, promoPrice: 32.2 },
	},
	MY: {
		bp_purview: { listPrice: 32, promoPrice: 32 },
		bp_defender: { listPrice: 32, promoPrice: 32 },
		bp_defender_purview: { listPrice: 37, promoPrice: 37 },
		bp_cb: { listPrice: 43, promoPrice: 32 },
		bs_cb: { listPrice: 33.5, promoPrice: 22 },
		bp_cb_purview: { listPrice: 53, promoPrice: 37 },
	},
	SG: {
		bp_purview: { listPrice: 32, promoPrice: 32 },
		bp_defender: { listPrice: 32, promoPrice: 32 },
		bp_defender_purview: { listPrice: 37, promoPrice: 37 },
		bp_cb: { listPrice: 43, promoPrice: 32 },
		bs_cb: { listPrice: 33.5, promoPrice: 22 },
		bp_cb_purview: { listPrice: 53, promoPrice: 37 },
	},
};

function normalizeRegion(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function roundMoney(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseCountryCode(
	value: string | null | undefined,
): RegionalPricingCountry | null {
	if (!value || value.trim().length === 0) {
		return null;
	}

	const normalized = value.trim().toUpperCase();
	if (Object.prototype.hasOwnProperty.call(CURRENCY_BY_COUNTRY, normalized)) {
		return normalized as RegionalPricingCountry;
	}

	return null;
}

export function resolveCountryFromRegion(
	region: string | null | undefined,
): RegionalPricingCountry | null {
	if (!region || region.trim().length === 0) {
		return null;
	}

	return COUNTRY_BY_REGION_NORMALIZED[normalizeRegion(region)] ?? null;
}

export function buildRegionalPricingContext(params: {
	region?: string | null;
	country?: string | null;
	fallbackReason?: PricingFallbackReason;
	currencyOverride?: RegionalCurrencyCode | string | null;
}): RegionalPricingContext {
	const explicitCountry = parseCountryCode(params.country);
	const inferredCountry = resolveCountryFromRegion(params.region);
	const regionCountry = explicitCountry ?? inferredCountry ?? DEFAULT_COUNTRY;
	const fallbackReason =
		params.fallbackReason ??
		(explicitCountry || inferredCountry
			? 'none'
			: !params.region || params.region.trim().length === 0
				? 'missing_region'
				: 'unknown_region');

	const override = isRegionalCurrencyCode(params.currencyOverride)
		? params.currencyOverride
		: null;
	// When a currency override is provided, flip the country so SKU price tables
	// (STARTING_SKU_PRICE_BY_COUNTRY, ENDING_SKU_PRICE_BY_COUNTRY, USD_TO_COUNTRY_RATE)
	// resolve to the override's country — otherwise we'd render the override's symbol
	// against the source region's price (e.g. "₹6" instead of "₹564.6" for bb).
	const country = override ? COUNTRY_BY_CURRENCY[override] : regionCountry;

	return {
		country,
		regionCountry,
		currency: override ?? CURRENCY_BY_COUNTRY[country],
		currencySymbol: override
			? SYMBOL_BY_CURRENCY[override]
			: SYMBOL_BY_COUNTRY[country],
		locale: override ? LOCALE_BY_CURRENCY[override] : LOCALE_BY_COUNTRY[country],
		sourceRegion: params.region?.trim() ? params.region.trim() : null,
		fallbackApplied: fallbackReason !== 'none',
		fallbackReason,
	};
}

export function buildRegionalPricingContextForRegions(
	regions: Iterable<string | null | undefined>,
	options?: { currencyOverride?: RegionalCurrencyCode | string | null },
): RegionalPricingContext {
	const normalizedRegions: string[] = [];
	const countries = new Set<RegionalPricingCountry>();

	for (const region of regions) {
		if (!region || region.trim().length === 0) continue;
		const trimmed = region.trim();
		normalizedRegions.push(trimmed);

		const country = resolveCountryFromRegion(trimmed);
		if (country) {
			countries.add(country);
		}
	}

	const currencyOverride = options?.currencyOverride;

	if (countries.size === 1) {
		const [country] = Array.from(countries);
		return buildRegionalPricingContext({
			country,
			region: normalizedRegions[0] ?? null,
			fallbackReason: 'none',
			currencyOverride,
		});
	}

	if (countries.size > 1) {
		return buildRegionalPricingContext({
			country: DEFAULT_COUNTRY,
			region: normalizedRegions[0] ?? null,
			fallbackReason: 'mixed_regions',
			currencyOverride,
		});
	}

	const fallbackReason: PricingFallbackReason =
		normalizedRegions.length === 0 ? 'missing_region' : 'unknown_region';
	return buildRegionalPricingContext({
		country: DEFAULT_COUNTRY,
		region: normalizedRegions[0] ?? null,
		fallbackReason,
		currencyOverride,
	});
}

export function getRegionalEndingSkuPrice(params: {
	endingSkuId: string;
	country: RegionalPricingCountry;
}): RegionalEndingSkuPrice | null {
	return (
		ENDING_SKU_PRICE_BY_COUNTRY[params.country][params.endingSkuId] ?? null
	);
}

export function applyRegionalPricingToEndingSku(params: {
	endingSku: EndingSku;
	country: RegionalPricingCountry;
}): EndingSku {
	const regional = getRegionalEndingSkuPrice({
		endingSkuId: params.endingSku.id,
		country: params.country,
	});
	if (!regional) {
		return params.endingSku;
	}

	return {
		...params.endingSku,
		listPrice: regional.listPrice,
		promoPrice: regional.promoPrice,
	};
}

export function getUsdToRegionalRate(params: {
	region?: string | null;
	country?: string | null;
}): number {
	const pricingContext = buildRegionalPricingContext({
		region: params.region,
		country: params.country,
	});
	return USD_TO_COUNTRY_RATE[pricingContext.country];
}

export function convertUsdAmountToRegional(params: {
	amountUsd: number;
	region?: string | null;
	country?: string | null;
}): number {
	const normalizedUsd = Number.isFinite(params.amountUsd)
		? Math.max(0, params.amountUsd)
		: 0;
	const rate = getUsdToRegionalRate({
		region: params.region,
		country: params.country,
	});
	return roundMoney(normalizedUsd * rate);
}

export function getRegionalStartingSkuMonthlyPrice(params: {
	startingSkuId: string;
	region?: string | null;
	country?: string | null;
}): number | null {
	const pricingContext = buildRegionalPricingContext({
		region: params.region,
		country: params.country,
	});
	const price =
		STARTING_SKU_PRICE_BY_COUNTRY[pricingContext.country][params.startingSkuId];
	return typeof price === 'number' ? price : null;
}

export function getDefaultTargetSkuMarginPercent(endingSkuId: string): number {
	return (
		DEFAULT_TARGET_SKU_MARGIN_PERCENT_BY_ENDING_SKU_ID[endingSkuId] ??
		DEFAULT_CURRENT_SKU_MARGIN_PERCENT
	);
}
