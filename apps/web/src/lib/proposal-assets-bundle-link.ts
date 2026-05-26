import { cspPartnerPublicApiFetch } from '@/lib/api-client';
import { parseApiErrorMessage, parseJsonSafely } from '@/lib/api-error';
import { resolveEmailDownloadUrl } from '@/lib/email-download-url';
import type { CreateProposalPptSessionRequest } from '@/lib/proposal-ppt-session';

const DEFAULT_ERROR_MESSAGE =
	'Unable to generate proposal assets. Please try again.';

interface ProposalAssetsBundleLinkResponse {
	url: string;
	expiresAt: string;
}

function parseLinkResponse(
	payload: unknown,
): ProposalAssetsBundleLinkResponse | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const candidate = payload as Partial<ProposalAssetsBundleLinkResponse>;
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

export async function createProposalAssetsBundleLink(
	request: CreateProposalPptSessionRequest,
): Promise<ProposalAssetsBundleLinkResponse> {
	let response: Response;
	try {
		response = await cspPartnerPublicApiFetch('/api/email/proposal-assets/link', {
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
