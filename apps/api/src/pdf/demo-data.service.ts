import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { SEAT_RANGE_ORDER, toSeatRange } from '@repo/shared';
import {
	SkuCategory,
	type RenewalSubscription,
	type FilterState,
} from '@repo/types';

export interface DemoFilterParams {
	filters?: Partial<FilterState>;
	searchTerm?: string;
}

const DROPDOWN_FILTER_FIELD_MAP: Partial<
	Record<keyof FilterState, keyof RenewalSubscription>
> = {
	pssAIWorkforce: 'pssAIWorkforceName',
	pssAISecurity: 'pssAISecurityName',
	psa: 'psaName',
	distributor: 'distributorName',
	reseller: 'resellerName',
	customer: 'customerName',
	pdm: 'pdmName',
	pmm: 'pmmName',
	region: 'region',
	type: 'type',
};

function daysUntilRenewal(renewalDateStr: string): number {
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const renewal = new Date(renewalDateStr);
	renewal.setHours(0, 0, 0, 0);
	return Math.ceil((renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

interface SmartBucket {
	label: string;
	predicate: (r: RenewalSubscription) => boolean;
}

const SMART_FILTER_CONFIG: Array<{
	key: keyof FilterState;
	buckets: SmartBucket[];
}> = [
	{
		key: 'skuCategory',
		buckets: [
			{
				label: 'Business Basic',
				predicate: (r) => r.skuCategory === SkuCategory.Basic,
			},
			{
				label: 'Business Standard',
				predicate: (r) => r.skuCategory === SkuCategory.Standard,
			},
			{
				label: 'Business Premium',
				predicate: (r) => r.skuCategory === SkuCategory.Premium,
			},
		],
	},
	{
		key: 'expSeats',
		buckets: SEAT_RANGE_ORDER.map((label) => ({
			label,
			predicate: (r) => toSeatRange(r.seatCount) === label,
		})),
	},
	{
		key: 'renewalDate',
		buckets: [
			{
				label: 'Within 7 days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= 0 && d <= 7;
				},
			},
			{
				label: 'Within 14 days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= 0 && d <= 14;
				},
			},
			{
				label: 'Within 30 days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= 0 && d <= 30;
				},
			},
			{
				label: 'Within 60 days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= 0 && d <= 60;
				},
			},
			{
				label: 'Above 60 days',
				predicate: (r) => daysUntilRenewal(r.renewalDate) > 60,
			},
		],
	},
	{
		key: 'pastRenewalDate',
		buckets: [
			{
				label: 'Within 7 days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= -7 && d < 0;
				},
			},
			{
				label: 'Within 14 days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= -14 && d < 0;
				},
			},
			{
				label: 'Within 30 days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= -30 && d < 0;
				},
			},
			{
				label: 'Within 60 days',
				predicate: (r) => {
					const d = daysUntilRenewal(r.renewalDate);
					return d >= -60 && d < 0;
				},
			},
			{
				label: 'Above 60 days',
				predicate: (r) => daysUntilRenewal(r.renewalDate) < -60,
			},
		],
	},
];

@Injectable()
export class DemoDataService {
	private cache: RenewalSubscription[] | null = null;

	loadSubscriptions(): RenewalSubscription[] {
		if (!this.cache) {
			const filePath = join(process.cwd(), 'assets', 'demo-subscriptions.json');
			this.cache = JSON.parse(readFileSync(filePath, 'utf-8'));
		}
		return this.cache!;
	}

	loadFilteredSubscriptions(params: DemoFilterParams): RenewalSubscription[] {
		let result = this.loadSubscriptions();

		const needle = params.searchTerm?.trim().toLowerCase();
		if (needle) {
			result = result.filter(
				(sub) =>
					sub.customerName.toLowerCase().includes(needle) ||
					sub.resellerName.toLowerCase().includes(needle) ||
					sub.currentProduct.toLowerCase().includes(needle),
			);
		}

		const filters = params.filters;
		if (!filters) return result;

		// Dropdown filters
		for (const [filterKey, field] of Object.entries(
			DROPDOWN_FILTER_FIELD_MAP,
		)) {
			const values = filters[filterKey as keyof FilterState];
			if (!values || values.length === 0) continue;
			result = result.filter((sub) => {
				const val = sub[field] as string;
				return val != null && values.includes(val);
			});
		}

		// Smart filters
		for (const dim of SMART_FILTER_CONFIG) {
			const values = filters[dim.key];
			if (!values || values.length === 0) continue;
			const activeBuckets = dim.buckets.filter((b) => values.includes(b.label));
			if (activeBuckets.length === 0) continue;
			result = result.filter((sub) =>
				activeBuckets.some((b) => b.predicate(sub)),
			);
		}

		return result;
	}

	getByReseller(resellerName: string): RenewalSubscription[] {
		return this.loadSubscriptions().filter(
			(s) => s.resellerName === resellerName,
		);
	}

	getByCustomer(customerId: string): RenewalSubscription[] {
		return this.loadSubscriptions().filter((s) => s.customerId === customerId);
	}
}
