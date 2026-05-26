import fs from 'node:fs/promises';
import path from 'node:path';
import { UnprocessableEntityException } from '@nestjs/common';

const FLYER_TEMPLATE_CACHE_MAX_ITEMS = 64;
const MULTI_RENEWAL_FIRST_PAGE = 'multiple_renewals/first_page.pptx';
const MULTI_RENEWAL_LAST_PAGE = 'multiple_renewals/last_page.pptx';
const MULTI_RENEWAL_BS_OR_BP_AND_CB = 'multiple_renewals/bs_or_bp_and_cb.pptx';
const MULTI_RENEWAL_BP_AND_CB_AND_PURVIEW =
	'multiple_renewals/bp_and_cb_and_purview.pptx';
const MULTI_RENEWAL_DEFENDER_SUITE = 'multiple_renewals/defender_suite.pptx';
const MULTI_RENEWAL_PURVIEW_SUITE = 'multiple_renewals/purview_suite.pptx';
const MULTI_RENEWAL_DEFENDER_AND_PURVIEW =
	'multiple_renewals/defender_and_purview_suite.pptx';
const MULTI_RENEWAL_INVESTMENT_AI = 'multiple_renewals/investment_ai.pptx';
const MULTI_RENEWAL_INVESTMENT_SECURITY =
	'multiple_renewals/investment_security.pptx';

const LEGACY_FLYER_PATH_ALIASES: Record<string, string[]> = {
	[MULTI_RENEWAL_FIRST_PAGE]: ['multiple_renewals/First page.pptx'],
	[MULTI_RENEWAL_LAST_PAGE]: ['multiple_renewals/Last page.pptx'],
	[MULTI_RENEWAL_BS_OR_BP_AND_CB]: [
		'multiple_renewals/Flyer - Copilot Business + BS or BP.pptx',
	],
	[MULTI_RENEWAL_BP_AND_CB_AND_PURVIEW]: [
		'multiple_renewals/Flyer - Copilot Business + BP + Purview.pptx',
	],
	[MULTI_RENEWAL_DEFENDER_SUITE]: [
		'multiple_renewals/Flyer - Defender Suite.pptx',
	],
	[MULTI_RENEWAL_PURVIEW_SUITE]: [
		'multiple_renewals/Flyer - Purview Suite.pptx',
	],
	[MULTI_RENEWAL_DEFENDER_AND_PURVIEW]: [
		'multiple_renewals/Flyer - Defender + Purview Suite.pptx',
	],
	[MULTI_RENEWAL_INVESTMENT_AI]: ['multiple_renewals/Investment - AI.pptx'],
	[MULTI_RENEWAL_INVESTMENT_SECURITY]: [
		'multiple_renewals/Investment - Security.pptx',
	],
};

interface EnvLike {
	emailTemplatesDir: string;
	proposalFlyersDir: string;
}

export class ProposalEmailTemplateLoaderService {
	private readonly flyerTemplateCache = new Map<string, Buffer>();

	constructor(private readonly env: EnvLike) {}

	async loadTemplateBuffer(templatePath: string): Promise<Buffer> {
		const prefix = '/email_templates/';
		if (!templatePath.startsWith(prefix)) {
			throw new UnprocessableEntityException(
				`Unsupported template path "${templatePath}"`,
			);
		}

		const relativePath = templatePath.slice(prefix.length);
		const filePath = path.resolve(this.env.emailTemplatesDir, relativePath);
		const templatesRoot = path.resolve(this.env.emailTemplatesDir);
		if (!filePath.startsWith(templatesRoot + path.sep)) {
			throw new UnprocessableEntityException(
				'Template path traversal is not allowed',
			);
		}

		return fs.readFile(filePath);
	}

	resolveFlyerSourcePath(relativePath: string): string {
		const fullPath = path.resolve(this.env.proposalFlyersDir, relativePath);
		const root = path.resolve(this.env.proposalFlyersDir);
		if (!fullPath.startsWith(root + path.sep)) {
			throw new UnprocessableEntityException(
				'Flyer path traversal is not allowed',
			);
		}
		return fullPath;
	}

	async loadFlyerTemplateBuffer(relativePath: string): Promise<Buffer> {
		const candidates = [
			relativePath,
			...(LEGACY_FLYER_PATH_ALIASES[relativePath] ?? []),
		];
		let sourcePath: string | null = null;
		let sourceBuffer: Buffer | null = null;

		for (const candidate of candidates) {
			const resolvedPath = this.resolveFlyerSourcePath(candidate);
			const cached = this.flyerTemplateCache.get(resolvedPath);
			if (cached) {
				return cached;
			}

			try {
				sourceBuffer = await fs.readFile(resolvedPath);
				sourcePath = resolvedPath;
				break;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
					continue;
				}
				throw error;
			}
		}

		if (!sourceBuffer || !sourcePath) {
			throw new UnprocessableEntityException(
				`Flyer template "${relativePath}" could not be resolved from configured flyer assets`,
			);
		}
		if (
			this.flyerTemplateCache.size >= FLYER_TEMPLATE_CACHE_MAX_ITEMS &&
			this.flyerTemplateCache.size > 0
		) {
			const firstKey = this.flyerTemplateCache.keys().next().value as
				| string
				| undefined;
			if (firstKey) {
				this.flyerTemplateCache.delete(firstKey);
			}
		}
		this.flyerTemplateCache.set(sourcePath, sourceBuffer);
		return sourceBuffer;
	}
}
