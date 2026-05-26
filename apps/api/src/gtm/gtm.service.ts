import fs from 'node:fs';
import path from 'node:path';
import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	Logger,
} from '@nestjs/common';
import { GTM_MANIFEST } from '@repo/shared';
import type { Response } from 'express';
import archiver from 'archiver';
import { getEnv } from '../config/env';
import { DlTokenService } from '../pdf/dl-token.service';
import type { GtmAssetSelection } from '../pdf/types/dl-token.types';

@Injectable()
export class GtmService {
	private readonly logger = new Logger(GtmService.name);
	private readonly env = getEnv();

	constructor(private readonly dlTokenService: DlTokenService) {}

	/**
	 * Validates the asset selection against the manifest and creates a signed
	 * download token embedding the exact file list.
	 */
	createBundleLink(selectedAssets: GtmAssetSelection[]): { url: string } {
		if (selectedAssets.length === 0) {
			throw new BadRequestException('At least one asset selection is required');
		}

		for (const selection of selectedAssets) {
			const scenario = GTM_MANIFEST[selection.endingSkuId];
			if (!scenario) {
				throw new BadRequestException(
					`Unknown endingSkuId: ${selection.endingSkuId}`,
				);
			}

			const knownFileNames = new Set(scenario.assets.map((a) => a.fileName));
			for (const fileName of selection.fileNames) {
				if (!knownFileNames.has(fileName)) {
					throw new BadRequestException(
						`Unknown file "${fileName}" for scenario "${selection.endingSkuId}"`,
					);
				}
			}
		}

		const token = this.dlTokenService.createToken({
			scope: 'gtm-bundle',
			tenantId: this.env.defaultTenantId,
			filters: {
				pssAIWorkforce: [],
				pssAISecurity: [],
				psa: [],
				distributor: [],
				reseller: [],
				customer: [],
				pdm: [],
				pmm: [],
				type: [],
				expSeats: [],
				renewalDate: [],
				search: '',
			},
			sort: { sortBy: '', sortDir: 'ascending' },
			selectedSkuIds: [],
			selectedAssets,
			ttlSeconds: 3600, // 1 hour for bundle links
		});

		return {
			url: `${this.env.apiPublicBaseUrl}/api/gtm/bundle?dlToken=${encodeURIComponent(token)}`,
		};
	}

	/**
	 * Verifies the token and streams a zip archive of the selected GTM assets.
	 */
	async streamBundle(
		dlToken: string | undefined,
		response: Response,
	): Promise<void> {
		const payload = this.dlTokenService.verifyTokenForScope({
			token: dlToken,
			scope: 'gtm-bundle',
		});

		const selectedAssets = payload.selectedAssets;
		if (!selectedAssets || selectedAssets.length === 0) {
			throw new BadRequestException('Token contains no asset selections');
		}

		// Resolve and validate all file paths before streaming
		const filesToArchive: Array<{ filePath: string; zipPath: string }> = [];
		const seenZipPaths = new Set<string>();

		for (const selection of selectedAssets) {
			const scenario = GTM_MANIFEST[selection.endingSkuId];
			if (!scenario) {
				throw new InternalServerErrorException(
					`Manifest missing scenario for endingSkuId: ${selection.endingSkuId}`,
				);
			}

			for (const fileName of selection.fileNames) {
				// Email campaign files are inside an "E-mail campaign" subfolder on disk
				const isEmailCampaign =
					fileName.endsWith('.oft') && !fileName.startsWith('Promotional');
				const diskPath = isEmailCampaign
					? path.join(
							this.env.gtmAssetsDir,
							scenario.folderName,
							'E-mail campaign',
							fileName,
						)
					: path.join(this.env.gtmAssetsDir, scenario.folderName, fileName);

				if (!fs.existsSync(diskPath)) {
					this.logger.error(`GTM asset file missing on disk: ${diskPath}`);
					throw new InternalServerErrorException(
						`Asset file not found: ${scenario.folderName}/${fileName}`,
					);
				}

				// Organize zip by scenario subfolder
				const zipPath = isEmailCampaign
					? `${scenario.label}/E-mail campaign/${fileName}`
					: `${scenario.label}/${fileName}`;

				if (!seenZipPaths.has(zipPath)) {
					seenZipPaths.add(zipPath);
					filesToArchive.push({ filePath: diskPath, zipPath });
				}
			}
		}

		// Set response headers
		response.setHeader('Content-Type', 'application/zip');
		response.setHeader(
			'Content-Disposition',
			'attachment; filename="gtm-assets.zip"',
		);
		response.setHeader('Cache-Control', 'no-store');

		// Create archive — level 0 = store mode (no compression, PPTX is already deflated)
		const archive = archiver('zip', { zlib: { level: 0 } });

		archive.on('error', (err) => {
			this.logger.error('Archiver stream error', err);
			if (!response.headersSent) {
				response.status(500).end();
			}
		});

		archive.pipe(response);

		for (const { filePath, zipPath } of filesToArchive) {
			archive.file(filePath, { name: zipPath });
		}

		await archive.finalize();
	}

	/**
	 * Streams a zip of all Pax8 copilot resource files from static/pax8/.
	 */
	async streamPax8CopilotBundle(response: Response): Promise<void> {
		const pax8Dir = path.join(process.cwd(), 'static', 'pax8');
		const files = [
			'Copilot-SMB-Checklist.xlsx',
			'Copilot-email-templates.docx',
			'Pax8-Free-Copilot-Chat-In-App-Prompt-Ideation.pdf',
		];

		for (const file of files) {
			const filePath = path.join(pax8Dir, file);
			if (!fs.existsSync(filePath)) {
				this.logger.error(`Pax8 asset file missing: ${filePath}`);
				throw new InternalServerErrorException(`Pax8 asset not found: ${file}`);
			}
		}

		response.setHeader('Content-Type', 'application/zip');
		response.setHeader(
			'Content-Disposition',
			'attachment; filename="pax8-copilot-resources.zip"',
		);
		response.setHeader('Cache-Control', 'no-store');

		const archive = archiver('zip', { zlib: { level: 6 } });

		archive.on('error', (err) => {
			this.logger.error('Pax8 archiver stream error', err);
			if (!response.headersSent) {
				response.status(500).end();
			}
		});

		archive.pipe(response);

		for (const file of files) {
			archive.file(path.join(pax8Dir, file), { name: file });
		}

		await archive.finalize();
	}
}
