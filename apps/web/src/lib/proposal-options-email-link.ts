import type {
	ProposalOptionsFilter,
	ProposalOptionsJourney,
	RegionalCurrencyCode,
	StartingSkuId,
} from '@repo/shared';
import { assertDemoModeEnabled } from '@/env';
import { apiFetch, cspPartnerPublicApiFetch } from '@/lib/api-client';
import { parseApiErrorMessage, parseJsonSafely } from '@/lib/api-error';
import { resolveEmailDownloadUrl } from '@/lib/email-download-url';

const DEFAULT_ERROR_MESSAGE =
	'Unable to generate the proposal options email. Please try again.';
const SCREENSHOT_FIELD_NAME = 'scenarioCardsImage';

export interface CreateProposalOptionsEmailLinkPayload {
	journey: ProposalOptionsJourney;
	filter: ProposalOptionsFilter;
	customerId: string;
	customerName: string;
	opportunityId: string;
	startingSkuId: StartingSkuId;
	startingSkuName: string;
	region: string;
	currency?: RegionalCurrencyCode;
	seats: number;
	expiringArr: number;
	renewalDate?: string | null;
	selectedEndingSkuIds: string[];
	selectedScenarios?: Array<{
		opportunityId: string;
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
	}>;
}

export interface CreateProposalOptionsEmailLinkRequest {
	payload: CreateProposalOptionsEmailLinkPayload;
	screenshot?: Blob | null;
}

interface ProposalOptionsEmailLinkResponse {
	url: string;
	expiresAt: string;
}

function parseLinkResponse(
	payload: unknown,
): ProposalOptionsEmailLinkResponse | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const candidate = payload as Partial<ProposalOptionsEmailLinkResponse>;
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

export async function createProposalOptionsEmailLink(
	request: CreateProposalOptionsEmailLinkRequest,
): Promise<ProposalOptionsEmailLinkResponse> {
	const formData = new FormData();
	formData.append('payload', JSON.stringify(request.payload));

	if (request.screenshot) {
		formData.append(
			SCREENSHOT_FIELD_NAME,
			request.screenshot,
			'scenario-cards.png',
		);
	}

	let response: Response;
	try {
		response = await apiFetch('/api/email/proposal-options/link', {
			method: 'POST',
			body: formData,
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

export async function createProposalOptionsEmailLinkPublic(
	request: CreateProposalOptionsEmailLinkRequest,
): Promise<ProposalOptionsEmailLinkResponse> {
	assertDemoModeEnabled('Demo proposal option emails');

	const formData = new FormData();
	formData.append('payload', JSON.stringify(request.payload));

	if (request.screenshot) {
		formData.append(
			SCREENSHOT_FIELD_NAME,
			request.screenshot,
			'scenario-cards.png',
		);
	}

	let response: Response;
	try {
		response = await cspPartnerPublicApiFetch(
			'/api/email/demo/proposal-options/link',
			{
				method: 'POST',
				body: formData,
			},
		);
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
