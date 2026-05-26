import { resellerApiFetch } from './reseller-api-client';

export interface ResellerSubscriptionEnrichmentUploadResult {
	jobId: string;
	totalRows: number;
}

export interface ResellerSubscriptionEnrichmentProgress {
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_found';
	processed: number;
	total: number;
	matched: number;
	unmatched: number;
	updated: number;
	errorMessage?: string | null;
}

const BASE = '/api/reseller/subscription-enrichment';

export async function uploadResellerEnrichmentFile(
	file: File,
): Promise<ResellerSubscriptionEnrichmentUploadResult> {
	const form = new FormData();
	form.append('file', file);

	const res = await resellerApiFetch(BASE, {
		method: 'POST',
		body: form,
	});

	const data = await res.json().catch(() => ({ message: 'Upload failed' }));
	if (!res.ok) {
		throw new Error(data?.message ?? `Upload failed (${res.status})`);
	}
	return data as ResellerSubscriptionEnrichmentUploadResult;
}

export function createResellerEnrichmentProgressStream(
	jobId: string,
	onProgress: (progress: ResellerSubscriptionEnrichmentProgress) => void,
	onError: (message: string) => void,
	onComplete: () => void,
): () => void {
	const eventSource = new EventSource(
		`/csp-partners/api/reseller/proxy${BASE}/${jobId}/progress`,
	);

	eventSource.onmessage = (event) => {
		try {
			const data = JSON.parse(
				event.data,
			) as ResellerSubscriptionEnrichmentProgress;
			onProgress(data);
			if (data.status === 'completed' || data.status === 'failed') {
				eventSource.close();
				onComplete();
			}
		} catch {
			// ignore parse errors
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
