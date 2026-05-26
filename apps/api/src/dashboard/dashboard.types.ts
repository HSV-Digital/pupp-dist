export type DashboardViewMode = 'customer' | 'reseller' | 'opportunity';
export type DashboardSortDirection = 'ascending' | 'descending';

export interface DashboardFilterState {
	pssAIWorkforce: string[];
	pssAISecurity: string[];
	psa: string[];
	distributor: string[];
	reseller: string[];
	customer: string[];
	pdm: string[];
	pmm: string[];
	region: string[];
	type: string[];
	skuCategory: string[];
	expSeats: string[];
	renewalDate: string[];
	pastRenewalDate: string[];
}

export interface DashboardOpportunityRow {
	customerId: string;
	subscriptionId: string;
	customerName: string;
	resellerName: string;
	distributorName: string;
	pssAIWorkforceName: string;
	pssAISecurityName: string;
	psaName: string;
	pdmName: string;
	pmmName: string;
	currentProduct: string;
	type: string;
	skuCategory: string;
	seatCount: number;
	annualRevenueRunRate: number;
	renewalDate: string;
	termMonths: number;
	autoRenew: boolean;
	multiYear: boolean;
	hasCopilot: boolean;
	hasPurview: boolean;
	hasSureStep: boolean;
	currentMargin: number;
	customerSegment: string;
	region: string;
	notes: string;
}

export interface DashboardCustomerRow {
	customerId: string;
	customerName: string;
	resellerName: string;
	distributorName: string;
	totalARR: number;
	totalSeats: number;
	subscriptionCount: number;
	subscriptionSkuCategories: string[];
	renewalDate: string;
}

export interface DashboardResellerRow {
	resellerName: string;
	totalARR: number;
	totalSeats: number;
	customerCount: number;
	subscriptionCount: number;
	renewalDate: string;
}

export interface DashboardSummaryResponse {
	totalRenewals: number;
	totalSeats: number;
	expiringARR: number;
	copilotOpportunities: number;
	totalCustomers: number;
	totalResellers: number;
}

export interface DashboardResponse {
	viewMode: DashboardViewMode;
	page: number;
	pageSize: number;
	total: number;
	sortBy: string;
	sortDir: DashboardSortDirection;
	summary?: DashboardSummaryResponse;
	availableOptions?: Record<keyof DashboardFilterState, string[]>;
	rows:
		| DashboardOpportunityRow[]
		| DashboardCustomerRow[]
		| DashboardResellerRow[];
}
