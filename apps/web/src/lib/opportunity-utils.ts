import type {
	DashboardOpportunityRow,
	EndingSku,
	RenewalSubscription,
	StartingSku,
} from '@repo/types';
import {
	buildRegionalPricingContext,
	convertUsdAmountToRegional,
	deriveResellerPriceFromMargin,
	getDefaultTargetSkuMarginPercent,
	getRegionalStartingSkuMonthlyPrice,
	getValidUpgradePaths,
	matchStartingSku,
	type RegionalPricingContext,
} from '@/lib/rules-engine';

export type OpportunitySubscription = RenewalSubscription &
	Partial<
		Pick<DashboardOpportunityRow, 'seatRange' | 'closestRenewalLabel'>
	>;

export interface CustomerOpportunity {
	opportunityId: string;
	customerId: string;
	subscriptionId: string;
	subscription: OpportunitySubscription;
	startingSku: StartingSku;
	endingSkus: EndingSku[];
	proposalExpiringArr: number;
	pricingContext: RegionalPricingContext;
}

export interface OpportunityDescriptor {
	opportunityId: string;
	startingSkuId: string;
	allowedEndingSkuIds: string[];
	maxSeats: number;
	currentSkuCustomerPrice: number;
	currentSkuResellerPrice: number;
	targetSkuPricingByEndingSkuId: Record<
		string,
		{
			targetSkuCustomerPrice: number;
			targetSkuResellerPrice: number;
		}
	>;
}

function toSortKey(subscription: OpportunitySubscription): string {
	return [
		subscription.renewalDate,
		subscription.currentProduct.toLowerCase(),
		String(subscription.seatCount),
		String(subscription.annualRevenueRunRate),
	].join('|');
}

function buildDuplicateOrdinalByIndex(
	subscriptions: OpportunitySubscription[],
): Map<number, { ordinal: number; total: number }> {
	const grouped = new Map<
		string,
		{ subscription: OpportunitySubscription; index: number }[]
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

export function buildOpportunityId(
	customerId: string,
	subscriptionId: string,
	duplicate: { ordinal: number; total: number },
): string {
	const base = `${customerId}:${subscriptionId}`;
	if (duplicate.total <= 1) return base;
	return `${base}:${duplicate.ordinal}`;
}

export function buildCustomerOpportunities(
	subscriptions: OpportunitySubscription[],
	options?: {
		convertUsdToRegional?: boolean;
		currencyOverride?: string | null;
	},
): CustomerOpportunity[] {
	const shouldConvertUsdToRegional = options?.convertUsdToRegional ?? true;
	const duplicateLookup = buildDuplicateOrdinalByIndex(subscriptions);
	const opportunities: CustomerOpportunity[] = [];

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
			currencyOverride: options?.currencyOverride,
		});
		const normalizedAnnualRevenueRunRate = Math.max(
			0,
			Number.isFinite(subscription.annualRevenueRunRate)
				? subscription.annualRevenueRunRate
				: 0,
		);
		const proposalExpiringArr = shouldConvertUsdToRegional
			? convertUsdAmountToRegional({
					amountUsd: normalizedAnnualRevenueRunRate,
					region: subscription.region,
					country: pricingContext.country,
				})
			: normalizedAnnualRevenueRunRate;

		const regionalStartingSkuPrice = getRegionalStartingSkuMonthlyPrice({
			startingSkuId: startingSku.id,
			region: subscription.region,
			country: pricingContext.country,
		});
		if (regionalStartingSkuPrice !== null) {
			startingSku = {
				...startingSku,
				monthlyPrice: regionalStartingSkuPrice,
			};
		}

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

		opportunities.push({
			opportunityId: buildOpportunityId(
				subscription.customerId,
				subscription.subscriptionId,
				duplicate,
			),
			customerId: subscription.customerId,
			subscriptionId: subscription.subscriptionId,
			subscription,
			startingSku,
			endingSkus,
			proposalExpiringArr,
			pricingContext,
		});
	});

	return opportunities;
}

export function toOpportunityDescriptorMap(
	opportunities: CustomerOpportunity[],
): Map<string, OpportunityDescriptor> {
	return new Map(
		opportunities.map((opportunity) => [
			opportunity.opportunityId,
			{
				opportunityId: opportunity.opportunityId,
				startingSkuId: opportunity.startingSku.id,
				allowedEndingSkuIds: opportunity.endingSkus.map((sku) => sku.id),
				maxSeats: Math.max(0, Math.floor(opportunity.subscription.seatCount)),
				currentSkuCustomerPrice: opportunity.startingSku.monthlyPrice,
				currentSkuResellerPrice: deriveResellerPriceFromMargin({
					customerPrice: opportunity.startingSku.monthlyPrice,
					marginPercent: 20,
				}),
				targetSkuPricingByEndingSkuId: Object.fromEntries(
					opportunity.endingSkus.map((sku) => [
						sku.id,
						{
							targetSkuCustomerPrice: sku.promoPrice,
							targetSkuResellerPrice: deriveResellerPriceFromMargin({
								customerPrice: sku.promoPrice,
								marginPercent: getDefaultTargetSkuMarginPercent(sku.id),
							}),
						},
					]),
				),
			},
		]),
	);
}
