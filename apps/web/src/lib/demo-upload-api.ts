import { demoResellerApiFetch } from './demo-reseller-api-client';
import type { FlaggedRow, UploadProgress, UploadResult } from './upload-api';

export async function demoUploadFile(file: File): Promise<UploadResult> {
	const formData = new FormData();
	formData.append('file', file);

	const response = await demoResellerApiFetch('/upload/file', {
		method: 'POST',
		body: formData,
	});

	if (!response.ok) {
		const data = await response
			.json()
			.catch(() => ({ message: 'Upload failed' }));
		throw new Error(data.message || 'Upload failed');
	}

	return response.json();
}

export function createDemoProgressStream(
	jobId: string,
	onProgress: (data: UploadProgress) => void,
	onError: (error: string) => void,
	onComplete: () => void,
): () => void {
	const eventSource = new EventSource(
		`/csp-partners/api/reseller/demo/upload/${jobId}/progress`,
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

export async function fetchDemoFlaggedRows(
	status = 'pending',
): Promise<FlaggedRow[]> {
	const response = await demoResellerApiFetch(
		`/upload/flagged?status=${status}`,
	);
	if (!response.ok) {
		throw new Error('Failed to fetch flagged rows');
	}
	return response.json();
}

export async function resolveDemoFlaggedRow(
	id: string,
	candidateId: string,
): Promise<void> {
	const response = await demoResellerApiFetch(
		`/upload/flagged/${id}/resolve`,
		{
			method: 'POST',
			body: JSON.stringify({ candidateId }),
		},
	);
	if (!response.ok) {
		throw new Error('Failed to resolve flagged row');
	}
}

export async function dismissDemoFlaggedRow(id: string): Promise<void> {
	const response = await demoResellerApiFetch(
		`/upload/flagged/${id}/dismiss`,
		{
			method: 'POST',
		},
	);
	if (!response.ok) {
		throw new Error('Failed to dismiss flagged row');
	}
}
