import type {
	ProposalOptionsFilter,
	ProposalOptionsJourney,
	RegionalCurrencyCode,
	StartingSkuId,
} from '@repo/shared';
import type { PartnerFiltersPayload } from '@repo/types';
import type { DashboardSortDirection } from '../../dashboard/dashboard.types';

export type DlTokenScope =
	| 'reseller-list'
	| 'customer-list'
	| 'opportunities'
	| 'reseller-opportunities'
	| 'gtm-bundle'
	| 'proposal-options-email'
	| 'opportunity-list-email'
	| 'customer-proposal-email'
	| 'partner-proposal-email'
	| 'proposal-assets-bundle'
	| 'proposal-ppt'
	| 'demo-pdf-list';

export interface GtmAssetSelection {
	endingSkuId: string;
	fileNames: string[];
}

export interface PdfFiltersPayload {
	pssAIWorkforce: string[];
	pssAISecurity: string[];
	psa: string[];
	distributor: string[];
	reseller: string[];
	customer: string[];
	pdm: string[];
	pmm: string[];
	region?: string[];
	type?: string[];
	skuCategory?: string[];
	expSeats: string[];
	renewalDate: string[];
	pastRenewalDate?: string[];
	search: string;
}

export interface PdfSortPayload {
	sortBy: string;
	sortDir: DashboardSortDirection;
}

export interface ProposalOptionsEmailSolution {
	opportunityId?: string;
	endingSkuId: string;
	solutionName: string;
	flyerUrl: string;
	documentsZipUrl?: string;
	selectedSeats?: number;
	originalSeats?: number;
	expiringArr?: number;
	expiringSkuRenewalPrice?: number;
}

export interface PricingContextPayload {
	region: string | null;
	country: string;
	/**
	 * Region-derived country, never flipped by a currency override. Optional
	 * for backward compatibility with previously-issued tokens; consumers must
	 * fall back to `country` when absent.
	 */
	regionCountry?: string;
	currency: string;
	currencySymbol: string;
	locale: string;
	fallbackApplied: boolean;
	fallbackReason: string;
}

export interface ProposalOptionsEmailPayload {
	templatePath: string;
	journey: ProposalOptionsJourney;
	filter: ProposalOptionsFilter;
	customerId: string;
	customerName: string;
	opportunityId: string;
	renewalDate: string | null;
	startingSkuId: StartingSkuId;
	startingSkuName: string;
	region: string;
	seats: number;
	expiringArr: number;
	pricingContext: PricingContextPayload;
	url: string;
	options: ProposalOptionsEmailSolution[];
	screenshotUrl: string | null;
	screenshotBlobName: string | null;
	screenshotMimeType: string | null;
	documentsZipUrl: string | null;
	documentsZipBlobName: string | null;
}

export interface OpportunityListEmailSolution {
	solutionName: string;
	bestFor: string;
}

export interface OpportunityListEmailPayload {
	templatePath: string;
	viewMode: 'reseller' | 'customer' | 'opportunity';
	resellerCount: number;
	customerCount: number;
	totalRenewals: number;
	totalSeatsRange: string;
	url: string;
	solutions: OpportunityListEmailSolution[];
	pdfDownloadUrl?: string;
}

export interface CustomerProposalEmailScenarioPayload {
	opportunityId: string;
	startingSkuId: StartingSkuId;
	startingSkuName: string;
	endingSkuId: string;
	selectedSeats: number;
	originalSeats: number;
	expiringArr: number;
	currentSkuCustomerPrice?: number;
	currentSkuResellerPrice?: number;
	targetSkuCustomerPrice?: number;
	targetSkuResellerPrice?: number;
	expiringSkuRenewalPrice?: number;
	targetSkuPrice?: number;
	region?: string;
}

export interface CustomerProposalEmailPayload {
	templatePath: string;
	journey: ProposalOptionsJourney;
	customerId: string;
	customerName: string;
	pricingContext?: PricingContextPayload;
	scenarios: CustomerProposalEmailScenarioPayload[];
	partnerFilters?: PartnerFiltersPayload;
}

export interface ProposalPptScenarioPayload {
	opportunityId: string;
	startingSkuId: StartingSkuId;
	startingSkuName: string;
	endingSkuId: string;
	selectedSeats: number;
	originalSeats: number;
	expiringArr: number;
	currentSkuCustomerPrice?: number;
	currentSkuResellerPrice?: number;
	targetSkuCustomerPrice?: number;
	targetSkuResellerPrice?: number;
	expiringSkuRenewalPrice?: number;
	targetSkuPrice?: number;
	region?: string;
}

export interface ProposalPptPayload {
	mode: 'single' | 'consolidated';
	journey: ProposalOptionsJourney;
	customerId: string;
	customerName: string;
	fileName: string;
	scenarios: ProposalPptScenarioPayload[];
	useChatToPaidFlyers?: boolean;
	currency?: RegionalCurrencyCode;
	partnerFilters?: PartnerFiltersPayload;
}

export interface ProposalAssetsBundlePayload {
	journey: ProposalOptionsJourney;
	customerId: string;
	customerName: string;
	fileName: string;
	scenarios: ProposalPptScenarioPayload[];
	useChatToPaidFlyers?: boolean;
	partnerFilters?: PartnerFiltersPayload;
	currency?: RegionalCurrencyCode;
}

export interface DemoPdfListPayload {
	viewMode: 'customer' | 'reseller';
	selectedSkuIds: string[];
	filters?: Record<string, string[]>;
	searchTerm?: string;
}

export interface DlTokenPayload {
	v: 1 | 2;
	scope: DlTokenScope;
	tenantId: string;
	filters: PdfFiltersPayload;
	sort: PdfSortPayload;
	selectedSkuIds: string[];
	resellerId?: string;
	customerId?: string;
	orgId?: string;
	selectedAssets?: GtmAssetSelection[];
	proposalOptionsEmail?: ProposalOptionsEmailPayload;
	opportunityListEmail?: OpportunityListEmailPayload;
	customerProposalEmail?: CustomerProposalEmailPayload;
	partnerProposalEmail?: CustomerProposalEmailPayload;
	proposalAssetsBundle?: ProposalAssetsBundlePayload;
	proposalPpt?: ProposalPptPayload;
	demoPdfList?: DemoPdfListPayload;
	singleUse?: boolean;
	iat: number;
	exp: number;
	jti: string;
}

export interface CreateDlTokenInput {
	scope: DlTokenScope;
	tenantId: string;
	filters: PdfFiltersPayload;
	sort: PdfSortPayload;
	selectedSkuIds: string[];
	resellerId?: string;
	customerId?: string;
	orgId?: string;
	selectedAssets?: GtmAssetSelection[];
	proposalOptionsEmail?: ProposalOptionsEmailPayload;
	opportunityListEmail?: OpportunityListEmailPayload;
	customerProposalEmail?: CustomerProposalEmailPayload;
	partnerProposalEmail?: CustomerProposalEmailPayload;
	proposalAssetsBundle?: ProposalAssetsBundlePayload;
	proposalPpt?: ProposalPptPayload;
	demoPdfList?: DemoPdfListPayload;
	singleUse?: boolean;
	ttlSeconds?: number;
}
