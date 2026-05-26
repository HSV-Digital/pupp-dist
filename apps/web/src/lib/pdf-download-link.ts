import type { RegionalCurrencyCode } from '@repo/shared';
import type {
	DashboardSortDirection,
	DashboardViewMode,
	FilterState,
} from '@repo/types';
import { assertDemoModeEnabled } from '@/env';
import { apiFetch, cspPartnerPublicApiFetch } from '@/lib/api-client';
import { parseApiErrorMessage, parseJsonSafely } from '@/lib/api-error';
import { resolveEmailDownloadUrl } from '@/lib/email-download-url';
import { capturePdfLinkRequested, countActiveFilters } from '@/lib/posthog-product-events';

export interface CreatePdfListLinkRequest {
	viewMode: DashboardViewMode;
	filters: FilterState & {
		search: string;
	};
	sort: {
		sortBy: string;
		sortDir: DashboardSortDirection;
	};
	selectedSkuIds: string[];
	currency?: RegionalCurrencyCode;
}

const DEFAULT_ERROR_MESSAGE = 'Unable to generate the PDF. Please try again.';

function parseUrl(payload: unknown): string | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	if ('url' in payload) {
		const url = (payload as { url?: unknown }).url;
		if (typeof url === 'string' && url.trim().length > 0) {
			return url;
		}
	}

	return null;
}

export async function createPdfListLink(
	request: CreatePdfListLinkRequest,
): Promise<string> {
	let response: Response;
	try {
		response = await apiFetch('/api/pdf/list/link', {
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

	const url = parseUrl(payload);
	if (!url) {
		throw new Error(DEFAULT_ERROR_MESSAGE);
	}

	capturePdfLinkRequested({
		viewMode: request.viewMode,
		isAsync: false,
		hasSearch: request.filters.search.trim().length > 0,
		activeFilterCount: countActiveFilters(request.filters),
		selectedSkuCount: request.selectedSkuIds.length,
		isDemo: false,
		isPublic: false,
	});

	return resolveEmailDownloadUrl(url);
}

export async function createResellerPdfLink(
	request: Omit<CreatePdfListLinkRequest, 'viewMode'>,
): Promise<string> {
	return createPdfListLink({
		...request,
		viewMode: 'reseller',
	});
}

// ── Async PDF Generation ──

export interface AsyncPdfJob {
	jobId: string;
	url: string;
	estimatedRows: number;
	totalChunks: number;
	totalParts: number;
}

export interface PdfJobPart {
	partNumber: number;
	startRow: number;
	endRow: number;
	rowCount: number;
	fileName: string;
	blobName: string | null;
	blobUrl: string | null;
	status: 'pending' | 'completed' | 'failed';
	errorMessage: string | null;
}

export interface PdfJobStatus {
	id: string;
	status: 'queued' | 'processing' | 'completed' | 'failed';
	progress: number;
	totalChunks: number;
	completedChunks: number;
	partSize: number;
	totalParts: number;
	completedParts: number;
	totalRows: number;
	azureBlobUrl: string | null;
	parts: PdfJobPart[];
	errorMessage: string | null;
	createdAt: string;
	startedAt: string | null;
	completedAt: string | null;
	expiresAt: string | null;
	passwordAvailable: boolean;
}

const PDF_JOB_STATUS_VALUES = new Set<PdfJobStatus['status']>([
	'queued',
	'processing',
	'completed',
	'failed',
]);
const PDF_JOB_PART_STATUS_VALUES = new Set<PdfJobPart['status']>([
	'pending',
	'completed',
	'failed',
]);

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function parseAsyncJob(payload: unknown): AsyncPdfJob | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

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

function parsePdfPart(payload: unknown): PdfJobPart | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const obj = payload as Record<string, unknown>;
	if (
		typeof obj.partNumber !== 'number' ||
		typeof obj.startRow !== 'number' ||
		typeof obj.endRow !== 'number' ||
		typeof obj.rowCount !== 'number' ||
		typeof obj.fileName !== 'string' ||
		!isNullableString(obj.blobName) ||
		!isNullableString(obj.blobUrl) ||
		!PDF_JOB_PART_STATUS_VALUES.has(obj.status as PdfJobPart['status']) ||
		!isNullableString(obj.errorMessage) ||
		!Number.isFinite(obj.partNumber) ||
		!Number.isFinite(obj.startRow) ||
		!Number.isFinite(obj.endRow) ||
		!Number.isFinite(obj.rowCount)
	) {
		return null;
	}

	return {
		partNumber: obj.partNumber,
		startRow: obj.startRow,
		endRow: obj.endRow,
		rowCount: obj.rowCount,
		fileName: obj.fileName,
		blobName: obj.blobName,
		blobUrl: obj.blobUrl,
		status: obj.status as PdfJobPart['status'],
		errorMessage: obj.errorMessage,
	};
}

function resolveFileNameFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const fileName = parsed.pathname.split('/').filter(Boolean).pop();
		if (fileName && fileName.trim().length > 0) {
			return decodeURIComponent(fileName);
		}
	} catch {
		// Best-effort fallback for non-URL values.
	}

	const fallback = url.split('/').filter(Boolean).pop();
	return fallback && fallback.trim().length > 0 ? fallback : 'export.pdf';
}

function parsePdfJobStatus(payload: unknown): PdfJobStatus | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const obj = payload as Record<string, unknown>;
	if (
		typeof obj.id !== 'string' ||
		!PDF_JOB_STATUS_VALUES.has(obj.status as PdfJobStatus['status']) ||
		typeof obj.progress !== 'number' ||
		typeof obj.totalChunks !== 'number' ||
		typeof obj.completedChunks !== 'number' ||
		typeof obj.totalRows !== 'number' ||
		!Number.isFinite(obj.progress) ||
		!Number.isFinite(obj.totalChunks) ||
		!Number.isFinite(obj.completedChunks) ||
		!Number.isFinite(obj.totalRows) ||
		!isNullableString(obj.azureBlobUrl) ||
		!isNullableString(obj.errorMessage) ||
		typeof obj.createdAt !== 'string' ||
		!isNullableString(obj.startedAt) ||
		!isNullableString(obj.completedAt) ||
		!isNullableString(obj.expiresAt)
	) {
		return null;
	}

	const parsedParts = Array.isArray(obj.parts)
		? obj.parts
				.map((part) => parsePdfPart(part))
				.filter((part): part is PdfJobPart => part !== null)
		: [];

	const totalParts =
		typeof obj.totalParts === 'number' && Number.isFinite(obj.totalParts)
			? obj.totalParts
			: obj.totalChunks;
	const completedParts =
		typeof obj.completedParts === 'number' &&
		Number.isFinite(obj.completedParts)
			? obj.completedParts
			: obj.completedChunks;
	const partSize =
		typeof obj.partSize === 'number' && Number.isFinite(obj.partSize)
			? obj.partSize
			: 25_000;
	const passwordAvailable =
		typeof obj.passwordAvailable === 'boolean' ? obj.passwordAvailable : false;

	if (
		parsedParts.length === 0 &&
		typeof obj.azureBlobUrl === 'string' &&
		obj.azureBlobUrl.trim().length > 0
	) {
		parsedParts.push({
			partNumber: 1,
			startRow: 1,
			endRow: obj.totalRows,
			rowCount: obj.totalRows,
			fileName: resolveFileNameFromUrl(obj.azureBlobUrl),
			blobName: null,
			blobUrl: obj.azureBlobUrl,
			status: obj.status === 'completed' ? 'completed' : 'pending',
			errorMessage: null,
		});
	}

	return {
		id: obj.id,
		status: obj.status as PdfJobStatus['status'],
		progress: obj.progress,
		totalChunks: obj.totalChunks,
		completedChunks: obj.completedChunks,
		partSize,
		totalParts,
		completedParts,
		totalRows: obj.totalRows,
		azureBlobUrl: obj.azureBlobUrl,
		parts: parsedParts,
		errorMessage: obj.errorMessage,
		createdAt: obj.createdAt,
		startedAt: obj.startedAt,
		completedAt: obj.completedAt,
		expiresAt: obj.expiresAt,
		passwordAvailable,
	};
}

export async function createAsyncPdfListLink(
	request: CreatePdfListLinkRequest,
): Promise<AsyncPdfJob> {
	let response: Response;
	try {
		response = await apiFetch('/api/pdf/list/link-async', {
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

	const job = parseAsyncJob(payload);
	if (!job) {
		throw new Error(DEFAULT_ERROR_MESSAGE);
	}

	capturePdfLinkRequested({
		viewMode: request.viewMode,
		isAsync: true,
		hasSearch: request.filters.search.trim().length > 0,
		activeFilterCount: countActiveFilters(request.filters),
		selectedSkuCount: request.selectedSkuIds.length,
		isDemo: false,
		isPublic: false,
	});

	return {
		...job,
		url: resolveEmailDownloadUrl(job.url),
	};
}

export async function getPdfJobStatus(jobId: string): Promise<PdfJobStatus> {
	let response: Response;
	try {
		response = await apiFetch(`/api/pdf/async/status/${jobId}`, {
			method: 'GET',
		});
	} catch {
		throw new Error('Unable to check PDF generation status. Please try again.');
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

export async function cancelPdfJob(jobId: string): Promise<void> {
	let response: Response;
	try {
		response = await apiFetch(`/api/pdf/async/${jobId}`, {
			method: 'DELETE',
		});
	} catch {
		throw new Error('Unable to cancel PDF generation. Please try again.');
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

export async function revealPdfJobPassword(
	jobId: string,
): Promise<{ password: string }> {
	let response: Response;
	try {
		response = await apiFetch(`/api/pdf/async/${jobId}/password/reveal`, {
			method: 'POST',
		});
	} catch {
		throw new Error('Unable to reveal the PDF password. Please try again.');
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

export async function createDemoPdfListLink(
	viewMode: 'customer' | 'reseller',
	selectedSkuIds: string[],
	filters?: FilterState & { search?: string },
	searchTerm?: string,
): Promise<{ url: string; expiresAt: string }> {
	assertDemoModeEnabled('Demo PDF link creation');

	let response: Response;
	try {
		response = await cspPartnerPublicApiFetch('/api/pdf/demo/list/link', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				viewMode,
				selectedSkuIds,
				filters: filters ?? undefined,
				searchTerm: searchTerm?.trim() || undefined,
			}),
		});
	} catch {
		throw new Error(DEFAULT_ERROR_MESSAGE);
	}

	const payload = await parseJsonSafely(response);

	if (!response.ok) {
		throw new Error(parseApiErrorMessage(payload, DEFAULT_ERROR_MESSAGE));
	}

	const url = parseUrl(payload);
	if (!url) {
		throw new Error(DEFAULT_ERROR_MESSAGE);
	}

	const expiresAt =
		payload &&
		typeof payload === 'object' &&
		'expiresAt' in payload &&
		typeof (payload as { expiresAt?: unknown }).expiresAt === 'string'
			? (payload as { expiresAt: string }).expiresAt
			: new Date(Date.now() + 3600_000).toISOString();

	return { url: resolveEmailDownloadUrl(url), expiresAt };
}

export async function downloadDemoPdfList(
	viewMode: 'customer' | 'reseller',
	selectedSkuIds: string[],
	filters?: FilterState & { search?: string },
	searchTerm?: string,
): Promise<Blob> {
	assertDemoModeEnabled('Demo PDF downloads');

	let response: Response;
	try {
		response = await cspPartnerPublicApiFetch('/api/pdf/demo/list/render', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				viewMode,
				selectedSkuIds,
				filters: filters ?? undefined,
				searchTerm: searchTerm?.trim() || undefined,
			}),
		});
	} catch {
		throw new Error(DEFAULT_ERROR_MESSAGE);
	}

	if (!response.ok) {
		const payload = await parseJsonSafely(response);
		throw new Error(parseApiErrorMessage(payload, DEFAULT_ERROR_MESSAGE));
	}

	capturePdfLinkRequested({
		viewMode,
		isAsync: false,
		hasSearch: (searchTerm ?? filters?.search ?? '').trim().length > 0,
		activeFilterCount: countActiveFilters(filters ?? ({} as FilterState)),
		selectedSkuCount: selectedSkuIds.length,
		isDemo: true,
		isPublic: true,
	});

	return response.blob();
}
