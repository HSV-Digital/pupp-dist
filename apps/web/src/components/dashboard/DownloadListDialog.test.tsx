import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadListDialog } from './DownloadListDialog';
import { createOpportunityListEmailLinkWithPdf } from '@/lib/opportunity-list-email-link';
import {
	createAsyncPdfListLink,
	getPdfJobStatus,
} from '@/lib/pdf-download-link';

vi.mock('@/lib/upgrade-matrix', () => ({
	ENDING_SKUS: [
		{ id: 'bp_cb', name: 'Business Premium + Copilot' },
		{ id: 'bp_def', name: 'Business Premium + Defender' },
	],
}));

vi.mock('@/lib/pdf-download-link', () => ({
	createAsyncPdfListLink: vi.fn(),
	getPdfJobStatus: vi.fn(),
	cancelPdfJob: vi.fn(),
}));

vi.mock('@/lib/opportunity-list-email-link', () => ({
	createOpportunityListEmailLinkPublic: vi.fn(),
	createOpportunityListEmailLinkWithPdf: vi.fn(),
}));

vi.mock('@/components/dashboard/SummaryCards', () => ({
	SummaryCards: () => <div data-testid="summary-cards" />,
}));

const createAsyncPdfListLinkMock = vi.mocked(createAsyncPdfListLink);
const getPdfJobStatusMock = vi.mocked(getPdfJobStatus);
const createOpportunityListEmailLinkWithPdfMock = vi.mocked(
	createOpportunityListEmailLinkWithPdf,
);

const baseProps = {
	open: true,
	onOpenChange: vi.fn(),
	summary: {
		totalRenewals: 100,
		totalSeats: 1200,
		copilotOpportunities: 75,
		totalCustomers: 200,
		totalResellers: 40,
	},
	customerCount: 200,
	resellerCount: 40,
	viewMode: 'reseller' as const,
	filters: {
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
		skuCategory: [],
		expSeats: [],
		renewalDate: [],
		pastRenewalDate: [],
	},
	searchTerm: '  contoso ',
	sortBy: 'totalSeats',
	sortDir: 'descending' as const,
	totalRows: 5,
	onAddDownloadJob: vi.fn(),
	activeTrackerJobs: [],
	onRemoveTrackerJob: vi.fn(),
};

function completedStatus(jobId: string) {
	return {
		id: jobId,
		status: 'completed' as const,
		progress: 100,
		totalChunks: 1,
		completedChunks: 1,
		partSize: 25_000,
		totalParts: 1,
		completedParts: 1,
		totalRows: 10,
		azureBlobUrl: 'https://blob.example/job.pdf',
		parts: [
			{
				partNumber: 1,
				startRow: 1,
				endRow: 10,
				rowCount: 10,
				fileName: 'reseller_list.pdf',
				blobName: 'job-1/reseller_list.pdf',
				blobUrl: 'https://blob.example/job.pdf',
				status: 'completed' as const,
				errorMessage: null,
			},
		],
		errorMessage: null,
		createdAt: new Date().toISOString(),
		startedAt: new Date().toISOString(),
		completedAt: new Date().toISOString(),
		expiresAt: new Date(Date.now() + 60_000).toISOString(),
		passwordAvailable: true,
	};
}

describe('DownloadListDialog', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('starts combined PDF+email flow and polls status', async () => {
		const pendingTab = {
			closed: false,
			opener: null,
			location: { href: '' },
			close: vi.fn(),
		} as unknown as Window;

		vi.spyOn(window, 'open').mockReturnValue(pendingTab);

		createAsyncPdfListLinkMock.mockResolvedValue({
			jobId: 'job-1',
			url: '/api/pdf/async/reseller-list?dlToken=token-1',
			estimatedRows: 10,
			totalChunks: 1,
			totalParts: 1,
		});
		getPdfJobStatusMock.mockResolvedValue(completedStatus('job-1'));
		createOpportunityListEmailLinkWithPdfMock.mockResolvedValue({
			url: '/api/email/opportunity-list/download?dlToken=email-token',
			expiresAt: '2026-03-01T00:00:00.000Z',
		});

		render(<DownloadListDialog {...baseProps} />);

		// Select a SKU first
		fireEvent.click(screen.getByText('Business Premium + Copilot'));

		// Click "Download e-mail" button
		fireEvent.click(
			screen.getByRole('button', {
				name: 'Download e-mail to send the list to partner',
			}),
		);

		await waitFor(() => {
			expect(createAsyncPdfListLinkMock).toHaveBeenCalledWith(
				expect.objectContaining({
					viewMode: 'reseller',
					filters: expect.objectContaining({ search: 'contoso' }),
					sort: {
						sortBy: 'totalSeats',
						sortDir: 'descending',
					},
				}),
			);
		});

		await waitFor(() => {
			expect(getPdfJobStatusMock).toHaveBeenCalledWith('job-1');
		});

		// After PDF completion, email link with PDF should be generated
		await waitFor(() => {
			expect(
				createOpportunityListEmailLinkWithPdfMock,
			).toHaveBeenCalledWith(
				expect.objectContaining({
					viewMode: 'reseller',
					selectedSkuIds: ['bp_cb'],
					totalSeatsRange: '1000+',
					pdfJobId: 'job-1',
					pdfDownloadUrl: 'https://blob.example/job.pdf',
				}),
			);
		});
	});

	it('renders failed inline state when async job fails', async () => {
		createAsyncPdfListLinkMock.mockResolvedValue({
			jobId: 'job-failed',
			url: '/api/pdf/async/reseller-list?dlToken=token-failed',
			estimatedRows: 10,
			totalChunks: 1,
			totalParts: 1,
		});
		getPdfJobStatusMock.mockResolvedValue({
			id: 'job-failed',
			status: 'failed',
			progress: 55,
			totalChunks: 1,
			completedChunks: 0,
			partSize: 25_000,
			totalParts: 1,
			completedParts: 0,
			totalRows: 10,
			azureBlobUrl: null,
			parts: [],
			errorMessage: 'Generation failed due to timeout',
			createdAt: new Date().toISOString(),
			startedAt: new Date().toISOString(),
			completedAt: null,
			expiresAt: null,
			passwordAvailable: false,
		});

		render(<DownloadListDialog {...baseProps} />);

		// Select a SKU and click download
		fireEvent.click(screen.getByText('Business Premium + Copilot'));
		fireEvent.click(
			screen.getByRole('button', {
				name: 'Download e-mail to send the list to partner',
			}),
		);

		expect(
			await screen.findByText('PDF generation failed'),
		).toBeInTheDocument();
		expect(
			await screen.findByText('Generation failed due to timeout'),
		).toBeInTheDocument();
	});

	it('disables download button when no SKUs are selected', () => {
		render(<DownloadListDialog {...baseProps} />);

		const downloadEmailButton = screen.getByRole('button', {
			name: 'Download e-mail to send the list to partner',
		});

		expect(downloadEmailButton).toBeDisabled();

		fireEvent.click(screen.getByText('Business Premium + Copilot'));
		expect(downloadEmailButton).not.toBeDisabled();
	});

	it('does not show Download List button', () => {
		render(<DownloadListDialog {...baseProps} />);
		expect(
			screen.queryByRole('button', { name: 'Download List' }),
		).not.toBeInTheDocument();
	});
});
