export type PdfAsyncJobStatus =
	| 'queued'
	| 'processing'
	| 'completed'
	| 'failed';

export type PdfAsyncPartStatus = 'pending' | 'completed' | 'failed';

export interface PdfAsyncJobPart {
	partNumber: number;
	startRow: number;
	endRow: number;
	rowCount: number;
	fileName: string;
	blobName: string | null;
	blobUrl: string | null;
	status: PdfAsyncPartStatus;
	errorMessage: string | null;
}
