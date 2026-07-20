import fs from 'node:fs/promises';
import path from 'node:path';
import {
	Inject,
	Injectable,
	UnprocessableEntityException,
	forwardRef,
} from '@nestjs/common';
import {
	ENDING_SKU_BY_ID,
	STARTING_SKU_BY_ID,
	buildRegionalPricingContext,
	calculateScenario,
	computeIncrementalCostPerUserAnnual,
	getValidUpgradePaths,
	roundCurrency,
	resolveProposalFlyerTemplatePath,
	type RegionalCurrencyCode,
	type RegionalPricingContext,
	type StartingSkuId,
} from '@repo/shared';
import type { StartingSku } from '@repo/types';
import { UpgradeType } from '@repo/types';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { BlobStorageService } from '../blob-storage/blob-storage.service';
import { getEnv } from '../config/env';
import { ProposalOptionsEmailService } from '../email/proposal-options-email.service';
import type {
	CustomerProposalEmailPayload,
	CustomerProposalEmailScenarioPayload,
	PricingContextPayload,
} from '../pdf/types/dl-token.types';

const PPTX_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const DOCX_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const FLYER_TEMPLATE_CACHE_MAX_ITEMS = 64;
const MANUAL_PARTNER_PLACEHOLDER = '[PARTNER NAME]';
const MANUAL_INSTRUCTION_PLACEHOLDER = '[INSTRUCTION FOR THE PARTNER]';
const SINGLE_PROPOSAL_DISCLAIMER_PATH =
	'multiple_renewals/Disclaimer page.pptx';

const ALLOWED_FLYER_PLACEHOLDERS = new Set([
	'start_sku',
	'starting_sku',
	'target_sku',
	'add_proposed_seat',
	'seats',
	'expiring_arr',
	'actual_price_per_user',
	'per_user_after_promo_price',
	'promo_savings_per_user',
	'actual_cost_per_user_monthly',
	'cost_after_promo_monthly',
	'promo_savings_percent',
	'overall_incremental_cost',
	'incremental_cost_per_user',
	'current_incentive',
	'new_incentive',
]);

const LEGACY_FLYER_PATH_ALIASES: Record<string, string[]> = {
	'multiple_renewals/first_page.pptx': ['multiple_renewals/First page.pptx'],
	'multiple_renewals/last_page.pptx': ['multiple_renewals/Last page.pptx'],
	'multiple_renewals/bs_or_bp_and_cb.pptx': [
		'multiple_renewals/Flyer - Copilot Business + BS or BP.pptx',
	],
	'multiple_renewals/bp_and_cb_and_purview.pptx': [
		'multiple_renewals/Flyer - Copilot Business + BP + Purview.pptx',
	],
	'multiple_renewals/defender_suite.pptx': [
		'multiple_renewals/Flyer - Defender Suite.pptx',
	],
	'multiple_renewals/purview_suite.pptx': [
		'multiple_renewals/Flyer - Purview Suite.pptx',
	],
	'multiple_renewals/defender_and_purview_suite.pptx': [
		'multiple_renewals/Flyer - Defender + Purview Suite.pptx',
	],
	'multiple_renewals/investment_ai.pptx': [
		'multiple_renewals/Investment - AI.pptx',
	],
	'multiple_renewals/investment_security.pptx': [
		'multiple_renewals/Investment - Security.pptx',
	],
};

function slugify(value: string): string {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return slug.length > 0 ? slug : 'value';
}

function formatNumber(value: number): string {
	return Math.max(0, Math.floor(value)).toLocaleString('en-US');
}

interface CurrencyFormatOptions {
	currencySymbol?: string;
	locale?: string;
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
		regionCountry: pricingContext.regionCountry,
		currency: pricingContext.currency,
		currencySymbol: pricingContext.currencySymbol,
		locale: pricingContext.locale,
		fallbackApplied: pricingContext.fallbackApplied,
		fallbackReason: pricingContext.fallbackReason,
	};
}

function resolveEffectiveStartingSku(
	startingSku: StartingSku,
	scenarioPayload: {
		originalSeats: number;
		expiringArr: number;
		expiringSkuRenewalPrice?: number;
	},
): StartingSku {
	if (startingSku.id === 'other' && scenarioPayload.originalSeats > 0) {
		return {
			...startingSku,
			monthlyPrice:
				scenarioPayload.expiringSkuRenewalPrice ??
				scenarioPayload.expiringArr / scenarioPayload.originalSeats / 12,
		};
	}
	return startingSku;
}

function normalizeFlyerPlaceholderName(raw: string): string {
	const trimmed = raw
		.replace(/\u200b/g, '')
		.replace(/^\[|\]$/g, '')
		.replace(/^\{|\}$/g, '')
		.trim()
		.toLowerCase();

	if (trimmed === '#' || trimmed === '# seats' || trimmed === 'seats') {
		return 'seats';
	}

	const normalized = trimEdgeChars(
		trimmed.replace(/^add\s+/, 'add_').replace(/[^a-z0-9]+/g, '_'),
		'_',
	);

	return normalized;
}

// Linear-time replacement for `/^_+|_+$/g`-style trims, whose trailing
// alternative backtracks polynomially on adversarial input.
function trimEdgeChars(value: string, char: string): string {
	let start = 0;
	let end = value.length;
	while (start < end && value[start] === char) {
		start += 1;
	}
	while (end > start && value[end - 1] === char) {
		end -= 1;
	}
	return value.slice(start, end);
}

function extractFlyerTemplateTokens(value: string): string[] {
	const matches = value.match(
		/\{[A-Za-z][A-Za-z0-9_ ]+\}|\[[A-Za-z][A-Za-z0-9 _#-]+\]/g,
	);
	return matches ?? [];
}

function extractFlyerTemplateTokensFromDrawingXml(xml: string): string[] {
	const runs = collectDrawingTextRuns(xml);
	if (runs.length === 0) {
		return extractFlyerTemplateTokens(xml);
	}

	const tokens: string[] = [];
	for (let i = 0; i < runs.length; i += 1) {
		let combined = runs[i].text;
		let j = i;

		while (j < runs.length - 1 && hasUnclosedPlaceholder(combined)) {
			j += 1;
			combined += runs[j].text;
		}

		tokens.push(...extractFlyerTemplateTokens(combined));
		i = j;
	}

	return tokens;
}

function decodeXmlText(value: string): string {
	// Decode `&amp;` last so `&amp;lt;` yields the literal text `&lt;`
	// instead of being double-decoded into `<`.
	return value
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'")
		.replaceAll('&amp;', '&');
}

function escapeXmlText(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

interface TextRun {
	text: string;
	start: number;
	end: number;
}

function collectDrawingTextRuns(xml: string): TextRun[] {
	const pattern = /<a:t>([\s\S]*?)<\/a:t>/g;
	const runs: TextRun[] = [];

	let match = pattern.exec(xml);
	while (match) {
		const fullMatch = match[0];
		const innerText = match[1] ?? '';
		const fullStart = match.index;
		const textStart = fullStart + fullMatch.indexOf(innerText);
		const textEnd = textStart + innerText.length;

		runs.push({
			text: decodeXmlText(innerText),
			start: textStart,
			end: textEnd,
		});

		match = pattern.exec(xml);
	}

	return runs;
}

function hasUnclosedPlaceholder(text: string): boolean {
	const lastBracketOpen = text.lastIndexOf('[');
	if (lastBracketOpen >= 0 && text.indexOf(']', lastBracketOpen) < 0) {
		return true;
	}

	const lastBraceOpen = text.lastIndexOf('{');
	if (lastBraceOpen >= 0 && text.indexOf('}', lastBraceOpen) < 0) {
		return true;
	}

	return false;
}

function replaceFlyerPlaceholdersInText(
	value: string,
	replacements: Record<string, string>,
): string {
	return value.replace(/(\[[^\]]+\]|\{[^}]+\})/g, (token) => {
		const normalized = normalizeFlyerPlaceholderName(token);

		if (!normalized) {
			return token;
		}

		if (normalized === 'partner_name') {
			return MANUAL_PARTNER_PLACEHOLDER;
		}

		if (normalized === 'instruction_for_the_partner') {
			return MANUAL_INSTRUCTION_PLACEHOLDER;
		}

		if (normalized === 'note_please_delete_before_sending_to_the_customer') {
			return token;
		}

		const replacement = replacements[normalized];
		if (replacement !== undefined) {
			return replacement;
		}

		return `{${normalized}}`;
	});
}

function hydratePptXmlText(
	xml: string,
	replacements: Record<string, string>,
): string {
	const runs = collectDrawingTextRuns(xml);
	if (runs.length === 0) return xml;

	for (let i = 0; i < runs.length; i += 1) {
		let combined = runs[i].text;
		let j = i;

		while (hasUnclosedPlaceholder(combined) && j + 1 < runs.length) {
			j += 1;
			combined += runs[j].text;
		}

		if (j > i) {
			const replaced = replaceFlyerPlaceholdersInText(combined, replacements);
			const parts = splitByRunBoundaries(replaced, runs, i, j);

			for (let k = i; k <= j; k += 1) {
				runs[k].text = parts[k - i] ?? '';
			}
		} else {
			runs[i].text = replaceFlyerPlaceholdersInText(runs[i].text, replacements);
		}
	}

	let result = '';
	let cursor = 0;
	for (const run of runs) {
		result += xml.slice(cursor, run.start);
		result += escapeXmlText(run.text);
		cursor = run.end;
	}
	result += xml.slice(cursor);
	return result;
}

function splitByRunBoundaries(
	replaced: string,
	runs: TextRun[],
	startIdx: number,
	endIdx: number,
): string[] {
	const parts: string[] = [];
	const originalLengths: number[] = [];
	for (let k = startIdx; k <= endIdx; k += 1) {
		originalLengths.push(runs[k].text.length);
	}
	const totalOriginal = originalLengths.reduce((a, b) => a + b, 0);

	if (replaced.length <= totalOriginal) {
		let offset = 0;
		for (let k = 0; k < originalLengths.length; k += 1) {
			if (k === originalLengths.length - 1) {
				parts.push(replaced.slice(offset));
			} else {
				parts.push(replaced.slice(offset, offset + originalLengths[k]));
				offset += originalLengths[k];
			}
		}
	} else {
		parts.push(replaced);
		for (let k = 1; k < originalLengths.length; k += 1) {
			parts.push('');
		}
	}

	return parts;
}

export interface GenerateSolutionZipParams {
	journey: 'renewal' | 'new_customer';
	customerId: string;
	customerName: string;
	opportunityId: string;
	startingSkuId: string;
	startingSkuName: string;
	endingSkuId: string;
	seats: number;
	expiringArr: number;
	expiringSkuRenewalPrice?: number;
	region?: string;
	currency?: RegionalCurrencyCode;
}

@Injectable()
export class ProposalAssetService {
	private readonly env = getEnv();
	private readonly flyerTemplateCache = new Map<string, Buffer>();

	constructor(
		private readonly blobStorageService: BlobStorageService,
		@Inject(forwardRef(() => ProposalOptionsEmailService))
		private readonly proposalOptionsEmailService: ProposalOptionsEmailService,
	) {}

	async generateSolutionZip(
		params: GenerateSolutionZipParams,
	): Promise<{ endingSkuId: string; documentsZipUrl: string }> {
		const endingSku = ENDING_SKU_BY_ID.get(params.endingSkuId);
		if (!endingSku) {
			throw new UnprocessableEntityException(
				`Unknown ending SKU "${params.endingSkuId}"`,
			);
		}

		// 1. Build the hydrated flyer PPTX
		const flyerBuffer = await this.buildHydratedFlyer(params);

		// 2. Render the customer email DOCX
		const emailBuffer = await this.renderCustomerEmail(params);

		// 3. Bundle into a ZIP
		const zipBuffer = this.buildZip({
			solutionName: endingSku.name,
			flyerBuffer,
			emailBuffer,
		});

		// 4. Upload the ZIP to blob storage
		const blobName = [
			'proposal-options/documents',
			slugify(params.customerId),
			slugify(params.opportunityId),
			`${Date.now()}-${slugify(params.endingSkuId)}.zip`,
		].join('/');

		const documentsZipUrl = await this.blobStorageService.upload(
			this.env.azureStorageContainerName,
			blobName,
			zipBuffer,
			'application/zip',
		);

		return { endingSkuId: params.endingSkuId, documentsZipUrl };
	}

	private async buildHydratedFlyer(
		params: GenerateSolutionZipParams,
	): Promise<Buffer> {
		const flyerRelativePath = resolveProposalFlyerTemplatePath({
			journey: params.journey,
			startingSkuId: params.startingSkuId as StartingSkuId,
			endingSkuId: params.endingSkuId,
		});
		if (!flyerRelativePath) {
			throw new UnprocessableEntityException(
				`No flyer template mapping found for ${params.journey}:${params.startingSkuId}:${params.endingSkuId}`,
			);
		}

		const sourceBuffer = await this.loadFlyerTemplateBuffer(flyerRelativePath);
		const replacements = this.buildFlyerPlaceholderValues(params);
		const flyerBuffer = this.hydrateFlyerTemplateBuffer(
			sourceBuffer,
			replacements,
			{ strictValidation: true },
		);
		const disclaimerSourceBuffer = await this.loadFlyerTemplateBuffer(
			SINGLE_PROPOSAL_DISCLAIMER_PATH,
		);
		const disclaimerBuffer = this.hydrateFlyerTemplateBuffer(
			disclaimerSourceBuffer,
			replacements,
			{ strictValidation: true },
		);
		return this.proposalOptionsEmailService.mergePptDecks([
			flyerBuffer,
			disclaimerBuffer,
		]);
	}

	private async renderCustomerEmail(
		params: GenerateSolutionZipParams,
	): Promise<Buffer> {
		const endingSku = ENDING_SKU_BY_ID.get(params.endingSkuId);
		if (!endingSku) {
			throw new UnprocessableEntityException(
				`Unknown ending SKU "${params.endingSkuId}"`,
			);
		}

		const variant =
			endingSku.upgradeType === UpgradeType.AI ? 'ai' : 'security';
		const templatePath =
			params.journey === 'new_customer'
				? `/email_templates/customer/new_customer/single_solution/${variant}.docx`
				: `/email_templates/customer/renewal/single_solution_renewal/${variant}.docx`;
		const pricingContext = buildRegionalPricingContext({
			region: params.region,
			currencyOverride: params.currency,
		});

		const payload: CustomerProposalEmailPayload = {
			templatePath,
			journey: params.journey,
			customerId: params.customerId,
			customerName: params.customerName,
			pricingContext: toPricingContextPayload(pricingContext),
			scenarios: [
				{
					opportunityId: params.opportunityId,
					startingSkuId: params.startingSkuId as never,
					startingSkuName: params.startingSkuName,
					endingSkuId: params.endingSkuId,
					selectedSeats: params.seats,
					originalSeats: params.seats,
					expiringArr: params.expiringArr,
					region: params.region?.trim() ?? '',
				},
			],
		};

		const templateBuffer = await this.loadTemplateBuffer(payload.templatePath);
		const zip = new PizZip(templateBuffer);
		const doc = new Docxtemplater(zip, {
			paragraphLoop: true,
			linebreaks: true,
		});

		doc.render(this.buildCustomerProposalTemplateValues(payload));

		return doc.getZip().generate({
			type: 'nodebuffer',
			mimeType: DOCX_CONTENT_TYPE,
		});
	}

	private buildZip(params: {
		solutionName: string;
		flyerBuffer: Buffer;
		emailBuffer: Buffer;
	}): Buffer {
		const zip = new PizZip();
		zip.file(`${params.solutionName}.pptx`, params.flyerBuffer);
		zip.file(`${params.solutionName}.docx`, params.emailBuffer);
		return zip.generate({ type: 'nodebuffer' });
	}

	// --- Flyer template helpers ---

	private resolveFlyerSourcePath(relativePath: string): string {
		const fullPath = path.resolve(this.env.proposalFlyersDir, relativePath);
		const root = path.resolve(this.env.proposalFlyersDir);
		if (!fullPath.startsWith(root + path.sep)) {
			throw new UnprocessableEntityException(
				'Flyer path traversal is not allowed',
			);
		}
		return fullPath;
	}

	private async loadFlyerTemplateBuffer(relativePath: string): Promise<Buffer> {
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

	private hydrateFlyerTemplateBuffer(
		sourceBuffer: Buffer,
		replacements: Record<string, string>,
		options?: { strictValidation?: boolean },
	): Buffer {
		const zip = new PizZip(sourceBuffer);
		const entries = Object.keys(zip.files);
		const targetEntryRegexes = [
			/^ppt\/slides\/slide\d+\.xml$/,
			/^ppt\/notesSlides\/notesSlide\d+\.xml$/,
		];

		for (const entryPath of entries) {
			if (!targetEntryRegexes.some((pattern) => pattern.test(entryPath))) {
				continue;
			}

			const entry = zip.file(entryPath);
			if (!entry) continue;

			const originalXml = entry.asText();
			if (options?.strictValidation) {
				this.assertFlyerPlaceholdersResolvable(originalXml, replacements);
			}
			const hydratedXml = hydratePptXmlText(originalXml, replacements);
			if (hydratedXml !== originalXml) {
				zip.file(entryPath, hydratedXml);
			}
		}

		return zip.generate({
			type: 'nodebuffer',
			mimeType: PPTX_CONTENT_TYPE,
		});
	}

	private assertFlyerPlaceholdersResolvable(
		xml: string,
		replacements: Record<string, string>,
	): void {
		const tokens = extractFlyerTemplateTokensFromDrawingXml(xml);

		for (const token of tokens) {
			const normalized = normalizeFlyerPlaceholderName(token);
			if (!normalized) continue;
			if (
				normalized === 'partner_name' ||
				normalized === 'instruction_for_the_partner' ||
				normalized === 'note_please_delete_before_sending_to_the_customer'
			) {
				continue;
			}

			if (!ALLOWED_FLYER_PLACEHOLDERS.has(normalized)) {
				throw new UnprocessableEntityException(
					`Unsupported flyer placeholder "${token}"`,
				);
			}

			if (replacements[normalized] === undefined) {
				throw new UnprocessableEntityException(
					`Missing flyer placeholder value for "${normalized}"`,
				);
			}
		}
	}

	private buildFlyerPlaceholderValues(
		params: GenerateSolutionZipParams,
	): Record<string, string> {
		const rawStartingSku = STARTING_SKU_BY_ID.get(params.startingSkuId);
		if (!rawStartingSku) {
			throw new UnprocessableEntityException(
				`Unknown starting SKU "${params.startingSkuId}"`,
			);
		}

		const pricingContext = buildRegionalPricingContext({
			region: params.region,
			currencyOverride: params.currency,
		});
		const endingSku =
			getValidUpgradePaths(params.startingSkuId, {
				region: params.region,
				country: pricingContext.country,
			}).find((candidate) => candidate.id === params.endingSkuId) ??
			ENDING_SKU_BY_ID.get(params.endingSkuId);
		if (!endingSku) {
			throw new UnprocessableEntityException(
				`Unknown ending SKU "${params.endingSkuId}"`,
			);
		}

		const startingSku = resolveEffectiveStartingSku(rawStartingSku, {
			originalSeats: params.seats,
			expiringArr: params.expiringArr,
			expiringSkuRenewalPrice: params.expiringSkuRenewalPrice,
		});
		const seats = Math.max(0, Math.floor(params.seats));
		const scenario = calculateScenario(startingSku, endingSku, seats, {
			journey: params.journey,
			expiringArr: params.expiringArr,
			originalSeats: params.seats,
			// Unified seat policy: current and target legs both use the
			// partner-edited proposal seats.
			currentSeats: seats,
			region: params.region,
			country: pricingContext.country,
		});
		const incrementalPerUserAnnual = computeIncrementalCostPerUserAnnual({
			offerAnnualValue: scenario.offerAnnualValue,
			currentAnnualValue: scenario.currentAnnualValue,
			seats,
		});
		const actualPricePerUserAnnual =
			seats > 0
				? scenario.listAnnualValue / seats
				: roundCurrency(endingSku.listPrice * 12);
		const afterPromoPerUserAnnual = roundCurrency(endingSku.promoPrice * 12);
		const promoSavingsPerUserAnnual = roundCurrency(
			(endingSku.listPrice - endingSku.promoPrice) * 12,
		);
		// Monthly tile values come from regional-pricing.ts. `endingSku` was
		// resolved via getValidUpgradePaths with `pricingContext.country`, which
		// buildRegionalPricingContext already flips to the override currency's
		// country when a currency override is set — so listPrice/promoPrice are
		// already in `pricingContext.currency`. No further conversion needed.
		const actualCostPerUserMonthly = roundCurrency(endingSku.listPrice);
		const afterPromoPerUserMonthly = roundCurrency(endingSku.promoPrice);
		const promoSavingsPercent =
			endingSku.listPrice > 0
				? Math.round(
						((endingSku.listPrice - endingSku.promoPrice) /
							endingSku.listPrice) *
							100,
					)
				: 0;
		const currencyFormat = toCurrencyFormatOptions(pricingContext);

		return {
			start_sku: params.startingSkuName,
			starting_sku: params.startingSkuName,
			target_sku: endingSku.name,
			add_proposed_seat: formatNumber(seats),
			seats: formatNumber(seats),
			expiring_arr: formatCurrency(params.expiringArr, currencyFormat),
			actual_price_per_user: formatCurrency(
				actualPricePerUserAnnual,
				currencyFormat,
			),
			per_user_after_promo_price: formatCurrency(
				afterPromoPerUserAnnual,
				currencyFormat,
			),
			promo_savings_per_user: formatCurrency(
				promoSavingsPerUserAnnual,
				currencyFormat,
			),
			actual_cost_per_user_monthly: formatCurrency(
				actualCostPerUserMonthly,
				currencyFormat,
			),
			cost_after_promo_monthly: formatCurrency(
				afterPromoPerUserMonthly,
				currencyFormat,
			),
			promo_savings_percent: `~${promoSavingsPercent}%`,
			overall_incremental_cost: formatCurrency(
				scenario.incrementalCost,
				currencyFormat,
			),
			incremental_cost_per_user: formatCurrency(
				incrementalPerUserAnnual,
				currencyFormat,
			),
			current_incentive: formatCurrency(
				scenario.economics.currentIncentive,
				currencyFormat,
			),
			new_incentive: formatCurrency(
				scenario.economics.totalIncentive,
				currencyFormat,
			),
		};
	}

	// --- Customer email helpers ---

	private async loadTemplateBuffer(templatePath: string): Promise<Buffer> {
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

	private buildCustomerProposalTemplateValues(
		payload: CustomerProposalEmailPayload,
	): Record<string, string> {
		const scenarioValues = payload.scenarios.map((scenario) =>
			this.buildCustomerProposalScenarioValues(scenario, payload),
		);
		const firstScenario = scenarioValues[0];

		const keys = [
			'start_sku',
			'target_sku',
			'end_sku',
			'solution_details',
			'solution_capabilities',
			'tagline',
			'one_liner',
			'selected_seats',
			'original_seats',
			'expiring_arr',
			'actual_price_per_user',
			'per_user_after_promo_price',
			'promo_savings_per_user',
			'overall_incremental_cost',
			'incremental_cost_per_user',
		] as const;

		const data: Record<string, string> = {
			customer_name: payload.customerName,
			solution_count: String(payload.scenarios.length),
			start_sku: firstScenario?.start_sku ?? '',
			target_sku: firstScenario?.target_sku ?? '',
			end_sku: firstScenario?.end_sku ?? '',
			solution_details: firstScenario?.solution_details ?? '',
			solution_capabilities: firstScenario?.solution_capabilities ?? '',
			tagline: firstScenario?.tagline ?? '',
			one_liner: firstScenario?.one_liner ?? '',
			selected_seats: firstScenario?.selected_seats ?? '',
			original_seats: firstScenario?.original_seats ?? '',
			expiring_arr: firstScenario?.expiring_arr ?? '',
			actual_price_per_user: firstScenario?.actual_price_per_user ?? '',
			per_user_after_promo_price:
				firstScenario?.per_user_after_promo_price ?? '',
			promo_savings_per_user: firstScenario?.promo_savings_per_user ?? '',
			overall_incremental_cost: firstScenario?.overall_incremental_cost ?? '',
			incremental_cost_per_user: firstScenario?.incremental_cost_per_user ?? '',
		};

		const maxScenarios = 3;
		for (let slot = 0; slot < maxScenarios; slot += 1) {
			const values = scenarioValues[slot];
			for (const key of keys) {
				data[`${key}_${slot + 1}`] = values?.[key] ?? '';
			}
		}

		return data;
	}

	private buildCustomerProposalScenarioValues(
		scenarioPayload: CustomerProposalEmailScenarioPayload,
		payload: Pick<CustomerProposalEmailPayload, 'journey' | 'pricingContext'>,
	): Record<string, string> {
		const pricingContext =
			payload.pricingContext != null
				? buildRegionalPricingContext({
						region: payload.pricingContext.region,
						country: payload.pricingContext.country,
						currencyOverride: payload.pricingContext.currency,
					})
				: buildRegionalPricingContext({
						region: scenarioPayload.region,
					});
		const currencyFormat = toCurrencyFormatOptions(pricingContext);
		const rawStartingSku = STARTING_SKU_BY_ID.get(
			scenarioPayload.startingSkuId,
		);
		if (!rawStartingSku) {
			throw new UnprocessableEntityException(
				`Unknown starting SKU "${scenarioPayload.startingSkuId}"`,
			);
		}

		const endingSku =
			getValidUpgradePaths(scenarioPayload.startingSkuId, {
				region: scenarioPayload.region,
				country: pricingContext.country,
			}).find((candidate) => candidate.id === scenarioPayload.endingSkuId) ??
			ENDING_SKU_BY_ID.get(scenarioPayload.endingSkuId);
		if (!endingSku) {
			throw new UnprocessableEntityException(
				`Unknown ending SKU "${scenarioPayload.endingSkuId}"`,
			);
		}

		const startingSku = resolveEffectiveStartingSku(
			rawStartingSku,
			scenarioPayload,
		);
		const selectedSeats = Math.max(
			0,
			Math.floor(scenarioPayload.selectedSeats),
		);
		const computed = calculateScenario(startingSku, endingSku, selectedSeats, {
			journey: payload.journey,
			expiringArr: scenarioPayload.expiringArr,
			originalSeats: scenarioPayload.originalSeats,
			// Unified seat policy: current and target legs both use the
			// partner-edited proposal seats so the previewed slide matches the
			// proposal page (and the email/PDF) rather than DB seats.
			currentSeats: selectedSeats,
			region: scenarioPayload.region,
			country: pricingContext.country,
		});
		const solutionCapabilities =
			endingSku.solutionCapabilities ?? endingSku.planHighlights;
		const actualPricePerUserAnnual =
			selectedSeats > 0
				? computed.listAnnualValue / selectedSeats
				: roundCurrency(endingSku.listPrice * 12);
		const afterPromoPerUserAnnual = roundCurrency(endingSku.promoPrice * 12);
		const promoSavingsPerUserAnnual = roundCurrency(
			(endingSku.listPrice - endingSku.promoPrice) * 12,
		);
		const incrementalPerUserAnnual = computeIncrementalCostPerUserAnnual({
			offerAnnualValue: computed.offerAnnualValue,
			currentAnnualValue: computed.currentAnnualValue,
			seats: selectedSeats,
		});

		return {
			start_sku: scenarioPayload.startingSkuName,
			target_sku: endingSku.name,
			end_sku: endingSku.name,
			solution_details: this.formatBulletLines(endingSku.solutionCapabilities),
			solution_capabilities: this.formatBulletLines(solutionCapabilities),
			tagline: endingSku.tagline,
			one_liner: endingSku.oneLiner,
			selected_seats: formatNumber(selectedSeats),
			// Unified seat policy: render the user-edited proposal seats so the
			// preview's "# Seats" matches the "# Proposed seats for upgrade".
			original_seats: formatNumber(selectedSeats),
			expiring_arr: formatCurrency(scenarioPayload.expiringArr, currencyFormat),
			actual_price_per_user: formatCurrency(
				actualPricePerUserAnnual,
				currencyFormat,
			),
			per_user_after_promo_price: formatCurrency(
				afterPromoPerUserAnnual,
				currencyFormat,
			),
			promo_savings_per_user: formatCurrency(
				promoSavingsPerUserAnnual,
				currencyFormat,
			),
			overall_incremental_cost: formatCurrency(
				computed.incrementalCost,
				currencyFormat,
			),
			incremental_cost_per_user: formatCurrency(
				incrementalPerUserAnnual,
				currencyFormat,
			),
		};
	}

	private formatBulletLines(values: string[] | null | undefined): string {
		if (!Array.isArray(values)) {
			return '';
		}
		const normalized = values
			.map((value) => value.trim())
			.filter((value) => value.length > 0);
		if (normalized.length === 0) {
			return '';
		}
		return normalized.map((value) => `• ${value}`).join('\n');
	}
}
