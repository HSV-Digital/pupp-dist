import { vi } from 'vitest';
import { InternalServerErrorException } from '@nestjs/common';
import type { AppEnv } from '../config/env';
import * as envModule from '../config/env';
import { BlobStorageService } from './blob-storage.service';

const uploadDataMock = vi.fn().mockResolvedValue(undefined);
const downloadToBufferMock = vi.fn();
const deleteIfExistsMock = vi.fn().mockResolvedValue(undefined);
const createIfNotExistsMock = vi.fn().mockResolvedValue(undefined);

const getBlockBlobClientMock = vi.fn(() => ({
	uploadData: uploadDataMock,
	downloadToBuffer: downloadToBufferMock,
	deleteIfExists: deleteIfExistsMock,
	url: 'https://testaccount.blob.core.windows.net/container/blob.txt',
}));

const getContainerClientMock = vi.fn(() => ({
	createIfNotExists: createIfNotExistsMock,
	getBlockBlobClient: getBlockBlobClientMock,
}));

vi.mock('@azure/storage-blob', () => ({
	BlobServiceClient: vi.fn(() => ({
		getContainerClient: getContainerClientMock,
	})),
	StorageSharedKeyCredential: vi.fn(),
}));

vi.mock('@azure/identity', () => ({
	DefaultAzureCredential: vi.fn(),
}));

const getEnvSpy = vi.spyOn(envModule, 'getEnv');

function createEnv(overrides: Partial<AppEnv> = {}): AppEnv {
	return {
		allowedTenantIds: [],
		apiPublicBaseUrl: 'http://localhost:3001',
		azureAdClientId: '',
		azureAdResellerClientId: '',
		azureCdnBaseUrl: '',
		azureStorageAccountKey: 'dGVzdGtleQ==',
		azureStorageAccountName: 'testaccount',
		azureStorageContainerName: 'proposal-assets',
		blobSasExpirySeconds: 604800,
		defaultTenantId: 'default-tenant',
		dlTokenEncryptionKey: 'secret',
		emailTemplatesDir: '/tmp/email-templates',
		isProduction: false,
		port: 3001,
		trustProxyHops: 1,
		uploadMaxConcurrency: 25,
		frontendUrl: 'http://localhost:3000',
		googleClientId: '',
		gtmAssetsDir: '/tmp/gtm-assets',
		hsvDigitalTenantId: '',
		internalTenantLabels: {},
		microsoftTenantId: '',
		pdfAsyncMinPartSize: 1000,
		pdfAsyncPartSize: 10000,
		pdfAsyncSplitMaxDepth: 4,
		pdfCacheTtlSeconds: 120,
		pdfDlTokenSecret: 'pdf-secret',
		pdfDlTokenTtlSeconds: 31536000,
		pdfMaxConcurrency: 4,
		pdfPasswordEncryptionKey: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
		pdfRenderCacheVersion: 'v2',
		pdfRenderTimeoutMs: 15000,
		posthogCaptureHost: 'https://us.i.posthog.com',
		posthogEndpointApiKey: '',
		posthogPersonalApiKey: '',
		posthogProjectToken: '',
		posthogQueryHost: 'https://us.posthog.com',
		posthogWebProjectId: '',
		proposalFlyersDir: '/tmp/flyers',
		proposalOptionsEmailTokenTtlSeconds: 600,
		partnerUploadUrl: 'https://example.com/csp-partners',
		proposalGenerationSelectionSnapshotLaunchAt: '2026-03-07T00:00:00.000Z',
		qpdfBinary: 'qpdf',
		redisConnection: {
			host: 'localhost',
			port: 6379,
			db: 0,
		},
		resellerApiTokenSecret: 'reseller-secret',
		resellerApiTokenTtlSeconds: 604800,
		resellerExcludedOrgDomains: [],
		...overrides,
	};
}

describe('BlobStorageService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uploads data and returns plain blob URL', async () => {
		getEnvSpy.mockReturnValue(createEnv());
		const service = new BlobStorageService();

		const data = Buffer.from('hello');
		const url = await service.upload(
			'my-container',
			'path/file.txt',
			data,
			'text/plain',
		);

		expect(getContainerClientMock).toHaveBeenCalledWith('my-container');
		expect(createIfNotExistsMock).toHaveBeenCalled();
		expect(getBlockBlobClientMock).toHaveBeenCalledWith('path/file.txt');
		expect(uploadDataMock).toHaveBeenCalledWith(data, {
			blobHTTPHeaders: { blobContentType: 'text/plain' },
		});
		expect(url).toBe(
			'https://testaccount.blob.core.windows.net/container/blob.txt',
		);
	});

	it('uploads without content type when omitted', async () => {
		getEnvSpy.mockReturnValue(createEnv());
		const service = new BlobStorageService();

		await service.upload('c', 'b', Buffer.from('data'));

		expect(uploadDataMock).toHaveBeenCalledWith(expect.any(Buffer), {});
	});

	it('downloads and returns a Buffer', async () => {
		getEnvSpy.mockReturnValue(createEnv());
		const expected = Buffer.from('file-content');
		downloadToBufferMock.mockResolvedValue(expected);
		const service = new BlobStorageService();

		const result = await service.download('my-container', 'path/file.txt');

		expect(getContainerClientMock).toHaveBeenCalledWith('my-container');
		expect(getBlockBlobClientMock).toHaveBeenCalledWith('path/file.txt');
		expect(result).toBe(expected);
	});

	it('deletes a blob using deleteIfExists', async () => {
		getEnvSpy.mockReturnValue(createEnv());
		const service = new BlobStorageService();

		await service.delete('my-container', 'path/file.txt');

		expect(getContainerClientMock).toHaveBeenCalledWith('my-container');
		expect(getBlockBlobClientMock).toHaveBeenCalledWith('path/file.txt');
		expect(deleteIfExistsMock).toHaveBeenCalled();
	});

	it('generateReadUrl returns plain URL', () => {
		getEnvSpy.mockReturnValue(createEnv());
		const service = new BlobStorageService();

		const url = service.generateReadUrl('my-container', 'path/file.txt');

		expect(url).toBe(
			'https://testaccount.blob.core.windows.net/container/blob.txt',
		);
	});

	it('upload() returns CDN URL when azureCdnBaseUrl is set', async () => {
		getEnvSpy.mockReturnValue(
			createEnv({ azureCdnBaseUrl: 'https://cdn.example.net' }),
		);
		const service = new BlobStorageService();

		const url = await service.upload('c', 'b', Buffer.from('data'));

		expect(url).toBe('https://cdn.example.net/container/blob.txt');
	});

	it('generateReadUrl() returns CDN URL when azureCdnBaseUrl is set', () => {
		getEnvSpy.mockReturnValue(
			createEnv({ azureCdnBaseUrl: 'https://cdn.example.net/' }),
		);
		const service = new BlobStorageService();

		const url = service.generateReadUrl('c', 'b');

		expect(url).toBe('https://cdn.example.net/container/blob.txt');
	});

	it('throws InternalServerErrorException when Azure is not configured', async () => {
		getEnvSpy.mockReturnValue(
			createEnv({ azureStorageAccountName: '', azureStorageAccountKey: '' }),
		);
		const service = new BlobStorageService();

		await expect(
			service.upload('c', 'b', Buffer.from('x')),
		).rejects.toBeInstanceOf(InternalServerErrorException);
		await expect(service.download('c', 'b')).rejects.toBeInstanceOf(
			InternalServerErrorException,
		);
		await expect(service.delete('c', 'b')).rejects.toBeInstanceOf(
			InternalServerErrorException,
		);
	});
});
