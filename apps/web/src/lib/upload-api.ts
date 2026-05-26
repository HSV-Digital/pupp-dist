import { resellerApiFetch } from './reseller-api-client';

export interface UploadResult {
	jobId: string;
	detectedSource: string;
	totalRows: number;
}

export interface RejectionReason {
	reason: string;
	count: number;
}

export interface UploadProgress {
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_found';
	processed: number;
	total: number;
	accepted: number;
	rejected: number;
	flagged?: number;
	rejections?: RejectionReason[];
	detectedSource?: string;
	queuePosition?: number;
	queueTotal?: number;
}

export interface FlaggedRow {
	id: string;
	uploadJobId: string;
	reason: string;
	reasonDetail: string | null;
	rawRow: string;
	candidateIds: string | null;
	status: string;
	createdAt: string;
}

export async function uploadFile(file: File): Promise<UploadResult> {
	const formData = new FormData();
	formData.append('file', file);

	const response = await resellerApiFetch('/api/reseller/upload/file', {
		method: 'POST',
		body: formData,
	});

	if (!response.ok) {
		const data = await response.json().catch(() => ({ message: 'Upload failed' }));
		throw new Error(data.message || 'Upload failed');
	}

	return response.json();
}

export function createProgressStream(
	jobId: string,
	onProgress: (data: UploadProgress) => void,
	onError: (error: string) => void,
	onComplete: () => void,
): () => void {
	const eventSource = new EventSource(
		`/csp-partners/api/reseller/proxy/api/reseller/upload/${jobId}/progress`,
	);

	eventSource.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data) as UploadProgress;
			onProgress(data);

			if (data.status === 'completed' || data.status === 'failed') {
				eventSource.close();
				onComplete();
			}
		} catch {
			// Ignore parse errors
		}
	};

	eventSource.onerror = () => {
		onError('Connection lost — refresh to check status');
		eventSource.close();
	};

	return () => {
		eventSource.close();
	};
}

export async function fetchFlaggedRows(status = 'pending'): Promise<FlaggedRow[]> {
	const response = await resellerApiFetch(`/api/reseller/upload/flagged?status=${status}`);
	if (!response.ok) {
		throw new Error('Failed to fetch flagged rows');
	}
	return response.json();
}

export async function resolveFlaggedRow(
	id: string,
	candidateId: string,
): Promise<void> {
	const response = await resellerApiFetch(`/api/reseller/upload/flagged/${id}/resolve`, {
		method: 'POST',
		body: JSON.stringify({ candidateId }),
	});
	if (!response.ok) {
		throw new Error('Failed to resolve flagged row');
	}
}

export async function dismissFlaggedRow(id: string): Promise<void> {
	const response = await resellerApiFetch(`/api/reseller/upload/flagged/${id}/dismiss`, {
		method: 'POST',
	});
	if (!response.ok) {
		throw new Error('Failed to dismiss flagged row');
	}
}
