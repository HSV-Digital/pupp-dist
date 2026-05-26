import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { DefaultAzureCredential } from '@azure/identity';
import {
	BlobServiceClient,
	StorageSharedKeyCredential,
	type BlockBlobUploadOptions,
} from '@azure/storage-blob';
import { getEnv } from '../config/env';

@Injectable()
export class BlobStorageService {
	private readonly blobServiceClient: BlobServiceClient | null;
	private readonly blobBaseUrl: string;
	private readonly cdnBaseUrl: string;

	constructor() {
		const env = getEnv();
		const accountName = env.azureStorageAccountName.trim();

		if (accountName.length === 0) {
			this.blobServiceClient = null;
			this.blobBaseUrl = '';
			this.cdnBaseUrl = '';
			return;
		}

		const accountUrl = `https://${accountName}.blob.core.windows.net`;
		this.blobBaseUrl = accountUrl;
		this.cdnBaseUrl = env.azureCdnBaseUrl.trim().replace(/\/+$/, '');
		const accountKey = env.azureStorageAccountKey.trim();

		if (accountKey.length > 0) {
			const credential = new StorageSharedKeyCredential(
				accountName,
				accountKey,
			);
			this.blobServiceClient = new BlobServiceClient(accountUrl, credential);
		} else {
			this.blobServiceClient = new BlobServiceClient(
				accountUrl,
				new DefaultAzureCredential(),
			);
		}
	}

	async upload(
		containerName: string,
		blobName: string,
		data: Buffer,
		contentType?: string,
	): Promise<string> {
		const client = this.requireClient();
		const containerClient = client.getContainerClient(containerName);
		await containerClient.createIfNotExists();

		const blockBlobClient = containerClient.getBlockBlobClient(blobName);
		const options: BlockBlobUploadOptions = contentType
			? { blobHTTPHeaders: { blobContentType: contentType } }
			: {};
		await blockBlobClient.uploadData(data, options);
		return this.toCdnUrl(blockBlobClient.url);
	}

	/** Generate a public read URL for an existing blob. */
	generateReadUrl(containerName: string, blobName: string): string {
		const client = this.requireClient();
		const blockBlobClient = client
			.getContainerClient(containerName)
			.getBlockBlobClient(blobName);
		return this.toCdnUrl(blockBlobClient.url);
	}

	async download(containerName: string, blobName: string): Promise<Buffer> {
		const client = this.requireClient();
		const containerClient = client.getContainerClient(containerName);
		const blockBlobClient = containerClient.getBlockBlobClient(blobName);
		return blockBlobClient.downloadToBuffer();
	}

	async delete(containerName: string, blobName: string): Promise<void> {
		const client = this.requireClient();
		const containerClient = client.getContainerClient(containerName);
		const blockBlobClient = containerClient.getBlockBlobClient(blobName);
		await blockBlobClient.deleteIfExists();
	}

	private toCdnUrl(blobUrl: string): string {
		if (this.cdnBaseUrl.length === 0) {
			return blobUrl;
		}
		return blobUrl.replace(this.blobBaseUrl, this.cdnBaseUrl);
	}

	private requireClient(): BlobServiceClient {
		if (!this.blobServiceClient) {
			throw new InternalServerErrorException(
				'Azure Blob Storage is not configured',
			);
		}
		return this.blobServiceClient;
	}
}
