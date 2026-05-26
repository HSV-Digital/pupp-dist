import {
	formatEstimatedSeatCount,
	getSeatRangeLowerBound,
	toSeatRange,
} from '@repo/shared';
import type {
	DashboardApiResponse,
	DashboardApiSummary,
	DashboardCustomerRow as PublicDashboardCustomerRow,
	DashboardOpportunityRow as PublicDashboardOpportunityRow,
	DashboardResellerRow as PublicDashboardResellerRow,
	FilterState,
} from '@repo/types';
import type {
	DashboardCustomerRow,
	DashboardOpportunityRow,
	DashboardResponse,
	DashboardResellerRow,
	DashboardSummaryResponse,
} from './dashboard.types';

function formatClosestRenewal(value: string): string {
	const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
	if (Number.isNaN(date.getTime())) {
		return 'N/A';
	}

	return date.toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric',
	});
}

function toPublicSummary(
	summary: DashboardSummaryResponse,
): DashboardApiSummary {
	return {
		totalRenewals: summary.totalRenewals,
		totalSeats: summary.totalSeats,
		totalSeatsDisplay: formatEstimatedSeatCount(summary.totalSeats),
		copilotOpportunities: summary.copilotOpportunities,
		totalCustomers: summary.totalCustomers,
		totalResellers: summary.totalResellers,
	};
}

function toPublicCustomerRow(
	row: DashboardCustomerRow,
): PublicDashboardCustomerRow {
	return {
		customerId: row.customerId,
		customerName: row.customerName,
		resellerName: row.resellerName,
		distributorName: row.distributorName,
		totalSeatsRange: toSeatRange(row.totalSeats),
		subscriptionCount: row.subscriptionCount,
		subscriptionSkuCategories:
			row.subscriptionSkuCategories as PublicDashboardCustomerRow['subscriptionSkuCategories'],
		renewalDate: row.renewalDate,
		closestRenewalLabel: formatClosestRenewal(row.renewalDate),
	};
}

function toPublicResellerRow(
	row: DashboardResellerRow,
): PublicDashboardResellerRow {
	return {
		resellerName: row.resellerName,
		totalSeatsRange: toSeatRange(row.totalSeats),
		customerCount: row.customerCount,
		subscriptionCount: row.subscriptionCount,
		renewalDate: row.renewalDate,
		closestRenewalLabel: formatClosestRenewal(row.renewalDate),
	};
}

function toPublicOpportunityRow(
	row: DashboardOpportunityRow,
): PublicDashboardOpportunityRow {
	const seatRange = toSeatRange(row.seatCount);

	return {
		...row,
		skuCategory: row.skuCategory as PublicDashboardOpportunityRow['skuCategory'],
		seatCount: getSeatRangeLowerBound(seatRange),
		seatRange,
		closestRenewalLabel: formatClosestRenewal(row.renewalDate),
	};
}

function toPublicAvailableOptions(
	options: DashboardResponse['availableOptions'],
): DashboardApiResponse['availableOptions'] {
	if (!options) {
		return undefined;
	}

	const {
		pssAIWorkforce,
		pssAISecurity,
		psa,
		distributor,
		reseller,
		customer,
		pdm,
		pmm,
		region,
		type,
		skuCategory,
		expSeats,
		renewalDate,
		pastRenewalDate,
	} = options;

	const publicOptions: Record<keyof FilterState, string[]> = {
		pssAIWorkforce,
		pssAISecurity,
		psa,
		distributor,
		reseller,
		customer,
		pdm,
		pmm,
		region,
		type,
		skuCategory,
		expSeats,
		renewalDate,
		pastRenewalDate,
	};

	return publicOptions;
}

export function toPublicDashboardResponse(
	response: DashboardResponse,
): DashboardApiResponse {
	if (response.viewMode === 'customer') {
		return {
			viewMode: response.viewMode,
			page: response.page,
			pageSize: response.pageSize,
			total: response.total,
			sortBy: response.sortBy,
			sortDir: response.sortDir,
			summary: response.summary ? toPublicSummary(response.summary) : undefined,
			availableOptions: toPublicAvailableOptions(response.availableOptions),
			rows: response.rows.map((row) =>
				toPublicCustomerRow(row as DashboardCustomerRow),
			),
		};
	}

	if (response.viewMode === 'reseller') {
		return {
			viewMode: response.viewMode,
			page: response.page,
			pageSize: response.pageSize,
			total: response.total,
			sortBy: response.sortBy,
			sortDir: response.sortDir,
			summary: response.summary ? toPublicSummary(response.summary) : undefined,
			availableOptions: toPublicAvailableOptions(response.availableOptions),
			rows: response.rows.map((row) =>
				toPublicResellerRow(row as DashboardResellerRow),
			),
		};
	}

	return {
		viewMode: response.viewMode,
		page: response.page,
		pageSize: response.pageSize,
		total: response.total,
		sortBy: response.sortBy,
		sortDir: response.sortDir,
		summary: undefined,
		availableOptions: undefined,
		rows: response.rows.map((row) =>
			toPublicOpportunityRow(row as DashboardOpportunityRow),
		),
	};
}
