import { SkuCategory } from '@repo/types';
import type { RenewalSubscription } from '@repo/types';
import {
	buildRegionalPricingContext,
	getRegionalStartingSkuMonthlyPrice,
	matchStartingSku,
} from '@repo/shared';
import type { ResellerFormData } from './reseller-session';
import type { ResellerSubscription } from './use-reseller-customers';

// Derive ARR from the regional SKU price × seats when the upstream record
// doesn't carry one (e.g. CSP partner CSV uploads, where `external_subscription`
// has no ARR column). Returns 0 only for unknown / "Other" SKUs.
function deriveAnnualRevenueRunRate(
	currentSku: string,
	seats: number,
	region: string | null | undefined,
): number {
	const startingSku = matchStartingSku(currentSku);
	if (!startingSku) return 0;
	const pricingContext = buildRegionalPricingContext({ region });
	const monthlyPrice = getRegionalStartingSkuMonthlyPrice({
		startingSkuId: startingSku.id,
		region,
		country: pricingContext.country,
	});
	if (!monthlyPrice || seats <= 0) return 0;
	return monthlyPrice * seats * 12;
}

const SKU_CATEGORY_MAP: Record<string, SkuCategory> = {
	'Business Basic': SkuCategory.Basic,
	'Business Standard': SkuCategory.Standard,
	'Business Premium': SkuCategory.Premium,
	Other: SkuCategory.Other,
};

export function resolveResellerSkuCategory(currentSku: string): SkuCategory {
	// Exact match first
	const exact = SKU_CATEGORY_MAP[currentSku];
	if (exact) return exact;

	// Fuzzy match: require both "business" and a type keyword
	const lower = currentSku.toLowerCase();
	const hasBusiness = lower.includes('business');
	if (hasBusiness && lower.includes('premium')) return SkuCategory.Premium;
	if (hasBusiness && lower.includes('standard')) return SkuCategory.Standard;
	if (hasBusiness && lower.includes('basic')) return SkuCategory.Basic;

	return SkuCategory.Other;
}

export function synthesizeSubscription(
	data: ResellerFormData,
): RenewalSubscription {
	const renewalDate = new Date();
	renewalDate.setDate(renewalDate.getDate() + 90);

	return {
		customerId: data.customerId,
		subscriptionId: `local-${data.customerId}`,
		customerName: data.customerName,
		resellerName: data.partnerName,
		distributorName: '',
		pssAIWorkforceName: '',
		pssAISecurityName: '',
		psaName: '',
		pdmName: '',
		pmmName: '',
		currentProduct: data.currentSku,
		skuCategory: resolveResellerSkuCategory(data.currentSku),
		seatCount: data.numberOfSeats,
		annualRevenueRunRate: data.numberOfSeats * data.costPerUser * 12,
		renewalDate: renewalDate.toISOString(),
		termMonths: 12,
		autoRenew: false,
		multiYear: false,
		hasCopilot: false,
		hasPurview: false,
		hasSureStep: false,
		currentMargin: 20,
		customerSegment: '',
		region: data.region ?? '',
		notes: '',
	};
}

export function synthesizeSubscriptionsFromCustomers(
	customerId: string,
	customers: ResellerSubscription[],
): RenewalSubscription[] {
	return customers.map((customer) => {
		const annualRevenueRunRate =
			customer.currentArr > 0
				? customer.currentArr
				: deriveAnnualRevenueRunRate(
						customer.currentSku,
						customer.seats,
						customer.region,
					);
		return {
			customerId,
			subscriptionId: customer.id,
			customerName: customer.customerName,
			resellerName: '',
			distributorName: '',
			pssAIWorkforceName: '',
			pssAISecurityName: '',
			psaName: '',
			pdmName: '',
			pmmName: '',
			currentProduct: customer.currentSku,
			skuCategory: resolveResellerSkuCategory(customer.currentSku),
			seatCount: customer.seats,
			annualRevenueRunRate,
			renewalDate: customer.renewalDate ?? '',
			termMonths: 12,
			autoRenew: false,
			multiYear: false,
			hasCopilot: false,
			hasPurview: false,
			hasSureStep: false,
			currentMargin: 20,
			customerSegment: '',
			region: customer.region ?? '',
			notes: '',
		};
	});
}
