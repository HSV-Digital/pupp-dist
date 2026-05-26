export enum SkuCategory {
	Basic = 'Basic',
	Standard = 'Standard',
	Premium = 'Premium',
	E3 = 'E3',
	E5 = 'E5',
	Copilot = 'Copilot',
	Other = 'Other',
}

export enum SeatRange {
	Seats1To24 = '1-24',
	Seats25To49 = '25-49',
	Seats50To99 = '50-99',
	Seats100To299 = '100-299',
	Seats300To499 = '300-499',
	Seats500To999 = '500-999',
	Seats1000Plus = '1000+',
}

export const ZERO_SEAT_RANGE = '0' as const;
export type SeatRangeValue = SeatRange | typeof ZERO_SEAT_RANGE;

export interface RenewalSubscription {
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
	type?: string;
	skuCategory: SkuCategory;
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

export interface StartingSku {
	id: string;
	name: string;
	monthlyPrice: number;
}

export enum CustomerRegion {
	UnitedStates = 'United States',
	Canada = 'Canada',
	Mexico = 'Mexico',
	Brazil = 'Brazil',
	CentralAndCaribbean = 'Central and Caribbean Region',
	SpanishSouthAmerica = 'Spanish South America Region',
	AntiguaAndBarbuda = 'Antigua and Barbuda',
	Argentina = 'Argentina',
	Bahamas = 'Bahamas',
	Barbados = 'Barbados',
	Bolivia = 'Bolivia',
	Chile = 'Chile',
	Colombia = 'Colombia',
	CostaRica = 'Costa Rica',
	Cuba = 'Cuba',
	Dominica = 'Dominica',
	DominicanRepublic = 'Dominican Republic',
	ElSalvador = 'El Salvador',
	Ecuador = 'Ecuador',
	Grenada = 'Grenada',
	Guatemala = 'Guatemala',
	Haiti = 'Haiti',
	Honduras = 'Honduras',
	Jamaica = 'Jamaica',
	Nicaragua = 'Nicaragua',
	Panama = 'Panama',
	Paraguay = 'Paraguay',
	Peru = 'Peru',
	StKittsAndNevis = 'St. Kitts and Nevis',
	StLucia = 'St. Lucia',
	StVincentAndTheGrenadines = 'St. Vincent and The Grenadines',
	TrinidadAndTobago = 'Trinidad and Tobago',
	Uruguay = 'Uruguay',
	Venezuela = 'Venezuela',
	NewZealand = 'New Zealand',
	Australia = 'Australia',
	Norway = 'Norway',
	UnitedKingdom = 'United Kingdom',
	Denmark = 'Denmark',
	Sweden = 'Sweden',
	Ireland = 'Ireland',
	India = 'India',
	Malaysia = 'Malaysia',
	Singapore = 'Singapore',
	Germany = 'Germany',
	Netherlands = 'Netherlands',
}

export enum UpgradeType {
	AI = 'AI',
	SECURITY = 'Security',
}

export enum UserRole {
	ADMIN = 'ADMIN',
	MEMBER = 'MEMBER',
}

export interface EndingSku {
	id: string;
	name: string;
	upgradeType: UpgradeType;
	listPrice: number;
	promoPrice: number;
	tagline: string;
	oneLiner: string;
	description: string;
	planHighlights: string[];
	solutionCapabilities: string[];
}

export interface ScenarioEconomics {
	cspCore: number;
	strategicAccelerator: number;
	strategicAcceleratorRate?: number;
	growthAccelerator: number;
	totalIncentive: number;
	cspCoreCurrent: number;
	strategicAcceleratorCurrent: number;
	currentIncentive: number;
	incrementalIncentive: number;
	newCustomerIncentive?: number;
}

export interface UpgradeScenario {
	startingSkuId: string;
	endingSkuId: string;
	startingSkuName: string;
	endingSkuName: string;
	startingMonthlyPrice: number;
	endingMonthlyPrice: number;
	seats: number;
	offerAnnualValue: number;
	listAnnualValue: number;
	promoSavingsAnnual: number;
	newAnnualValue: number;
	currentAnnualValue: number;
	incrementalCost: number;
	economics: ScenarioEconomics;
}

export interface Customer {
	customerId: string;
	customerName: string;
	subscriptions: RenewalSubscription[];
	totalSeats: number;
	totalARR: number;
	resellerName: string;
	distributorName: string;
	renewalDate: string;
}

export interface ScenarioSelection {
	opportunityId: string;
	startingSkuId: string;
	endingSkuId: string;
	seats: number;
	currentSkuCustomerPrice?: number;
	currentSkuResellerPrice?: number;
	targetSkuCustomerPrice?: number;
	targetSkuResellerPrice?: number;
	expiringSkuRenewalPrice?: number;
	targetSkuPrice?: number;
	targetSkuMarginPercent?: number;
}

/**
 * The subset of the proposal-page partner filter state needed by the backend
 * to decide CSP incentive eligibility. Mirrors the eligibility predicate in
 * `ScenarioCard.tsx` so backend-rendered totals (load-assets summary, proposal
 * PPT, customer/partner email) match the proposal cards.
 */
export interface PartnerFiltersPayload {
	partnerType?: 'CSP Direct' | 'CSP Indirect' | string;
	hasSolutionPartnerDesignation?: boolean;
	hasOver25Points?: boolean;
	isNewCustomerIncentive?: boolean;
}

export function isIncentiveEligibleFromFilters(
	filters: PartnerFiltersPayload | null | undefined,
): boolean {
	if (!filters) return false;
	const { partnerType, hasSolutionPartnerDesignation, hasOver25Points } = filters;
	return (
		(partnerType === 'CSP Direct' && hasSolutionPartnerDesignation === true) ||
		(partnerType === 'CSP Indirect' && hasOver25Points === true)
	);
}

export interface FilterState {
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

export interface DashboardSummary {
	totalRenewals: number;
	totalSeats: number;
	totalSeatsDisplay?: string;
	copilotOpportunities: number;
}

export type DashboardSortDirection = 'ascending' | 'descending';

export interface DashboardApiSummary extends DashboardSummary {
	totalCustomers: number;
	totalResellers: number;
}

export interface DashboardCustomerRow {
	customerId: string;
	customerName: string;
	resellerName: string;
	distributorName: string;
	totalSeatsRange: SeatRangeValue;
	subscriptionCount: number;
	subscriptionSkuCategories: SkuCategory[];
	renewalDate: string;
	closestRenewalLabel: string;
}

export interface DashboardResellerRow {
	resellerName: string;
	totalSeatsRange: SeatRangeValue;
	customerCount: number;
	subscriptionCount: number;
	renewalDate: string;
	closestRenewalLabel: string;
}

export interface DashboardOpportunityRow extends RenewalSubscription {
	seatRange: SeatRangeValue;
	closestRenewalLabel: string;
}

export interface DashboardApiResponse {
	viewMode: DashboardViewMode;
	page: number;
	pageSize: number;
	total: number;
	sortBy: string;
	sortDir: DashboardSortDirection;
	summary?: DashboardApiSummary;
	availableOptions?: Record<keyof FilterState, string[]>;
	rows:
		| DashboardCustomerRow[]
		| DashboardResellerRow[]
		| DashboardOpportunityRow[];
}

export interface ParseResult {
	successful: number;
	skipped: number;
	errors: string[];
}

export type DashboardViewMode = 'customer' | 'reseller' | 'opportunity';

export interface GroupedReseller {
	resellerName: string;
	customers: Customer[];
	subscriptions: RenewalSubscription[];
	totalSeats: number;
	totalARR: number;
	customerCount: number;
	renewalDate: string;
}

export type AuditActionStatus = 'success' | 'failure';
export type AuditActorType = 'user' | 'anonymous' | 'system';
export type AuditSourceSystem = 'api' | 'web';

export interface AuditEventRecord {
	id: string;
	occurredAt: string;
	eventName: string;
	actionStatus: AuditActionStatus;
	actorType: AuditActorType;
	actorId: string | null;
	actorEmail: string | null;
	actorDisplayName: string | null;
	tenantId: string;
	sourceSystem: AuditSourceSystem;
	targetType: string | null;
	targetId: string | null;
	requestId: string | null;
	route: string | null;
	httpMethod: string | null;
	httpStatus: number | null;
	durationMs: number | null;
	metadata: Record<string, unknown>;
}

export interface AuditEventListResponse {
	page: number;
	pageSize: number;
	total: number;
	rows: AuditEventRecord[];
}

export type AnalyticsRange = '1d' | '7d' | '14d' | '30d';
export const ADMIN_ANALYTICS_ALL_TENANTS = 'all' as const;
export type AdminAnalyticsTenantScope =
	| typeof ADMIN_ANALYTICS_ALL_TENANTS
	| string;

export const POSTHOG_PRODUCT_EVENTS = {
	dashboardSearchUsed: 'dashboard_search_used',
	dashboardFilterApplied: 'dashboard_filter_applied',
	dashboardFiltersCleared: 'dashboard_filters_cleared',
	dashboardTabSwitched: 'dashboard_tab_switched',
	proposalStarted: 'proposal_started',
	proposalScenariosSelected: 'proposal_scenarios_selected',
	proposalAssetsRequested: 'proposal_assets_requested',
	proposalEmailLinkRequested: 'proposal_email_link_requested',
	proposalPptSessionRequested: 'proposal_ppt_session_requested',
	pdfLinkRequested: 'pdf_link_requested',
	downloadIntentClicked: 'download_intent_clicked',
	activationMilestoneReached: 'activation_milestone_reached',
} as const;

export type PostHogProductEventName =
	(typeof POSTHOG_PRODUCT_EVENTS)[keyof typeof POSTHOG_PRODUCT_EVENTS];

export const POSTHOG_ACTIVATION_MILESTONES = {
	searchedDashboard: 'searched_dashboard',
	appliedFilter: 'applied_filter',
	startedProposal: 'started_proposal',
	requestedExport: 'requested_export',
	requestedProposalAsset: 'requested_proposal_asset',
} as const;

export type PostHogActivationMilestone =
	(typeof POSTHOG_ACTIVATION_MILESTONES)[keyof typeof POSTHOG_ACTIVATION_MILESTONES];

export interface AdminAnalyticsMetricCounts {
	resellerListDownloads: number;
	customerListDownloads: number;
	opportunityListEmails: number;
	proposalOptionsPartnerEmails: number;
	proposalsGenerated: number;
	proposalDocumentsDownloaded: number;
}

export interface AdminAnalyticsSeriesPoint extends AdminAnalyticsMetricCounts {
	date: string;
}

export interface AdminAnalyticsTenantOption {
	id: string;
	label: string;
}

export interface AdminAnalyticsUserRow extends AdminAnalyticsMetricCounts {
	userId: string;
	tenantId: string;
	tenantLabel: string;
	email: string;
	displayName: string;
	lastLoginAt: string | null;
}

export interface AdminAnalyticsUserViewResponse {
	range: AnalyticsRange;
	selectedTenant: AdminAnalyticsTenantScope;
	availableTenants: AdminAnalyticsTenantOption[];
	from: string;
	to: string;
	bucketTimezone: 'UTC';
	series: AdminAnalyticsSeriesPoint[];
	users: AdminAnalyticsUserRow[];
}

export interface AdminAnalyticsGeoBreakdown {
	us: number;
	canada: number;
	latam: number;
}

export interface AdminAnalyticsActivitySessionSummary {
	averageDailyUsers: number;
	averageSessionTimeSeconds: number;
	sessionsPerDay: number;
	medianSessionTimeSeconds: number;
	bounceRate: number;
	pagesPerSession: number;
	newUsers: number;
	returningUsers: number;
}

export interface AdminAnalyticsActivitySessionSeriesPoint {
	date: string;
	users: number;
	sessions: number;
	avgSessionTimeSeconds: number;
}

export interface AdminAnalyticsActivityTopUserRow {
	userId: string;
	tenantId: string;
	tenantLabel: string;
	email: string;
	displayName: string;
	downloadCount: number;
	entityCount: number;
}

export interface AdminAnalyticsDownloadSection {
	users: number;
	downloads: number;
	entitiesTotal: number;
	entitiesByRegion: AdminAnalyticsGeoBreakdown;
	topUsers: AdminAnalyticsActivityTopUserRow[];
}

export interface AdminAnalyticsActivityDownloads {
	resellerLists: AdminAnalyticsDownloadSection;
	customerLists: AdminAnalyticsDownloadSection;
	proposals: AdminAnalyticsDownloadSection;
	proposalsGenerated: AdminAnalyticsDownloadSection;
	emailOpportunityLists: AdminAnalyticsDownloadSection;
	emailProposalOptions: AdminAnalyticsDownloadSection;
}

export interface AdminAnalyticsActivityUserRow {
	userId: string;
	tenantId: string;
	tenantLabel: string;
	email: string;
	displayName: string;
	lastLoginAt: string | null;
	resellerListDownloads: number;
	customerListDownloads: number;
	proposalDownloads: number;
	proposalsGenerated: number;
	emailOpportunityListDownloads: number;
	emailProposalOptionsDownloads: number;
	totalDownloads: number;
}

export type AdminAnalyticsActivityBucketSize = 'day' | 'hour';

export interface AdminAnalyticsActivityOverviewSummary {
	averageDailyUsers: number;
	averageSessionTimeSeconds: number;
}

export interface AdminAnalyticsActivityOverviewSeriesPoint {
	bucketStart: string;
	users: number;
}

export interface AdminAnalyticsActivityOverviewResponse {
	range: AnalyticsRange;
	from: string;
	to: string;
	bucketTimezone: 'UTC';
	bucketSize: AdminAnalyticsActivityBucketSize;
	summary: AdminAnalyticsActivityOverviewSummary;
	usersSeries: AdminAnalyticsActivityOverviewSeriesPoint[];
}

export interface AdminAnalyticsActivityDetailsResponse {
	range: AnalyticsRange;
	from: string;
	to: string;
	bucketTimezone: 'UTC';
	downloads: AdminAnalyticsActivityDownloads;
	userActivityTable: AdminAnalyticsActivityUserRow[];
}

export interface AdminAnalyticsValueShareRow {
	label: string;
	value: number;
	share: number;
}

export interface AdminAnalyticsProductMetricsKpis {
	sessionsPerDay: number;
	pagesPerSession: number;
	avgActiveHoursPerUser?: number;
	avgActiveDaysPerUser?: number;
	newUsers: number;
	returningUsers: number;
}

export interface AdminAnalyticsDauWauMau {
	dau: number;
	wau: number;
	mau: number;
}

export interface AdminAnalyticsStickinessStat {
	stickinessPct: number;
	avgDailyUsers?: number;
	weeklyActiveUsers?: number;
	monthlyActiveUsers?: number;
}

export interface AdminAnalyticsProductMetricsKpisResponse {
	range: AnalyticsRange;
	from: string;
	to: string;
	bucketTimezone: 'UTC';
	kpis: AdminAnalyticsProductMetricsKpis;
}

export interface AdminAnalyticsProductMetricsEngagementSummaryResponse {
	range: AnalyticsRange;
	from: string;
	to: string;
	bucketTimezone: 'UTC';
	dauWauMau: AdminAnalyticsDauWauMau;
	averageSessionTimeSeconds: number;
	stickiness: AdminAnalyticsStickinessStat;
}

export interface AdminAnalyticsProductMetricsActiveUsersTrendPoint {
	bucketStart: string;
	users: number;
}

export interface AdminAnalyticsProductMetricsSessionDurationTrendPoint {
	bucketStart: string;
	averageSessionDurationSeconds: number;
}

export interface AdminAnalyticsProductMetricsStickinessTrendPoint {
	bucketStart: string;
	activeUsers: number;
	stickinessPct: number;
}

export interface AdminAnalyticsProductMetricsActiveUsersTrendResponse {
	range: AnalyticsRange;
	from: string;
	to: string;
	bucketTimezone: 'UTC';
	bucketSize: AdminAnalyticsActivityBucketSize;
	series: AdminAnalyticsProductMetricsActiveUsersTrendPoint[];
}

export interface AdminAnalyticsProductMetricsSessionDurationTrendResponse {
	range: AnalyticsRange;
	from: string;
	to: string;
	bucketTimezone: 'UTC';
	bucketSize: AdminAnalyticsActivityBucketSize;
	series: AdminAnalyticsProductMetricsSessionDurationTrendPoint[];
}

export interface AdminAnalyticsProductMetricsStickinessTrendResponse {
	range: AnalyticsRange;
	from: string;
	to: string;
	bucketTimezone: 'UTC';
	bucketSize: AdminAnalyticsActivityBucketSize;
	series: AdminAnalyticsProductMetricsStickinessTrendPoint[];
}

export interface AdminAnalyticsProductMetricsProposalFunnelStep {
	key: 'proposal-started' | 'scenarios-selected' | 'assets-requested';
	label: string;
	users: number;
	conversionRate: number;
}

export interface AdminAnalyticsProductMetricsProposalFunnelResponse {
	range: AnalyticsRange;
	from: string;
	to: string;
	bucketTimezone: 'UTC';
	overallConversionRate: number;
	steps: AdminAnalyticsProductMetricsProposalFunnelStep[];
}

export interface AdminAnalyticsProductMetricsUsersByCountryRow {
	country: string;
	userCount: number;
}

export interface AdminAnalyticsProductMetricsUsersByCountryResponse {
	range: AnalyticsRange;
	from: string;
	to: string;
	bucketTimezone: 'UTC';
	rows: AdminAnalyticsProductMetricsUsersByCountryRow[];
}

export interface AdminAnalyticsActiveDaysDistributionRow {
	daysActive: number;
	users: number;
}

export interface AdminAnalyticsFunnelStep {
	key: string;
	label: string;
	users: number;
	conversionRate: number;
}

export interface AdminAnalyticsFunnel {
	key: string;
	label: string;
	steps: AdminAnalyticsFunnelStep[];
}

export interface AdminAnalyticsActivityViewResponse {
	range: AnalyticsRange;
	selectedTenant: AdminAnalyticsTenantScope;
	availableTenants: AdminAnalyticsTenantOption[];
	from: string;
	to: string;
	bucketTimezone: 'UTC';
	sessionSummary: AdminAnalyticsActivitySessionSummary;
	sessionSeries: AdminAnalyticsActivitySessionSeriesPoint[];
	downloads: AdminAnalyticsActivityDownloads;
	userActivityTable: AdminAnalyticsActivityUserRow[];
}

export interface AdminAnalyticsEndingSkuOption {
	id: string;
	label: string;
	upgradeType: UpgradeType;
}

export interface AdminAnalyticsStartingSkuOption {
	id: string;
	label: string;
}

export type AdminAnalyticsFilterKey =
	| 'region'
	| 'distributor'
	| 'reseller'
	| 'pssAIWorkforce'
	| 'pssAISecurity'
	| 'pdm'
	| 'pmm'
	| 'subscriptionType'
	| 'expiringSeats';

export interface AdminAnalyticsFilterState {
	region: string[];
	distributor: string[];
	reseller: string[];
	pssAIWorkforce: string[];
	pssAISecurity: string[];
	pdm: string[];
	pmm: string[];
	subscriptionType: string[];
	expiringSeats: string[];
}

export interface AdminAnalyticsFilterOption {
	id: string;
	label: string;
	proposalsGeneratedOverall: number;
}

export type AdminAnalyticsAvailableFilters = Record<
	AdminAnalyticsFilterKey,
	AdminAnalyticsFilterOption[]
>;

export interface AdminAnalyticsBreakdownRow {
	id: string;
	label: string;
	proposalsGeneratedOverall: number;
	countsByEndingSku: Record<string, number>;
}

export interface AdminAnalyticsBreakdown {
	rows: AdminAnalyticsBreakdownRow[];
	totalCategories: number;
}

export interface AdminAnalyticsEndingSkuSeriesPoint {
	date: string;
	proposalsGeneratedOverall: number;
	countsByEndingSku: Record<string, number>;
	countsByEndingSkuAndStartingSku: Record<string, Record<string, number>>;
}

export interface AdminAnalyticsEndingSkuUserRow {
	userId: string;
	tenantId: string;
	tenantLabel: string;
	email: string;
	displayName: string;
	lastActivityAt: string | null;
	proposalsGeneratedOverall: number;
	countsByEndingSku: Record<string, number>;
}

export interface AdminAnalyticsEndingSkuCustomerRow {
	customerId: string;
	customerName: string;
	proposalsGeneratedOverall: number;
	countsByEndingSku: Record<string, number>;
}

export interface AdminAnalyticsEndingSkuOverviewResponse {
	range: AnalyticsRange;
	endingSkus: AdminAnalyticsEndingSkuOption[];
	startingSkus: AdminAnalyticsStartingSkuOption[];
	availableFilters: AdminAnalyticsAvailableFilters;
	series: AdminAnalyticsEndingSkuSeriesPoint[];
}

export interface AdminAnalyticsEndingSkuBreakdownResponse {
	distributorBreakdown: AdminAnalyticsBreakdown;
	resellerBreakdown: AdminAnalyticsBreakdown;
	expiringSeatBreakdown: AdminAnalyticsBreakdown;
}

export interface AdminAnalyticsEndingSkuTablesResponse {
	range: AnalyticsRange;
	selectedTenant: AdminAnalyticsTenantScope;
	endingSkus: AdminAnalyticsEndingSkuOption[];
	to: string;
	users: AdminAnalyticsEndingSkuUserRow[];
	customers: AdminAnalyticsEndingSkuCustomerRow[];
}

export interface ResellerEndingSkuOverviewResponse {
	range: AnalyticsRange;
	endingSkus: AdminAnalyticsEndingSkuOption[];
	startingSkus: AdminAnalyticsStartingSkuOption[];
	availableResellers: AdminAnalyticsFilterOption[];
	availableRegions: AdminAnalyticsFilterOption[];
	availableExpiringSeats: AdminAnalyticsFilterOption[];
	series: AdminAnalyticsEndingSkuSeriesPoint[];
}

export interface ResellerEndingSkuBreakdownResponse {
	resellerBreakdown: AdminAnalyticsBreakdown;
	expiringSeatBreakdown: AdminAnalyticsBreakdown;
}

export interface ResellerEndingSkuTablesResponse {
	range: AnalyticsRange;
	endingSkus: AdminAnalyticsEndingSkuOption[];
	to: string;
	customers: AdminAnalyticsEndingSkuCustomerRow[];
}

export interface PartnerCustomer {
	id: string;
	partnerName: string;
	customerName: string;
	currentSku: string;
	seatCount: number;
	costPerUser: number;
	region: CustomerRegion;
	createdByUserId: string;
	createdAt: string;
	updatedAt: string;
}

export type CreatePartnerCustomerInput = Omit<
	PartnerCustomer,
	'id' | 'createdByUserId' | 'createdAt' | 'updatedAt'
>;
