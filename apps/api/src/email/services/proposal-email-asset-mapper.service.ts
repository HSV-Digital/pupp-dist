import crypto from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import {
	ENDING_SKU_BY_ID,
	STARTING_SKU_BY_ID,
	calculateScenarioFromExplicitPrices,
	buildRegionalPricingContext,
	buildRegionalPricingContextForRegions,
	convertUsdAmountToRegional,
	deriveResellerPriceFromMargin,
	getDefaultTargetSkuMarginPercent,
	getRegionalStartingSkuMonthlyPrice,
	getValidUpgradePaths,
	matchStartingSku,
	roundCurrency,
	type ProposalOptionsJourney,
	type RegionalPricingContext,
	type StartingSkuId,
} from '@repo/shared';
import {
	isIncentiveEligibleFromFilters,
	type PartnerFiltersPayload,
	type RenewalSubscription,
	type StartingSku,
} from '@repo/types';
import type {
	ProposalLineItemScenario,
	ProposalSelectedScenario,
} from '../proposal-options-email.service';

const PROPOSAL_PPT_MAX_SCENARIOS = 50;

// "Other" customers are net-new — they have no existing subscription, so the
// seat count from the subscription record is 0. Without a non-zero upper bound,
// the user-edited seat count would be clamped back to 0 and every downstream
// price/asset would render as $0. Mirrors the seat ceiling enforced by the
// proposal scenario card on the web (`MAX_SEATS = 300`).
const NET_NEW_MAX_SELECTED_SEATS = 300;

const STARTING_SKU_SHORT_LABEL_BY_ID: Record<StartingSkuId, string> = {
	bb: 'BB',
	bs: 'BS',
	bp: 'BP',
	other: 'Other',
};

const ENDING_SKU_TOKEN_LABEL_BY_ID: Record<string, string> = {
	bb: 'BB',
	bs: 'BS',
	bp: 'BP',
	cb: 'CB',
	defender: 'Defender Suite',
	purview: 'Purview Suite',
	other: 'Other',
};

const ENDING_SKU_TOKEN_FILE_STEM_BY_ID: Record<string, string> = {
	bb: 'bb',
	bs: 'bs',
	bp: 'bp',
	cb: 'cb',
	defender: 'defender_suite',
	purview: 'purview_suite',
	other: 'other',
};

function toSortKey(subscription: RenewalSubscription): string {
	return [
		subscription.renewalDate,
		subscription.currentProduct.toLowerCase(),
		String(subscription.seatCount),
		String(subscription.annualRevenueRunRate),
	].join('|');
}

function buildScenarioSelectionKey(
	opportunityId: string,
	endingSkuId: string,
): string {
	return `${opportunityId}::${endingSkuId}`;
}

function buildDuplicateOrdinalByIndex(
	subscriptions: RenewalSubscription[],
): Map<number, { ordinal: number; total: number }> {
	const grouped = new Map<
		string,
		{ subscription: RenewalSubscription; index: number }[]
	>();

	subscriptions.forEach((subscription, index) => {
		const list = grouped.get(subscription.subscriptionId) ?? [];
		list.push({ subscription, index });
		grouped.set(subscription.subscriptionId, list);
	});

	const lookup = new Map<number, { ordinal: number; total: number }>();
	for (const entries of grouped.values()) {
		const sorted = [...entries].sort((a, b) => {
			const keyA = toSortKey(a.subscription);
			const keyB = toSortKey(b.subscription);
			if (keyA !== keyB) return keyA.localeCompare(keyB);
			return a.index - b.index;
		});

		sorted.forEach((entry, position) => {
			lookup.set(entry.index, {
				ordinal: position + 1,
				total: sorted.length,
			});
		});
	}

	return lookup;
}

function buildOpportunityId(
	customerId: string,
	subscriptionId: string,
	duplicate: { ordinal: number; total: number },
): string {
	const base = `${customerId}:${subscriptionId}`;
	if (duplicate.total <= 1) return base;
	return `${base}:${duplicate.ordinal}`;
}

function resolveStartingSkuId(value: string): StartingSkuId {
	switch (value) {
		case 'bb':
		case 'bs':
		case 'bp':
		case 'other':
			return value;
		default:
			throw new UnprocessableEntityException(
				`Unsupported starting SKU "${value}"`,
			);
	}
}

function normalizeOptionalRenewalPrice(
	value: number | null | undefined,
): number | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return undefined;
	}

	return roundCurrency(Math.max(0, parsed));
}

function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

function slugifyUnderscore(value: string): string {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 120);
	return slug.length > 0 ? slug : 'value';
}

function resolveEffectiveStartingSku(
	startingSku: StartingSku,
	scenario: {
		expiringArr: number;
		currentSkuCustomerPrice?: number;
		expiringSkuRenewalPrice?: number;
		selectedSeats: number;
		startingSkuId: StartingSkuId;
	},
): StartingSku {
	if (scenario.startingSkuId === 'other' && scenario.selectedSeats > 0) {
		return {
			...startingSku,
			monthlyPrice:
				scenario.currentSkuCustomerPrice ??
				scenario.expiringSkuRenewalPrice ??
				Math.max(0, scenario.expiringArr) / scenario.selectedSeats / 12,
		};
	}

	return startingSku;
}

function resolveScenarioExplicitPrices(params: {
	startingSku: StartingSku;
	endingSku: { id: string; promoPrice: number };
	scenario: {
		currentSkuCustomerPrice?: number;
		currentSkuResellerPrice?: number;
		targetSkuCustomerPrice?: number;
		targetSkuResellerPrice?: number;
		expiringSkuRenewalPrice?: number;
		targetSkuPrice?: number;
	};
}) {
	const currentSkuCustomerPrice =
		normalizeOptionalRenewalPrice(params.scenario.currentSkuCustomerPrice) ??
		normalizeOptionalRenewalPrice(params.scenario.expiringSkuRenewalPrice) ??
		params.startingSku.monthlyPrice;
	const currentSkuResellerPrice =
		normalizeOptionalRenewalPrice(params.scenario.currentSkuResellerPrice) ??
		deriveResellerPriceFromMargin({
			customerPrice: currentSkuCustomerPrice,
			marginPercent: 20,
		});
	const targetSkuCustomerPrice =
		normalizeOptionalRenewalPrice(params.scenario.targetSkuCustomerPrice) ??
		normalizeOptionalRenewalPrice(params.scenario.targetSkuPrice) ??
		params.endingSku.promoPrice;
	const targetSkuResellerPrice =
		normalizeOptionalRenewalPrice(params.scenario.targetSkuResellerPrice) ??
		deriveResellerPriceFromMargin({
			customerPrice: targetSkuCustomerPrice,
			marginPercent: getDefaultTargetSkuMarginPercent(params.endingSku.id),
		});

	return {
		currentSkuCustomerPrice,
		currentSkuResellerPrice,
		targetSkuCustomerPrice,
		targetSkuResellerPrice,
	};
}

function splitSkuIdTokens(value: string): string[] {
	return value
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.map((token) => token.trim())
		.filter((token) => token.length > 0);
}

function toEndingSkuShortLabel(endingSkuId: string): string {
	const direct = ENDING_SKU_TOKEN_LABEL_BY_ID[endingSkuId];
	if (direct) {
		return direct;
	}
	const tokens = splitSkuIdTokens(endingSkuId)
		.map((token) => ENDING_SKU_TOKEN_LABEL_BY_ID[token] ?? token.toUpperCase())
		.filter((token) => token.length > 0);
	return tokens.length > 0 ? tokens.join(' + ') : endingSkuId.toUpperCase();
}

function toEndingSkuFileStem(endingSkuId: string): string {
	const direct = ENDING_SKU_TOKEN_FILE_STEM_BY_ID[endingSkuId];
	if (direct) {
		return direct;
	}
	const tokens = splitSkuIdTokens(endingSkuId).map(
		(token) => ENDING_SKU_TOKEN_FILE_STEM_BY_ID[token] ?? token,
	);
	if (tokens.length === 0) {
		return 'ending_sku';
	}
	const combined = tokens
		.join('_')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '');
	return combined.length > 0 ? combined : 'ending_sku';
}

export class ProposalEmailAssetMapperService {
	normalizeCustomerSubscriptions(params: {
		customerId: string;
		subscriptions: RenewalSubscription[];
	}): RenewalSubscription[] {
		const subscriptions = params.subscriptions
			.filter((subscription) => subscription.customerId === params.customerId)
			.map((subscription) => ({
				...subscription,
				seatCount: Math.max(0, Math.floor(subscription.seatCount)),
				annualRevenueRunRate: Math.max(
					0,
					Number.isFinite(subscription.annualRevenueRunRate)
						? subscription.annualRevenueRunRate
						: 0,
				),
			}));

		if (subscriptions.length === 0) {
			throw new UnprocessableEntityException(
				'No subscriptions available for the requested customer',
			);
		}

		return subscriptions;
	}

	computeProposalAssetsSummary(
		selectedScenarios: ProposalSelectedScenario[],
		journey: ProposalOptionsJourney,
		pricingContextOverride?: RegionalPricingContext,
		partnerFilters?: PartnerFiltersPayload | null,
	): {
		currentAnnual: number;
		listAnnual: number;
		offerAnnual: number;
		promoSavings: number;
		incrementalCost: number;
		incrementalIncentive: number;
	} {
		const isIncentiveEligible = isIncentiveEligibleFromFilters(partnerFilters);
		// The caller's pricing context already factors in the user's currency
		// override (e.g. "INR"), which flips the country for canonical-price
		// lookups even when subscription.region doesn't resolve to a known
		// country. Falling back to a region-only context here would default to
		// US prices and produce the wrong incremental cost/incentive that
		// disagrees with the per-scenario card on the proposal page.
		const pricingContext =
			pricingContextOverride ??
			buildRegionalPricingContextForRegions(
				selectedScenarios.map((scenario) => scenario.region),
			);
		const summary = {
			currentAnnual: 0,
			listAnnual: 0,
			offerAnnual: 0,
			promoSavings: 0,
			incrementalCost: 0,
			incrementalIncentive: 0,
		};
		// Unified seat policy: each selected scenario represents a distinct
		// proposal alternative carrying its own partner-edited seat count, so
		// every scenario's current ARR contributes to the consolidated total
		// (no per-opportunity dedup). This keeps the summary consistent with
		// the per-scenario investment slides — Σ current = sum of each card's
		// "Current investment" — and with the relation
		//   Σ incremental = Σ offer − Σ current.
		for (const scenario of selectedScenarios) {
			const rawStartingSku = STARTING_SKU_BY_ID.get(scenario.startingSkuId);
			const endingSku = ENDING_SKU_BY_ID.get(scenario.endingSkuId);
			if (!rawStartingSku || !endingSku) {
				throw new UnprocessableEntityException(
					`Invalid scenario SKU combination "${scenario.startingSkuId}:${scenario.endingSkuId}"`,
				);
			}

			const startingSku = resolveEffectiveStartingSku(rawStartingSku, scenario);
			const explicitPrices = resolveScenarioExplicitPrices({
				startingSku,
				endingSku,
				scenario,
			});
			const computed = calculateScenarioFromExplicitPrices(
				startingSku,
				endingSku,
				scenario.selectedSeats,
				explicitPrices,
				{
					journey,
					region: scenario.region,
					country: pricingContext.country,
					currentSeats: scenario.selectedSeats,
					isIncentiveEligible,
				},
			);
			summary.currentAnnual += computed.currentAnnualValue;
			summary.listAnnual += computed.listAnnualValue;
			summary.offerAnnual += computed.offerAnnualValue;
			summary.promoSavings += computed.promoSavingsAnnual;
			summary.incrementalCost += computed.incrementalCost;
			summary.incrementalIncentive += computed.economics.incrementalIncentive;
		}

		return {
			currentAnnual: roundCurrency(summary.currentAnnual),
			listAnnual: roundCurrency(summary.listAnnual),
			offerAnnual: roundCurrency(summary.offerAnnual),
			promoSavings: roundCurrency(summary.promoSavings),
			incrementalCost: roundCurrency(summary.incrementalCost),
			incrementalIncentive: roundCurrency(summary.incrementalIncentive),
		};
	}

	buildLineItemMeta(params: {
		scenario: ProposalLineItemScenario;
		documentIndex: number | null;
		totalDocuments: number;
	}): {
		opportunityId: string;
		endingSkuId: string;
		selectedSeats: number;
		label: string;
		fileName: string;
		status: 'not_generated';
	} {
		const { scenario } = params;
		const endingSku = ENDING_SKU_BY_ID.get(scenario.endingSkuId);
		if (!endingSku) {
			throw new UnprocessableEntityException(
				`Unknown ending SKU "${scenario.endingSkuId}"`,
			);
		}

		const startingSkuLabel =
			STARTING_SKU_SHORT_LABEL_BY_ID[scenario.startingSkuId] ??
			scenario.startingSkuName;
		const endingSkuLabel = toEndingSkuShortLabel(scenario.endingSkuId);
		const startingStem = slugifyUnderscore(startingSkuLabel);
		const endingStem = toEndingSkuFileStem(scenario.endingSkuId);
		const labelPrefix =
			params.totalDocuments > 1 && params.documentIndex !== null
				? `Proposal Document ${params.documentIndex}`
				: 'Proposal Document';
		const fileNamePrefix =
			params.totalDocuments > 1 && params.documentIndex !== null
				? `proposal_document_${params.documentIndex}`
				: 'proposal_document';
		const selectedSeats = Math.max(0, Math.floor(scenario.selectedSeats));
		const label = `${labelPrefix} - ${startingSkuLabel} to ${endingSkuLabel} - ${selectedSeats} Seats`;
		const fileName = `${fileNamePrefix}_${startingStem}_to_${endingStem}_${selectedSeats}_seats.pptx`;

		return {
			opportunityId: scenario.opportunityId,
			endingSkuId: scenario.endingSkuId,
			selectedSeats: scenario.selectedSeats,
			label,
			fileName,
			status: 'not_generated',
		};
	}

	buildLineItemBlobName(params: {
		journey: ProposalOptionsJourney;
		customerId: string;
		customerName: string;
		scenario: {
			opportunityId: string;
			endingSkuId: string;
			selectedSeats: number;
		};
		fileName: string;
		useChatToPaidFlyers?: boolean;
	}): string {
		const variant = params.useChatToPaidFlyers ? 'chat-to-paid' : 'standard';
		const hash = this.buildAssetHash(
			`${params.journey}|${params.customerId}|${params.scenario.opportunityId}|${params.scenario.endingSkuId}|${params.scenario.selectedSeats}|line-item|${variant}`,
		);
		const fileStem = params.fileName.replace(/\.pptx$/i, '');
		return [
			'proposal-ppts',
			slugify(params.customerName || 'customer'),
			'line-items',
			`${fileStem}_${hash}.pptx`,
		].join('/');
	}

	buildAssetHash(input: string): string {
		return crypto.createHash('sha256').update(input).digest('hex').slice(0, 6);
	}

	resolveProposalAssetScenariosFromSelections(params: {
		journey: ProposalOptionsJourney;
		subscriptions: RenewalSubscription[];
		selections: Array<{
			opportunityId: string;
			endingSkuId: string;
			seats: number;
			currentSkuCustomerPrice?: number;
			currentSkuResellerPrice?: number;
			targetSkuCustomerPrice?: number;
			targetSkuResellerPrice?: number;
			expiringSkuRenewalPrice?: number;
			targetSkuPrice?: number;
		}>;
	}): ProposalSelectedScenario[] {
		const opportunities = this.buildOpportunityIndexForSelections(
			params.subscriptions,
			params.journey,
		);

		let selectedScenarios: ProposalSelectedScenario[] = [];
		const seenScenarioKeys = new Set<string>();

		for (const selection of params.selections) {
			const scenarioKey = buildScenarioSelectionKey(
				selection.opportunityId,
				selection.endingSkuId,
			);
			if (seenScenarioKeys.has(scenarioKey)) {
				continue;
			}

			const opportunity = opportunities.get(selection.opportunityId);
			if (!opportunity) {
				throw new UnprocessableEntityException(
					`Selected opportunity "${selection.opportunityId}" was not found`,
				);
			}

			if (!opportunity.allowedEndingSkuIds.has(selection.endingSkuId)) {
				throw new UnprocessableEntityException(
					`Selected ending SKU "${selection.endingSkuId}" is not valid for opportunity "${selection.opportunityId}"`,
				);
			}

			seenScenarioKeys.add(scenarioKey);
			// Honor whatever the user typed on the scenario card, even when the
			// requested seat count is larger than the customer's current seats
			// (growth scenarios). The only cap is the shared 300-seat ceiling that
			// matches the web-side input — for both renewals and net-new ("Other").
			selectedScenarios.push({
				opportunityId: selection.opportunityId,
				startingSkuId: resolveStartingSkuId(opportunity.startingSku.id),
				startingSkuName: opportunity.startingSku.name,
				endingSkuId: selection.endingSkuId,
				selectedSeats: Math.max(
					0,
					Math.min(
						NET_NEW_MAX_SELECTED_SEATS,
						Math.floor(Number.isFinite(selection.seats) ? selection.seats : 0),
					),
				),
				originalSeats: opportunity.maxSeats,
				expiringArr: this.toProposalExpiringArr({
					journey: params.journey,
					annualRevenueRunRate: opportunity.subscription.annualRevenueRunRate,
					region: opportunity.subscription.region,
					country: opportunity.pricingContext.country,
					currentProduct: opportunity.subscription.currentProduct,
					seatCount: opportunity.maxSeats,
				}),
				currentSkuCustomerPrice: normalizeOptionalRenewalPrice(
					selection.currentSkuCustomerPrice,
				),
				currentSkuResellerPrice: normalizeOptionalRenewalPrice(
					selection.currentSkuResellerPrice,
				),
				targetSkuCustomerPrice: normalizeOptionalRenewalPrice(
					selection.targetSkuCustomerPrice,
				),
				targetSkuResellerPrice: normalizeOptionalRenewalPrice(
					selection.targetSkuResellerPrice,
				),
				expiringSkuRenewalPrice: normalizeOptionalRenewalPrice(
					selection.expiringSkuRenewalPrice,
				),
				targetSkuPrice: normalizeOptionalRenewalPrice(selection.targetSkuPrice),
				expiringSeatCount: opportunity.maxSeats,
				region: opportunity.subscription.region,
				distributorName: opportunity.subscription.distributorName,
				resellerName: opportunity.subscription.resellerName,
				pssAIWorkforceName: opportunity.subscription.pssAIWorkforceName,
				pssAISecurityName: opportunity.subscription.pssAISecurityName,
				pdmName: opportunity.subscription.pdmName,
				pmmName: opportunity.subscription.pmmName,
				subscriptionType: opportunity.subscription.type,
			});
		}

		if (selectedScenarios.length === 0) {
			throw new UnprocessableEntityException(
				'At least one valid proposal scenario is required',
			);
		}

		if (selectedScenarios.length > PROPOSAL_PPT_MAX_SCENARIOS) {
			throw new UnprocessableEntityException(
				`Proposal PPT supports up to ${PROPOSAL_PPT_MAX_SCENARIOS} scenarios`,
			);
		}

		// Note: we intentionally do NOT split a customer's current seats across
		// multiple scenarios for the same opportunity. Each scenario card shows
		// the customer's full original seat count. The proportional allocation
		// that used to live here distorted per-card displays (e.g. 52 current
		// seats → 20/32 across two scenarios), and per-scenario expiringArr is
		// recomputed below from `currentSkuCustomerPrice × selectedSeats × 12`.

		// When the user provides currentSkuCustomerPrice (always true after the
		// proposal page reset-on-currency-change flow), recompute expiringArr
		// from it so the investment slide's "current investment" placeholder
		// reflects the user-selected currency.
		//
		// Seats here use `selectedSeats` so `expiringArr` reflects the partner-
		// edited proposal seat count, matching the unified current-and-target
		// seat policy. For net-new "Other" SKU opportunities where the partner
		// enters both a current price and seats, current investment will display
		// as `currentSkuCustomerPrice × selectedSeats × 12` (non-zero) — this is
		// intentional under the new policy.
		selectedScenarios = selectedScenarios.map((scenario) => {
			if (scenario.currentSkuCustomerPrice === undefined) {
				return scenario;
			}
			return {
				...scenario,
				expiringArr: roundCurrency(
					scenario.currentSkuCustomerPrice * scenario.selectedSeats * 12,
				),
			};
		});

		selectedScenarios = selectedScenarios.map((scenario) => ({
			...scenario,
			currentSkuCustomerPrice:
				scenario.currentSkuCustomerPrice ??
				scenario.expiringSkuRenewalPrice ??
				(scenario.originalSeats > 0
					? roundCurrency(scenario.expiringArr / scenario.originalSeats / 12)
					: 0),
			currentSkuResellerPrice:
				scenario.currentSkuResellerPrice ??
				deriveResellerPriceFromMargin({
					customerPrice:
						scenario.currentSkuCustomerPrice ??
						scenario.expiringSkuRenewalPrice ??
						(scenario.originalSeats > 0
							? roundCurrency(scenario.expiringArr / scenario.originalSeats / 12)
							: 0),
					marginPercent: 20,
				}),
		}));

		return selectedScenarios;
	}

	buildOpportunityIndexForSelections(
		subscriptions: RenewalSubscription[],
		journey: ProposalOptionsJourney,
	) {
		const duplicateLookup = buildDuplicateOrdinalByIndex(subscriptions);
		const opportunities = new Map<
			string,
			{
				subscription: RenewalSubscription;
				startingSku: StartingSku;
				allowedEndingSkuIds: Set<string>;
				maxSeats: number;
				pricingContext: RegionalPricingContext;
			}
		>();

		subscriptions.forEach((subscription, index) => {
			const hasProductName =
				typeof subscription.currentProduct === 'string' &&
				subscription.currentProduct.trim().length > 0;
			let startingSku = hasProductName
				? matchStartingSku(subscription.currentProduct)
				: matchStartingSku('other');
			if (!startingSku) return;

			const pricingContext = buildRegionalPricingContext({
				region: subscription.region,
			});
			const proposalExpiringArr = this.toProposalExpiringArr({
				journey,
				annualRevenueRunRate: subscription.annualRevenueRunRate,
				region: subscription.region,
				country: pricingContext.country,
				currentProduct: subscription.currentProduct,
				seatCount: subscription.seatCount,
			});
			if (startingSku.id === 'other' && subscription.seatCount > 0) {
				startingSku = {
					...startingSku,
					monthlyPrice: proposalExpiringArr / subscription.seatCount / 12,
				};
			}

			const endingSkus = getValidUpgradePaths(startingSku.id, {
				region: subscription.region,
				country: pricingContext.country,
			});
			if (endingSkus.length === 0) return;

			const duplicate = duplicateLookup.get(index) ?? { ordinal: 1, total: 1 };
			const opportunityId = buildOpportunityId(
				subscription.customerId,
				subscription.subscriptionId,
				duplicate,
			);

			opportunities.set(opportunityId, {
				subscription,
				startingSku,
				allowedEndingSkuIds: new Set(endingSkus.map((sku) => sku.id)),
				maxSeats: Math.max(0, Math.floor(subscription.seatCount)),
				pricingContext,
			});
		});

		return opportunities;
	}

	toProposalExpiringArr(params: {
		journey: ProposalOptionsJourney;
		annualRevenueRunRate: number;
		region?: string | null;
		country?: string | null;
		currentProduct?: string | null;
		seatCount?: number | null;
	}): number {
		const normalizedUsd = Math.max(
			0,
			Number.isFinite(params.annualRevenueRunRate)
				? params.annualRevenueRunRate
				: 0,
		);
		const regional = params.journey !== 'renewal'
			? normalizedUsd
			: convertUsdAmountToRegional({
					amountUsd: normalizedUsd,
					region: params.region,
					country: params.country,
				});
		if (regional > 0) {
			return regional;
		}

		// Fallback: when the upstream subscription has no ARR (CSP partner CSV
		// imports don't include it), derive it from the regional SKU monthly
		// price × seats × 12 so the proposal slide shows a real "current
		// investment" instead of $0.
		const seats = Math.max(
			0,
			Math.floor(
				Number.isFinite(params.seatCount ?? 0) ? (params.seatCount ?? 0) : 0,
			),
		);
		if (seats <= 0 || !params.currentProduct) {
			return 0;
		}
		const startingSku = matchStartingSku(params.currentProduct);
		if (!startingSku) {
			return 0;
		}
		const pricingContext = buildRegionalPricingContext({
			region: params.region,
			country: params.country,
		});
		const monthlyPrice = getRegionalStartingSkuMonthlyPrice({
			startingSkuId: startingSku.id,
			region: params.region,
			country: pricingContext.country,
		});
		if (!monthlyPrice) {
			return 0;
		}
		return roundCurrency(monthlyPrice * seats * 12);
	}
}
