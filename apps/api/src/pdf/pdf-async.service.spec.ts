import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
	ConflictException,
	GoneException,
	NotFoundException,
} from '@nestjs/common';

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockValues = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockReturning = vi.fn();

vi.mock('../database/connection', () => ({
	createDatabaseClient: () => ({
		db: {
			select: mockSelect,
			insert: mockInsert,
			update: mockUpdate,
		},
	}),
}));

vi.mock('../database/database-url', () => ({
	resolveDatabaseUrl: () => 'postgres://localhost:5432/test',
}));

import { PdfAsyncService } from './pdf-async.service';

describe('PdfAsyncService', () => {
	const queueMock = {
		add: vi.fn(),
		getJob: vi.fn(),
	};
	const dlTokenServiceMock = {
		createToken: vi.fn(),
	};
	const dashboardServiceMock = {
		getExportRowCount: vi.fn(),
	};
	const pdfPasswordServiceMock = {
		generatePassword: vi.fn(),
		encryptPassword: vi.fn(),
		decryptPassword: vi.fn(),
	};

	let service: PdfAsyncService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new PdfAsyncService(
			queueMock as never,
			dlTokenServiceMock as never,
			dashboardServiceMock as never,
			pdfPasswordServiceMock as never,
		);

		mockSelect.mockReturnValue({ from: mockFrom });
		mockFrom.mockReturnValue({ where: mockWhere });
		mockWhere.mockReturnValue({ limit: mockLimit });

		mockInsert.mockReturnValue({ values: mockValues });
		mockValues.mockResolvedValue(undefined);

		mockUpdate.mockReturnValue({ set: mockSet });
		mockSet.mockReturnValue({ where: mockUpdateWhere });
		mockUpdateWhere.mockReturnValue({ returning: mockReturning });
		mockReturning.mockResolvedValue([{ id: 'job-1' }]);
		pdfPasswordServiceMock.generatePassword.mockReturnValue(
			'Password123ABCxyz',
		);
		pdfPasswordServiceMock.encryptPassword.mockReturnValue(
			'encrypted-password',
		);
		pdfPasswordServiceMock.decryptPassword.mockReturnValue('Password123ABCxyz');
	});

	it('creates async jobs with owner id and normalized filters/sort', async () => {
		dashboardServiceMock.getExportRowCount.mockResolvedValue(1200);
		dlTokenServiceMock.createToken.mockReturnValue('token-1');
		queueMock.add.mockResolvedValue(undefined);

		const result = await service.createAsyncJob(
			{
				viewMode: 'reseller',
				filters: {
					pssAIWorkforce: ['wf'],
					pssAISecurity: [],
					psa: [],
					distributor: [],
					reseller: [],
					customer: [],
					pdm: [],
					pmm: [],
					region: [],
					type: ['Direct'],
					expSeats: [],
					expArr: [],
					renewalDate: [],
					search: '  test  ',
				},
				sort: {
					sortBy: 'totalARR',
					sortDir: 'descending',
				},
				selectedSkuIds: ['bp_cb'],
			},
			'entra-123',
		);

		expect(dashboardServiceMock.getExportRowCount).toHaveBeenCalledWith(
			expect.objectContaining({
				viewMode: 'reseller',
				search: 'test',
				filters: expect.objectContaining({ type: ['Direct'] }),
			}),
		);
		expect(mockValues).toHaveBeenCalledWith(
			expect.objectContaining({
				createdByEntraObjectId: 'entra-123',
				filters: expect.objectContaining({ type: ['Direct'], search: 'test' }),
				pdfPasswordCiphertext: 'encrypted-password',
			}),
		);
		expect(queueMock.add).toHaveBeenCalledWith(
			'generate-pdf',
			expect.objectContaining({
				filters: expect.objectContaining({ type: ['Direct'], search: 'test' }),
			}),
			expect.objectContaining({ jobId: expect.any(String) }),
		);
		expect(dlTokenServiceMock.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'reseller-list',
				selectedSkuIds: ['bp_cb'],
			}),
		);
		expect(
			dlTokenServiceMock.createToken.mock.calls[0]?.[0]?.singleUse,
		).toBeUndefined();
		expect(result.totalRows).toBe(1200);
		expect(result.totalChunks).toBeGreaterThan(0);
		expect(result.totalParts).toBe(result.totalChunks);
	});

	it('creates reseller-customer async jobs with reusable customer-list tokens', async () => {
		dlTokenServiceMock.createToken.mockReturnValue('token-2');
		queueMock.add.mockResolvedValue(undefined);

		const result = await service.createResellerCustomerAsyncJob(
			'org-1',
			'entra-123',
			1200,
		);

		expect(dlTokenServiceMock.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'customer-list',
				selectedSkuIds: [],
			}),
		);
		expect(
			dlTokenServiceMock.createToken.mock.calls[0]?.[0]?.singleUse,
		).toBeUndefined();
		expect(result.dlToken).toBe('token-2');
	});

	it('handles totalChunks=0 safely when updating progress', async () => {
		mockLimit.mockResolvedValueOnce([
			{
				id: 'job-1',
				totalChunks: 0,
			},
		]);

		await service.updateJobProgress('job-1', 9);

		expect(mockSet).toHaveBeenCalledWith({
			completedChunks: 0,
			completedParts: 0,
			progress: 0,
		});
	});

	it('throws when updateJobStatus updates zero rows', async () => {
		mockReturning.mockResolvedValueOnce([]);

		await expect(
			service.updateJobStatus('missing-job', 'completed', {
				azureBlobUrl: 'https://blob.example/missing.pdf',
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('rejects cancellation for already completed jobs', async () => {
		mockLimit.mockResolvedValueOnce([
			{
				id: 'job-1',
				status: 'completed',
			},
		]);

		await expect(
			service.cancelJobForOwner('job-1', 'entra-1'),
		).rejects.toBeInstanceOf(ConflictException);
	});

	it('marks jobs cancelled even when queue job is locked', async () => {
		mockLimit.mockResolvedValueOnce([
			{
				id: 'job-1',
				status: 'processing',
				createdByEntraObjectId: 'entra-1',
			},
		]);

		queueMock.getJob.mockResolvedValue({
			remove: vi.fn().mockRejectedValue(new Error('locked by worker')),
		});
		mockReturning.mockResolvedValueOnce([{ id: 'job-1' }]);

		await service.cancelJobForOwner('job-1', 'entra-1');

		expect(queueMock.getJob).toHaveBeenCalledWith('job-1');
		expect(mockSet).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'failed',
				errorMessage: 'Job cancelled by user',
			}),
		);
	});

	it('reveals password only once for completed jobs', async () => {
		mockLimit.mockResolvedValueOnce([
			{
				id: 'job-1',
				status: 'completed',
				expiresAt: new Date(Date.now() + 60_000),
				pdfPasswordRevealedAt: null,
				pdfPasswordCiphertext: 'encrypted-password',
				createdByEntraObjectId: 'entra-1',
			},
		]);

		const password = await service.revealJobPasswordForOwner(
			'job-1',
			'entra-1',
		);

		expect(password).toBe('Password123ABCxyz');
		expect(pdfPasswordServiceMock.decryptPassword).toHaveBeenCalledWith(
			'encrypted-password',
		);
		expect(mockSet).toHaveBeenCalledWith(
			expect.objectContaining({
				pdfPasswordCiphertext: null,
				pdfPasswordRevealedAt: expect.any(Date),
			}),
		);
	});

	it('throws gone when password has already been revealed', async () => {
		mockLimit.mockResolvedValueOnce([
			{
				id: 'job-1',
				status: 'completed',
				expiresAt: new Date(Date.now() + 60_000),
				pdfPasswordRevealedAt: new Date(),
				pdfPasswordCiphertext: null,
				createdByEntraObjectId: 'entra-1',
			},
		]);

		await expect(
			service.revealJobPasswordForOwner('job-1', 'entra-1'),
		).rejects.toBeInstanceOf(GoneException);
	});
});
