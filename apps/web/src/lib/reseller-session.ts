const RESELLER_SESSION_KEY = 'reseller-form-data';

export interface ResellerFormData {
	customerId: string;
	partnerName: string;
	customerName: string;
	currentSku: string;
	numberOfSeats: number;
	costPerUser: number;
	region: string;
}

export function writeResellerSession(data: ResellerFormData): void {
	sessionStorage.setItem(RESELLER_SESSION_KEY, JSON.stringify(data));
}

export function readResellerSession(): ResellerFormData | null {
	try {
		const raw = sessionStorage.getItem(RESELLER_SESSION_KEY);
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

export function clearResellerSession(): void {
	sessionStorage.removeItem(RESELLER_SESSION_KEY);
}
