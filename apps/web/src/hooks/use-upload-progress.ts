'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
	createProgressStream,
	type UploadProgress,
} from '@/lib/upload-api';

interface UseUploadProgressResult {
	progress: UploadProgress | null;
	error: string | null;
	isComplete: boolean;
}

export function useUploadProgress(
	jobId: string | null,
): UseUploadProgressResult {
	const [progress, setProgress] = useState<UploadProgress | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isComplete, setIsComplete] = useState(false);
	const cleanupRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		if (!jobId) {
			setProgress(null);
			setError(null);
			setIsComplete(false);
			return;
		}

		setError(null);
		setIsComplete(false);

		const cleanup = createProgressStream(
			jobId,
			(data) => setProgress(data),
			(errMsg) => setError(errMsg),
			() => setIsComplete(true),
		);

		cleanupRef.current = cleanup;

		return () => {
			cleanup();
			cleanupRef.current = null;
		};
	}, [jobId]);

	return { progress, error, isComplete };
}
