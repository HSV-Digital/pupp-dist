import { demoResellerApiFetch } from './demo-reseller-api-client';
import type {
	ResellerSubscriptionEnrichmentProgress,
	ResellerSubscriptionEnrichmentUploadResult,
} from './use-reseller-subscription-enrichment';

const BASE = '/subscription-enrichment';

export async function uploadDemoResellerEnrichmentFile(
	file: File,
): Promise<ResellerSubscriptionEnrichmentUploadResult> {
	const form = new FormData();
	form.append('file', file);

	const res = await demoResellerApiFetch(BASE, {
		method: 'POST',
		body: form,
	});

	const data = await res.json().catch(() => ({ message: 'Upload failed' }));
	if (!res.ok) {
		throw new Error(data?.message ?? `Upload failed (${res.status})`);
	}
	return data as ResellerSubscriptionEnrichmentUploadResult;
}

export function createDemoResellerEnrichmentProgressStream(
	jobId: string,
	onProgress: (progress: ResellerSubscriptionEnrichmentProgress) => void,
	onError: (message: string) => void,
	onComplete: () => void,
): () => void {
	const eventSource = new EventSource(
		`/csp-partners/api/reseller/demo/subscription-enrichment/${jobId}/progress`,
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
