import { UnprocessableEntityException } from '@nestjs/common';
import {
	ENDING_SKU_BY_ID,
	STARTING_SKU_BY_ID,
	allocateScenarioBaselines,
	calculateScenarioFromExplicitPrices,
	buildRegionalPricingContext,
	buildRegionalPricingContextForRegions,
	computeIncrementalCostPerUserAnnual,
	deriveResellerPriceFromMargin,
	getDefaultTargetSkuMarginPercent,
	getValidUpgradePaths,
	roundCurrency,
	type RegionalPricingContext,
} from '@repo/shared';
import { UpgradeType, isIncentiveEligibleFromFilters } from '@repo/types';
import type { StartingSku } from '@repo/types';
import type { CreateCustomerProposalEmailLinkDto } from '../dto/create-customer-proposal-email-link.dto';
import type {
	CustomerProposalEmailPayload,
	CustomerProposalEmailScenarioPayload,
	PricingContextPayload,
} from '../../pdf/types/dl-token.types';

const CUSTOMER_EMAIL_MAX_SCENARIOS = 3;
const PROPOSAL_PPT_MAX_SCENARIOS = 50;

interface CurrencyFormatOptions {
	currencySymbol?: string;
	locale?: string;
}

interface PartnerProposalScenarioValues {
	starting_sku: string;
	target_sku: string;
	solution_overview: string;
	seats: string;
	proposed_seat: string;
	expiring_arr: string;
	after_promo_price: string;
	incremental_cost: string;
	current_incentive: string;
	new_incentive: string;
	incrementalCostPerUserAnnual: string;
	incrementalIncentive: string;
}

type TemplateChunkValue = string | boolean;

function buildScenarioSelectionKey(
	opportunityId: string,
	endingSkuId: string,
): string {
	return `${opportunityId}::${endingSkuId}`;
}

function applyRenewalAllocationIfNeeded<
	T extends {
		opportunityId: string;
		endingSkuId: string;
		selectedSeats: number;
		originalSeats: number;
		expiringArr: number;
	},
>(scenarios: T[]): T[] {
	// Each scenario is an *alternative* the customer can pick — not a split.
	// When the partner shows multiple paths from one opportunity, each path
	// must reflect the customer's full current seats and full current
	// investment, so the per-card "Current SKU / # Seats / Current investment"
	// in the investment snapshot is consistent across alternatives. Keep
	// originalSeats and expiringArr unchanged.
	return scenarios;
}

function formatNumber(value: number): string {
	return Math.max(0, Math.floor(value)).toLocaleString('en-US');
}

function formatCurrency(
	value: number,
	options?: CurrencyFormatOptions,
): string {
	const symbol = options?.currencySymbol ?? '$';
	const locale = options?.locale ?? 'en-US';
	const normalized = Math.max(0, Number.isFinite(value) ? value : 0);
	return `${symbol}${Math.round(normalized).toLocaleString(locale)}`;
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

function toCurrencyFormatOptions(
	pricingContext:
		| Pick<RegionalPricingContext, 'currencySymbol' | 'locale'>
		| Pick<PricingContextPayload, 'currencySymbol' | 'locale'>
		| null
		| undefined,
): CurrencyFormatOptions {
	return {
		currencySymbol: pricingContext?.currencySymbol ?? '$',
		locale: pricingContext?.locale ?? 'en-US',
	};
}

function resolvePayloadCurrencyOverride(
	pricingContext: PricingContextPayload | null | undefined,
): string | null {
	return pricingContext?.currency ?? null;
}

function resolvePayloadPricingContext(
	pricingContext: PricingContextPayload | null | undefined,
): RegionalPricingContext | null {
	if (!pricingContext) {
		return null;
	}

	return buildRegionalPricingContext({
		region: pricingContext.region,
		country: pricingContext.country,
		currencyOverride: pricingContext.currency,
	});
}

function resolveScenarioPricingContext(params: {
	scenarioRegion: string | null | undefined;
	payloadPricingContext: PricingContextPayload | null | undefined;
}): RegionalPricingContext {
	const currencyOverride = resolvePayloadCurrencyOverride(
		params.payloadPricingContext,
	);
	const scenarioPricingContext = buildRegionalPricingContext({
		region: params.scenarioRegion,
		currencyOverride,
	});

	if (!scenarioPricingContext.fallbackApplied) {
		return scenarioPricingContext;
	}

	return (
		resolvePayloadPricingContext(params.payloadPricingContext) ??
		scenarioPricingContext
	);
}

function resolveDocumentPricingContext(params: {
	scenarios: Array<Pick<CustomerProposalEmailScenarioPayload, 'region'>>;
	payloadPricingContext: PricingContextPayload | null | undefined;
}): RegionalPricingContext {
	const currencyOverride = resolvePayloadCurrencyOverride(
		params.payloadPricingContext,
	);
	const scenarioPricingContext = buildRegionalPricingContextForRegions(
		params.scenarios.map((scenario) => scenario.region),
		{ currencyOverride },
	);

	if (!scenarioPricingContext.fallbackApplied) {
		return scenarioPricingContext;
	}

	return (
		resolvePayloadPricingContext(params.payloadPricingContext) ??
		scenarioPricingContext
	);
}

function resolveEffectiveStartingSku(
	startingSku: StartingSku,
	scenario: {
		expiringArr: number;
		currentSkuCustomerPrice?: number;
		expiringSkuRenewalPrice?: number;
		selectedSeats: number;
		startingSkuId: StartingSku['id'];
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

export class ProposalEmailTemplateService {
	resolveCustomerProposalScenarios(
		payload: CreateCustomerProposalEmailLinkDto,
	): CustomerProposalEmailScenarioPayload[] {
		const ordered: CustomerProposalEmailScenarioPayload[] = [];
		const seenScenarioKeys = new Set<string>();

		for (const candidate of payload.scenarios) {
			const scenarioKey = buildScenarioSelectionKey(
				candidate.opportunityId,
				candidate.endingSkuId,
			);
			if (seenScenarioKeys.has(scenarioKey)) {
				continue;
			}

			const startingSku = STARTING_SKU_BY_ID.get(candidate.startingSkuId);
			if (!startingSku) {
				throw new UnprocessableEntityException(
					`Unknown starting SKU "${candidate.startingSkuId}"`,
				);
			}

			if (!ENDING_SKU_BY_ID.has(candidate.endingSkuId)) {
				throw new UnprocessableEntityException(
					`Unknown ending SKU "${candidate.endingSkuId}"`,
				);
			}

			seenScenarioKeys.add(scenarioKey);
			ordered.push({
				opportunityId: candidate.opportunityId,
				startingSkuId: candidate.startingSkuId,
				startingSkuName:
					candidate.startingSkuName?.trim().length > 0
						? candidate.startingSkuName.trim()
						: startingSku.name,
				endingSkuId: candidate.endingSkuId,
				selectedSeats: Math.max(0, Math.floor(candidate.selectedSeats)),
				originalSeats: Math.max(0, Math.floor(candidate.originalSeats)),
				expiringArr: Math.max(0, candidate.expiringArr),
				currentSkuCustomerPrice: normalizeOptionalRenewalPrice(
					candidate.currentSkuCustomerPrice,
				),
				currentSkuResellerPrice: normalizeOptionalRenewalPrice(
					candidate.currentSkuResellerPrice,
				),
				targetSkuCustomerPrice: normalizeOptionalRenewalPrice(
					candidate.targetSkuCustomerPrice,
				),
				targetSkuResellerPrice: normalizeOptionalRenewalPrice(
					candidate.targetSkuResellerPrice,
				),
				expiringSkuRenewalPrice: normalizeOptionalRenewalPrice(
					candidate.expiringSkuRenewalPrice,
				),
				targetSkuPrice: normalizeOptionalRenewalPrice(candidate.targetSkuPrice),
				region: candidate.region?.trim() ?? '',
			});
		}

		if (ordered.length === 0) {
			throw new UnprocessableEntityException(
				'At least one valid proposal scenario is required',
			);
		}

		if (ordered.length > CUSTOMER_EMAIL_MAX_SCENARIOS) {
			throw new UnprocessableEntityException(
				`Customer proposal email supports up to ${CUSTOMER_EMAIL_MAX_SCENARIOS} scenarios`,
			);
		}

		return applyRenewalAllocationIfNeeded(ordered);
	}

	resolvePartnerProposalScenarios(
		payload: CreateCustomerProposalEmailLinkDto,
	): CustomerProposalEmailScenarioPayload[] {
		const ordered: CustomerProposalEmailScenarioPayload[] = [];
		const seenScenarioKeys = new Set<string>();

		for (const candidate of payload.scenarios) {
			const scenarioKey = buildScenarioSelectionKey(
				candidate.opportunityId,
				candidate.endingSkuId,
			);
			if (seenScenarioKeys.has(scenarioKey)) {
				continue;
			}

			const startingSku = STARTING_SKU_BY_ID.get(candidate.startingSkuId);
			if (!startingSku) {
				throw new UnprocessableEntityException(
					`Unknown starting SKU "${candidate.startingSkuId}"`,
				);
			}

			if (!ENDING_SKU_BY_ID.has(candidate.endingSkuId)) {
				throw new UnprocessableEntityException(
					`Unknown ending SKU "${candidate.endingSkuId}"`,
				);
			}

			seenScenarioKeys.add(scenarioKey);
			ordered.push({
				opportunityId: candidate.opportunityId,
				startingSkuId: candidate.startingSkuId,
				startingSkuName:
					candidate.startingSkuName?.trim().length > 0
						? candidate.startingSkuName.trim()
						: startingSku.name,
				endingSkuId: candidate.endingSkuId,
				selectedSeats: Math.max(0, Math.floor(candidate.selectedSeats)),
				originalSeats: Math.max(0, Math.floor(candidate.originalSeats)),
				expiringArr: Math.max(0, candidate.expiringArr),
				currentSkuCustomerPrice: normalizeOptionalRenewalPrice(
					candidate.currentSkuCustomerPrice,
				),
				currentSkuResellerPrice: normalizeOptionalRenewalPrice(
					candidate.currentSkuResellerPrice,
				),
				targetSkuCustomerPrice: normalizeOptionalRenewalPrice(
					candidate.targetSkuCustomerPrice,
				),
				targetSkuResellerPrice: normalizeOptionalRenewalPrice(
					candidate.targetSkuResellerPrice,
				),
				expiringSkuRenewalPrice: normalizeOptionalRenewalPrice(
					candidate.expiringSkuRenewalPrice,
				),
				targetSkuPrice: normalizeOptionalRenewalPrice(candidate.targetSkuPrice),
				region: candidate.region?.trim() ?? '',
			});
		}

		if (ordered.length === 0) {
			throw new UnprocessableEntityException(
				'At least one valid proposal scenario is required',
			);
		}

		if (ordered.length > PROPOSAL_PPT_MAX_SCENARIOS) {
			throw new UnprocessableEntityException(
				`Partner proposal email supports up to ${PROPOSAL_PPT_MAX_SCENARIOS} scenarios`,
			);
		}

		return applyRenewalAllocationIfNeeded(ordered);
	}

	resolveCustomerProposalTemplatePath(params: {
		journey: 'new_customer' | 'renewal';
		scenarios: CustomerProposalEmailScenarioPayload[];
	}): string {
		let hasAi = false;
		let hasSecurity = false;

		for (const scenario of params.scenarios) {
			const endingSku = ENDING_SKU_BY_ID.get(scenario.endingSkuId);
			if (!endingSku) {
				throw new UnprocessableEntityException(
					`Unknown ending SKU "${scenario.endingSkuId}"`,
				);
			}
			if (endingSku.upgradeType === UpgradeType.AI) {
				hasAi = true;
			} else {
				hasSecurity = true;
			}
		}

		const templateVariant = hasAi ? 'ai' : hasSecurity ? 'security' : null;
		if (!templateVariant) {
			throw new UnprocessableEntityException(
				'Unable to resolve customer email template for selected scenarios',
			);
		}

		if (params.journey === 'new_customer') {
			if (params.scenarios.length > 1) {
				return `/email_templates/customer/new_customer/multi_solution/${templateVariant}.docx`;
			}
			return `/email_templates/customer/new_customer/single_solution/${templateVariant}.docx`;
		}

		const category = params.scenarios.length > 1 ? 'multi' : 'single';
		if (category === 'multi') {
			return `/email_templates/customer/renewal/multi_solution_renewal/${templateVariant}.docx`;
		}
		return `/email_templates/customer/renewal/single_solution_renewal/${templateVariant}.docx`;
	}

	resolvePartnerProposalTemplatePath(params: {
		journey: 'new_customer' | 'renewal';
		scenarios: CustomerProposalEmailScenarioPayload[];
	}): string {
		if (params.journey === 'new_customer') {
			if (params.scenarios.length > 1) {
				return '/email_templates/partner/proposal/renewal/multiple.docx';
			}
			const firstScenario = params.scenarios[0];
			if (!firstScenario) {
				throw new UnprocessableEntityException(
					'Unable to resolve partner proposal template without scenarios',
				);
			}
			return firstScenario.startingSkuId === 'other'
				? '/email_templates/partner/proposal/new_customer/others.docx'
				: '/email_templates/partner/proposal/new_customer/bb_bs_bp.docx';
		}

		return params.scenarios.length > 1
			? '/email_templates/partner/proposal/renewal/multiple.docx'
			: '/email_templates/partner/proposal/renewal/single.docx';
	}

	buildPartnerProposalTemplateValues(
		payload: CustomerProposalEmailPayload,
	): Record<string, unknown> {
		const documentPricingContext = resolveDocumentPricingContext({
			scenarios: payload.scenarios,
			payloadPricingContext: payload.pricingContext,
		});
		const currencyFormat = toCurrencyFormatOptions(documentPricingContext);
		const scenarioValues: PartnerProposalScenarioValues[] = [];
		const startSkuNames: string[] = [];
		const targetSkuNames: string[] = [];
		let totalOriginalSeats = 0;
		let totalSelectedSeats = 0;
		let totalExpiringArr = 0;
		let totalOfferAnnual = 0;
		let totalIncrementalCost = 0;
		let totalIncrementalCostForPerUser = 0;
		let totalCurrentIncentive = 0;
		let totalNewIncentive = 0;
		let totalIncrementalIncentive = 0;
		// Current-side aggregates (originalSeats, expiringArr, currentIncentive)
		// reflect the customer's actual current state. When multiple alternative
		// paths share the same opportunity, count each opportunity's current
		// state once — not once per alternative — so totals don't double-count.
		const seenOpportunityIdsForCurrentAggregates = new Set<string>();

		for (const scenarioPayload of payload.scenarios) {
			const scenarioPricingContext = resolveScenarioPricingContext({
				scenarioRegion: scenarioPayload.region,
				payloadPricingContext: payload.pricingContext,
			});
			const scenarioCurrencyFormat = toCurrencyFormatOptions(
				scenarioPricingContext,
			);
			const rawStartingSku = STARTING_SKU_BY_ID.get(
				scenarioPayload.startingSkuId,
			);
			if (!rawStartingSku) {
				throw new UnprocessableEntityException(
					`Unknown starting SKU "${scenarioPayload.startingSkuId}"`,
				);
			}
			const endingSku =
				getValidUpgradePaths(scenarioPayload.startingSkuId, {
					region: scenarioPayload.region,
					country: scenarioPricingContext.country,
				}).find((candidate) => candidate.id === scenarioPayload.endingSkuId) ??
				ENDING_SKU_BY_ID.get(scenarioPayload.endingSkuId);
			if (!endingSku) {
				throw new UnprocessableEntityException(
					`Unknown ending SKU "${scenarioPayload.endingSkuId}"`,
				);
			}

			const selectedSeats = Math.max(
				0,
				Math.floor(scenarioPayload.selectedSeats),
			);
			const originalSeats = Math.max(
				0,
				Math.floor(scenarioPayload.originalSeats),
			);
			const startingSku = resolveEffectiveStartingSku(
				rawStartingSku,
				scenarioPayload,
			);
			const explicitPrices = resolveScenarioExplicitPrices({
				startingSku,
				endingSku,
				scenario: scenarioPayload,
			});
			const calculated = calculateScenarioFromExplicitPrices(
				startingSku,
				endingSku,
				selectedSeats,
				explicitPrices,
				{
					journey: payload.journey,
					region: scenarioPayload.region,
					country: scenarioPricingContext.country,
					// Unified seat policy: current and target legs both use the
					// partner-edited proposal seats.
					currentSeats: selectedSeats,
					isIncentiveEligible: isIncentiveEligibleFromFilters(
						payload.partnerFilters,
					),
				},
			);

			const isFirstAlternativeForOpportunity =
				!seenOpportunityIdsForCurrentAggregates.has(scenarioPayload.opportunityId);
			if (isFirstAlternativeForOpportunity) {
				seenOpportunityIdsForCurrentAggregates.add(scenarioPayload.opportunityId);
				totalOriginalSeats += originalSeats;
				totalExpiringArr += Math.max(0, scenarioPayload.expiringArr);
				totalCurrentIncentive += calculated.economics.currentIncentive;
			}
			totalSelectedSeats += selectedSeats;
			totalOfferAnnual += calculated.offerAnnualValue;
			totalIncrementalCost += calculated.incrementalCost;
			totalNewIncentive += calculated.economics.totalIncentive;
			totalIncrementalIncentive += calculated.economics.incrementalIncentive;

			if (!startSkuNames.includes(scenarioPayload.startingSkuName)) {
				startSkuNames.push(scenarioPayload.startingSkuName);
			}
			if (!targetSkuNames.includes(endingSku.name)) {
				targetSkuNames.push(endingSku.name);
			}

			const effectiveSelectedSeats =
				selectedSeats > 0 ? selectedSeats : originalSeats;
			const afterPromoPerUserAnnual = roundCurrency(
				explicitPrices.targetSkuCustomerPrice * 12,
			);
			const incrementalCostPerUserAnnual = computeIncrementalCostPerUserAnnual({
				offerAnnualValue: calculated.offerAnnualValue,
				currentAnnualValue: calculated.currentAnnualValue,
				seats: effectiveSelectedSeats,
			});
			totalIncrementalCostForPerUser +=
				incrementalCostPerUserAnnual * effectiveSelectedSeats;

			scenarioValues.push({
				starting_sku: scenarioPayload.startingSkuName,
				target_sku: endingSku.name,
				solution_overview: this.formatBulletLines(
					endingSku.solutionCapabilities,
				),
				// Per-card seats reflect what the user entered for this SKU.
				seats: formatNumber(effectiveSelectedSeats),
				proposed_seat: formatNumber(effectiveSelectedSeats),
				expiring_arr: formatCurrency(
					scenarioPayload.expiringArr,
					scenarioCurrencyFormat,
				),
				after_promo_price: formatCurrency(
					afterPromoPerUserAnnual,
					scenarioCurrencyFormat,
				),
				incremental_cost: formatCurrency(
					calculated.incrementalCost,
					scenarioCurrencyFormat,
				),
				current_incentive: formatCurrency(
					calculated.economics.currentIncentive,
					scenarioCurrencyFormat,
				),
				new_incentive: formatCurrency(
					calculated.economics.totalIncentive,
					scenarioCurrencyFormat,
				),
				incrementalCostPerUserAnnual: formatCurrency(
					incrementalCostPerUserAnnual,
					scenarioCurrencyFormat,
				),
				incrementalIncentive: formatCurrency(
					calculated.economics.incrementalIncentive,
					scenarioCurrencyFormat,
				),
			});
		}

		const seatsForIncentiveText =
			totalOriginalSeats > 0 ? totalOriginalSeats : totalSelectedSeats;
		const effectiveSelectedSeats =
			totalSelectedSeats > 0 ? totalSelectedSeats : seatsForIncentiveText;
		const afterPromoPerUserAnnual =
			effectiveSelectedSeats > 0
				? totalOfferAnnual / effectiveSelectedSeats
				: 0;
		const incrementalCostPerUserAnnual =
			effectiveSelectedSeats > 0
				? totalIncrementalCostForPerUser / effectiveSelectedSeats
				: 0;
		const aggregateSolutionOverview = scenarioValues
			.map((value) => value.solution_overview)
			.filter((value) => value.trim().length > 0)
			.join('\n\n');
		const chunks = this.buildPartnerProposalChunks({ scenarioValues });

		const data: Record<string, unknown> = {
			customer_name: payload.customerName,
			starting_sku: startSkuNames.join(', '),
			target_sku: targetSkuNames.join(', '),
			solution_overview: aggregateSolutionOverview,
			// Aggregate seats reflect total seats entered by the user across SKUs.
			seats: formatNumber(effectiveSelectedSeats),
			proposed_seat: formatNumber(effectiveSelectedSeats),
			expiring_arr: formatCurrency(totalExpiringArr, currencyFormat),
			after_promo_price: formatCurrency(
				afterPromoPerUserAnnual,
				currencyFormat,
			),
			incremental_cost: formatCurrency(totalIncrementalCost, currencyFormat),
			current_incentive: formatCurrency(totalCurrentIncentive, currencyFormat),
			new_incentive: formatCurrency(totalNewIncentive, currencyFormat),
			difference: formatCurrency(totalIncrementalIncentive, currencyFormat),
			incrementalCostPerUserAnnual: formatCurrency(
				incrementalCostPerUserAnnual,
				currencyFormat,
			),
			incremental_cost_per_user_annual: formatCurrency(
				incrementalCostPerUserAnnual,
				currencyFormat,
			),
			incrementalIncentive: formatCurrency(
				totalIncrementalIncentive,
				currencyFormat,
			),
			incremental_incentive: formatCurrency(
				totalIncrementalIncentive,
				currencyFormat,
			),
			renewal_date: '',
			link: '__PARTNER_PROPOSAL_BOM_LINK__',
			url: '__PARTNER_PROPOSAL_UPLOAD_LINK__',
			chunks,
		};

		return data;
	}

	buildPartnerProposalChunks(params: {
		scenarioValues: PartnerProposalScenarioValues[];
	}): Array<Record<string, TemplateChunkValue>> {
		const keys = [
			'starting_sku',
			'target_sku',
			'solution_overview',
			'seats',
			'proposed_seat',
			'expiring_arr',
			'after_promo_price',
			'incremental_cost',
			'current_incentive',
			'new_incentive',
			'incrementalCostPerUserAnnual',
			'incrementalIncentive',
		] as const;

		return this.buildTemplateChunks({
			scenarioValues: params.scenarioValues,
			keys,
		});
	}

	buildCustomerProposalTemplateValues(
		payload: CustomerProposalEmailPayload,
	): Record<string, unknown> {
		const scenarioValues = payload.scenarios.map((scenario) =>
			this.buildCustomerProposalScenarioValues(scenario, payload),
		);
		const firstScenario = scenarioValues[0];

		const keys = [
			'start_sku',
			'target_sku',
			'end_sku',
			'solution_details',
			'solution_capabilities',
			'tagline',
			'one_liner',
			'selected_seats',
			'original_seats',
			'expiring_arr',
			'actual_price_per_user',
			'per_user_after_promo_price',
			'promo_savings_per_user',
			'overall_incremental_cost',
			'incremental_cost_per_user',
		] as const;

		const data: Record<string, unknown> = {
			customer_name: payload.customerName,
			solution_count: String(payload.scenarios.length),
			start_sku: firstScenario?.start_sku ?? '',
			target_sku: firstScenario?.target_sku ?? '',
			end_sku: firstScenario?.end_sku ?? '',
			solution_details: firstScenario?.solution_details ?? '',
			solution_capabilities: firstScenario?.solution_capabilities ?? '',
			tagline: firstScenario?.tagline ?? '',
			one_liner: firstScenario?.one_liner ?? '',
			selected_seats: firstScenario?.selected_seats ?? '',
			original_seats: firstScenario?.original_seats ?? '',
			expiring_arr: firstScenario?.expiring_arr ?? '',
			actual_price_per_user: firstScenario?.actual_price_per_user ?? '',
			per_user_after_promo_price:
				firstScenario?.per_user_after_promo_price ?? '',
			promo_savings_per_user: firstScenario?.promo_savings_per_user ?? '',
			overall_incremental_cost: firstScenario?.overall_incremental_cost ?? '',
			incremental_cost_per_user: firstScenario?.incremental_cost_per_user ?? '',
		};

		for (let slot = 0; slot < CUSTOMER_EMAIL_MAX_SCENARIOS; slot += 1) {
			const values = scenarioValues[slot];
			for (const key of keys) {
				data[`${key}_${slot + 1}`] = values?.[key] ?? '';
			}
		}
		data.chunks = this.buildTemplateChunks({
			scenarioValues,
			keys,
		});

		return data;
	}

	buildCustomerProposalScenarioValues(
		scenarioPayload: CustomerProposalEmailScenarioPayload,
		payload: Pick<
			CustomerProposalEmailPayload,
			'journey' | 'pricingContext' | 'partnerFilters'
		>,
	): Record<string, string> {
		const pricingContext = resolveScenarioPricingContext({
			scenarioRegion: scenarioPayload.region,
			payloadPricingContext: payload.pricingContext,
		});
		const currencyFormat = toCurrencyFormatOptions(pricingContext);
		const rawStartingSku = STARTING_SKU_BY_ID.get(
			scenarioPayload.startingSkuId,
		);
		if (!rawStartingSku) {
			throw new UnprocessableEntityException(
				`Unknown starting SKU "${scenarioPayload.startingSkuId}"`,
			);
		}

		const endingSku =
			getValidUpgradePaths(scenarioPayload.startingSkuId, {
				region: scenarioPayload.region,
				country: pricingContext.country,
			}).find((candidate) => candidate.id === scenarioPayload.endingSkuId) ??
			ENDING_SKU_BY_ID.get(scenarioPayload.endingSkuId);
		if (!endingSku) {
			throw new UnprocessableEntityException(
				`Unknown ending SKU "${scenarioPayload.endingSkuId}"`,
			);
		}

		const startingSku = resolveEffectiveStartingSku(
			rawStartingSku,
			scenarioPayload,
		);
		const selectedSeats = Math.max(
			0,
			Math.floor(scenarioPayload.selectedSeats),
		);
		const originalSeats = Math.max(
			0,
			Math.floor(scenarioPayload.originalSeats),
		);
		const explicitPrices = resolveScenarioExplicitPrices({
			startingSku,
			endingSku,
			scenario: scenarioPayload,
		});
		const computed = calculateScenarioFromExplicitPrices(
			startingSku,
			endingSku,
			selectedSeats,
			explicitPrices,
			{
				journey: payload.journey,
				region: scenarioPayload.region,
				country: pricingContext.country,
				// Unified seat policy: current and target legs both use the
				// partner-edited proposal seats.
				currentSeats: selectedSeats,
				isIncentiveEligible: isIncentiveEligibleFromFilters(
					payload.partnerFilters,
				),
			},
		);
		const solutionCapabilities =
			endingSku.solutionCapabilities ?? endingSku.planHighlights;
		const actualPricePerUserAnnual =
			selectedSeats > 0
				? computed.listAnnualValue / selectedSeats
				: roundCurrency(endingSku.listPrice * 12);
		const afterPromoPerUserAnnual = roundCurrency(
			explicitPrices.targetSkuCustomerPrice * 12,
		);
		const promoSavingsPerUserAnnual = roundCurrency(
			(endingSku.listPrice - explicitPrices.targetSkuCustomerPrice) * 12,
		);
		const incrementalPerUserAnnual = computeIncrementalCostPerUserAnnual({
			offerAnnualValue: computed.offerAnnualValue,
			currentAnnualValue: computed.currentAnnualValue,
			seats: selectedSeats,
		});

		return {
			start_sku: scenarioPayload.startingSkuName,
			target_sku: endingSku.name,
			end_sku: endingSku.name,
			solution_details: this.formatBulletLines(endingSku.solutionCapabilities),
			solution_capabilities: this.formatBulletLines(solutionCapabilities),
			tagline: endingSku.tagline,
			one_liner: endingSku.oneLiner,
			selected_seats: formatNumber(selectedSeats),
			// Unified seat policy: `original_seats` (rendered as the customer-
			// facing "# Seats" placeholder in the investment summary) tracks the
			// partner-edited proposal seats so current and target sections of
			// the slide stay consistent. The financial "Current investment"
			// placeholder is price × selectedSeats × 12 — both must agree.
			original_seats: formatNumber(selectedSeats),
			expiring_arr: formatCurrency(scenarioPayload.expiringArr, currencyFormat),
			actual_price_per_user: formatCurrency(
				actualPricePerUserAnnual,
				currencyFormat,
			),
			per_user_after_promo_price: formatCurrency(
				afterPromoPerUserAnnual,
				currencyFormat,
			),
			promo_savings_per_user: formatCurrency(
				promoSavingsPerUserAnnual,
				currencyFormat,
			),
			overall_incremental_cost: formatCurrency(
				computed.incrementalCost,
				currencyFormat,
			),
			incremental_cost_per_user: formatCurrency(
				incrementalPerUserAnnual,
				currencyFormat,
			),
		};
	}

	formatBulletLines(values: string[] | null | undefined): string {
		if (!Array.isArray(values)) {
			return '';
		}
		const normalized = values
			.map((value) => value.trim())
			.filter((value) => value.length > 0);
		if (normalized.length === 0) {
			return '';
		}
		return normalized.map((value) => `• ${value}`).join('\n');
	}

	private buildTemplateChunks<T extends string>(params: {
		scenarioValues: Array<Record<T, string>>;
		keys: readonly T[];
	}): Array<Record<string, TemplateChunkValue>> {
		const CHUNK_SIZE = 3;
		const chunks: Array<Record<string, TemplateChunkValue>> = [];
		for (
			let startIndex = 0;
			startIndex < params.scenarioValues.length;
			startIndex += CHUNK_SIZE
		) {
			const chunkValues = params.scenarioValues.slice(
				startIndex,
				startIndex + CHUNK_SIZE,
			);
			const chunk: Record<string, TemplateChunkValue> = {
				is_3col: chunkValues.length === 3,
				is_2col: chunkValues.length === 2,
				is_1col: chunkValues.length === 1,
			};

			for (let slot = 0; slot < CHUNK_SIZE; slot += 1) {
				const scenario = chunkValues[slot];
				const slotSuffix = slot + 1;
				for (const key of params.keys) {
					chunk[`${key}_${slotSuffix}`] = scenario?.[key] ?? '';
				}
			}

			chunks.push(chunk);
		}
		return chunks;
	}
}
