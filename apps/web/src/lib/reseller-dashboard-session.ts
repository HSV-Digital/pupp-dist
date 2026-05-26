import type { ResellerFormData } from './reseller-session';

const DASHBOARD_KEY = 'reseller-dashboard-entries';

export interface SessionResellerEntry extends ResellerFormData {
	id: string;
	createdAt: string;
}

function isValidEntry(obj: Record<string, unknown>): boolean {
	return (
		typeof obj.id === 'string' &&
		typeof obj.createdAt === 'string' &&
		typeof obj.customerId === 'string' &&
		typeof obj.partnerName === 'string' &&
		typeof obj.customerName === 'string' &&
		typeof obj.currentSku === 'string' &&
		typeof obj.numberOfSeats === 'number' &&
		typeof obj.costPerUser === 'number' &&
		typeof obj.region === 'string'
	);
}

export function readResellerDashboardEntries(): SessionResellerEntry[] {
	try {
		const raw = sessionStorage.getItem(DASHBOARD_KEY);
		if (!raw) return [];

		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed.filter(
			(item) =>
				item &&
				typeof item === 'object' &&
				isValidEntry(item as Record<string, unknown>),
		) as SessionResellerEntry[];
	} catch {
		return [];
	}
}

export function writeResellerDashboardEntries(
	entries: SessionResellerEntry[],
): void {
	sessionStorage.setItem(DASHBOARD_KEY, JSON.stringify(entries));
}

export function addResellerDashboardEntry(
	data: ResellerFormData,
): SessionResellerEntry {
	const entry: SessionResellerEntry = {
		...data,
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
	};
	const entries = readResellerDashboardEntries();
	entries.push(entry);
	writeResellerDashboardEntries(entries);
	return entry;
}

export function removeResellerDashboardEntry(id: string): void {
	const entries = readResellerDashboardEntries();
	writeResellerDashboardEntries(entries.filter((e) => e.id !== id));
}
