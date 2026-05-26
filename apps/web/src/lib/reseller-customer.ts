import { readResellerDashboardEntries } from './reseller-dashboard-session';
import { readResellerSession, type ResellerFormData } from './reseller-session';

export function resolveResellerCustomerData(
	customerId: string,
): ResellerFormData | null {
	const activeSession = readResellerSession();
	if (activeSession?.customerId === customerId) {
		return activeSession;
	}

	const dashboardEntry = readResellerDashboardEntries().find(
		(entry) => entry.customerId === customerId,
	);
	if (!dashboardEntry) {
		return null;
	}

	return {
		customerId: dashboardEntry.customerId,
		partnerName: dashboardEntry.partnerName,
		customerName: dashboardEntry.customerName,
		currentSku: dashboardEntry.currentSku,
		numberOfSeats: dashboardEntry.numberOfSeats,
		costPerUser: dashboardEntry.costPerUser,
		region: dashboardEntry.region,
	};
}
