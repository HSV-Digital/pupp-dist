import type {
	ProposalOptionsJourney,
	RegionalCurrencyCode,
	StartingSkuId,
} from '@repo/shared';
import type { PartnerFiltersPayload } from '@repo/types';
import { apiFetch } from '@/lib/api-client';
import { parseApiErrorMessage, parseJsonSafely } from '@/lib/api-error';
import { resolveEmailDownloadUrl } from '@/lib/email-download-url';

const DEFAULT_ERROR_MESSAGE =
	'Unable to generate the customer email. Please try again.';

export interface CreateCustomerProposalEmailScenarioRequest {
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

export interface CreateCustomerProposalEmailLinkRequest {
	journey: ProposalOptionsJourney;
	customerId: string;
	customerName: string;
	scenarios: CreateCustomerProposalEmailScenarioRequest[];
	currency?: RegionalCurrencyCode;
	partnerFilters?: PartnerFiltersPayload;
}

interface CustomerProposalEmailLinkResponse {
	url: string;
	expiresAt: string;
}

function parseLinkResponse(
	payload: unknown,
): CustomerProposalEmailLinkResponse | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const candidate = payload as Partial<CustomerProposalEmailLinkResponse>;
	if (
		typeof candidate.url !== 'string' ||
		candidate.url.trim().length === 0 ||
		typeof candidate.expiresAt !== 'string' ||
		candidate.expiresAt.trim().length === 0
	) {
		return null;
	}

	return {
		url: resolveEmailDownloadUrl(candidate.url),
		expiresAt: candidate.expiresAt,
	};
}

export async function createCustomerProposalEmailLink(
	request: CreateCustomerProposalEmailLinkRequest,
): Promise<CustomerProposalEmailLinkResponse> {
	let response: Response;
	try {
		response = await apiFetch('/api/email/customer-proposal/link', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		});
	} catch {
		throw new Error(DEFAULT_ERROR_MESSAGE);
	}

	const payload = await parseJsonSafely(response);
	if (!response.ok) {
		throw new Error(parseApiErrorMessage(payload, DEFAULT_ERROR_MESSAGE));
	}

	const parsed = parseLinkResponse(payload);
	if (!parsed) {
		throw new Error(DEFAULT_ERROR_MESSAGE);
	}

	return parsed;
}
