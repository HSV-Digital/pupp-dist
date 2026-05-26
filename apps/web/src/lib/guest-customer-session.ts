import type { RenewalSubscription } from '@repo/types';
import type { ResellerFormData } from './reseller-session';

const GUEST_CUSTOMER_KEY = 'guest-customer-data';
const GUEST_SNAPSHOT_KEY = 'guest-customer-snapshot';

export function writeGuestCustomer(data: ResellerFormData): void {
	localStorage.setItem(GUEST_CUSTOMER_KEY, JSON.stringify(data));
}

export function readGuestCustomer(): ResellerFormData | null {
	try {
		const raw = localStorage.getItem(GUEST_CUSTOMER_KEY);
		if (!raw) return null;

		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;

		const obj = parsed as Record<string, unknown>;
		if (
			typeof obj.customerId !== 'string' ||
			typeof obj.partnerName !== 'string' ||
			typeof obj.customerName !== 'string' ||
			typeof obj.currentSku !== 'string' ||
			typeof obj.numberOfSeats !== 'number' ||
			typeof obj.costPerUser !== 'number' ||
			typeof obj.region !== 'string'
		) {
			return null;
		}

		return obj as unknown as ResellerFormData;
	} catch {
		return null;
	}
}

export function clearGuestCustomer(): void {
	localStorage.removeItem(GUEST_CUSTOMER_KEY);
}

export interface GuestCustomerSnapshot {
	customerId: string;
	customerName: string;
	subscriptions: RenewalSubscription[];
}

export function writeGuestCustomerSnapshot(
	snapshot: GuestCustomerSnapshot,
): void {
	localStorage.setItem(GUEST_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function readGuestCustomerSnapshot(): GuestCustomerSnapshot | null {
	try {
		const raw = localStorage.getItem(GUEST_SNAPSHOT_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as GuestCustomerSnapshot;
	} catch {
		return null;
	}
}
