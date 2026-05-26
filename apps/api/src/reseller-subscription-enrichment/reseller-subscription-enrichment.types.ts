export interface ResellerSubscriptionEnrichmentUploadResult {
	jobId: string;
	totalRows: number;
}

export interface ResellerSubscriptionEnrichmentProgress {
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_found';
	processed: number;
	total: number;
	matched: number;
	unmatched: number;
	updated: number;
	errorMessage?: string | null;
}

export interface ResellerSubscriptionEnrichmentJobData {
	jobId: string;
	orgId: string;
	resellerUserId: string;
	fileBuffer: string;
	fileExtension: 'csv' | 'xlsx' | 'xls';
}

export interface ResellerEnrichmentRow {
	customerTpid: string | null;
	accountName: string | null;
	countryName: string | null;
	tenantIds: string | null;
	subscriptionEndDate: string | null;
	copilotEligibleM365Seats: number | null;
	copilotSeatsWhitespace: number | null;
	adoptionStatus: string | null;
	freeCopilotChatMAU: number | null;
	allAgentMAU: number | null;
	mciEligibility: number | null;
	partnerName: string | null;
	mciEngagementName: string | null;
	dominantSkuGroup: string | null;
}
