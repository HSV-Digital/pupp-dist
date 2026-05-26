import {
	BadRequestException,
	UnauthorizedException,
	UnprocessableEntityException,
} from '@nestjs/common';
import {
	ENDING_SKU_BY_ID,
	buildRegionalPricingContext,
	getValidUpgradePaths,
	resolveEndingSkuIdsForFilter,
	resolveProposalFlyerTemplatePath,
	resolveProposalOptionsTemplatePath,
	type RegionalPricingContext,
} from '@repo/shared';
import { UpgradeType } from '@repo/types';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { CreateProposalOptionsEmailLinkPayloadDto } from '../dto/create-proposal-options-email-link.dto';
import { BlobStorageService } from '../../blob-storage/blob-storage.service';
import { DlTokenService } from '../../pdf/dl-token.service';
import type {
	CustomerProposalEmailPayload,
	PdfFiltersPayload,
	PdfSortPayload,
	PricingContextPayload,
	ProposalOptionsEmailPayload,
	ProposalOptionsEmailSolution,
	ProposalPptScenarioPayload,
} from '../../pdf/types/dl-token.types';

const DOCX_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const ALLOWED_SCREENSHOT_MIME_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/webp',
]);
const SCENARIO_IMAGE_ANCHOR = '__SCENARIO_IMAGE_ANCHOR__';
const PROPOSAL_OPTIONS_UPLOAD_LINK_TOKEN = '__PROPOSAL_OPTIONS_UPLOAD_LINK__';
const FLYER_LINK_TOKEN_PREFIX = '__PROPOSAL_FLYER_LINK_';
const FLYER_LINK_TEXT = 'View Proposal Flyer';
const DOCUMENTS_LINK_TEXT = 'Download Proposal Documents';

const EMPTY_FILTERS: PdfFiltersPayload = {
	pssAIWorkforce: [],
	pssAISecurity: [],
	psa: [],
	distributor: [],
	reseller: [],
	customer: [],
	pdm: [],
	pmm: [],
	type: [],
	skuCategory: [],
	expSeats: [],
	renewalDate: [],
	search: '',
};

const EMPTY_SORT: PdfSortPayload = {
	sortBy: 'renewalDate',
	sortDir: 'ascending',
};

interface EnvLike {
	defaultTenantId: string;
	proposalOptionsEmailTokenTtlSeconds: number;
	partnerUploadUrl: string;
	azureStorageContainerName: string;
}

interface UploadedImageFileLike {
	originalname: string;
	mimetype: string;
	size: number;
	buffer: Buffer;
}

interface UploadedScreenshotAsset {
	blobName: string;
	mimeType: string;
	url: string;
}

interface CurrencyFormatOptions {
	currencySymbol?: string;
	locale?: string;
}

interface SolutionWithBuffer extends ProposalOptionsEmailSolution {
	flyerBuffer: Buffer;
}

interface ResolvedOptionScenario {
	opportunityId: string;
	endingSkuId: string;
	selectedSeats: number;
	originalSeats: number;
	expiringArr: number;
	expiringSkuRenewalPrice?: number;
}

interface WorkflowDeps {
	env: EnvLike;
	dlTokenService: DlTokenService;
	blobStorageService: BlobStorageService;
	loadTemplateBuffer: (templatePath: string) => Promise<Buffer>;
	loadFlyerTemplateBuffer: (relativePath: string) => Promise<Buffer>;
	resolveFlyerSourcePath: (relativePath: string) => string;
	hydrateFlyerTemplateBuffer: (
		sourceBuffer: Buffer,
		replacements: Record<string, string>,
		options?: { strictValidation?: boolean },
	) => Buffer;
	buildFlyerPlaceholderValuesFromScenario: (
		scenarioPayload: ProposalPptScenarioPayload,
		pricingContext?: RegionalPricingContext,
		journey?: 'renewal' | 'new_customer',
	) => Record<string, string>;
	renderCustomerProposalEmail: (
		payload: CustomerProposalEmailPayload,
	) => Promise<Buffer>;
	injectDocxHyperlinks: (
		zip: PizZip,
		targets: Array<{ token: string; url: string; displayText: string }>,
	) => void;
	embedInlineScreenshot: (params: {
		zip: PizZip;
		imageBuffer: Buffer;
		mimeType: string;
	}) => void;
	removeImageAnchorText: (zip: PizZip) => void;
	injectDocumentsZipLink: (zip: PizZip, zipUrl: string) => void;
}

function formatNumber(value: number): string {
	return Math.max(0, Math.floor(value)).toLocaleString('en-US');
}

function formatRenewalDate(value: string | null | undefined): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	});
}

function formatCurrency(
	value: number,
	options?: CurrencyFormatOptions,
): string {
	const symbol = options?.currencySymbol ?? '$';
	const locale = options?.locale ?? 'en-US';
	const normalized = Math.max(0, Number.isFinite(value) ? value : 0);
	return `${symbol}${Math.round(normalized).toLocaleString(locale)}`;
}

function normalizeOptionalRenewalPrice(
	value: number | null | undefined,
): number | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return undefined;
	}

	return Math.round((Math.max(0, parsed) + Number.EPSILON) * 100) / 100;
}

function toCurrencyFormatOptions(
	pricingContext:
		| Pick<RegionalPricingContext, 'currencySymbol' | 'locale'>
		| Pick<PricingContextPayload, 'currencySymbol' | 'locale'>
		| null
		| undefined,
): CurrencyFormatOptions {
	return {
		currencySymbol: pricingContext?.currencySymbol ?? '$',
		locale: pricingContext?.locale ?? 'en-US',
	};
}

function toPricingContextPayload(
	pricingContext: RegionalPricingContext,
): PricingContextPayload {
	return {
		region: pricingContext.sourceRegion,
		country: pricingContext.country,
		currency: pricingContext.currency,
		currencySymbol: pricingContext.currencySymbol,
		locale: pricingContext.locale,
		fallbackApplied: pricingContext.fallbackApplied,
		fallbackReason: pricingContext.fallbackReason,
	};
}

function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

function buildFlyerLinkToken(index: number): string {
	return `${FLYER_LINK_TOKEN_PREFIX}${index + 1}__`;
}

export class ProposalOptionsWorkflowService {
	constructor(private readonly deps: WorkflowDeps) {}

	async createProposalOptionsEmailLink(params: {
		payload: CreateProposalOptionsEmailLinkPayloadDto;
		screenshotFile?: UploadedImageFileLike;
	}): Promise<{ url: string; expiresAt: string }> {
		const pricingContext = buildRegionalPricingContext({
			region: params.payload.region,
		});
		const templatePath = resolveProposalOptionsTemplatePath({
			journey: params.payload.journey,
			filter: params.payload.filter,
		});

		const selectedEndingSkuIds = this.resolveSelectedEndingSkuIds(
			params.payload,
		);
		const selectedScenarios = this.resolveSelectedScenarios({
			payload: params.payload,
			selectedEndingSkuIds,
		});
		const solutionsWithBuffers = await this.buildSolutions({
			payload: params.payload,
			scenarios: selectedScenarios,
			pricingContext,
		});

		const screenshot = await this.uploadScreenshot({
			payload: params.payload,
			screenshotFile: params.screenshotFile,
		});

		const customerEmails: Array<{
			endingSkuId: string;
			solutionName: string;
			emailBuffer: Buffer;
		}> = [];
		for (const solution of solutionsWithBuffers) {
			const email = await this.renderCustomerEmailForSolution({
				journey: params.payload.journey,
				customerId: params.payload.customerId,
				customerName: params.payload.customerName,
				startingSkuId: params.payload.startingSkuId,
				startingSkuName: params.payload.startingSkuName,
				region: params.payload.region ?? '',
				solutionName: solution.solutionName,
				pricingContext,
				scenario: {
					opportunityId: solution.opportunityId ?? params.payload.opportunityId,
					endingSkuId: solution.endingSkuId,
					selectedSeats:
						solution.selectedSeats ??
						Math.max(0, Math.floor(params.payload.seats)),
					originalSeats:
						solution.originalSeats ??
						Math.max(0, Math.floor(params.payload.seats)),
					expiringArr:
						solution.expiringArr ?? Math.max(0, params.payload.expiringArr),
					expiringSkuRenewalPrice: solution.expiringSkuRenewalPrice,
				},
			});
			customerEmails.push(email);
		}

		const options: ProposalOptionsEmailSolution[] = [];
		for (let i = 0; i < solutionsWithBuffers.length; i++) {
			const solution = solutionsWithBuffers[i];
			const email = customerEmails[i];

			const solutionZipBuffer = this.buildSolutionZip({
				solutionName: solution.solutionName,
				flyerBuffer: solution.flyerBuffer,
				emailBuffer: email.emailBuffer,
			});

			const solutionZipBlobName = [
				'proposal-options/documents',
				slugify(params.payload.customerId),
				slugify(params.payload.opportunityId),
				`${Date.now()}-${slugify(solution.endingSkuId)}.zip`,
			].join('/');

			const solutionZipUrl = await this.deps.blobStorageService.upload(
				this.deps.env.azureStorageContainerName,
				solutionZipBlobName,
				solutionZipBuffer,
				'application/zip',
			);

			options.push({
				endingSkuId: solution.endingSkuId,
				solutionName: solution.solutionName,
				flyerUrl: solution.flyerUrl,
				documentsZipUrl: solutionZipUrl,
				selectedSeats: solution.selectedSeats,
				originalSeats: solution.originalSeats,
				expiringArr: solution.expiringArr,
				expiringSkuRenewalPrice: solution.expiringSkuRenewalPrice,
			});
		}

		const aggregatedOriginalSeats =
			selectedScenarios.length > 0
				? selectedScenarios.reduce(
						(sum, scenario) => sum + scenario.originalSeats,
						0,
					)
				: Math.max(0, Math.floor(params.payload.seats));
		const aggregatedExpiringArr =
			selectedScenarios.length > 0
				? selectedScenarios.reduce(
						(sum, scenario) => sum + scenario.expiringArr,
						0,
					)
				: Math.max(0, params.payload.expiringArr);

		const tokenPayload: ProposalOptionsEmailPayload = {
			templatePath,
			journey: params.payload.journey,
			filter: params.payload.filter,
			customerId: params.payload.customerId,
			customerName: params.payload.customerName,
			opportunityId: params.payload.opportunityId,
			renewalDate: params.payload.renewalDate ?? null,
			startingSkuId: params.payload.startingSkuId,
			startingSkuName: params.payload.startingSkuName,
			region: params.payload.region ?? '',
			seats: aggregatedOriginalSeats,
			expiringArr: aggregatedExpiringArr,
			pricingContext: toPricingContextPayload(pricingContext),
			url: this.deps.env.partnerUploadUrl,
			options,
			screenshotUrl: screenshot?.url ?? null,
			screenshotBlobName: screenshot?.blobName ?? null,
			screenshotMimeType: screenshot?.mimeType ?? null,
			documentsZipUrl: null,
			documentsZipBlobName: null,
		};

		const token = this.deps.dlTokenService.createToken({
			scope: 'proposal-options-email',
			tenantId: this.deps.env.defaultTenantId,
			filters: EMPTY_FILTERS,
			sort: EMPTY_SORT,
			selectedSkuIds: selectedScenarios.map((scenario) => scenario.endingSkuId),
			customerId: params.payload.customerId,
			proposalOptionsEmail: tokenPayload,
			ttlSeconds: this.deps.env.proposalOptionsEmailTokenTtlSeconds,
		});

		const url = `/api/email/proposal-options/download?dlToken=${encodeURIComponent(token)}`;
		const expiresAt = new Date(
			Date.now() + this.deps.env.proposalOptionsEmailTokenTtlSeconds * 1000,
		).toISOString();

		return { url, expiresAt };
	}

	async renderProposalOptionsEmailFromToken(
		dlToken: string | undefined,
	): Promise<Buffer> {
		const tokenPayload = this.deps.dlTokenService.verifyTokenForScope({
			token: dlToken,
			scope: 'proposal-options-email',
		});
		const proposalOptionsEmail = tokenPayload.proposalOptionsEmail;
		if (!proposalOptionsEmail) {
			throw new UnauthorizedException(
				'Invalid proposal-options email payload in download token',
			);
		}

		const templateBuffer = await this.deps.loadTemplateBuffer(
			proposalOptionsEmail.templatePath,
		);
		const zip = new PizZip(templateBuffer);

		const doc = new Docxtemplater(zip, {
			paragraphLoop: true,
			linebreaks: true,
		});
		const pricingContext =
			proposalOptionsEmail.pricingContext ??
			toPricingContextPayload(
				buildRegionalPricingContext({
					region: proposalOptionsEmail.region,
				}),
			);
		const currencyFormat = toCurrencyFormatOptions(pricingContext);
		const hasPerSolutionZips = proposalOptionsEmail.options.some(
			(option) => !!option.documentsZipUrl,
		);
		const hasLegacyCombinedZip = !!proposalOptionsEmail.documentsZipUrl;

		const flyerLinks: Array<{
			token: string;
			url: string;
			displayText: string;
		}> = [];
		const solutionsData = proposalOptionsEmail.options.map((option, index) => {
			if (hasPerSolutionZips && option.documentsZipUrl) {
				const token = buildFlyerLinkToken(index);
				flyerLinks.push({
					token,
					url: option.documentsZipUrl,
					displayText: DOCUMENTS_LINK_TEXT,
				});
				return { solution_name: option.solutionName, flyer_url: token };
			}
			if (hasLegacyCombinedZip) {
				return { solution_name: option.solutionName, flyer_url: '' };
			}
			const token = buildFlyerLinkToken(index);
			flyerLinks.push({
				token,
				url: option.flyerUrl,
				displayText: FLYER_LINK_TEXT,
			});
			return { solution_name: option.solutionName, flyer_url: token };
		});

		doc.render({
			customer_name: proposalOptionsEmail.customerName,
			renewal_date: formatRenewalDate(proposalOptionsEmail.renewalDate),
			seats: formatNumber(proposalOptionsEmail.seats),
			solution_count: String(proposalOptionsEmail.options.length),
			starting_sku: proposalOptionsEmail.startingSkuName,
			expiring_arr: formatCurrency(
				proposalOptionsEmail.expiringArr,
				currencyFormat,
			),
			url: PROPOSAL_OPTIONS_UPLOAD_LINK_TOKEN,
			scenario_image_anchor: proposalOptionsEmail.screenshotBlobName
				? SCENARIO_IMAGE_ANCHOR
				: '',
			solutions: solutionsData,
		});

		const renderedZip = doc.getZip();
		this.deps.injectDocxHyperlinks(renderedZip, [
			{
				token: PROPOSAL_OPTIONS_UPLOAD_LINK_TOKEN,
				url: proposalOptionsEmail.url,
				displayText: proposalOptionsEmail.url,
			},
			...flyerLinks,
		]);

		if (
			proposalOptionsEmail.screenshotBlobName &&
			proposalOptionsEmail.screenshotMimeType
		) {
			const screenshotBuffer = await this.deps.blobStorageService.download(
				this.deps.env.azureStorageContainerName,
				proposalOptionsEmail.screenshotBlobName,
			);

			this.deps.embedInlineScreenshot({
				zip: renderedZip,
				imageBuffer: screenshotBuffer,
				mimeType: proposalOptionsEmail.screenshotMimeType,
			});
		} else {
			this.deps.removeImageAnchorText(renderedZip);
		}

		if (!hasPerSolutionZips && proposalOptionsEmail.documentsZipUrl) {
			this.deps.injectDocumentsZipLink(
				renderedZip,
				proposalOptionsEmail.documentsZipUrl,
			);
		}

		return renderedZip.generate({
			type: 'nodebuffer',
			mimeType: DOCX_CONTENT_TYPE,
		});
	}

	private resolveSelectedEndingSkuIds(
		payload: CreateProposalOptionsEmailLinkPayloadDto,
	): string[] {
		const allowedByFilter = new Set(
			resolveEndingSkuIdsForFilter({
				startingSkuId: payload.startingSkuId,
				filter: payload.filter,
			}),
		);

		const ordered: string[] = [];
		for (const endingSkuId of payload.selectedEndingSkuIds) {
			if (!allowedByFilter.has(endingSkuId)) continue;
			if (!ordered.includes(endingSkuId)) {
				ordered.push(endingSkuId);
			}
		}

		if (ordered.length > 0) {
			return ordered;
		}

		const fallbacks = [...allowedByFilter];
		if (fallbacks.length === 0) {
			throw new UnprocessableEntityException(
				'No valid ending SKUs exist for the selected starting SKU and filter',
			);
		}

		return fallbacks;
	}

	private resolveSelectedScenarios(params: {
		payload: CreateProposalOptionsEmailLinkPayloadDto;
		selectedEndingSkuIds: string[];
	}): ResolvedOptionScenario[] {
		const providedScenarios = params.payload.selectedScenarios;
		if (providedScenarios && providedScenarios.length > 0) {
			const scenarioByEndingSkuId = new Map<string, ResolvedOptionScenario>();
			for (const scenario of providedScenarios) {
				if (!params.selectedEndingSkuIds.includes(scenario.endingSkuId)) {
					continue;
				}
				if (scenarioByEndingSkuId.has(scenario.endingSkuId)) {
					continue;
				}

				scenarioByEndingSkuId.set(scenario.endingSkuId, {
					opportunityId:
						scenario.opportunityId?.trim().length > 0
							? scenario.opportunityId
							: params.payload.opportunityId,
					endingSkuId: scenario.endingSkuId,
					selectedSeats: Math.max(0, Math.floor(scenario.selectedSeats)),
					originalSeats: Math.max(0, Math.floor(scenario.originalSeats)),
					expiringArr: Math.max(0, scenario.expiringArr),
					expiringSkuRenewalPrice: normalizeOptionalRenewalPrice(
						scenario.expiringSkuRenewalPrice,
					),
				});
			}

			const ordered = params.selectedEndingSkuIds
				.map((endingSkuId) => scenarioByEndingSkuId.get(endingSkuId))
				.filter((scenario): scenario is ResolvedOptionScenario =>
					Boolean(scenario),
				);

			if (ordered.length > 0) {
				return ordered;
			}
		}

		const defaultSeats = Math.max(0, Math.floor(params.payload.seats));
		const defaultExpiringArr = Math.max(0, params.payload.expiringArr);

		return params.selectedEndingSkuIds.map((endingSkuId) => ({
			opportunityId: params.payload.opportunityId,
			endingSkuId,
			selectedSeats: defaultSeats,
			originalSeats: defaultSeats,
			expiringArr: defaultExpiringArr,
			expiringSkuRenewalPrice:
				defaultSeats > 0
					? normalizeOptionalRenewalPrice(
							defaultExpiringArr / defaultSeats / 12,
						)
					: 0,
		}));
	}

	private async buildSolutions(params: {
		payload: CreateProposalOptionsEmailLinkPayloadDto;
		scenarios: ResolvedOptionScenario[];
		pricingContext: RegionalPricingContext;
	}): Promise<SolutionWithBuffer[]> {
		const rows: SolutionWithBuffer[] = [];
		const regionalEndingSkuMap = new Map(
			getValidUpgradePaths(params.payload.startingSkuId, {
				region: params.payload.region,
				country: params.pricingContext.country,
			}).map((sku) => [sku.id, sku]),
		);

		for (const scenario of params.scenarios) {
			const endingSkuId = scenario.endingSkuId;
			const endingSku =
				regionalEndingSkuMap.get(endingSkuId) ??
				ENDING_SKU_BY_ID.get(endingSkuId);
			if (!endingSku) {
				throw new UnprocessableEntityException(
					`Unknown ending SKU "${endingSkuId}"`,
				);
			}

			const flyerRelativePath = resolveProposalFlyerTemplatePath({
				journey: params.payload.journey,
				startingSkuId: params.payload.startingSkuId,
				endingSkuId,
			});
			if (!flyerRelativePath) {
				throw new UnprocessableEntityException(
					`No flyer template mapping found for ${params.payload.journey}:${params.payload.startingSkuId}:${endingSkuId}`,
				);
			}

			const sourcePath = this.deps.resolveFlyerSourcePath(flyerRelativePath);
			const sourceBuffer =
				await this.deps.loadFlyerTemplateBuffer(flyerRelativePath);
			const replacements = this.deps.buildFlyerPlaceholderValuesFromScenario(
				{
					opportunityId: scenario.opportunityId,
					startingSkuId: params.payload.startingSkuId,
					startingSkuName: params.payload.startingSkuName,
					endingSkuId,
					selectedSeats: scenario.selectedSeats,
					originalSeats: scenario.originalSeats,
					expiringArr: scenario.expiringArr,
					expiringSkuRenewalPrice: scenario.expiringSkuRenewalPrice,
					region: params.payload.region,
				},
				params.pricingContext,
				params.payload.journey,
			);
			const hydratedBuffer = this.deps.hydrateFlyerTemplateBuffer(
				sourceBuffer,
				replacements,
				{ strictValidation: true },
			);
			const blobName = this.buildFlyerBlobName({
				payload: params.payload,
				endingSkuId,
				sourcePath,
			});

			const flyerUrl = await this.deps.blobStorageService.upload(
				this.deps.env.azureStorageContainerName,
				blobName,
				hydratedBuffer,
				PPTX_CONTENT_TYPE,
			);

			rows.push({
				opportunityId: scenario.opportunityId,
				endingSkuId,
				solutionName: endingSku.name,
				flyerUrl,
				flyerBuffer: hydratedBuffer,
				selectedSeats: scenario.selectedSeats,
				originalSeats: scenario.originalSeats,
				expiringArr: scenario.expiringArr,
				expiringSkuRenewalPrice: scenario.expiringSkuRenewalPrice,
			});
		}

		return rows;
	}

	private async renderCustomerEmailForSolution(params: {
		journey: 'renewal' | 'new_customer';
		customerId: string;
		customerName: string;
		startingSkuId: string;
		startingSkuName: string;
		region: string;
		solutionName: string;
		pricingContext: RegionalPricingContext;
		scenario: ResolvedOptionScenario;
	}): Promise<{
		endingSkuId: string;
		solutionName: string;
		emailBuffer: Buffer;
	}> {
		const endingSku = ENDING_SKU_BY_ID.get(params.scenario.endingSkuId);
		if (!endingSku) {
			throw new UnprocessableEntityException(
				`Unknown ending SKU "${params.scenario.endingSkuId}"`,
			);
		}

		const variant =
			endingSku.upgradeType === UpgradeType.AI ? 'ai' : 'security';
		const templatePath =
			params.journey === 'new_customer'
				? `/email_templates/customer/new_customer/single_solution/${variant}.docx`
				: `/email_templates/customer/renewal/single_solution_renewal/${variant}.docx`;

		const payload: CustomerProposalEmailPayload = {
			templatePath,
			journey: params.journey,
			customerId: params.customerId,
			customerName: params.customerName,
			pricingContext: toPricingContextPayload(params.pricingContext),
			scenarios: [
				{
					opportunityId: params.scenario.opportunityId,
					startingSkuId: params.startingSkuId as never,
					startingSkuName: params.startingSkuName,
					endingSkuId: params.scenario.endingSkuId,
					selectedSeats: params.scenario.selectedSeats,
					originalSeats: params.scenario.originalSeats,
					expiringArr: params.scenario.expiringArr,
					expiringSkuRenewalPrice: params.scenario.expiringSkuRenewalPrice,
					region: params.region,
				},
			],
		};
		const emailBuffer = await this.deps.renderCustomerProposalEmail(payload);

		return {
			endingSkuId: params.scenario.endingSkuId,
			solutionName: params.solutionName,
			emailBuffer,
		};
	}

	private buildSolutionZip(params: {
		solutionName: string;
		flyerBuffer: Buffer;
		emailBuffer: Buffer;
	}): Buffer {
		const zip = new PizZip();
		zip.file(`${params.solutionName}.pptx`, params.flyerBuffer);
		zip.file(`${params.solutionName}.docx`, params.emailBuffer);
		return zip.generate({ type: 'nodebuffer' });
	}

	private async uploadScreenshot(params: {
		payload: CreateProposalOptionsEmailLinkPayloadDto;
		screenshotFile?: UploadedImageFileLike;
	}): Promise<UploadedScreenshotAsset | null> {
		const screenshotFile = params.screenshotFile;
		if (!screenshotFile) {
			return null;
		}

		const mimeType = screenshotFile.mimetype.toLowerCase();
		if (!ALLOWED_SCREENSHOT_MIME_TYPES.has(mimeType)) {
			throw new BadRequestException(
				'Scenario screenshot must be PNG, JPEG, or WEBP',
			);
		}

		const extension =
			mimeType === 'image/png'
				? 'png'
				: mimeType === 'image/webp'
					? 'webp'
					: 'jpeg';
		const blobName = [
			'proposal-options',
			'screenshots',
			slugify(params.payload.customerId),
			slugify(params.payload.opportunityId),
			`${Date.now()}-${slugify(params.payload.filter)}.${extension}`,
		].join('/');

		const url = await this.deps.blobStorageService.upload(
			this.deps.env.azureStorageContainerName,
			blobName,
			screenshotFile.buffer,
			mimeType,
		);

		return {
			blobName,
			mimeType,
			url,
		};
	}

	private buildFlyerBlobName(params: {
		payload: CreateProposalOptionsEmailLinkPayloadDto;
		endingSkuId: string;
		sourcePath: string;
	}): string {
		const sourceBaseName = params.sourcePath.split('/').pop() || 'flyer.pptx';
		return [
			'proposal-options',
			'flyers',
			slugify(params.payload.customerId),
			slugify(params.payload.opportunityId),
			`${Date.now()}-${slugify(params.endingSkuId)}-${slugify(sourceBaseName)}`,
		].join('/');
	}
}
