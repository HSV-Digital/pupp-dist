import type { RegionalCurrencyCode } from '@repo/shared';
import type { DashboardViewMode, SeatRangeValue } from '@repo/types';
import { assertDemoModeEnabled } from '@/env';
import { apiFetch, cspPartnerPublicApiFetch } from '@/lib/api-client';
import { parseApiErrorMessage, parseJsonSafely } from '@/lib/api-error';
import { resolveEmailDownloadUrl } from '@/lib/email-download-url';

const DEFAULT_ERROR_MESSAGE =
	'Unable to generate the partner email. Please try again.';

export interface CreateOpportunityListEmailLinkRequest {
	viewMode: DashboardViewMode;
	resellerCount: number;
	customerCount: number;
	totalRenewals: number;
	totalSeatsRange: SeatRangeValue;
	selectedSkuIds: string[];
	pdfDownloadUrl?: string;
	currency?: RegionalCurrencyCode;
}

interface OpportunityListEmailLinkResponse {
	url: string;
	expiresAt: string;
}

function parseLinkResponse(
	payload: unknown,
): OpportunityListEmailLinkResponse | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const candidate = payload as Partial<OpportunityListEmailLinkResponse>;
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

export async function createOpportunityListEmailLink(
	request: CreateOpportunityListEmailLinkRequest,
): Promise<OpportunityListEmailLinkResponse> {
	let response: Response;
	try {
		response = await apiFetch('/api/email/opportunity-list/link', {
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

export interface CreateOpportunityListEmailWithPdfLinkRequest
	extends CreateOpportunityListEmailLinkRequest {
	pdfJobId: string;
	pdfDownloadUrl: string;
	pdfZipUrl?: string;
}

export async function createOpportunityListEmailLinkWithPdf(
	request: CreateOpportunityListEmailWithPdfLinkRequest,
): Promise<OpportunityListEmailLinkResponse> {
	let response: Response;
	try {
		response = await apiFetch('/api/email/opportunity-list/link-with-pdf', {
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

export async function createOpportunityListEmailLinkPublic(
	request: CreateOpportunityListEmailLinkRequest,
): Promise<OpportunityListEmailLinkResponse> {
	assertDemoModeEnabled('Demo opportunity list emails');

	let response: Response;
	try {
		response = await cspPartnerPublicApiFetch('/api/email/demo/opportunity-list/link', {
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
