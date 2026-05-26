import type {
	EndingSku,
	ScenarioEconomics,
	StartingSku,
	UpgradeScenario,
	UpgradeType,
} from '@repo/types';
import {
	ENDING_SKU_BY_ID,
	INCENTIVE_RATES,
	STARTING_SKU_BY_ID,
	STRATEGIC_ACCELERATOR_SKU_IDS,
	STRATEGIC_ACCELERATOR_STARTING_SKU_ID,
	VALID_UPGRADE_PATHS,
} from './upgrade-matrix';
import {
	applyRegionalPricingToEndingSku,
	buildRegionalPricingContext,
	DEFAULT_CURRENT_SKU_MARGIN_PERCENT,
	getDefaultTargetSkuMarginPercent,
	getRegionalStartingSkuMonthlyPrice,
	getStrategicAcceleratorRate,
	type RegionalPricingCountry,
} from './regional-pricing';

export type ScenarioJourney = 'renewal' | 'new_customer';

export interface UpgradePricingSelectionOptions {
	region?: string | null;
	country?: string | null;
}

export interface CalculateScenarioOptions
	extends UpgradePricingSelectionOptions {
	journey?: ScenarioJourney;
	expiringArr?: number;
	originalSeats?: number;
	/**
	 * DB-backed seat count for the customer's existing subscription.
	 * Drives the current-leg multiplier (current customer / reseller / margin /
	 * incentive). Defaults to `seats` when omitted (back-compat).
	 *
	 * The `seats` parameter to calculate* always represents the partner's
	 * target / proposed seats; `currentSeats` is the actual DB seat count.
	 */
	currentSeats?: number;
	/**
	 * Whether the partner qualifies for CSP incentives, derived from their
	 * partnerType + `hasSolutionPartnerDesignation` / `hasOver25Points` filters.
	 * When omitted, defaults to `true` for back-compat — but every caller that
	 * has access to partner filters SHOULD pass this so backend-rendered totals
	 * (email, PPT, assets summary) match what ScenarioCard displays.
	 */
	isIncentiveEligible?: boolean;
}

export interface ProposalScenario {
	endingSkuId: string;
	endingSkuName: string;
	endingSkuType: UpgradeType;
	seats: number;
	offerAnnualValue: number;
	currentAnnualValue: number;
	incrementalCost: number;
	totalIncentive: number;
	promoMonthlyPerUser: number;
	listMonthlyPerUser: number;
}

export interface IncrementalCostPerUserAnnualInput {
	offerAnnualValue: number;
	currentAnnualValue: number;
	seats: number;
}

export interface ScenarioExplicitMonthlyPrices {
	currentSkuCustomerPrice: number;
	currentSkuResellerPrice: number;
	targetSkuCustomerPrice: number;
	targetSkuResellerPrice: number;
}

export interface ScenarioExplicitAnnualValues {
	currentCustomerAnnualValue: number;
	currentResellerAnnualValue: number;
	targetCustomerAnnualValue: number;
	targetListAnnualValue: number;
	targetResellerAnnualValue: number;
	promoSavingsAnnual: number;
	incrementalCustomerCost: number;
	currentMarginAnnualValue: number;
	targetMarginAnnualValue: number;
	currentMarginPercent: number;
	targetMarginPercent: number;
}

export function roundCurrency(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeSeats(seats: number): number {
	if (!Number.isFinite(seats)) return 0;
	return Math.max(0, Math.floor(seats));
}

export function normalizeCurrentSkuMarginPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, value));
}

export function normalizeNonNegativeMoney(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return roundCurrency(Math.max(0, value));
}

export function annualizeMonthlyPrice(monthlyPrice: number, seats: number): number {
	return roundCurrency(
		normalizeNonNegativeMoney(monthlyPrice) * normalizeSeats(seats) * 12,
	);
}

export function deriveResellerPriceFromMargin(params: {
	customerPrice: number;
	marginPercent: number;
}): number {
	const customerPrice = normalizeNonNegativeMoney(params.customerPrice);
	const marginPercent = normalizeCurrentSkuMarginPercent(params.marginPercent);
	return roundCurrency(customerPrice * (1 - marginPercent / 100));
}

export function deriveMarginPercentFromPrices(params: {
	customerPrice: number;
	resellerPrice: number;
}): number {
	const customerPrice = normalizeNonNegativeMoney(params.customerPrice);
	if (customerPrice <= 0) {
		return 0;
	}

	const resellerPrice = normalizeNonNegativeMoney(params.resellerPrice);
	return normalizeCurrentSkuMarginPercent(
		((customerPrice - resellerPrice) / customerPrice) * 100,
	);
}

export function calculateScenarioAnnualValuesFromPrices(params: {
	seats: number;
	currentSeats?: number;
	targetListPrice: number;
	prices: ScenarioExplicitMonthlyPrices;
}): ScenarioExplicitAnnualValues {
	const seats = normalizeSeats(params.seats);
	const currentSeats = normalizeSeats(params.currentSeats ?? params.seats);
	const currentCustomerAnnualValue = annualizeMonthlyPrice(
		params.prices.currentSkuCustomerPrice,
		currentSeats,
	);
	const currentResellerAnnualValue = annualizeMonthlyPrice(
		params.prices.currentSkuResellerPrice,
		currentSeats,
	);
	const targetCustomerAnnualValue = annualizeMonthlyPrice(
		params.prices.targetSkuCustomerPrice,
		seats,
	);
	const targetListAnnualValue = annualizeMonthlyPrice(
		params.targetListPrice,
		seats,
	);
	const targetResellerAnnualValue = annualizeMonthlyPrice(
		params.prices.targetSkuResellerPrice,
		seats,
	);
	const currentMarginAnnualValue = roundCurrency(
		currentCustomerAnnualValue - currentResellerAnnualValue,
	);
	const targetMarginAnnualValue = roundCurrency(
		targetCustomerAnnualValue - targetResellerAnnualValue,
	);

	return {
		currentCustomerAnnualValue,
		currentResellerAnnualValue,
		targetCustomerAnnualValue,
		targetListAnnualValue,
		targetResellerAnnualValue,
		promoSavingsAnnual: roundCurrency(
			targetListAnnualValue - targetCustomerAnnualValue,
		),
		incrementalCustomerCost: roundCurrency(
			targetCustomerAnnualValue - currentCustomerAnnualValue,
		),
		currentMarginAnnualValue,
		targetMarginAnnualValue,
		currentMarginPercent: deriveMarginPercentFromPrices({
			customerPrice: params.prices.currentSkuCustomerPrice,
			resellerPrice: params.prices.currentSkuResellerPrice,
		}),
		targetMarginPercent: deriveMarginPercentFromPrices({
			customerPrice: params.prices.targetSkuCustomerPrice,
			resellerPrice: params.prices.targetSkuResellerPrice,
		}),
	};
}

export function computeIncrementalCostPerUserAnnual(
	params: IncrementalCostPerUserAnnualInput,
): number {
	const normalizedSeats = normalizeSeats(params.seats);
	if (normalizedSeats === 0) return 0;

	const offerAnnualValue = Number.isFinite(params.offerAnnualValue)
		? params.offerAnnualValue
		: 0;
	const currentAnnualValue = Number.isFinite(params.currentAnnualValue)
		? params.currentAnnualValue
		: 0;
	return roundCurrency((offerAnnualValue - currentAnnualValue) / normalizedSeats);
}

export function normalizeProduct(product: string): string {
	return product
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/**
 * Returns all valid ending SKUs for a given starting SKU id.
 */
export function getValidUpgradePaths(
	startingSkuId: string,
	options?: UpgradePricingSelectionOptions,
): EndingSku[] {
	const pathIds = VALID_UPGRADE_PATHS[startingSkuId] ?? [];
	const pricingContext = buildRegionalPricingContext({
		region: options?.region ?? null,
		country: options?.country ?? null,
	});

	return pathIds
		.map((pathId) => ENDING_SKU_BY_ID.get(pathId))
		.filter((sku): sku is EndingSku => Boolean(sku))
		.map((endingSku) =>
			applyRegionalPricingToEndingSku({
				endingSku,
				country: pricingContext.country,
			}),
		);
}

export interface CalculateIncentivesInput {
	endingSkuId: string;
	/**
	 * Canonical (regionally-adjusted) target SKU promo per-user-monthly price.
	 * MUST come from the SKU catalog, never from a partner-entered field —
	 * incentives are pinned to the canonical price.
	 */
	targetPrice: number;
	/**
	 * Canonical (regionally-adjusted) current SKU per-user-monthly price.
	 * MUST come from the SKU catalog, never from a partner-entered field.
	 * Ignored when journey is 'new_customer'.
	 */
	currentPrice: number;
	seats: number;
	/**
	 * DB-backed seat count for the existing subscription. Drives the current-leg
	 * (`currentPart`, `cspCoreCurrent`, `strategicAcceleratorCurrent`). Defaults
	 * to `seats` when omitted (back-compat). For renewals where the partner is
	 * proposing a different target seat count, callers MUST pass the actual DB
	 * seat count here so `currentIncentive` reflects the customer's true baseline.
	 */
	currentSeats?: number;
	journey: ScenarioJourney;
	/** ≥25-points partner-eligibility gate. Defaults to true for back-compat. */
	isIncentiveEligible?: boolean;
	/**
	 * Whether the ending SKU qualifies for Strategic Accelerator. Defaults to
	 * the membership in STRATEGIC_ACCELERATOR_SKU_IDS.
	 */
	endingSkuIsPremium?: boolean;
	/**
	 * Starting SKU ID — used to gate the current-leg Strategic Accelerator
	 * (only applies when the customer is currently on Business Premium, i.e. `bp`).
	 */
	startingSkuId?: string;
	/**
	 * Pricing country used to look up the region-specific Strategic Accelerator
	 * rate. Falls back to INCENTIVE_RATES.strategicAccelerator when omitted.
	 */
	country?: RegionalPricingCountry;
}

/**
 * Calculates scenario economics for the three partner incentives
 * (CSP Core, Strategic Accelerator, Growth Accelerator).
 *
 * Each leg uses canonical (regional) SKU prices net of the default margin:
 *   target_part  = targetPrice  * (1 - target_margin% / 100)  * seats * 12
 *   current_part = currentPrice * (1 - DEFAULT_CURRENT_SKU_MARGIN_PERCENT/100) * seats * 12
 *
 * Target leg (always shown on proposal card):
 *   cspCore              = 3.75% × target_part
 *   strategicAccelerator = 3%    × target_part   (only if endingSku is Business Premium)
 *   growthAccelerator    = 7.5%  × max(0, target_part − current_part)   (renewal only;
 *                                                                       0 for new_customer)
 *
 * Current leg (renewal only — rolled up into `currentIncentive`):
 *   cspCoreCurrent              = 3.75% × current_part
 *   strategicAcceleratorCurrent = 3%    × current_part   (only if startingSku === 'bp')
 *
 * Roll-ups:
 *   totalIncentive       = target leg sum
 *   currentIncentive     = current leg sum
 *   incrementalIncentive = totalIncentive − currentIncentive
 */
export function calculateIncentives(
	input: CalculateIncentivesInput,
): ScenarioEconomics {
	const isEligible = input.isIncentiveEligible ?? true;
	const isPremium =
		input.endingSkuIsPremium ??
		STRATEGIC_ACCELERATOR_SKU_IDS.has(input.endingSkuId);
	const startingSkuIsPremium =
		input.startingSkuId === STRATEGIC_ACCELERATOR_STARTING_SKU_ID;

	const seats = normalizeSeats(input.seats);
	const currentSeats = normalizeSeats(input.currentSeats ?? input.seats);
	const targetPrice = normalizeNonNegativeMoney(input.targetPrice);
	const currentPrice = normalizeNonNegativeMoney(input.currentPrice);
	const targetMarginPercent = getDefaultTargetSkuMarginPercent(
		input.endingSkuId,
	);
	const isRenewal = input.journey !== 'new_customer';

	const targetPart =
		targetPrice * (1 - targetMarginPercent / 100) * seats * 12;
	const currentPart = isRenewal
		? currentPrice *
			(1 - DEFAULT_CURRENT_SKU_MARGIN_PERCENT / 100) *
			currentSeats *
			12
		: 0;
	const growthBase = isRenewal ? Math.max(0, targetPart - currentPart) : 0;

	const strategicAcceleratorRate = input.country
		? getStrategicAcceleratorRate(input.country)
		: INCENTIVE_RATES.strategicAccelerator;

	const cspCore = isEligible
		? roundCurrency(targetPart * INCENTIVE_RATES.cspCore)
		: 0;
	const strategicAccelerator =
		isEligible && isPremium
			? roundCurrency(targetPart * strategicAcceleratorRate)
			: 0;
	const growthAccelerator = isEligible
		? roundCurrency(growthBase * INCENTIVE_RATES.growthAccelerator)
		: 0;
	const totalIncentive = roundCurrency(
		cspCore + strategicAccelerator + growthAccelerator,
	);

	const cspCoreCurrent =
		isEligible && isRenewal
			? roundCurrency(currentPart * INCENTIVE_RATES.cspCore)
			: 0;
	const strategicAcceleratorCurrent =
		isEligible && isRenewal && startingSkuIsPremium
			? roundCurrency(currentPart * strategicAcceleratorRate)
			: 0;
	const currentIncentive = roundCurrency(
		cspCoreCurrent + strategicAcceleratorCurrent,
	);
	const incrementalIncentive = roundCurrency(totalIncentive - currentIncentive);

	return {
		cspCore,
		strategicAccelerator,
		strategicAcceleratorRate,
		growthAccelerator,
		totalIncentive,
		cspCoreCurrent,
		strategicAcceleratorCurrent,
		currentIncentive,
		incrementalIncentive,
	};
}

/**
 * Calculates a full upgrade scenario for a specific starting/ending SKU pair.
 */
export function calculateScenario(
	startingSku: StartingSku,
	endingSku: EndingSku,
	seats: number,
	options?: CalculateScenarioOptions,
): UpgradeScenario {
	const normalizedSeats = normalizeSeats(seats);
	const pricingContext = buildRegionalPricingContext({
		region: options?.region ?? null,
		country: options?.country ?? null,
	});
	const resolvedEndingSku = applyRegionalPricingToEndingSku({
		endingSku,
		country: pricingContext.country,
	});
	const journey = options?.journey;
	const normalizedExpiringArr = Number.isFinite(options?.expiringArr)
		? Math.max(0, Number(options?.expiringArr))
		: null;
	const normalizedOriginalSeats = normalizeSeats(options?.originalSeats ?? seats);
	const normalizedCurrentSeats = normalizeSeats(
		options?.currentSeats ?? options?.originalSeats ?? seats,
	);

	let effectiveStartingMonthlyPrice = startingSku.monthlyPrice;
	let currentAnnualValue = roundCurrency(
		startingSku.monthlyPrice * normalizedCurrentSeats * 12,
	);

	// Renewal flow uses the subscription's expiring ARR as the current baseline.
	if (journey === 'renewal' && normalizedExpiringArr !== null) {
		currentAnnualValue = roundCurrency(normalizedExpiringArr);
	} else if (journey === 'new_customer' && normalizedExpiringArr !== null) {
		// New-customer baseline is derived from the user-provided cost-per-user.
		// Divide by currentSeats — the seat count the call site used to compute
		// expiringArr — so the per-user price derivation inverts cleanly under
		// the unified current-and-target seat policy.
		if (normalizedCurrentSeats > 0) {
			effectiveStartingMonthlyPrice =
				normalizedExpiringArr / normalizedCurrentSeats / 12;
			currentAnnualValue = roundCurrency(
				effectiveStartingMonthlyPrice * normalizedCurrentSeats * 12,
			);
		}
	}

	const offerAnnualValue = roundCurrency(
		resolvedEndingSku.promoPrice * normalizedSeats * 12,
	);
	const listAnnualValue = roundCurrency(
		resolvedEndingSku.listPrice * normalizedSeats * 12,
	);
	const promoSavingsAnnual = roundCurrency(listAnnualValue - offerAnnualValue);
	const incrementalCost = roundCurrency(offerAnnualValue - currentAnnualValue);
	const canonicalCurrentPrice =
		getRegionalStartingSkuMonthlyPrice({
			startingSkuId: startingSku.id,
			country: pricingContext.country,
		}) ?? startingSku.monthlyPrice;
	const economics = calculateIncentives({
		endingSkuId: resolvedEndingSku.id,
		targetPrice: resolvedEndingSku.promoPrice,
		currentPrice: canonicalCurrentPrice,
		seats: normalizedSeats,
		currentSeats: normalizedCurrentSeats,
		journey: journey ?? 'renewal',
		startingSkuId: startingSku.id,
		country: pricingContext.country,
		isIncentiveEligible: options?.isIncentiveEligible,
	});

	return {
		startingSkuId: startingSku.id,
		endingSkuId: resolvedEndingSku.id,
		startingSkuName: startingSku.name,
		endingSkuName: resolvedEndingSku.name,
		startingMonthlyPrice: effectiveStartingMonthlyPrice,
		endingMonthlyPrice: resolvedEndingSku.promoPrice,
		seats: normalizedSeats,
		offerAnnualValue,
		listAnnualValue,
		promoSavingsAnnual,
		newAnnualValue: offerAnnualValue,
		currentAnnualValue,
		incrementalCost,
		economics,
	};
}

export function calculateScenarioFromExplicitPrices(
	startingSku: StartingSku,
	endingSku: EndingSku,
	seats: number,
	prices: ScenarioExplicitMonthlyPrices,
	options?: CalculateScenarioOptions,
): UpgradeScenario {
	const normalizedSeats = normalizeSeats(seats);
	const pricingContext = buildRegionalPricingContext({
		region: options?.region ?? null,
		country: options?.country ?? null,
	});
	const resolvedEndingSku = applyRegionalPricingToEndingSku({
		endingSku,
		country: pricingContext.country,
	});
	const normalizedCurrentSeats = normalizeSeats(
		options?.currentSeats ?? options?.originalSeats ?? seats,
	);
	const annualValues = calculateScenarioAnnualValuesFromPrices({
		seats: normalizedSeats,
		currentSeats: normalizedCurrentSeats,
		targetListPrice: resolvedEndingSku.listPrice,
		prices,
	});
	// Incentives are PINNED to canonical regional SKU prices, NOT the
	// partner-entered customer / reseller prices in `prices`.
	const canonicalCurrentPrice =
		getRegionalStartingSkuMonthlyPrice({
			startingSkuId: startingSku.id,
			country: pricingContext.country,
		}) ?? startingSku.monthlyPrice;
	const economics = calculateIncentives({
		endingSkuId: resolvedEndingSku.id,
		targetPrice: resolvedEndingSku.promoPrice,
		currentPrice: canonicalCurrentPrice,
		seats: normalizedSeats,
		currentSeats: normalizedCurrentSeats,
		journey: options?.journey ?? 'renewal',
		startingSkuId: startingSku.id,
		country: pricingContext.country,
		isIncentiveEligible: options?.isIncentiveEligible,
	});

	return {
		startingSkuId: startingSku.id,
		endingSkuId: resolvedEndingSku.id,
		startingSkuName: startingSku.name,
		endingSkuName: resolvedEndingSku.name,
		startingMonthlyPrice: normalizeNonNegativeMoney(
			prices.currentSkuCustomerPrice,
		),
		endingMonthlyPrice: normalizeNonNegativeMoney(prices.targetSkuCustomerPrice),
		seats: normalizedSeats,
		offerAnnualValue: annualValues.targetCustomerAnnualValue,
		listAnnualValue: annualValues.targetListAnnualValue,
		promoSavingsAnnual: annualValues.promoSavingsAnnual,
		newAnnualValue: annualValues.targetCustomerAnnualValue,
		currentAnnualValue: annualValues.currentCustomerAnnualValue,
		incrementalCost: annualValues.incrementalCustomerCost,
		economics,
	};
}

/**
 * Maps a product string to a supported starting SKU, or null for unsupported.
 */
export function matchStartingSku(product: string): StartingSku | null {
	const normalized = normalizeProduct(product);

	if (normalized === 'other') return STARTING_SKU_BY_ID.get('other') ?? null;

	if (normalized.includes(' e3 ') || normalized.endsWith(' e3')) return null;
	if (normalized.includes(' e5 ') || normalized.endsWith(' e5')) return null;

	if (/\b(o365|office 365)\s+business\s+premium\b/.test(normalized)) {
		return STARTING_SKU_BY_ID.get('bs') ?? null;
	}
	if (/\bbusiness\s+premium\b/.test(normalized)) {
		return STARTING_SKU_BY_ID.get('bp') ?? null;
	}
	if (/\bbusiness\s+standard\b/.test(normalized)) {
		return STARTING_SKU_BY_ID.get('bs') ?? null;
	}
	if (/\bbusiness\s+basic\b/.test(normalized)) {
		return STARTING_SKU_BY_ID.get('bb') ?? null;
	}
	if (/\bo365\s+business\s+essentials\b/.test(normalized)) {
		return STARTING_SKU_BY_ID.get('bb') ?? null;
	}

	return null;
}

/**
 * Builds the condensed proposal scenario shape used in list PDFs.
 */
export function buildProposalScenarios(params: {
	currentProduct: string;
	seatCount: number;
	selectedSkuIds: string[];
	expiringArr?: number;
	journey?: ScenarioJourney;
	region?: string | null;
	country?: string | null;
}): ProposalScenario[] {
	const startingSku = matchStartingSku(params.currentProduct);
	if (!startingSku) {
		return [];
	}

	const allCandidates = getValidUpgradePaths(startingSku.id, {
		region: params.region,
		country: params.country,
	});
	const selectedSkuIds = params.selectedSkuIds ?? [];
	const selectedSkuSet = new Set(selectedSkuIds);
	const candidates =
		selectedSkuIds.length === 0
			? allCandidates
			: allCandidates.filter((endingSku) => selectedSkuSet.has(endingSku.id));

	return candidates.map((endingSku) => {
		const scenario = calculateScenario(startingSku, endingSku, params.seatCount, {
			journey: params.journey ?? 'renewal',
			expiringArr: params.expiringArr,
			originalSeats: params.seatCount,
			region: params.region,
			country: params.country,
		});
		return {
			endingSkuId: scenario.endingSkuId,
			endingSkuName: scenario.endingSkuName,
			endingSkuType: endingSku.upgradeType,
			seats: scenario.seats,
			offerAnnualValue: scenario.offerAnnualValue,
			currentAnnualValue: scenario.currentAnnualValue,
			incrementalCost: scenario.incrementalCost,
			totalIncentive: scenario.economics.totalIncentive,
			promoMonthlyPerUser: endingSku.promoPrice,
			listMonthlyPerUser: endingSku.listPrice,
		};
	});
}
