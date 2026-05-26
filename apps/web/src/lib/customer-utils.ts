import type {
	Customer,
	GroupedReseller,
	RenewalSubscription,
} from '@repo/types';

function toDateValue(value: string): number | null {
	if (!value) return null;
	const parsed = new Date(value);
	const timestamp = parsed.getTime();
	return Number.isFinite(timestamp) ? timestamp : null;
}

function toIsoDate(value: number): string {
	return new Date(value).toISOString().slice(0, 10);
}

function getNearestRenewalDate(subscriptions: RenewalSubscription[]): string {
	const timestamps = subscriptions
		.map((subscription) => toDateValue(subscription.renewalDate))
		.filter((value): value is number => value !== null);

	if (timestamps.length === 0) {
		return subscriptions[0]?.renewalDate ?? '';
	}

	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const today = now.getTime();

	const future = timestamps.filter((value) => value >= today);
	if (future.length > 0) {
		return toIsoDate(Math.min(...future));
	}

	return toIsoDate(Math.max(...timestamps));
}

export function groupByCustomer(
	subscriptions: RenewalSubscription[],
): Customer[] {
	const grouped = new Map<string, RenewalSubscription[]>();

	for (const subscription of subscriptions) {
		const bucket = grouped.get(subscription.customerId) ?? [];
		bucket.push(subscription);
		grouped.set(subscription.customerId, bucket);
	}

	const customers: Customer[] = [];

	for (const [customerId, customerSubscriptions] of grouped.entries()) {
		const first = customerSubscriptions[0];
		const totalSeats = customerSubscriptions.reduce(
			(sum, subscription) => sum + subscription.seatCount,
			0,
		);
		const totalARR = customerSubscriptions.reduce(
			(sum, subscription) => sum + subscription.annualRevenueRunRate,
			0,
		);

		customers.push({
			customerId,
			customerName: first?.customerName ?? '',
			subscriptions: customerSubscriptions,
			totalSeats,
			totalARR,
			resellerName: first?.resellerName ?? '',
			distributorName: first?.distributorName ?? '',
			renewalDate: getNearestRenewalDate(customerSubscriptions),
		});
	}

	return customers.sort((a, b) => b.totalARR - a.totalARR);
}

export function groupByReseller(
	subscriptions: RenewalSubscription[],
): GroupedReseller[] {
	const grouped = new Map<string, RenewalSubscription[]>();

	for (const subscription of subscriptions) {
		const bucket = grouped.get(subscription.resellerName) ?? [];
		bucket.push(subscription);
		grouped.set(subscription.resellerName, bucket);
	}

	const resellers: GroupedReseller[] = [];

	for (const [resellerName, resellerSubscriptions] of grouped.entries()) {
		const customers = groupByCustomer(resellerSubscriptions);
		const totalSeats = resellerSubscriptions.reduce(
			(sum, s) => sum + s.seatCount,
			0,
		);
		const totalARR = resellerSubscriptions.reduce(
			(sum, s) => sum + s.annualRevenueRunRate,
			0,
		);

		resellers.push({
			resellerName,
			customers,
			subscriptions: resellerSubscriptions,
			totalSeats,
			totalARR,
			customerCount: customers.length,
			renewalDate: getNearestRenewalDate(resellerSubscriptions),
		});
	}

	return resellers.sort((a, b) => b.totalARR - a.totalARR);
}
