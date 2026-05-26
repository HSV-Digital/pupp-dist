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
	'Unable to generate the proposal preview. Please try again.';

export interface ProposalPptScenarioRequest {
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

export interface CreateProposalPptSessionRequest {
	mode: 'single' | 'consolidated';
	journey: ProposalOptionsJourney;
	customerId: string;
	customerName: string;
	fileName: string;
	scenarios: ProposalPptScenarioRequest[];
	currency?: RegionalCurrencyCode;
	partnerFilters?: PartnerFiltersPayload;
}

interface ProposalPptSessionResponse {
	token: string;
	renderUrl: string;
	downloadUrl: string;
	expiresAt: string;
}

function parseSessionResponse(
	payload: unknown,
): ProposalPptSessionResponse | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const candidate = payload as Partial<ProposalPptSessionResponse>;
	if (
		typeof candidate.token !== 'string' ||
		candidate.token.trim().length === 0 ||
		typeof candidate.renderUrl !== 'string' ||
		candidate.renderUrl.trim().length === 0 ||
		typeof candidate.downloadUrl !== 'string' ||
		candidate.downloadUrl.trim().length === 0 ||
		typeof candidate.expiresAt !== 'string' ||
		candidate.expiresAt.trim().length === 0
	) {
		return null;
	}

	return {
		token: candidate.token,
		renderUrl: resolveEmailDownloadUrl(candidate.renderUrl),
		downloadUrl: resolveEmailDownloadUrl(candidate.downloadUrl),
		expiresAt: candidate.expiresAt,
	};
}

export async function createProposalPptSession(
	request: CreateProposalPptSessionRequest,
): Promise<ProposalPptSessionResponse> {
	let response: Response;
	try {
		response = await apiFetch('/api/email/proposal-ppt/session', {
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

	const parsed = parseSessionResponse(payload);
	if (!parsed) {
		throw new Error(DEFAULT_ERROR_MESSAGE);
	}

	return parsed;
}
