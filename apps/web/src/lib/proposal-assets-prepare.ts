import type {
	ProposalOptionsJourney,
	RegionalCurrencyCode,
} from '@repo/shared';
import type { PartnerFiltersPayload, RenewalSubscription } from '@repo/types';
import { apiFetch, cspPartnerPublicApiFetch } from '@/lib/api-client';
import { resellerApiFetch } from '@/lib/reseller-api-client';
import { parseApiErrorMessage, parseJsonSafely } from '@/lib/api-error';
import { resolveEmailDownloadUrl } from '@/lib/email-download-url';
import type { ProposalPptScenarioRequest } from '@/lib/proposal-ppt-session';

const DEFAULT_LOAD_ERROR_MESSAGE =
	'Unable to load proposal assets. Please try again.';
const DEFAULT_LINE_ITEM_ERROR_MESSAGE =
	'Unable to generate the proposal preview. Please try again.';

export interface ProposalAssetSelectionRequest {
	opportunityId: string;
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

export type ProposalAssetsCustomerSource = 'dashboard' | 'partner_customer' | 'reseller_customer';

export interface ProposalAssetsCustomerSnapshot {
	customerId: string;
	customerName: string;
	subscriptions: RenewalSubscription[];
}

export interface LoadProposalAssetsAuthRequest {
	journey: ProposalOptionsJourney;
	customerId: string;
	customerSource: ProposalAssetsCustomerSource;
	selections: ProposalAssetSelectionRequest[];
	currency?: RegionalCurrencyCode;
	partnerFilters?: PartnerFiltersPayload;
}

export interface LoadProposalAssetsPublicRequest {
	journey: ProposalOptionsJourney;
	customerSnapshot: ProposalAssetsCustomerSnapshot;
	selections: ProposalAssetSelectionRequest[];
	useChatToPaidFlyers?: boolean;
	currency?: RegionalCurrencyCode;
	partnerFilters?: PartnerFiltersPayload;
}

export interface ProposalAssetsSummary {
	currentAnnual: number;
	listAnnual: number;
	offerAnnual: number;
	promoSavings: number;
	incrementalCost: number;
	incrementalIncentive: number;
}

export interface ProposalAssetsPricingContext {
	region: string | null;
	country: string;
	/** Region-derived country (unflipped). Optional: legacy responses omit it. */
	regionCountry?: string;
	currency: string;
	currencySymbol: string;
	locale: string;
	fallbackApplied: boolean;
	fallbackReason: string;
}

export interface ProposalAssetsLineItem {
	opportunityId: string;
	endingSkuId: string;
	selectedSeats: number;
	label: string;
	fileName: string;
	status: 'not_generated';
}

export interface LoadProposalAssetsResponse {
	customer: {
		customerId: string;
		customerName: string;
	};
	selectedScenarios: ProposalPptScenarioRequest[];
	summary: ProposalAssetsSummary;
	pricingContext: ProposalAssetsPricingContext;
	assets: {
		consolidated: {
			blobUrl: string;
			fileName: string;
		} | null;
		lineItems: ProposalAssetsLineItem[];
		bundleDownloadUrl: string;
		uploadedAt: string;
	};
}

export interface GenerateProposalAssetLineItemAuthRequest {
	journey: ProposalOptionsJourney;
	customerId: string;
	customerSource: ProposalAssetsCustomerSource;
	selection: ProposalAssetSelectionRequest;
	selectionContext?: ProposalAssetSelectionRequest[];
	currency?: RegionalCurrencyCode;
	partnerFilters?: PartnerFiltersPayload;
}

export interface GenerateProposalAssetLineItemPublicRequest {
	journey: ProposalOptionsJourney;
	customerSnapshot: ProposalAssetsCustomerSnapshot;
	selection: ProposalAssetSelectionRequest;
	selectionContext?: ProposalAssetSelectionRequest[];
	useChatToPaidFlyers?: boolean;
	currency?: RegionalCurrencyCode;
	partnerFilters?: PartnerFiltersPayload;
}

export interface GenerateProposalAssetLineItemResponse {
	opportunityId: string;
	endingSkuId: string;
	selectedSeats: number;
	label: string;
	fileName: string;
	blobUrl: string;
	uploadedAt: string;
}

function parseLoadResponsePayload(
	payload: unknown,
): LoadProposalAssetsResponse | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const candidate = payload as Partial<LoadProposalAssetsResponse>;
	if (
		!candidate.customer ||
		typeof candidate.customer.customerId !== 'string' ||
		typeof candidate.customer.customerName !== 'string' ||
		!Array.isArray(candidate.selectedScenarios) ||
		!candidate.summary ||
		typeof candidate.summary.currentAnnual !== 'number' ||
		typeof candidate.summary.listAnnual !== 'number' ||
		typeof candidate.summary.offerAnnual !== 'number' ||
		typeof candidate.summary.promoSavings !== 'number' ||
		typeof candidate.summary.incrementalCost !== 'number' ||
		typeof candidate.summary.incrementalIncentive !== 'number' ||
		!candidate.pricingContext ||
		typeof candidate.pricingContext.country !== 'string' ||
		typeof candidate.pricingContext.currency !== 'string' ||
		typeof candidate.pricingContext.currencySymbol !== 'string' ||
		typeof candidate.pricingContext.locale !== 'string' ||
		typeof candidate.pricingContext.fallbackApplied !== 'boolean' ||
		typeof candidate.pricingContext.fallbackReason !== 'string' ||
		!candidate.assets ||
		(candidate.assets.consolidated !== null &&
			(typeof candidate.assets.consolidated !== 'object' ||
				typeof candidate.assets.consolidated.blobUrl !== 'string' ||
				typeof candidate.assets.consolidated.fileName !== 'string')) ||
		!Array.isArray(candidate.assets.lineItems) ||
		typeof candidate.assets.uploadedAt !== 'string' ||
		typeof candidate.assets.bundleDownloadUrl !== 'string' ||
		candidate.assets.bundleDownloadUrl.trim().length === 0
	) {
		return null;
	}

	for (const scenario of candidate.selectedScenarios) {
		if (
			typeof scenario.opportunityId !== 'string' ||
			typeof scenario.startingSkuId !== 'string' ||
			typeof scenario.startingSkuName !== 'string' ||
			typeof scenario.endingSkuId !== 'string' ||
			typeof scenario.selectedSeats !== 'number' ||
			typeof scenario.originalSeats !== 'number' ||
			typeof scenario.expiringArr !== 'number' ||
			(scenario.currentSkuCustomerPrice !== undefined &&
				typeof scenario.currentSkuCustomerPrice !== 'number') ||
			(scenario.currentSkuResellerPrice !== undefined &&
				typeof scenario.currentSkuResellerPrice !== 'number') ||
			(scenario.targetSkuCustomerPrice !== undefined &&
				typeof scenario.targetSkuCustomerPrice !== 'number') ||
			(scenario.targetSkuResellerPrice !== undefined &&
				typeof scenario.targetSkuResellerPrice !== 'number') ||
			(scenario.expiringSkuRenewalPrice !== undefined &&
				typeof scenario.expiringSkuRenewalPrice !== 'number')
		) {
			return null;
		}
	}

	for (const lineItem of candidate.assets.lineItems) {
		if (
			typeof lineItem.opportunityId !== 'string' ||
			typeof lineItem.endingSkuId !== 'string' ||
			typeof lineItem.selectedSeats !== 'number' ||
			typeof lineItem.label !== 'string' ||
			typeof lineItem.fileName !== 'string' ||
			lineItem.status !== 'not_generated'
		) {
			return null;
		}
	}

	return {
		...(candidate as LoadProposalAssetsResponse),
		assets: {
			...candidate.assets,
			consolidated: candidate.assets.consolidated
				? {
						...candidate.assets.consolidated,
						blobUrl: resolveEmailDownloadUrl(
							candidate.assets.consolidated.blobUrl,
						),
					}
				: null,
			bundleDownloadUrl: resolveEmailDownloadUrl(
				candidate.assets.bundleDownloadUrl,
			),
		},
	};
}

function parseLineItemPayload(
	payload: unknown,
): GenerateProposalAssetLineItemResponse | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const candidate = payload as Partial<GenerateProposalAssetLineItemResponse>;
	if (
		typeof candidate.opportunityId !== 'string' ||
		typeof candidate.endingSkuId !== 'string' ||
		typeof candidate.selectedSeats !== 'number' ||
		typeof candidate.label !== 'string' ||
		typeof candidate.fileName !== 'string' ||
		typeof candidate.blobUrl !== 'string' ||
		typeof candidate.uploadedAt !== 'string'
	) {
		return null;
	}

	return {
		...(candidate as GenerateProposalAssetLineItemResponse),
		blobUrl: resolveEmailDownloadUrl(candidate.blobUrl),
	};
}

async function parseLoadResponse(response: Response) {
	const payload = await parseJsonSafely(response);
	if (!response.ok) {
		throw new Error(parseApiErrorMessage(payload, DEFAULT_LOAD_ERROR_MESSAGE));
	}

	const parsed = parseLoadResponsePayload(payload);
	if (!parsed) {
		throw new Error(DEFAULT_LOAD_ERROR_MESSAGE);
	}

	return parsed;
}

async function parseLineItemResponse(response: Response) {
	const payload = await parseJsonSafely(response);
	if (!response.ok) {
		throw new Error(
			parseApiErrorMessage(payload, DEFAULT_LINE_ITEM_ERROR_MESSAGE),
		);
	}

	const parsed = parseLineItemPayload(payload);
	if (!parsed) {
		throw new Error(DEFAULT_LINE_ITEM_ERROR_MESSAGE);
	}

	return parsed;
}

export async function loadProposalAssets(
	request: LoadProposalAssetsAuthRequest,
): Promise<LoadProposalAssetsResponse> {
	let response: Response;
	try {
		response = await apiFetch('/api/email/proposal-assets/load', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		});
	} catch {
		throw new Error(DEFAULT_LOAD_ERROR_MESSAGE);
	}

	return parseLoadResponse(response);
}

export async function loadProposalAssetsPublic(
	request: LoadProposalAssetsPublicRequest,
): Promise<LoadProposalAssetsResponse> {
	let response: Response;
	try {
		response = await cspPartnerPublicApiFetch(
			'/api/email/proposal-assets/load-public',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(request),
			},
		);
	} catch {
		throw new Error(DEFAULT_LOAD_ERROR_MESSAGE);
	}

	return parseLoadResponse(response);
}

export async function generateProposalAssetLineItem(
	request: GenerateProposalAssetLineItemAuthRequest,
): Promise<GenerateProposalAssetLineItemResponse> {
	let response: Response;
	try {
		response = await apiFetch('/api/email/proposal-assets/line-item/generate', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		});
	} catch {
		throw new Error(DEFAULT_LINE_ITEM_ERROR_MESSAGE);
	}

	return parseLineItemResponse(response);
}

export async function generateProposalAssetLineItemPublic(
	request: GenerateProposalAssetLineItemPublicRequest,
): Promise<GenerateProposalAssetLineItemResponse> {
	let response: Response;
	try {
		response = await cspPartnerPublicApiFetch(
			'/api/email/proposal-assets/line-item/generate-public',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(request),
			},
		);
	} catch {
		throw new Error(DEFAULT_LINE_ITEM_ERROR_MESSAGE);
	}

	return parseLineItemResponse(response);
}

export async function loadProposalAssetsReseller(
	request: LoadProposalAssetsAuthRequest,
): Promise<LoadProposalAssetsResponse> {
	let response: Response;
	try {
		response = await resellerApiFetch('/api/email/proposal-assets/load', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(request),
		});
	} catch {
		throw new Error(DEFAULT_LOAD_ERROR_MESSAGE);
	}

	return parseLoadResponse(response);
}

export async function generateProposalAssetLineItemReseller(
	request: GenerateProposalAssetLineItemAuthRequest,
): Promise<GenerateProposalAssetLineItemResponse> {
	let response: Response;
	try {
		response = await resellerApiFetch(
			'/api/email/proposal-assets/line-item/generate',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(request),
			},
		);
	} catch {
		throw new Error(DEFAULT_LINE_ITEM_ERROR_MESSAGE);
	}

	return parseLineItemResponse(response);
}

