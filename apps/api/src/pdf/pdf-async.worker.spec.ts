import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import { PdfAsyncWorker } from './pdf-async.worker';
import type { PdfGenerationQueueJobData } from './pdf-async.service';
import { PdfRenderException } from './pdf-renderer.service';

function createJob(data: PdfGenerationQueueJobData): Job {
	return { data } as Job;
}

const DEFAULT_FILTERS = {
	pssAIWorkforce: [],
	pssAISecurity: [],
	psa: [],
	distributor: [],
	reseller: [],
	customer: [],
	pdm: [],
	pmm: [],
	region: [],
	type: [],
	expSeats: [],
	expArr: [],
	renewalDate: [],
	search: '',
};

describe('PdfAsyncWorker', () => {
	const pdfAsyncServiceMock = {
		getJobById: vi.fn(),
		updateJobStatus: vi.fn(),
		updateJobProgressPercent: vi.fn(),
		updateJobParts: vi.fn(),
		markJobCompleted: vi.fn(),
		markJobCancelled: vi.fn(),
		getJobPasswordForProcessing: vi.fn(),
	};
	const pdfChunkServiceMock = {
		buildCustomerListRows: vi.fn(),
		buildResellerListRows: vi.fn(),
		generatePdfFromPreparedRows: vi.fn(),
	};
	const blobStorageMock = {
		upload: vi.fn(),
	};
	const dashboardServiceMock = {
		getExportRows: vi.fn(),
	};
	const pdfServiceMock = {
		loadTemplateAssets: vi.fn(),
	};
	const pdfEncryptionServiceMock = {
		encryptPdf: vi.fn(),
	};
	const resellerCustomersServiceMock = {
		getExportRows: vi.fn(),
	};
	const dlTokenServiceMock = {
		createToken: vi.fn().mockReturnValue('mock-dl-token'),
	};

	let worker: PdfAsyncWorker;

	beforeEach(() => {
		vi.clearAllMocks();
		worker = new PdfAsyncWorker(
			pdfAsyncServiceMock as never,
			pdfChunkServiceMock as never,
			blobStorageMock as never,
			dashboardServiceMock as never,
			pdfServiceMock as never,
			pdfEncryptionServiceMock as never,
			resellerCustomersServiceMock as never,
			dlTokenServiceMock as never,
		);

		pdfAsyncServiceMock.getJobById.mockResolvedValue({ status: 'processing' });
		pdfAsyncServiceMock.updateJobStatus.mockResolvedValue(undefined);
		pdfAsyncServiceMock.updateJobProgressPercent.mockResolvedValue(undefined);
		pdfAsyncServiceMock.updateJobParts.mockResolvedValue(undefined);
		pdfAsyncServiceMock.markJobCompleted.mockResolvedValue(true);
		pdfAsyncServiceMock.markJobCancelled.mockResolvedValue(true);
		pdfAsyncServiceMock.getJobPasswordForProcessing.mockResolvedValue(
			'Password123ABCxyz',
		);

		dashboardServiceMock.getExportRows.mockResolvedValue([]);
		pdfServiceMock.loadTemplateAssets.mockResolvedValue({});
		pdfChunkServiceMock.buildCustomerListRows.mockReturnValue([
			{
				customerId: 'c1',
				customerName: 'Contoso',
				expiringArr: 100,
				seats: 5,
				basicSeats: 2,
				standardSeats: 2,
				premiumSeats: 1,
				opportunityCount: 1,
				proposalLink: 'https://example.test/proposal',
			},
		]);
		pdfChunkServiceMock.buildResellerListRows.mockReturnValue([
			{
				resellerName: 'Reseller A',
				customerCount: 2,
				opportunityCount: 3,
				expiringArr: 200,
				seats: 10,
				proposalLink: 'https://example.test/proposal',
			},
		]);
		pdfChunkServiceMock.generatePdfFromPreparedRows.mockResolvedValue(
			Buffer.from('pdf'),
		);
		pdfEncryptionServiceMock.encryptPdf.mockImplementation(
			async ({ pdfBuffer }: { pdfBuffer: Buffer }) => pdfBuffer,
		);
		blobStorageMock.upload.mockResolvedValue(
			'https://blob.example/job-1/part-1.pdf',
		);
	});

	it('fails closed when cancellation status cannot be read from DB', async () => {
		pdfAsyncServiceMock.getJobById.mockRejectedValueOnce(new Error('db down'));

		await worker.process(
			createJob({
				jobId: 'job-1',
				filters: DEFAULT_FILTERS,
				sort: { sortBy: 'totalARR', sortDir: 'descending' },
				viewMode: 'reseller',
				totalRows: 10,
				partSize: 25_000,
				totalParts: 1,
				selectedSkuIds: [],
			}),
		);

		expect(pdfAsyncServiceMock.updateJobStatus).not.toHaveBeenCalledWith(
			'job-1',
			'processing',
		);
		expect(pdfAsyncServiceMock.markJobCancelled).toHaveBeenCalledWith('job-1');
	});

	it('normalizes opportunity viewMode to customer rendering and uploads part files', async () => {
		dashboardServiceMock.getExportRows.mockResolvedValue([
			{
				customerId: 'c1',
				customerName: 'Contoso',
				seatCount: 5,
				annualRevenueRunRate: 100,
				skuCategory: 'Basic',
			},
		]);

		await worker.process(
			createJob({
				jobId: 'job-2',
				filters: DEFAULT_FILTERS,
				sort: { sortBy: 'totalARR', sortDir: 'descending' },
				viewMode: 'opportunity',
				totalRows: 1,
				partSize: 25_000,
				totalParts: 1,
				selectedSkuIds: [],
			}),
		);

		expect(dashboardServiceMock.getExportRows).toHaveBeenCalledWith(
			expect.objectContaining({ viewMode: 'opportunity' }),
		);
		expect(pdfChunkServiceMock.buildCustomerListRows).toHaveBeenCalled();
		expect(
			pdfChunkServiceMock.generatePdfFromPreparedRows,
		).toHaveBeenCalledWith(
			expect.any(Array),
			expect.anything(),
			'customer',
			expect.any(Function),
		);
		expect(blobStorageMock.upload).toHaveBeenCalledWith(
			'pdf-exports',
			expect.stringContaining('customer_list.pdf'),
			expect.any(Buffer),
			'application/pdf',
		);
		expect(pdfEncryptionServiceMock.encryptPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				password: 'Password123ABCxyz',
			}),
		);
		expect(pdfAsyncServiceMock.markJobCompleted).toHaveBeenCalledWith('job-2');
		expect(pdfAsyncServiceMock.updateJobProgressPercent).toHaveBeenCalled();
	});

	it('re-checks cancellation before completion and avoids overwrite', async () => {
		pdfAsyncServiceMock.getJobById
			.mockResolvedValueOnce({ status: 'queued' })
			.mockResolvedValueOnce({ status: 'processing' })
			.mockResolvedValueOnce({ status: 'processing' })
			.mockResolvedValueOnce({ status: 'processing' })
			.mockResolvedValueOnce({ status: 'processing' })
			.mockResolvedValueOnce({ status: 'processing' })
			.mockResolvedValueOnce({ status: 'failed' });

		await worker.process(
			createJob({
				jobId: 'job-3',
				filters: DEFAULT_FILTERS,
				sort: { sortBy: 'totalARR', sortDir: 'descending' },
				viewMode: 'reseller',
				totalRows: 1,
				partSize: 25_000,
				totalParts: 1,
				selectedSkuIds: [],
			}),
		);

		expect(pdfAsyncServiceMock.updateJobStatus).toHaveBeenCalledWith(
			'job-3',
			'processing',
		);
		expect(pdfAsyncServiceMock.markJobCompleted).not.toHaveBeenCalledWith(
			'job-3',
		);
		expect(pdfAsyncServiceMock.markJobCancelled).toHaveBeenCalledWith('job-3');
	});

	it('splits a part and retries when rendering fails with retryable print errors', async () => {
		dashboardServiceMock.getExportRows.mockResolvedValue([
			{
				customerId: 'c1',
				customerName: 'Contoso',
				seatCount: 5,
				annualRevenueRunRate: 100,
				skuCategory: 'Basic',
			},
		]);
		pdfChunkServiceMock.buildCustomerListRows.mockReturnValue(
			Array.from({ length: 2002 }, (_, index) => ({
				customerId: `c-${index + 1}`,
				customerName: `Customer ${index + 1}`,
				expiringArr: 100,
				seats: 5,
				basicSeats: 2,
				standardSeats: 2,
				premiumSeats: 1,
				opportunityCount: 1,
				proposalLink: 'https://example.test/proposal',
			})),
		);
		pdfChunkServiceMock.generatePdfFromPreparedRows
			.mockRejectedValueOnce(
				new PdfRenderException(
					true,
					'Protocol error (Page.printToPDF): Printing failed',
				),
			)
			.mockResolvedValue(Buffer.from('pdf-after-split'));

		await worker.process(
			createJob({
				jobId: 'job-split',
				filters: DEFAULT_FILTERS,
				sort: { sortBy: 'totalARR', sortDir: 'descending' },
				viewMode: 'opportunity',
				totalRows: 2002,
				partSize: 2002,
				totalParts: 1,
				selectedSkuIds: [],
			}),
		);

		expect(
			pdfChunkServiceMock.generatePdfFromPreparedRows,
		).toHaveBeenCalledTimes(3);
		expect(blobStorageMock.upload).toHaveBeenCalledTimes(2);
		expect(pdfAsyncServiceMock.markJobCompleted).toHaveBeenCalledWith(
			'job-split',
		);
		expect(pdfAsyncServiceMock.updateJobParts).toHaveBeenCalledWith(
			'job-split',
			expect.objectContaining({
				parts: expect.arrayContaining([
					expect.objectContaining({
						startRow: 1,
						endRow: 1001,
						status: 'completed',
					}),
					expect.objectContaining({
						startRow: 1002,
						endRow: 2002,
						status: 'completed',
					}),
				]),
			}),
		);
	});
});
