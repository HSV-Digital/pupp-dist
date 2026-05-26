import { assertDemoModeEnabled } from '@/env';
import { apiFetch, cspPartnerPublicApiFetch } from '@/lib/api-client';
import { parseApiErrorMessage, parseJsonSafely } from '@/lib/api-error';
import type { CreateCustomerProposalEmailLinkRequest } from '@/lib/customer-proposal-email-link';
import { resolveEmailDownloadUrl } from '@/lib/email-download-url';

const DEFAULT_ERROR_MESSAGE =
	'Unable to generate the partner email. Please try again.';

interface PartnerProposalEmailLinkResponse {
	url: string;
	expiresAt: string;
}

function parseLinkResponse(
	payload: unknown,
): PartnerProposalEmailLinkResponse | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const candidate = payload as Partial<PartnerProposalEmailLinkResponse>;
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

export async function createPartnerProposalEmailLink(
	request: CreateCustomerProposalEmailLinkRequest,
): Promise<PartnerProposalEmailLinkResponse> {
	let response: Response;
	try {
		response = await apiFetch('/api/email/partner-proposal/link', {
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

export async function createPartnerProposalEmailLinkPublic(
	request: CreateCustomerProposalEmailLinkRequest,
): Promise<PartnerProposalEmailLinkResponse> {
	assertDemoModeEnabled('Demo partner proposal emails');

	let response: Response;
	try {
		response = await cspPartnerPublicApiFetch('/api/email/partner-proposal/link', {
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
