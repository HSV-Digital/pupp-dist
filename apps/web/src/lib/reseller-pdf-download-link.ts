import { resellerApiFetch } from '@/lib/reseller-api-client';
import { parseApiErrorMessage, parseJsonSafely } from '@/lib/api-error';
import { resolveEmailDownloadUrl } from '@/lib/email-download-url';
import type { AsyncPdfJob, PdfJobStatus } from '@/lib/pdf-download-link';

const DEFAULT_ERROR_MESSAGE = 'Unable to generate the PDF. Please try again.';

function parseAsyncJob(payload: unknown): AsyncPdfJob | null {
	if (!payload || typeof payload !== 'object') return null;
	const obj = payload as Record<string, unknown>;
	if (
		typeof obj.jobId === 'string' &&
		typeof obj.url === 'string' &&
		typeof obj.estimatedRows === 'number' &&
		typeof obj.totalChunks === 'number'
	) {
		const totalParts =
			typeof obj.totalParts === 'number' ? obj.totalParts : obj.totalChunks;
		return {
			jobId: obj.jobId,
			url: obj.url,
			estimatedRows: obj.estimatedRows,
			totalChunks: obj.totalChunks,
			totalParts,
		};
	}
	return null;
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function resolveFileNameFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const fileName = parsed.pathname.split('/').filter(Boolean).pop();
		if (fileName && fileName.trim().length > 0) {
			return decodeURIComponent(fileName);
		}
	} catch {
		// Best-effort fallback.
	}
	const fallback = url.split('/').filter(Boolean).pop();
	return fallback && fallback.trim().length > 0 ? fallback : 'export.pdf';
}

function parsePdfJobStatus(payload: unknown): PdfJobStatus | null {
	if (!payload || typeof payload !== 'object') return null;
	const obj = payload as Record<string, unknown>;

	const validStatuses = new Set(['queued', 'processing', 'completed', 'failed']);
	const validPartStatuses = new Set(['pending', 'completed', 'failed']);

	if (
		typeof obj.id !== 'string' ||
		!validStatuses.has(obj.status as string) ||
		typeof obj.progress !== 'number' ||
		typeof obj.totalChunks !== 'number' ||
		typeof obj.completedChunks !== 'number' ||
		typeof obj.totalRows !== 'number' ||
		!isNullableString(obj.azureBlobUrl) ||
		!isNullableString(obj.errorMessage) ||
		typeof obj.createdAt !== 'string' ||
		!isNullableString(obj.startedAt) ||
		!isNullableString(obj.completedAt) ||
		!isNullableString(obj.expiresAt)
	)
		return null;

	const parts = Array.isArray(obj.parts)
		? obj.parts
				.map((part: unknown) => {
					if (!part || typeof part !== 'object') return null;
					const p = part as Record<string, unknown>;
					if (
						typeof p.partNumber !== 'number' ||
						typeof p.startRow !== 'number' ||
						typeof p.endRow !== 'number' ||
						typeof p.rowCount !== 'number' ||
						typeof p.fileName !== 'string' ||
						!isNullableString(p.blobName) ||
						!isNullableString(p.blobUrl) ||
						!validPartStatuses.has(p.status as string) ||
						!isNullableString(p.errorMessage)
					)
						return null;
					return {
						partNumber: p.partNumber as number,
						startRow: p.startRow as number,
						endRow: p.endRow as number,
						rowCount: p.rowCount as number,
						fileName: p.fileName as string,
						blobName: p.blobName as string | null,
						blobUrl: p.blobUrl as string | null,
						status: p.status as 'pending' | 'completed' | 'failed',
						errorMessage: p.errorMessage as string | null,
					};
				})
				.filter(Boolean)
		: [];

	if (
		parts.length === 0 &&
		typeof obj.azureBlobUrl === 'string' &&
		obj.azureBlobUrl.trim().length > 0
	) {
		parts.push({
			partNumber: 1,
			startRow: 1,
			endRow: obj.totalRows as number,
			rowCount: obj.totalRows as number,
			fileName: resolveFileNameFromUrl(obj.azureBlobUrl),
			blobName: null,
			blobUrl: obj.azureBlobUrl,
			status: obj.status === 'completed' ? 'completed' : 'pending',
			errorMessage: null,
		});
	}

	return {
		id: obj.id as string,
		status: obj.status as PdfJobStatus['status'],
		progress: obj.progress as number,
		totalChunks: obj.totalChunks as number,
		completedChunks: obj.completedChunks as number,
		partSize:
			typeof obj.partSize === 'number' ? obj.partSize : 25_000,
		totalParts:
			typeof obj.totalParts === 'number' ? obj.totalParts : (obj.totalChunks as number),
		completedParts:
			typeof obj.completedParts === 'number'
				? obj.completedParts
				: (obj.completedChunks as number),
		totalRows: obj.totalRows as number,
		azureBlobUrl: obj.azureBlobUrl as string | null,
		parts: parts as PdfJobStatus['parts'],
		errorMessage: obj.errorMessage as string | null,
		createdAt: obj.createdAt as string,
		startedAt: obj.startedAt as string | null,
		completedAt: obj.completedAt as string | null,
		expiresAt: obj.expiresAt as string | null,
		passwordAvailable:
			typeof obj.passwordAvailable === 'boolean'
				? obj.passwordAvailable
				: false,
	};
}

export interface ResellerPdfListRequest {
	filters: Record<string, string[]>;
	sort: {
		sortBy: string;
		sortDir: 'ascending' | 'descending';
	};
}

export async function createResellerAsyncPdfListLink(
	request: ResellerPdfListRequest,
): Promise<AsyncPdfJob> {
	let response: Response;
	try {
		response = await resellerApiFetch('/api/reseller/pdf/list/link-async', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(request),
		});
	} catch {
		throw new Error(DEFAULT_ERROR_MESSAGE);
	}

	const payload = await parseJsonSafely(response);
	if (!response.ok) {
		throw new Error(parseApiErrorMessage(payload, DEFAULT_ERROR_MESSAGE));
	}

	const job = parseAsyncJob(payload);
	if (!job) throw new Error(DEFAULT_ERROR_MESSAGE);

	return { ...job, url: resolveEmailDownloadUrl(job.url) };
}

export async function getResellerPdfJobStatus(
	jobId: string,
): Promise<PdfJobStatus> {
	let response: Response;
	try {
		response = await resellerApiFetch(
			`/api/reseller/pdf/async/status/${jobId}`,
			{ method: 'GET' },
		);
	} catch {
		throw new Error(
			'Unable to check PDF generation status. Please try again.',
		);
	}

	const payload = await parseJsonSafely(response);
	if (!response.ok) {
		throw new Error(
			parseApiErrorMessage(
				payload,
				'Unable to check PDF generation status. Please try again.',
			),
		);
	}

	const status = parsePdfJobStatus(payload);
	if (!status) {
		throw new Error(
			'Received an invalid PDF status response. Please refresh and try again.',
		);
	}
	return status;
}

export async function cancelResellerPdfJob(
	jobId: string,
): Promise<void> {
	let response: Response;
	try {
		response = await resellerApiFetch(`/api/reseller/pdf/async/${jobId}`, {
			method: 'DELETE',
		});
	} catch {
		throw new Error(
			'Unable to cancel PDF generation. Please try again.',
		);
	}

	const payload = await parseJsonSafely(response);
	if (!response.ok) {
		throw new Error(
			parseApiErrorMessage(
				payload,
				'Unable to cancel PDF generation. Please try again.',
			),
		);
	}
}

export async function revealResellerPdfJobPassword(
	jobId: string,
): Promise<{ password: string }> {
	let response: Response;
	try {
		response = await resellerApiFetch(
			`/api/reseller/pdf/async/${jobId}/password/reveal`,
			{ method: 'POST' },
		);
	} catch {
		throw new Error(
			'Unable to reveal the PDF password. Please try again.',
		);
	}

	const payload = await parseJsonSafely(response);
	if (!response.ok) {
		throw new Error(
			parseApiErrorMessage(
				payload,
				'Unable to reveal the PDF password. Please try again.',
			),
		);
	}

	if (
		!payload ||
		typeof payload !== 'object' ||
		typeof (payload as { password?: unknown }).password !== 'string' ||
		(payload as { password: string }).password.trim().length === 0
	) {
		throw new Error(
			'Received an invalid password response. Please refresh and try again.',
		);
	}

	return { password: (payload as { password: string }).password };
}
