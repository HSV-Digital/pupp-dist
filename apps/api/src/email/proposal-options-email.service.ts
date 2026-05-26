import path from 'node:path';
import crypto from 'node:crypto';
import {
	Inject,
	Injectable,
	InternalServerErrorException,
	Logger,
	Optional,
	UnauthorizedException,
	UnprocessableEntityException,
	forwardRef,
} from '@nestjs/common';
import {
	ENDING_SKUS,
	ENDING_SKU_BY_ID,
	OPPORTUNITY_LIST_SKU_BEST_FOR,
	STARTING_SKU_BY_ID,
	allocateScenarioBaselines,
	buildRegionalPricingContext,
	buildRegionalPricingContextForRegions,
	calculateScenarioFromExplicitPrices,
	computeIncrementalCostPerUserAnnual,
	deriveResellerPriceFromMargin,
	getDefaultTargetSkuMarginPercent,
	getValidUpgradePaths,
	roundCurrency,
	resolveProposalFlyerTemplatePath,
	type ProposalOptionsJourney,
	type RegionalCurrencyCode,
	type RegionalPricingContext,
	type StartingSkuId,
} from '@repo/shared';
import type {
	PartnerFiltersPayload,
	RenewalSubscription,
	StartingSku,
} from '@repo/types';
import {
	SkuCategory,
	UpgradeType,
	isIncentiveEligibleFromFilters,
} from '@repo/types';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { CreateCustomerProposalEmailLinkDto } from './dto/create-customer-proposal-email-link.dto';
import type { CreateProposalPptSessionDto } from './dto/create-proposal-ppt-session.dto';
import type { UploadProposalPptsDto } from './dto/upload-proposal-ppts.dto';
import type { CreateOpportunityListEmailLinkDto } from './dto/create-opportunity-list-email-link.dto';
import type { CreateProposalOptionsEmailLinkPayloadDto } from './dto/create-proposal-options-email-link.dto';
import { ProposalEmailAssetMapperService } from './services/proposal-email-asset-mapper.service';
import { ProposalEmailDocxUtilsService } from './services/proposal-email-docx-utils.service';
import { ProposalEmailLinkWorkflowService } from './services/proposal-email-link-workflow.service';
import { ProposalEmailTemplateService } from './services/proposal-email-template.service';
import { ProposalEmailTemplateLoaderService } from './services/proposal-email-template-loader.service';
import { ProposalOptionsWorkflowService } from './services/proposal-options-workflow.service';
import { AdminAnalyticsDownloadTrackingService } from '../admin-analytics/admin-analytics-download-tracking.service';
import { BlobStorageService } from '../blob-storage/blob-storage.service';
import { getEnv } from '../config/env';
import { DlTokenService } from '../pdf/dl-token.service';
import { ProposalAssetService } from '../proposal-asset/proposal-asset.service';
import type {
	CustomerProposalEmailPayload,
	CustomerProposalEmailScenarioPayload,
	OpportunityListEmailSolution,
	PdfFiltersPayload,
	PdfSortPayload,
	ProposalAssetsBundlePayload,
	ProposalPptPayload,
	ProposalPptScenarioPayload,
	PricingContextPayload,
} from '../pdf/types/dl-token.types';

const DOCX_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const ZIP_CONTENT_TYPE = 'application/zip';

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

const PARTNER_PROPOSAL_UPLOAD_LINK_TOKEN = '__PARTNER_PROPOSAL_UPLOAD_LINK__';
const PARTNER_PROPOSAL_BOM_LINK_TOKEN = '__PARTNER_PROPOSAL_BOM_LINK__';
const MANUAL_PARTNER_PLACEHOLDER = '[PARTNER NAME]';
const MANUAL_INSTRUCTION_PLACEHOLDER = '[INSTRUCTION FOR THE PARTNER]';
const PROPOSAL_PPT_MAX_SCENARIOS = 50;
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
const MULTI_RENEWAL_INVESTMENT_AI_NEW_CUSTOMER =
	'multiple_renewals/investment_ai_new_customer.pptx';
const MULTI_RENEWAL_INVESTMENT_SECURITY_NEW_CUSTOMER =
	'multiple_renewals/investment_security_new_customer.pptx';
const MULTI_RENEWAL_INVESTMENT_AI_PATHS = new Set<string>([
	MULTI_RENEWAL_INVESTMENT_AI,
	MULTI_RENEWAL_INVESTMENT_AI_NEW_CUSTOMER,
]);
const MULTI_RENEWAL_INVESTMENT_SECURITY_PATHS = new Set<string>([
	MULTI_RENEWAL_INVESTMENT_SECURITY,
	MULTI_RENEWAL_INVESTMENT_SECURITY_NEW_CUSTOMER,
]);
const MULTI_RENEWAL_INVESTMENT_SUMMARY_PAGE =
	'multiple_renewals/Investment_summary_page.pptx';
const MULTI_RENEWAL_DISCLAIMER_CONSOLIDATED =
	'multiple_renewals/disclaimer_consolidated.pptx';
const SINGLE_PROPOSAL_DISCLAIMER = 'multiple_renewals/Disclaimer page.pptx';
const CHAT_TO_PAID_FLYER_SUBDIR = 'Copilot Chat';

// Multi-renewal templates that should NOT be swapped to the Copilot Chat
// variant. The investment summary page does not exist in the Copilot Chat
// folder, and the disclaimer slides are intentionally kept from the standard
// folder so the disclaimer continues to be appended unchanged. The new-
// customer investment variants have no Copilot Chat sibling either.
const MULTI_RENEWAL_NON_SWAPPABLE_PATHS = new Set<string>([
	MULTI_RENEWAL_INVESTMENT_SUMMARY_PAGE,
	MULTI_RENEWAL_DISCLAIMER_CONSOLIDATED,
	SINGLE_PROPOSAL_DISCLAIMER,
	MULTI_RENEWAL_INVESTMENT_AI_NEW_CUSTOMER,
	MULTI_RENEWAL_INVESTMENT_SECURITY_NEW_CUSTOMER,
]);

function resolveMultiRenewalLoadPath(
	relativePath: string,
	useChatToPaidFlyers?: boolean,
): string {
	if (!useChatToPaidFlyers) return relativePath;
	if (MULTI_RENEWAL_NON_SWAPPABLE_PATHS.has(relativePath)) return relativePath;
	return `${CHAT_TO_PAID_FLYER_SUBDIR}/${relativePath}`;
}

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

const PPT_PRESENTATION_XML_PATH = 'ppt/presentation.xml';
const PPT_PRESENTATION_RELS_XML_PATH = 'ppt/_rels/presentation.xml.rels';
const PPT_CONTENT_TYPES_XML_PATH = '[Content_Types].xml';
const PPT_APP_XML_PATH = 'docProps/app.xml';
const PPT_SLIDE_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const PPT_RELATIONSHIP_TYPE_SLIDE =
	'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide';
const PPT_RELATIONSHIP_TYPE_SLIDE_MASTER =
	'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster';
const PPT_RELATIONSHIP_TYPE_SLIDE_LAYOUT =
	'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';
const PPT_RELATIONSHIP_TYPE_NOTES_MASTER =
	'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster';
const PPT_RELATIONSHIP_TYPE_CHANGES_INFO =
	'http://schemas.microsoft.com/office/2016/11/relationships/changesInfo';
const PPT_SLIDE_MASTER_PART_PREFIX = 'ppt/slideMasters/';
const PPT_NOTES_MASTER_PART_PREFIX = 'ppt/notesMasters/';
const PPT_CHANGES_INFO_PART_PREFIX = 'ppt/changesInfos/';
const PPT_MEDIA_PART_PREFIX = 'ppt/media/';
const PPT_SLIDE_MASTER_ID_BASE = 2_147_483_648;

type CanonicalPptPartCategory =
	| 'slide_layout'
	| 'slide_master'
	| 'notes_slide'
	| 'notes_master';

interface CanonicalPptPartType {
	category: CanonicalPptPartCategory;
	regex: RegExp;
	directory: string;
	prefix: string;
}

const CANONICAL_PPT_PART_TYPES: readonly CanonicalPptPartType[] = [
	{
		category: 'slide_layout',
		regex: /^ppt\/slideLayouts\/slideLayout\d+\.xml$/,
		directory: 'ppt/slideLayouts',
		prefix: 'slideLayout',
	},
	{
		category: 'slide_master',
		regex: /^ppt\/slideMasters\/slideMaster\d+\.xml$/,
		directory: 'ppt/slideMasters',
		prefix: 'slideMaster',
	},
	{
		category: 'notes_slide',
		regex: /^ppt\/notesSlides\/notesSlide\d+\.xml$/,
		directory: 'ppt/notesSlides',
		prefix: 'notesSlide',
	},
	{
		category: 'notes_master',
		regex: /^ppt\/notesMasters\/notesMaster\d+\.xml$/,
		directory: 'ppt/notesMasters',
		prefix: 'notesMaster',
	},
];

interface DocxHyperlinkTarget {
	token: string;
	url: string;
	displayText: string;
}

interface PartnerProposalScenarioValues {
	starting_sku: string;
	target_sku: string;
	solution_overview: string;
	seats: string;
	proposed_seat: string;
	expiring_arr: string;
	after_promo_price: string;
	incremental_cost: string;
	current_incentive: string;
	new_incentive: string;
	incrementalCostPerUserAnnual: string;
	incrementalIncentive: string;
}

interface TextRun {
	text: string;
	start: number;
	end: number;
}

interface PptContentTypesIndex {
	defaults: Map<string, string>;
	overrides: Map<string, string>;
}

interface MergeDependencyCopyState {
	sourceZip: PizZip;
	baseZip: PizZip;
	sourceContentTypes: PptContentTypesIndex;
	copiedParts: Map<string, string>;
	existingPaths: Set<string>;
	contentTypesState: { value: string };
	nextCanonicalPartIndexByCategory: Map<CanonicalPptPartCategory, number>;
	primaryNotesMasterPath: string | null;
	deckToken: string;
	mediaPartPathByHash: Map<string, string>;
}

interface MergedPptXmlState {
	presentationXml: string;
	presentationRelsXml: string;
	contentTypesXml: string;
}

export interface UploadedImageFile {
	originalname: string;
	mimetype: string;
	size: number;
	buffer: Buffer;
}

export interface ProposalAssetSelectionInput {
	opportunityId: string;
	endingSkuId: string;
	seats: number;
	currentSkuCustomerPrice?: number;
	currentSkuResellerPrice?: number;
	targetSkuCustomerPrice?: number;
	targetSkuResellerPrice?: number;
	expiringSkuRenewalPrice?: number;
	targetSkuPrice?: number;
	targetSkuMarginPercent?: number;
}

export interface ProposalAssetsSummary {
	currentAnnual: number;
	listAnnual: number;
	offerAnnual: number;
	promoSavings: number;
	incrementalCost: number;
	incrementalIncentive: number;
}

export interface ProposalAssetsLineItemMeta {
	opportunityId: string;
	endingSkuId: string;
	selectedSeats: number;
	label: string;
	fileName: string;
	status: 'not_generated';
}

export interface ProposalSelectedScenario {
	opportunityId: string;
	startingSkuId: StartingSkuId;
	startingSkuName: string;
	endingSkuId: string;
	selectedSeats: number;
	originalSeats: number;
	expiringArr: number;
	currentSkuCustomerPrice?: number;
	currentSkuResellerPrice?: number;
	targetSkuCustomerPrice?: number;
	targetSkuResellerPrice?: number;
	expiringSkuRenewalPrice?: number;
	targetSkuPrice?: number;
	expiringSeatCount: number;
	region?: string;
	distributorName?: string;
	resellerName?: string;
	pssAIWorkforceName?: string;
	pssAISecurityName?: string;
	pdmName?: string;
	pmmName?: string;
	subscriptionType?: string;
}

export interface ProposalLineItemScenario {
	opportunityId: string;
	startingSkuId: StartingSkuId;
	startingSkuName: string;
	endingSkuId: string;
	selectedSeats: number;
}

export interface ProposalAssetsLoadResponse {
	customer: {
		customerId: string;
		customerName: string;
	};
	selectedScenarios: ProposalSelectedScenario[];
	summary: ProposalAssetsSummary;
	pricingContext: PricingContextPayload;
	assets: {
		consolidated: {
			blobUrl: string;
			fileName: string;
		} | null;
		lineItems: ProposalAssetsLineItemMeta[];
		bundleDownloadUrl: string;
		uploadedAt: string;
	};
}

export interface ProposalAssetLineItemResponse {
	opportunityId: string;
	endingSkuId: string;
	selectedSeats: number;
	label: string;
	fileName: string;
	blobUrl: string;
	uploadedAt: string;
}

export interface ProposalIssuanceContext {
	actorId?: string | null;
	tenantId?: string | null;
	requestId?: string | null;
	route?: string | null;
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

	return roundCurrency(Math.max(0, parsed));
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
		// Preserve the region-derived (unflipped) country so the client can use it
		// for region-bound business logic (e.g. the Strategic Accelerator rate
		// for MY/SG = 4%) even when a currency override flips `country` to
		// something else. Without this, the assets-page Total Earnings tile
		// fell back to `country` (e.g. 'US' = 3%) and disagreed with ScenarioCard,
		// which uses its own client-built RegionalPricingContext that retains
		// `regionCountry`.
		regionCountry: pricingContext.regionCountry,
		currency: pricingContext.currency,
		currencySymbol: pricingContext.currencySymbol,
		locale: pricingContext.locale,
		fallbackApplied: pricingContext.fallbackApplied,
		fallbackReason: pricingContext.fallbackReason,
	};
}

function slugify(value: string): string {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');

	return slug.length > 0 ? slug : 'value';
}

function slugifyUnderscore(value: string): string {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '');

	return slug.length > 0 ? slug : 'value';
}

function buildScenarioSelectionKey(
	opportunityId: string,
	endingSkuId: string,
): string {
	return `${opportunityId}::${endingSkuId}`;
}

function applyRenewalAllocationIfNeeded<
	T extends {
		opportunityId: string;
		endingSkuId: string;
		selectedSeats: number;
		originalSeats: number;
		expiringArr: number;
	},
>(scenarios: T[]): T[] {
	// Each scenario is an *alternative* the customer can pick — not a split.
	// When the partner shows multiple paths from one opportunity, each path
	// must reflect the customer's full current seats and full current
	// investment. Splitting the 52 DB seats as 24/28 across two alternatives
	// makes the per-card "Current SKU / # Seats / Current investment" wrong
	// in the investment snapshot. Keep originalSeats and expiringArr unchanged.
	return scenarios;
}

/**
 * For "other" SKU, derive the actual monthly price from expiringArr and
 * originalSeats instead of using the static placeholder (monthlyPrice = 0).
 * Mirrors the same derivation the frontend does in opportunity-utils.ts.
 */
function resolveEffectiveStartingSku(
	startingSku: StartingSku,
	scenarioPayload: {
		originalSeats: number;
		expiringArr: number;
		currentSkuCustomerPrice?: number;
		expiringSkuRenewalPrice?: number;
	},
): StartingSku {
	if (startingSku.id === 'other' && scenarioPayload.originalSeats > 0) {
		return {
			...startingSku,
			monthlyPrice:
				scenarioPayload.currentSkuCustomerPrice ??
				scenarioPayload.expiringSkuRenewalPrice ??
				scenarioPayload.expiringArr / scenarioPayload.originalSeats / 12,
		};
	}
	return startingSku;
}

function resolveScenarioExplicitPrices(params: {
	startingSku: StartingSku;
	endingSku: { id: string; promoPrice: number };
	scenario: {
		currentSkuCustomerPrice?: number;
		currentSkuResellerPrice?: number;
		targetSkuCustomerPrice?: number;
		targetSkuResellerPrice?: number;
		expiringSkuRenewalPrice?: number;
		targetSkuPrice?: number;
	};
}) {
	const currentSkuCustomerPrice =
		normalizeOptionalRenewalPrice(params.scenario.currentSkuCustomerPrice) ??
		normalizeOptionalRenewalPrice(params.scenario.expiringSkuRenewalPrice) ??
		params.startingSku.monthlyPrice;
	const currentSkuResellerPrice =
		normalizeOptionalRenewalPrice(params.scenario.currentSkuResellerPrice) ??
		deriveResellerPriceFromMargin({
			customerPrice: currentSkuCustomerPrice,
			marginPercent: 20,
		});
	const targetSkuCustomerPrice =
		normalizeOptionalRenewalPrice(params.scenario.targetSkuCustomerPrice) ??
		normalizeOptionalRenewalPrice(params.scenario.targetSkuPrice) ??
		params.endingSku.promoPrice;
	const targetSkuResellerPrice =
		normalizeOptionalRenewalPrice(params.scenario.targetSkuResellerPrice) ??
		deriveResellerPriceFromMargin({
			customerPrice: targetSkuCustomerPrice,
			marginPercent: getDefaultTargetSkuMarginPercent(params.endingSku.id),
		});

	return {
		currentSkuCustomerPrice,
		currentSkuResellerPrice,
		targetSkuCustomerPrice,
		targetSkuResellerPrice,
	};
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXmlText(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function decodeXmlText(value: string): string {
	return value
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'");
}

function extractFirstCapture(value: string, pattern: RegExp): string | null {
	const match = pattern.exec(value);
	return match?.[1] ?? null;
}

function escapeXmlAttr(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function ensureContentTypeForExtension(
	contentTypesXml: string,
	extension: string,
	mimeType: string,
): string {
	const escapedExtension = escapeRegExp(extension);
	const hasDefault = new RegExp(
		`<Default\\s+Extension="${escapedExtension}"\\s+ContentType="[^"]+"\\s*/>`,
		'i',
	).test(contentTypesXml);

	if (hasDefault) {
		return contentTypesXml;
	}

	return contentTypesXml.replace(
		'</Types>',
		`<Default Extension="${extension}" ContentType="${mimeType}"/></Types>`,
	);
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

	const normalized = trimmed
		.replace(/^add\s+/, 'add_')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');

	return normalized;
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

function extractNumericSuffix(value: string, fallback: number): number {
	const match = value.match(/(\d+)/);
	if (!match) {
		return fallback;
	}
	const parsed = Number.parseInt(match[1] ?? '', 10);
	return Number.isFinite(parsed) ? parsed : fallback;
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

		while (j < runs.length - 1 && hasUnclosedPlaceholder(combined)) {
			j += 1;
			combined += runs[j].text;
		}

		const replaced = replaceFlyerPlaceholdersInText(combined, replacements);
		if (replaced !== combined || j > i) {
			runs[i].text = replaced;
			for (let cursor = i + 1; cursor <= j; cursor += 1) {
				runs[cursor].text = '';
			}
			i = j;
		}
	}

	let cursor = 0;
	let output = '';
	for (const run of runs) {
		output += xml.slice(cursor, run.start);
		output += escapeXmlText(run.text);
		cursor = run.end;
	}
	output += xml.slice(cursor);

	return output;
}

function listSlidePaths(zip: PizZip): string[] {
	return Object.keys(zip.files)
		.filter((entryPath) => /^ppt\/slides\/slide\d+\.xml$/.test(entryPath))
		.sort((left, right) => {
			const leftNumber = extractNumericSuffix(left, 0);
			const rightNumber = extractNumericSuffix(right, 0);
			return leftNumber - rightNumber;
		});
}

function listSlideMasterPaths(zip: PizZip): string[] {
	return Object.keys(zip.files)
		.filter((entryPath) =>
			/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(entryPath),
		)
		.sort((left, right) => {
			const leftNumber = extractNumericSuffix(left, 0);
			const rightNumber = extractNumericSuffix(right, 0);
			return leftNumber - rightNumber;
		});
}

function listDuplicateSlideMasterLayoutIds(params: {
	zip: PizZip;
}): Array<{ id: string; masterPaths: string[] }> {
	const layoutIdToMasters = new Map<string, string[]>();

	for (const slideMasterPath of listSlideMasterPaths(params.zip)) {
		const slideMasterXml = getRequiredZipText(params.zip, slideMasterPath);
		const pattern = /<p:sldLayoutId\b[^>]*\bid="(\d+)"/g;
		let match = pattern.exec(slideMasterXml);
		while (match) {
			const layoutId = match[1];
			if (layoutId) {
				const masters = layoutIdToMasters.get(layoutId) ?? [];
				masters.push(slideMasterPath);
				layoutIdToMasters.set(layoutId, masters);
			}
			match = pattern.exec(slideMasterXml);
		}
	}

	return [...layoutIdToMasters.entries()]
		.filter(([, masterPaths]) => masterPaths.length > 1)
		.map(([id, masterPaths]) => ({ id, masterPaths }));
}

function normalizeSlideMasterLayoutIds(params: { zip: PizZip }): void {
	const slideMasterPaths = listSlideMasterPaths(params.zip);
	if (slideMasterPaths.length === 0) {
		return;
	}

	let maxLayoutId = 0;
	for (const slideMasterPath of slideMasterPaths) {
		const slideMasterXml = getRequiredZipText(params.zip, slideMasterPath);
		const pattern = /<p:sldLayoutId\b[^>]*\bid="(\d+)"/g;
		let match = pattern.exec(slideMasterXml);
		while (match) {
			const parsed = Number.parseInt(match[1] ?? '', 10);
			if (Number.isFinite(parsed)) {
				maxLayoutId = Math.max(maxLayoutId, parsed);
			}
			match = pattern.exec(slideMasterXml);
		}
	}

	const seenIds = new Set<string>();
	let nextLayoutId = maxLayoutId + 1;

	for (const slideMasterPath of slideMasterPaths) {
		const slideMasterXml = getRequiredZipText(params.zip, slideMasterPath);
		const updatedSlideMasterXml = slideMasterXml.replace(
			/(<p:sldLayoutId\b[^>]*\bid=")(\d+)("[^>]*>)/g,
			(_fullMatch, prefix: string, id: string, suffix: string) => {
				if (!seenIds.has(id)) {
					seenIds.add(id);
					return `${prefix}${id}${suffix}`;
				}

				while (seenIds.has(String(nextLayoutId))) {
					nextLayoutId += 1;
				}
				const newId = String(nextLayoutId);
				seenIds.add(newId);
				nextLayoutId += 1;
				return `${prefix}${newId}${suffix}`;
			},
		);

		if (updatedSlideMasterXml !== slideMasterXml) {
			params.zip.file(slideMasterPath, updatedSlideMasterXml);
		}
	}
}

interface PresentationIdToken {
	originalId: number;
	ordinal: number;
}

interface SlideMasterLayoutIdToken extends PresentationIdToken {
	slideMasterPath: string;
}

function collectPresentationIdTokens(params: {
	presentationXml: string;
	tagName: 'p:sldId' | 'p:sldMasterId';
}): PresentationIdToken[] {
	const tokens: PresentationIdToken[] = [];
	const pattern =
		params.tagName === 'p:sldId'
			? /<p:sldId\b[^>]*\bid="(\d+)"/g
			: /<p:sldMasterId\b[^>]*\bid="(\d+)"/g;
	let ordinal = 0;
	let match = pattern.exec(params.presentationXml);
	while (match) {
		const parsed = Number.parseInt(match[1] ?? '', 10);
		if (Number.isFinite(parsed)) {
			tokens.push({
				originalId: parsed,
				ordinal,
			});
			ordinal += 1;
		}
		match = pattern.exec(params.presentationXml);
	}
	return tokens;
}

function collectSlideMasterLayoutIdTokens(
	zip: PizZip,
): SlideMasterLayoutIdToken[] {
	const tokens: SlideMasterLayoutIdToken[] = [];
	for (const slideMasterPath of listSlideMasterPaths(zip)) {
		const slideMasterXml = getRequiredZipText(zip, slideMasterPath);
		const pattern = /<p:sldLayoutId\b[^>]*\bid="(\d+)"/g;
		let ordinal = 0;
		let match = pattern.exec(slideMasterXml);
		while (match) {
			const parsed = Number.parseInt(match[1] ?? '', 10);
			if (Number.isFinite(parsed)) {
				tokens.push({
					slideMasterPath,
					originalId: parsed,
					ordinal,
				});
				ordinal += 1;
			}
			match = pattern.exec(slideMasterXml);
		}
	}
	return tokens;
}

function replaceTagIdsByOrdinal(params: {
	xml: string;
	tagPattern: RegExp;
	replacementByOrdinal: Map<number, number>;
}): string {
	let ordinal = 0;
	return params.xml.replace(
		params.tagPattern,
		(fullMatch, prefix: string, id: string, suffix: string) => {
			const replacement = params.replacementByOrdinal.get(ordinal);
			ordinal += 1;
			if (replacement === undefined) {
				return fullMatch;
			}
			return `${prefix}${replacement}${suffix}`;
		},
	);
}

function normalizeGlobalPresentationIds(params: {
	zip: PizZip;
	presentationXml: string;
}): { presentationXml: string } {
	const slideIdTokens = collectPresentationIdTokens({
		presentationXml: params.presentationXml,
		tagName: 'p:sldId',
	});
	const slideMasterIdTokens = collectPresentationIdTokens({
		presentationXml: params.presentationXml,
		tagName: 'p:sldMasterId',
	});
	const layoutIdTokens = collectSlideMasterLayoutIdTokens(params.zip);

	const allIds = [
		...slideIdTokens.map((token) => token.originalId),
		...slideMasterIdTokens.map((token) => token.originalId),
		...layoutIdTokens.map((token) => token.originalId),
	];
	if (allIds.length === 0) {
		return { presentationXml: params.presentationXml };
	}

	const usedIds = new Set<number>();
	let nextId = Math.max(...allIds) + 1;
	const slideIdReplacementByOrdinal = new Map<number, number>();
	const slideMasterIdReplacementByOrdinal = new Map<number, number>();
	const layoutIdReplacementByMasterAndOrdinal = new Map<
		string,
		Map<number, number>
	>();

	const allocateId = (originalId: number): number => {
		if (!usedIds.has(originalId)) {
			usedIds.add(originalId);
			return originalId;
		}
		while (usedIds.has(nextId)) {
			nextId += 1;
		}
		const allocated = nextId;
		usedIds.add(allocated);
		nextId += 1;
		return allocated;
	};

	for (const token of slideIdTokens) {
		const normalizedId = allocateId(token.originalId);
		if (normalizedId !== token.originalId) {
			slideIdReplacementByOrdinal.set(token.ordinal, normalizedId);
		}
	}
	for (const token of slideMasterIdTokens) {
		const normalizedId = allocateId(token.originalId);
		if (normalizedId !== token.originalId) {
			slideMasterIdReplacementByOrdinal.set(token.ordinal, normalizedId);
		}
	}
	for (const token of layoutIdTokens) {
		const normalizedId = allocateId(token.originalId);
		if (normalizedId === token.originalId) {
			continue;
		}
		const replacementByOrdinal =
			layoutIdReplacementByMasterAndOrdinal.get(token.slideMasterPath) ??
			new Map<number, number>();
		replacementByOrdinal.set(token.ordinal, normalizedId);
		layoutIdReplacementByMasterAndOrdinal.set(
			token.slideMasterPath,
			replacementByOrdinal,
		);
	}

	let presentationXml = replaceTagIdsByOrdinal({
		xml: params.presentationXml,
		tagPattern: /(<p:sldId\b[^>]*\bid=")(\d+)("[^>]*>)/g,
		replacementByOrdinal: slideIdReplacementByOrdinal,
	});
	presentationXml = replaceTagIdsByOrdinal({
		xml: presentationXml,
		tagPattern: /(<p:sldMasterId\b[^>]*\bid=")(\d+)("[^>]*>)/g,
		replacementByOrdinal: slideMasterIdReplacementByOrdinal,
	});

	for (const [
		slideMasterPath,
		replacementByOrdinal,
	] of layoutIdReplacementByMasterAndOrdinal.entries()) {
		const slideMasterXml = getRequiredZipText(params.zip, slideMasterPath);
		const updatedSlideMasterXml = replaceTagIdsByOrdinal({
			xml: slideMasterXml,
			tagPattern: /(<p:sldLayoutId\b[^>]*\bid=")(\d+)("[^>]*>)/g,
			replacementByOrdinal,
		});
		if (updatedSlideMasterXml !== slideMasterXml) {
			params.zip.file(slideMasterPath, updatedSlideMasterXml);
		}
	}

	return { presentationXml };
}

function listCrossPoolIdCollisions(params: {
	zip: PizZip;
	presentationXml: string;
}): Array<{ id: number; refs: string[] }> {
	const refsById = new Map<number, string[]>();
	const appendRef = (id: number, ref: string): void => {
		const refs = refsById.get(id) ?? [];
		refs.push(ref);
		refsById.set(id, refs);
	};

	for (const token of collectPresentationIdTokens({
		presentationXml: params.presentationXml,
		tagName: 'p:sldId',
	})) {
		appendRef(token.originalId, `presentation.xml:p:sldId#${token.ordinal}`);
	}
	for (const token of collectPresentationIdTokens({
		presentationXml: params.presentationXml,
		tagName: 'p:sldMasterId',
	})) {
		appendRef(
			token.originalId,
			`presentation.xml:p:sldMasterId#${token.ordinal}`,
		);
	}
	for (const token of collectSlideMasterLayoutIdTokens(params.zip)) {
		appendRef(
			token.originalId,
			`${token.slideMasterPath}:p:sldLayoutId#${token.ordinal}`,
		);
	}

	return [...refsById.entries()]
		.filter(([, refs]) => refs.length > 1)
		.map(([id, refs]) => ({ id, refs }))
		.sort((left, right) => left.id - right.id);
}

function getRequiredZipText(zip: PizZip, entryPath: string): string {
	const entry = zip.file(entryPath);
	if (!entry) {
		throw new InternalServerErrorException(
			`PPT template is missing required entry "${entryPath}"`,
		);
	}
	return entry.asText();
}

function getRequiredZipBuffer(zip: PizZip, entryPath: string): Buffer {
	const entry = zip.file(entryPath);
	if (!entry) {
		throw new InternalServerErrorException(
			`PPT template is missing required entry "${entryPath}"`,
		);
	}
	return entry.asNodeBuffer();
}

function getNextSlideFileIndex(zip: PizZip): number {
	let max = 0;
	for (const slidePath of listSlidePaths(zip)) {
		max = Math.max(max, extractNumericSuffix(slidePath, 0));
	}
	return max + 1;
}

function getNextSlideId(presentationXml: string): number {
	let max = 0;
	const pattern = /<p:sldId\b[^>]*\bid="(\d+)"/g;
	let match = pattern.exec(presentationXml);
	while (match) {
		const parsed = Number.parseInt(match[1] ?? '', 10);
		if (Number.isFinite(parsed)) {
			max = Math.max(max, parsed);
		}
		match = pattern.exec(presentationXml);
	}
	return max + 1;
}

function getNextPresentationRelId(presentationRelsXml: string): number {
	let max = 0;
	const pattern = /\bId="rId(\d+)"/g;
	let match = pattern.exec(presentationRelsXml);
	while (match) {
		const parsed = Number.parseInt(match[1] ?? '', 10);
		if (Number.isFinite(parsed)) {
			max = Math.max(max, parsed);
		}
		match = pattern.exec(presentationRelsXml);
	}
	return max + 1;
}

function getNextSlideMasterId(presentationXml: string): number {
	let max = PPT_SLIDE_MASTER_ID_BASE - 1;
	const pattern = /<p:sldMasterId\b[^>]*\bid="(\d+)"/g;
	let match = pattern.exec(presentationXml);
	while (match) {
		const parsed = Number.parseInt(match[1] ?? '', 10);
		if (Number.isFinite(parsed)) {
			max = Math.max(max, parsed);
		}
		match = pattern.exec(presentationXml);
	}
	return max + 1;
}

function appendPresentationRelationship(
	xml: string,
	relationshipId: string,
	target: string,
	relationshipType: string,
): string {
	const relationship =
		`<Relationship Id="${relationshipId}" ` +
		`Type="${relationshipType}" ` +
		`Target="${target}"/>`;

	if (!xml.includes('</Relationships>')) {
		throw new InternalServerErrorException(
			'PPT presentation relationships XML is invalid',
		);
	}

	return xml.replace('</Relationships>', `${relationship}</Relationships>`);
}

function ensurePresentationMasterList(
	xml: string,
	tagName: 'p:sldMasterIdLst' | 'p:notesMasterIdLst',
): string {
	if (new RegExp(`<${escapeRegExp(tagName)}\\b`).test(xml)) {
		return xml;
	}
	if (!xml.includes('</p:presentation>')) {
		throw new InternalServerErrorException('PPT presentation XML is invalid');
	}
	return xml.replace(
		'</p:presentation>',
		`<${tagName}></${tagName}></p:presentation>`,
	);
}

function appendPresentationListEntry(params: {
	xml: string;
	listTag: 'p:sldMasterIdLst' | 'p:notesMasterIdLst';
	entryXml: string;
}): string {
	const selfClosingPattern = new RegExp(
		`<${escapeRegExp(params.listTag)}\\b[^>]*\\/\\s*>`,
	);
	const selfClosingMatch = selfClosingPattern.exec(params.xml);
	if (selfClosingMatch) {
		const selfClosingTag = selfClosingMatch[0];
		return params.xml.replace(
			selfClosingTag,
			selfClosingTag.replace(
				/\/\s*>$/,
				`>${params.entryXml}</${params.listTag}>`,
			),
		);
	}

	const closingTag = `</${params.listTag}>`;
	if (!params.xml.includes(closingTag)) {
		throw new InternalServerErrorException('PPT presentation XML is invalid');
	}
	return params.xml.replace(closingTag, `${params.entryXml}${closingTag}`);
}

function appendSlideReference(
	xml: string,
	slideId: number,
	relationshipId: string,
): string {
	const slideRef = `<p:sldId id="${slideId}" r:id="${relationshipId}"/>`;
	if (!xml.includes('</p:sldIdLst>')) {
		throw new InternalServerErrorException('PPT presentation XML is invalid');
	}
	return xml.replace('</p:sldIdLst>', `${slideRef}</p:sldIdLst>`);
}

function appendSlideMasterReference(
	xml: string,
	slideMasterId: number,
	relationshipId: string,
): string {
	const ensuredXml = ensurePresentationMasterList(xml, 'p:sldMasterIdLst');
	const ref = `<p:sldMasterId id="${slideMasterId}" r:id="${relationshipId}"/>`;
	return appendPresentationListEntry({
		xml: ensuredXml,
		listTag: 'p:sldMasterIdLst',
		entryXml: ref,
	});
}

function appendNotesMasterReference(
	xml: string,
	relationshipId: string,
): string {
	const ensuredXml = ensurePresentationMasterList(xml, 'p:notesMasterIdLst');
	const ref = `<p:notesMasterId r:id="${relationshipId}"/>`;
	return appendPresentationListEntry({
		xml: ensuredXml,
		listTag: 'p:notesMasterIdLst',
		entryXml: ref,
	});
}

function collectPresentationRelationshipTargetsByType(params: {
	relsXml: string;
	relationshipType: string;
}): Set<string> {
	const targets = new Set<string>();
	const pattern = /<Relationship\b[^>]*\/>/g;
	let match = pattern.exec(params.relsXml);

	while (match) {
		const tag = match[0];
		const relationshipType = tag.match(/\bType="([^"]+)"/)?.[1];
		if (relationshipType === params.relationshipType) {
			const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
			if (!target) {
				throw new InternalServerErrorException(
					'PPT presentation relationship is missing a Target',
				);
			}
			const targetMode = tag.match(/\bTargetMode="([^"]+)"/)?.[1];
			if (targetMode?.toLowerCase() !== 'external') {
				targets.add(
					resolveInternalRelationshipTargetPath({
						relsPath: PPT_PRESENTATION_RELS_XML_PATH,
						target,
					}),
				);
			}
		}
		match = pattern.exec(params.relsXml);
	}

	return targets;
}

function ensureSlideOverride(xml: string, slidePartName: string): string {
	if (xml.includes(`PartName="${slidePartName}"`)) {
		return xml;
	}
	if (!xml.includes('</Types>')) {
		throw new InternalServerErrorException('PPT content types XML is invalid');
	}

	const override =
		`<Override PartName="${slidePartName}" ` +
		`ContentType="${PPT_SLIDE_CONTENT_TYPE}"/>`;
	return xml.replace('</Types>', `${override}</Types>`);
}

function parsePptContentTypesXml(xml: string): PptContentTypesIndex {
	const defaults = new Map<string, string>();
	const overrides = new Map<string, string>();

	const defaultTags = xml.match(/<Default\b[^>]*\/>/g) ?? [];
	for (const tag of defaultTags) {
		const extension = tag.match(/\bExtension="([^"]+)"/)?.[1];
		const contentType = tag.match(/\bContentType="([^"]+)"/)?.[1];
		if (!extension || !contentType) {
			continue;
		}
		defaults.set(extension.toLowerCase(), contentType);
	}

	const overrideTags = xml.match(/<Override\b[^>]*\/>/g) ?? [];
	for (const tag of overrideTags) {
		const partName = tag.match(/\bPartName="([^"]+)"/)?.[1];
		const contentType = tag.match(/\bContentType="([^"]+)"/)?.[1];
		if (!partName || !contentType) {
			continue;
		}
		overrides.set(partName, contentType);
	}

	return { defaults, overrides };
}

interface ParsedRelationshipTag {
	id: string | null;
	type: string | null;
	target: string | null;
	targetMode: string | null;
	rawTag: string;
}

function parseRelationshipTag(tag: string): ParsedRelationshipTag {
	return {
		id: tag.match(/\bId="([^"]+)"/)?.[1] ?? null,
		type: tag.match(/\bType="([^"]+)"/)?.[1] ?? null,
		target: tag.match(/\bTarget="([^"]+)"/)?.[1] ?? null,
		targetMode: tag.match(/\bTargetMode="([^"]+)"/)?.[1]?.toLowerCase() ?? null,
		rawTag: tag,
	};
}

function rewriteRelationshipTags(params: {
	relsXml: string;
	transform: (parsed: ParsedRelationshipTag) => string | null;
}): string {
	const relationshipPattern = /<Relationship\b[^>]*\/>/g;
	let rewrittenXml = '';
	let cursor = 0;
	let match = relationshipPattern.exec(params.relsXml);

	while (match) {
		const tag = match[0];
		const parsed = parseRelationshipTag(tag);
		const replacement = params.transform(parsed);
		rewrittenXml += params.relsXml.slice(cursor, match.index);
		if (replacement !== null) {
			rewrittenXml += replacement;
		}
		cursor = match.index + tag.length;
		match = relationshipPattern.exec(params.relsXml);
	}

	rewrittenXml += params.relsXml.slice(cursor);
	return rewrittenXml;
}

function listZipPartPathsByPattern(params: {
	zip: PizZip;
	pattern: RegExp;
}): string[] {
	return Object.keys(params.zip.files)
		.filter((entryPath) => params.pattern.test(entryPath))
		.sort();
}

function isMediaPartPath(partPath: string): boolean {
	return partPath.startsWith(PPT_MEDIA_PART_PREFIX);
}

function hashBuffer(buffer: Buffer): string {
	return crypto.createHash('sha256').update(buffer).digest('hex');
}

function buildMediaPartPathByHashIndex(zip: PizZip): Map<string, string> {
	const map = new Map<string, string>();
	for (const mediaPath of listZipPartPathsByPattern({
		zip,
		pattern: /^ppt\/media\/[^/]+$/,
	})) {
		const entry = zip.file(mediaPath);
		if (!entry) {
			continue;
		}
		map.set(hashBuffer(entry.asNodeBuffer()), mediaPath);
	}
	return map;
}

function removeContentTypeOverrides(params: {
	xml: string;
	shouldRemove: (partName: string) => boolean;
}): string {
	return params.xml.replace(/<Override\b[^>]*\/>/g, (tag) => {
		const partName = tag.match(/\bPartName="([^"]+)"/)?.[1];
		if (!partName) {
			return tag;
		}
		return params.shouldRemove(partName) ? '' : tag;
	});
}

function collectInternalRelationshipTargetsByTypeSuffix(params: {
	zip: PizZip;
	relsPathPattern: RegExp;
	typeSuffix: string;
}): Set<string> {
	const targets = new Set<string>();
	for (const relsPath of listZipPartPathsByPattern({
		zip: params.zip,
		pattern: params.relsPathPattern,
	})) {
		const relsXml = params.zip.file(relsPath)?.asText();
		if (!relsXml) {
			continue;
		}
		const relationshipTags = relsXml.match(/<Relationship\b[^>]*\/>/g) ?? [];
		for (const tag of relationshipTags) {
			const parsed = parseRelationshipTag(tag);
			if (
				!parsed.type?.endsWith(params.typeSuffix) ||
				parsed.targetMode === 'external' ||
				!parsed.target
			) {
				continue;
			}
			targets.add(
				resolveInternalRelationshipTargetPath({
					relsPath,
					target: parsed.target,
				}),
			);
		}
	}
	return targets;
}

function removeSlideMasterReferencesFromPresentationXml(params: {
	presentationXml: string;
	removedRelationshipIds: Set<string>;
}): string {
	return params.presentationXml.replace(/<p:sldMasterId\b[^>]*\/>/g, (tag) => {
		const relationshipId = tag.match(/\br:id="([^"]+)"/)?.[1];
		if (relationshipId && params.removedRelationshipIds.has(relationshipId)) {
			return '';
		}
		return tag;
	});
}

function collectSlideLayoutTargetsForMaster(params: {
	zip: PizZip;
	masterPath: string;
}): Set<string> {
	const layoutTargets = new Set<string>();
	const relsPath = buildRelsPathForPart(params.masterPath);
	const relsXml = params.zip.file(relsPath)?.asText();
	if (!relsXml) {
		return layoutTargets;
	}

	const relationshipTags = relsXml.match(/<Relationship\b[^>]*\/>/g) ?? [];
	for (const tag of relationshipTags) {
		const parsed = parseRelationshipTag(tag);
		if (
			parsed.type !== PPT_RELATIONSHIP_TYPE_SLIDE_LAYOUT ||
			parsed.targetMode === 'external' ||
			!parsed.target
		) {
			continue;
		}
		layoutTargets.add(
			resolveInternalRelationshipTargetPath({
				relsPath,
				target: parsed.target,
			}),
		);
	}

	return layoutTargets;
}

function removeZipEntryIfExists(zip: PizZip, entryPath: string): void {
	if (zip.file(entryPath)) {
		zip.remove(entryPath);
	}
}

function stripOrphanSlideMastersAndLayouts(params: {
	zip: PizZip;
	presentationXml: string;
	presentationRelsXml: string;
	contentTypesXml: string;
}): MergedPptXmlState {
	const orphanMasterPaths = new Set<string>();
	const layoutTargetsFromRemovedMasters = new Set<string>();

	for (const masterPath of listSlideMasterPaths(params.zip)) {
		const layoutTargets = collectSlideLayoutTargetsForMaster({
			zip: params.zip,
			masterPath,
		});
		if (layoutTargets.size > 0) {
			continue;
		}
		orphanMasterPaths.add(masterPath);
		for (const layoutTarget of layoutTargets) {
			layoutTargetsFromRemovedMasters.add(layoutTarget);
		}
	}

	if (orphanMasterPaths.size === 0) {
		return {
			presentationXml: params.presentationXml,
			presentationRelsXml: params.presentationRelsXml,
			contentTypesXml: params.contentTypesXml,
		};
	}

	for (const masterPath of orphanMasterPaths) {
		const masterLayouts = collectSlideLayoutTargetsForMaster({
			zip: params.zip,
			masterPath,
		});
		for (const layoutTarget of masterLayouts) {
			layoutTargetsFromRemovedMasters.add(layoutTarget);
		}
		removeZipEntryIfExists(params.zip, masterPath);
		removeZipEntryIfExists(params.zip, buildRelsPathForPart(masterPath));
	}

	const removedPresentationRelationshipIds = new Set<string>();
	const presentationRelsXml = rewriteRelationshipTags({
		relsXml: params.presentationRelsXml,
		transform: (parsed) => {
			if (
				parsed.type !== PPT_RELATIONSHIP_TYPE_SLIDE_MASTER ||
				parsed.targetMode === 'external' ||
				!parsed.target ||
				!parsed.id
			) {
				return parsed.rawTag;
			}
			const resolvedTarget = resolveInternalRelationshipTargetPath({
				relsPath: PPT_PRESENTATION_RELS_XML_PATH,
				target: parsed.target,
			});
			if (!orphanMasterPaths.has(resolvedTarget)) {
				return parsed.rawTag;
			}
			removedPresentationRelationshipIds.add(parsed.id);
			return null;
		},
	});

	const presentationXml = removeSlideMasterReferencesFromPresentationXml({
		presentationXml: params.presentationXml,
		removedRelationshipIds: removedPresentationRelationshipIds,
	});

	const remainingLayoutTargets = new Set<string>();
	for (const masterPath of listSlideMasterPaths(params.zip)) {
		const masterLayoutTargets = collectSlideLayoutTargetsForMaster({
			zip: params.zip,
			masterPath,
		});
		for (const layoutTarget of masterLayoutTargets) {
			remainingLayoutTargets.add(layoutTarget);
		}
	}

	const removedLayoutPaths = new Set<string>();
	for (const layoutPath of layoutTargetsFromRemovedMasters) {
		if (remainingLayoutTargets.has(layoutPath)) {
			continue;
		}
		removedLayoutPaths.add(layoutPath);
		removeZipEntryIfExists(params.zip, layoutPath);
		removeZipEntryIfExists(params.zip, buildRelsPathForPart(layoutPath));
	}

	const removedPartNames = new Set<string>([
		...orphanMasterPaths,
		...removedLayoutPaths,
	]);
	const contentTypesXml = removeContentTypeOverrides({
		xml: params.contentTypesXml,
		shouldRemove: (partName) => removedPartNames.has(partName.slice(1)),
	});

	return {
		presentationXml,
		presentationRelsXml,
		contentTypesXml,
	};
}

function stripChangesInfoArtifacts(params: {
	zip: PizZip;
	presentationRelsXml: string;
	contentTypesXml: string;
}): Pick<MergedPptXmlState, 'presentationRelsXml' | 'contentTypesXml'> {
	for (const entryPath of Object.keys(params.zip.files)) {
		if (entryPath.startsWith(PPT_CHANGES_INFO_PART_PREFIX)) {
			removeZipEntryIfExists(params.zip, entryPath);
		}
	}

	const presentationRelsXml = rewriteRelationshipTags({
		relsXml: params.presentationRelsXml,
		transform: (parsed) =>
			parsed.type === PPT_RELATIONSHIP_TYPE_CHANGES_INFO ? null : parsed.rawTag,
	});
	const contentTypesXml = removeContentTypeOverrides({
		xml: params.contentTypesXml,
		shouldRemove: (partName) =>
			partName.startsWith(`/${PPT_CHANGES_INFO_PART_PREFIX}`),
	});

	return { presentationRelsXml, contentTypesXml };
}

function stripOrphanThemes(params: {
	zip: PizZip;
	presentationRelsXml: string;
	contentTypesXml: string;
}): Pick<MergedPptXmlState, 'presentationRelsXml' | 'contentTypesXml'> {
	const referencedThemes = collectInternalRelationshipTargetsByTypeSuffix({
		zip: params.zip,
		relsPathPattern: /^ppt\/(?:slideMasters|notesMasters)\/_rels\/[^/]+\.rels$/,
		typeSuffix: '/theme',
	});
	const themePaths = new Set(
		listZipPartPathsByPattern({
			zip: params.zip,
			pattern: /^ppt\/theme\/theme\d+\.xml$/,
		}),
	);
	const orphanThemePaths = new Set<string>();
	for (const themePath of themePaths) {
		if (!referencedThemes.has(themePath)) {
			orphanThemePaths.add(themePath);
		}
	}

	if (orphanThemePaths.size === 0) {
		return {
			presentationRelsXml: params.presentationRelsXml,
			contentTypesXml: params.contentTypesXml,
		};
	}

	for (const themePath of orphanThemePaths) {
		removeZipEntryIfExists(params.zip, themePath);
		removeZipEntryIfExists(params.zip, buildRelsPathForPart(themePath));
	}

	const presentationRelsXml = rewriteRelationshipTags({
		relsXml: params.presentationRelsXml,
		transform: (parsed) => {
			if (
				parsed.targetMode === 'external' ||
				!parsed.target ||
				parsed.type?.endsWith('/theme') !== true
			) {
				return parsed.rawTag;
			}
			const resolvedTarget = resolveInternalRelationshipTargetPath({
				relsPath: PPT_PRESENTATION_RELS_XML_PATH,
				target: parsed.target,
			});
			return orphanThemePaths.has(resolvedTarget) ? null : parsed.rawTag;
		},
	});
	const contentTypesXml = removeContentTypeOverrides({
		xml: params.contentTypesXml,
		shouldRemove: (partName) => orphanThemePaths.has(partName.slice(1)),
	});

	return { presentationRelsXml, contentTypesXml };
}

function sanitizeMergedPptPackage(params: {
	zip: PizZip;
	presentationXml: string;
	presentationRelsXml: string;
	contentTypesXml: string;
}): MergedPptXmlState {
	const withoutOrphanMasters = stripOrphanSlideMastersAndLayouts({
		zip: params.zip,
		presentationXml: params.presentationXml,
		presentationRelsXml: params.presentationRelsXml,
		contentTypesXml: params.contentTypesXml,
	});
	const withoutChangesInfos = stripChangesInfoArtifacts({
		zip: params.zip,
		presentationRelsXml: withoutOrphanMasters.presentationRelsXml,
		contentTypesXml: withoutOrphanMasters.contentTypesXml,
	});
	const withoutOrphanThemes = stripOrphanThemes({
		zip: params.zip,
		presentationRelsXml: withoutChangesInfos.presentationRelsXml,
		contentTypesXml: withoutChangesInfos.contentTypesXml,
	});

	return {
		presentationXml: withoutOrphanMasters.presentationXml,
		presentationRelsXml: withoutOrphanThemes.presentationRelsXml,
		contentTypesXml: withoutOrphanThemes.contentTypesXml,
	};
}

function getRelationshipsBaseDirectory(relsPath: string): string {
	const relsDirectory = path.posix.dirname(relsPath);
	if (path.posix.basename(relsDirectory) !== '_rels') {
		throw new InternalServerErrorException(
			`Invalid relationships path "${relsPath}"`,
		);
	}
	return path.posix.dirname(relsDirectory);
}

function buildRelsPathForPart(partPath: string): string {
	const directory = path.posix.dirname(partPath);
	const fileName = path.posix.basename(partPath);
	return path.posix.join(directory, '_rels', `${fileName}.rels`);
}

function resolveInternalRelationshipTargetPath(params: {
	relsPath: string;
	target: string;
}): string {
	if (params.target.startsWith('/')) {
		return params.target.slice(1);
	}
	const baseDirectory = getRelationshipsBaseDirectory(params.relsPath);
	const resolved = path.posix.normalize(
		path.posix.join(baseDirectory, params.target),
	);
	if (resolved.startsWith('../')) {
		throw new InternalServerErrorException(
			`Relationship target resolves outside PPT package: "${params.target}"`,
		);
	}
	return resolved;
}

function buildRelativeRelationshipTarget(params: {
	relsPath: string;
	destinationPartPath: string;
}): string {
	const baseDirectory = getRelationshipsBaseDirectory(params.relsPath);
	const relativePath = path.posix.relative(
		baseDirectory,
		params.destinationPartPath,
	);
	if (!relativePath || relativePath.length === 0) {
		return path.posix.basename(params.destinationPartPath);
	}
	return relativePath.replaceAll('\\', '/');
}

function getCanonicalPptPartType(
	partPath: string,
): CanonicalPptPartType | null {
	for (const partType of CANONICAL_PPT_PART_TYPES) {
		if (partType.regex.test(partPath)) {
			return partType;
		}
	}
	return null;
}

function getNextCanonicalPartIndexByType(params: {
	existingPaths: Set<string>;
	partType: CanonicalPptPartType;
}): number {
	let max = 0;
	const pattern = new RegExp(
		`^${escapeRegExp(params.partType.directory)}/${escapeRegExp(params.partType.prefix)}(\\d+)\\.xml$`,
	);
	for (const entryPath of params.existingPaths) {
		const match = pattern.exec(entryPath);
		if (!match) {
			continue;
		}
		const parsed = Number.parseInt(match[1] ?? '', 10);
		if (Number.isFinite(parsed)) {
			max = Math.max(max, parsed);
		}
	}
	return max + 1;
}

function createNextCanonicalPartIndexByCategory(
	existingPaths: Set<string>,
): Map<CanonicalPptPartCategory, number> {
	const indexMap = new Map<CanonicalPptPartCategory, number>();
	for (const partType of CANONICAL_PPT_PART_TYPES) {
		indexMap.set(
			partType.category,
			getNextCanonicalPartIndexByType({
				existingPaths,
				partType,
			}),
		);
	}
	return indexMap;
}

function allocateCanonicalPartPath(params: {
	state: MergeDependencyCopyState;
	partType: CanonicalPptPartType;
}): string {
	let nextIndex =
		params.state.nextCanonicalPartIndexByCategory.get(
			params.partType.category,
		) ?? 1;
	let candidate = path.posix.join(
		params.partType.directory,
		`${params.partType.prefix}${nextIndex}.xml`,
	);
	while (params.state.existingPaths.has(candidate)) {
		nextIndex += 1;
		candidate = path.posix.join(
			params.partType.directory,
			`${params.partType.prefix}${nextIndex}.xml`,
		);
	}
	params.state.nextCanonicalPartIndexByCategory.set(
		params.partType.category,
		nextIndex + 1,
	);
	return candidate;
}

function allocateIndexedMergedPartPath(params: {
	sourcePartPath: string;
	existingPaths: Set<string>;
}): string | null {
	const indexedPathMatch = params.sourcePartPath.match(
		/^(.*\/)([^/]*?)(\d+)(\.[A-Za-z0-9]+)$/,
	);
	if (!indexedPathMatch) {
		return null;
	}

	const directory = indexedPathMatch[1] ?? '';
	const prefix = indexedPathMatch[2] ?? '';
	const parsedIndex = Number.parseInt(indexedPathMatch[3] ?? '', 10);
	const extension = indexedPathMatch[4] ?? '';
	if (
		directory.length === 0 ||
		prefix.length === 0 ||
		extension.length === 0 ||
		!Number.isFinite(parsedIndex)
	) {
		return null;
	}

	let nextIndex = parsedIndex + 1;
	let candidate = `${directory}${prefix}${nextIndex}${extension}`;
	while (params.existingPaths.has(candidate)) {
		nextIndex += 1;
		candidate = `${directory}${prefix}${nextIndex}${extension}`;
	}

	return candidate;
}

function resolveMergedDestinationPartPath(params: {
	state: MergeDependencyCopyState;
	sourcePartPath: string;
}): string {
	const canonicalPartType = getCanonicalPptPartType(params.sourcePartPath);
	if (
		canonicalPartType?.category === 'notes_master' &&
		params.state.primaryNotesMasterPath
	) {
		return params.state.primaryNotesMasterPath;
	}

	if (!params.state.existingPaths.has(params.sourcePartPath)) {
		return params.sourcePartPath;
	}

	if (canonicalPartType) {
		return allocateCanonicalPartPath({
			state: params.state,
			partType: canonicalPartType,
		});
	}

	const indexedPartPath = allocateIndexedMergedPartPath({
		sourcePartPath: params.sourcePartPath,
		existingPaths: params.state.existingPaths,
	});
	if (indexedPartPath) {
		return indexedPartPath;
	}

	return getUniqueMergedPartPath({
		desiredPath: params.sourcePartPath,
		existingPaths: params.state.existingPaths,
		deckToken: params.state.deckToken,
	});
}

function getUniqueMergedPartPath(params: {
	desiredPath: string;
	existingPaths: Set<string>;
	deckToken: string;
}): string {
	if (!params.existingPaths.has(params.desiredPath)) {
		return params.desiredPath;
	}

	const parsed = path.posix.parse(params.desiredPath);
	const suffixBase = `__${params.deckToken}`;
	let candidate = path.posix.join(
		parsed.dir,
		`${parsed.name}${suffixBase}${parsed.ext}`,
	);
	let suffix = 1;

	while (params.existingPaths.has(candidate)) {
		candidate = path.posix.join(
			parsed.dir,
			`${parsed.name}${suffixBase}_${suffix}${parsed.ext}`,
		);
		suffix += 1;
	}

	return candidate;
}

function ensurePartOverrideContentType(params: {
	xml: string;
	partName: string;
	contentType: string;
}): string {
	if (
		new RegExp(`\\bPartName="${escapeRegExp(params.partName)}"`).test(
			params.xml,
		)
	) {
		return params.xml;
	}
	if (!params.xml.includes('</Types>')) {
		throw new InternalServerErrorException('PPT content types XML is invalid');
	}
	return params.xml.replace(
		'</Types>',
		`<Override PartName="${escapeXmlAttr(params.partName)}" ContentType="${escapeXmlAttr(params.contentType)}"/></Types>`,
	);
}

function ensurePartContentType(params: {
	xml: string;
	sourcePartPath: string;
	destinationPartPath: string;
	sourceContentTypes: PptContentTypesIndex;
}): string {
	const sourcePartName = `/${params.sourcePartPath}`;
	const destinationPartName = `/${params.destinationPartPath}`;
	const overrideContentType =
		params.sourceContentTypes.overrides.get(sourcePartName) ??
		params.sourceContentTypes.overrides.get(destinationPartName);
	if (overrideContentType) {
		return ensurePartOverrideContentType({
			xml: params.xml,
			partName: destinationPartName,
			contentType: overrideContentType,
		});
	}

	const extension = path.posix
		.extname(params.destinationPartPath)
		.replace(/^\./, '')
		.toLowerCase();
	if (!extension) {
		return params.xml;
	}
	const defaultContentType = params.sourceContentTypes.defaults.get(extension);
	if (!defaultContentType) {
		return params.xml;
	}
	return ensureContentTypeForExtension(
		params.xml,
		extension,
		defaultContentType,
	);
}

function copyPartWithDependencies(params: {
	state: MergeDependencyCopyState;
	sourcePartPath: string;
}): string {
	const sourcePartPath = path.posix.normalize(params.sourcePartPath);
	const existingDestinationPath = params.state.copiedParts.get(sourcePartPath);
	if (existingDestinationPath) {
		return existingDestinationPath;
	}

	const destinationPartPath = resolveMergedDestinationPartPath({
		state: params.state,
		sourcePartPath,
	});
	if (destinationPartPath === params.state.primaryNotesMasterPath) {
		params.state.copiedParts.set(sourcePartPath, destinationPartPath);
		return destinationPartPath;
	}

	const sourcePartEntry = params.state.sourceZip.file(sourcePartPath);
	if (!sourcePartEntry) {
		throw new InternalServerErrorException(
			`PPT template is missing required dependency "${sourcePartPath}"`,
		);
	}
	const sourcePartBuffer = sourcePartEntry.asNodeBuffer();
	if (isMediaPartPath(sourcePartPath)) {
		const existingMediaPath = params.state.mediaPartPathByHash.get(
			hashBuffer(sourcePartBuffer),
		);
		if (existingMediaPath) {
			params.state.copiedParts.set(sourcePartPath, existingMediaPath);
			return existingMediaPath;
		}
	}

	params.state.baseZip.file(destinationPartPath, sourcePartBuffer);
	params.state.existingPaths.add(destinationPartPath);
	params.state.copiedParts.set(sourcePartPath, destinationPartPath);
	if (isMediaPartPath(destinationPartPath)) {
		params.state.mediaPartPathByHash.set(
			hashBuffer(sourcePartBuffer),
			destinationPartPath,
		);
	}
	params.state.contentTypesState.value = ensurePartContentType({
		xml: params.state.contentTypesState.value,
		sourcePartPath,
		destinationPartPath,
		sourceContentTypes: params.state.sourceContentTypes,
	});

	const sourcePartRelsPath = buildRelsPathForPart(sourcePartPath);
	const sourcePartRelsEntry = params.state.sourceZip.file(sourcePartRelsPath);
	if (!sourcePartRelsEntry) {
		return destinationPartPath;
	}

	const destinationPartRelsPath = buildRelsPathForPart(destinationPartPath);
	const rewrittenRelsXml = rewriteAndCopyInternalRelationships({
		relsXml: sourcePartRelsEntry.asText(),
		sourceRelsPath: sourcePartRelsPath,
		destinationRelsPath: destinationPartRelsPath,
		state: params.state,
	});
	params.state.baseZip.file(destinationPartRelsPath, rewrittenRelsXml);
	params.state.existingPaths.add(destinationPartRelsPath);
	return destinationPartPath;
}

function rewriteAndCopyInternalRelationships(params: {
	relsXml: string;
	sourceRelsPath: string;
	destinationRelsPath: string;
	state: MergeDependencyCopyState;
}): string {
	const relationshipPattern = /<Relationship\b[^>]*\/>/g;
	let rewrittenXml = '';
	let cursor = 0;
	let match = relationshipPattern.exec(params.relsXml);

	while (match) {
		const tag = match[0];
		const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
		if (!target) {
			throw new InternalServerErrorException(
				`PPT relationship in "${params.sourceRelsPath}" is missing a Target`,
			);
		}

		const targetMode = tag.match(/\bTargetMode="([^"]+)"/)?.[1]?.toLowerCase();
		let rewrittenTag = tag;
		if (targetMode !== 'external') {
			const sourceDependencyPath = resolveInternalRelationshipTargetPath({
				relsPath: params.sourceRelsPath,
				target,
			});
			const destinationDependencyPath = copyPartWithDependencies({
				state: params.state,
				sourcePartPath: sourceDependencyPath,
			});
			const rewrittenTarget = buildRelativeRelationshipTarget({
				relsPath: params.destinationRelsPath,
				destinationPartPath: destinationDependencyPath,
			});
			rewrittenTag = tag.replace(
				/\bTarget="[^"]*"/,
				`Target="${escapeXmlAttr(rewrittenTarget)}"`,
			);
		}

		rewrittenXml += params.relsXml.slice(cursor, match.index) + rewrittenTag;
		cursor = match.index + tag.length;
		match = relationshipPattern.exec(params.relsXml);
	}

	rewrittenXml += params.relsXml.slice(cursor);
	return rewrittenXml;
}

function listSlideLayoutPaths(zip: PizZip): string[] {
	return listZipPartPathsByPattern({
		zip,
		pattern: /^ppt\/slideLayouts\/slideLayout\d+\.xml$/,
	});
}

function listNotesSlidePaths(zip: PizZip): string[] {
	return listZipPartPathsByPattern({
		zip,
		pattern: /^ppt\/notesSlides\/notesSlide\d+\.xml$/,
	});
}

function collectPresentationSlideTargetsByRelationshipId(
	presentationRelsXml: string,
): Map<string, string> {
	const map = new Map<string, string>();
	const relationshipTags =
		presentationRelsXml.match(/<Relationship\b[^>]*\/>/g) ?? [];

	for (const tag of relationshipTags) {
		const parsed = parseRelationshipTag(tag);
		if (
			parsed.type !== PPT_RELATIONSHIP_TYPE_SLIDE ||
			parsed.targetMode === 'external' ||
			!parsed.id ||
			!parsed.target
		) {
			continue;
		}
		map.set(
			parsed.id,
			resolveInternalRelationshipTargetPath({
				relsPath: PPT_PRESENTATION_RELS_XML_PATH,
				target: parsed.target,
			}),
		);
	}

	return map;
}

function listPresentationSlidePathsInOrder(params: {
	zip: PizZip;
	presentationXml: string;
	presentationRelsXml: string;
}): string[] {
	const slideTargetByRelationshipId =
		collectPresentationSlideTargetsByRelationshipId(params.presentationRelsXml);
	const orderedSlidePaths: string[] = [];
	const seen = new Set<string>();
	const slideIdPattern = /<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*\/>/g;
	let match = slideIdPattern.exec(params.presentationXml);

	while (match) {
		const relationshipId = match[1];
		const slidePath = relationshipId
			? slideTargetByRelationshipId.get(relationshipId)
			: null;
		if (
			!slidePath ||
			!/^ppt\/slides\/slide\d+\.xml$/.test(slidePath) ||
			!params.zip.file(slidePath) ||
			seen.has(slidePath)
		) {
			match = slideIdPattern.exec(params.presentationXml);
			continue;
		}
		seen.add(slidePath);
		orderedSlidePaths.push(slidePath);
		match = slideIdPattern.exec(params.presentationXml);
	}

	if (orderedSlidePaths.length > 0) {
		return orderedSlidePaths;
	}

	return listSlidePaths(params.zip);
}

function extractSlideTitleFromXml(slideXml: string): string | null {
	const shapePattern = /<p:sp\b[\s\S]*?<\/p:sp>/g;
	let shapeMatch = shapePattern.exec(slideXml);

	while (shapeMatch) {
		const shapeXml = shapeMatch[0];
		if (!/<p:ph\b[^>]*\btype="(?:title|ctrTitle)"/.test(shapeXml)) {
			shapeMatch = shapePattern.exec(slideXml);
			continue;
		}
		const textRuns: string[] = shapeXml.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [];
		const textValue = textRuns
			.map((textRunTag) => {
				return decodeXmlText(
					extractFirstCapture(textRunTag, /<a:t>([\s\S]*?)<\/a:t>/) ?? '',
				);
			})
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim();
		if (textValue.length > 0) {
			return textValue;
		}
		shapeMatch = shapePattern.exec(slideXml);
	}

	return null;
}

function collectReferencedThemePartPaths(zip: PizZip): string[] {
	return [
		...collectInternalRelationshipTargetsByTypeSuffix({
			zip,
			relsPathPattern:
				/^ppt\/(?:slideMasters|notesMasters)\/_rels\/[^/]+\.rels$/,
			typeSuffix: '/theme',
		}),
	]
		.filter((partPath) => /^ppt\/theme\/theme\d+\.xml$/.test(partPath))
		.filter((partPath) => Boolean(zip.file(partPath)))
		.sort((left, right) => {
			const leftNumber = extractNumericSuffix(left, 0);
			const rightNumber = extractNumericSuffix(right, 0);
			return leftNumber - rightNumber;
		});
}

function normalizeFontName(rawValue: string): string | null {
	const normalized = decodeXmlText(rawValue).trim();
	if (
		normalized.length === 0 ||
		normalized.startsWith('+') ||
		normalized.toLowerCase() === 'none'
	) {
		return null;
	}
	return normalized;
}

function collectFontNamesFromXml(xml: string, collector: Set<string>): void {
	const typefacePattern = /<a:(?:latin|ea|cs|font)\b[^>]*\btypeface="([^"]*)"/g;
	let match = typefacePattern.exec(xml);
	while (match) {
		const fontName = normalizeFontName(match[1] ?? '');
		if (fontName) {
			collector.add(fontName);
		}
		match = typefacePattern.exec(xml);
	}
}

function countWords(value: string): number {
	return value.match(/\S+/g)?.length ?? 0;
}

function readExtendedPropertyValue(
	xml: string,
	tagName: string,
): string | null {
	const match = new RegExp(
		`<${escapeRegExp(tagName)}>([\\s\\S]*?)<\\/${escapeRegExp(tagName)}>`,
	).exec(xml);
	return match?.[1] ?? null;
}

function buildHeadingPairsXml(params: {
	fontCount: number;
	themeCount: number;
	slideTitleCount: number;
}): string {
	const pairs: Array<{ label: string; count: number }> = [
		{ label: 'Fonts Used', count: params.fontCount },
		{ label: 'Theme', count: params.themeCount },
		{ label: 'Slide Titles', count: params.slideTitleCount },
	];
	const values = pairs
		.map(
			(pair) =>
				`<vt:variant><vt:lpstr>${escapeXmlText(pair.label)}</vt:lpstr></vt:variant><vt:variant><vt:i4>${pair.count}</vt:i4></vt:variant>`,
		)
		.join('');

	return `<HeadingPairs><vt:vector size="${pairs.length * 2}" baseType="variant">${values}</vt:vector></HeadingPairs>`;
}

function buildTitlesOfPartsXml(values: string[]): string {
	const entries = values
		.map((value) => `<vt:lpstr>${escapeXmlText(value)}</vt:lpstr>`)
		.join('');
	return `<TitlesOfParts><vt:vector size="${values.length}" baseType="lpstr">${entries}</vt:vector></TitlesOfParts>`;
}

function regeneratePptAppXml(params: {
	zip: PizZip;
	presentationXml: string;
	presentationRelsXml: string;
}): void {
	const appEntry = params.zip.file(PPT_APP_XML_PATH);
	if (!appEntry) {
		return;
	}

	const existingAppXml = appEntry.asText();
	const slidePaths = listPresentationSlidePathsInOrder({
		zip: params.zip,
		presentationXml: params.presentationXml,
		presentationRelsXml: params.presentationRelsXml,
	});
	const notesCount = listNotesSlidePaths(params.zip).length;
	const hiddenSlides =
		params.presentationXml.match(/<p:sldId\b[^>]*\bshow="0"[^>]*>/g)?.length ??
		0;

	let words = 0;
	let paragraphs = 0;
	const slideTitles: string[] = [];
	for (const slidePath of slidePaths) {
		const slideXml = params.zip.file(slidePath)?.asText();
		if (!slideXml) {
			continue;
		}
		const textNodes: string[] = slideXml.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [];
		const plainText = textNodes
			.map((node) =>
				decodeXmlText(
					extractFirstCapture(node, /<a:t>([\s\S]*?)<\/a:t>/) ?? '',
				),
			)
			.join(' ');
		words += countWords(plainText);
		paragraphs += slideXml.match(/<a:p\b/g)?.length ?? 0;
		slideTitles.push(
			extractSlideTitleFromXml(slideXml) ?? 'PowerPoint Presentation',
		);
	}

	const referencedThemePaths = collectReferencedThemePartPaths(params.zip);
	const themeNames = referencedThemePaths.map((themePath) => {
		const themeXml = params.zip.file(themePath)?.asText() ?? '';
		return (
			decodeXmlText(
				themeXml.match(/<a:theme\b[^>]*\bname="([^"]+)"/)?.[1] ?? '',
			).trim() || path.posix.basename(themePath, '.xml')
		);
	});

	const fontNames = new Set<string>();
	const fontScanPaths = [
		...slidePaths,
		...listSlideMasterPaths(params.zip),
		...listSlideLayoutPaths(params.zip),
		...referencedThemePaths,
	];
	for (const partPath of fontScanPaths) {
		const partXml = params.zip.file(partPath)?.asText();
		if (!partXml) {
			continue;
		}
		collectFontNamesFromXml(partXml, fontNames);
	}
	const sortedFontNames = [...fontNames].sort((left, right) =>
		left.localeCompare(right),
	);

	const titleParts = [...sortedFontNames, ...themeNames, ...slideTitles];
	const templateValue =
		readExtendedPropertyValue(existingAppXml, 'Template') ?? 'Office Theme';
	const totalTimeValue =
		readExtendedPropertyValue(existingAppXml, 'TotalTime') ?? '0';
	const applicationValue =
		readExtendedPropertyValue(existingAppXml, 'Application') ??
		'Microsoft PowerPoint';
	const presentationFormatValue =
		readExtendedPropertyValue(existingAppXml, 'PresentationFormat') ?? 'Custom';
	const mmClipsValue =
		readExtendedPropertyValue(existingAppXml, 'MMClips') ?? '0';
	const scaleCropValue =
		readExtendedPropertyValue(existingAppXml, 'ScaleCrop') ?? 'false';
	const linksUpToDateValue =
		readExtendedPropertyValue(existingAppXml, 'LinksUpToDate') ?? 'false';
	const sharedDocValue =
		readExtendedPropertyValue(existingAppXml, 'SharedDoc') ?? 'false';
	const hyperlinksChangedValue =
		readExtendedPropertyValue(existingAppXml, 'HyperlinksChanged') ?? 'false';
	const appVersionValue =
		readExtendedPropertyValue(existingAppXml, 'AppVersion') ?? '16.0000';

	const rebuiltXml = [
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
		'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
		`<Template>${escapeXmlText(templateValue)}</Template>`,
		`<TotalTime>${escapeXmlText(totalTimeValue)}</TotalTime>`,
		`<Words>${words}</Words>`,
		`<Application>${escapeXmlText(applicationValue)}</Application>`,
		`<PresentationFormat>${escapeXmlText(presentationFormatValue)}</PresentationFormat>`,
		`<Paragraphs>${paragraphs}</Paragraphs>`,
		`<Slides>${slidePaths.length}</Slides>`,
		`<Notes>${notesCount}</Notes>`,
		`<HiddenSlides>${hiddenSlides}</HiddenSlides>`,
		`<MMClips>${escapeXmlText(mmClipsValue)}</MMClips>`,
		`<ScaleCrop>${escapeXmlText(scaleCropValue)}</ScaleCrop>`,
		buildHeadingPairsXml({
			fontCount: sortedFontNames.length,
			themeCount: themeNames.length,
			slideTitleCount: slideTitles.length,
		}),
		buildTitlesOfPartsXml(titleParts),
		`<LinksUpToDate>${escapeXmlText(linksUpToDateValue)}</LinksUpToDate>`,
		`<SharedDoc>${escapeXmlText(sharedDocValue)}</SharedDoc>`,
		`<HyperlinksChanged>${escapeXmlText(hyperlinksChangedValue)}</HyperlinksChanged>`,
		`<AppVersion>${escapeXmlText(appVersionValue)}</AppVersion>`,
		'</Properties>',
	].join('');

	params.zip.file(PPT_APP_XML_PATH, rebuiltXml);
}

function resolveZipCompressionForEntryPath(
	entryPath: string,
): 'STORE' | 'DEFLATE' {
	if (entryPath.endsWith('.xml') || entryPath.endsWith('.rels')) {
		return 'DEFLATE';
	}
	if (entryPath.startsWith(PPT_MEDIA_PART_PREFIX)) {
		return 'STORE';
	}

	const extension = path.posix.extname(entryPath).toLowerCase();
	const alreadyCompressedExtensions = new Set([
		'.png',
		'.jpg',
		'.jpeg',
		'.gif',
		'.webp',
		'.svg',
		'.mp4',
		'.mov',
		'.avi',
		'.mp3',
		'.wav',
		'.zip',
	]);

	return alreadyCompressedExtensions.has(extension) ? 'STORE' : 'DEFLATE';
}

function generatePptxWithCompressionPolicy(zip: PizZip): Buffer {
	const outputZip = new PizZip();
	for (const entryPath of Object.keys(zip.files).sort()) {
		const zipObject = zip.files[entryPath];
		if (!zipObject || zipObject.dir) {
			continue;
		}
		const entryBuffer = zip.file(entryPath)?.asNodeBuffer();
		if (!entryBuffer) {
			continue;
		}
		outputZip.file(entryPath, entryBuffer, {
			compression: resolveZipCompressionForEntryPath(entryPath),
		});
	}

	return outputZip.generate({
		type: 'nodebuffer',
		mimeType: PPTX_CONTENT_TYPE,
	});
}

@Injectable()
export class ProposalOptionsEmailService {
	private readonly env = getEnv();
	private readonly logger = new Logger(ProposalOptionsEmailService.name);
	private readonly templateService = new ProposalEmailTemplateService();
	private readonly assetMapperService = new ProposalEmailAssetMapperService();
	private readonly docxUtilsService = new ProposalEmailDocxUtilsService();
	private readonly templateLoaderService: ProposalEmailTemplateLoaderService;
	private readonly proposalEmailLinkWorkflowService: ProposalEmailLinkWorkflowService;
	private readonly proposalOptionsWorkflowService: ProposalOptionsWorkflowService;

	constructor(
		private readonly dlTokenService: DlTokenService,
		private readonly blobStorageService: BlobStorageService,
		@Inject(forwardRef(() => ProposalAssetService))
		private readonly proposalAssetService: ProposalAssetService,
		@Optional()
		private readonly adminAnalyticsDownloadTrackingService?: AdminAnalyticsDownloadTrackingService,
	) {
		this.templateLoaderService = new ProposalEmailTemplateLoaderService(
			this.env,
		);
		this.proposalEmailLinkWorkflowService =
			new ProposalEmailLinkWorkflowService({
				env: this.env,
				dlTokenService: this.dlTokenService,
				resolveSelectedOpportunityListSkuIds: (...args) =>
					this.resolveSelectedOpportunityListSkuIds(...args),
				buildOpportunityListSolutions: (...args) =>
					this.buildOpportunityListSolutions(...args),
				loadTemplateBuffer: (...args) => this.loadTemplateBuffer(...args),
				injectDocxHyperlinks: (...args) => this.injectDocxHyperlinks(...args),
				resolveCustomerProposalScenarios: (...args) =>
					this.resolveCustomerProposalScenarios(...args),
				resolvePartnerProposalScenarios: (...args) =>
					this.resolvePartnerProposalScenarios(...args),
				resolveCustomerProposalTemplatePath: (...args) =>
					this.resolveCustomerProposalTemplatePath(...args),
				resolvePartnerProposalTemplatePath: (...args) =>
					this.resolvePartnerProposalTemplatePath(...args),
				renderCustomerProposalEmail: (...args) =>
					this.renderCustomerProposalEmail(...args),
				buildPartnerProposalTemplateValues: (...args) =>
					this.buildPartnerProposalTemplateValues(...args),
				toPricingContextPayload: (
					pricingContext: RegionalPricingContext,
				): PricingContextPayload => toPricingContextPayload(pricingContext),
				buildRegionalPricingContextForRegions: (
					regions: Array<string | undefined>,
					options?: {
						currencyOverride?: RegionalCurrencyCode | string | null;
					},
				): RegionalPricingContext =>
					buildRegionalPricingContextForRegions(regions, options),
			});
		this.proposalOptionsWorkflowService = new ProposalOptionsWorkflowService({
			env: this.env,
			dlTokenService: this.dlTokenService,
			blobStorageService: this.blobStorageService,
			loadTemplateBuffer: (...args) => this.loadTemplateBuffer(...args),
			loadFlyerTemplateBuffer: (...args) =>
				this.loadFlyerTemplateBuffer(...args),
			resolveFlyerSourcePath: (...args) => this.resolveFlyerSourcePath(...args),
			hydrateFlyerTemplateBuffer: (...args) =>
				this.hydrateFlyerTemplateBuffer(...args),
			buildFlyerPlaceholderValuesFromScenario: (...args) =>
				this.buildFlyerPlaceholderValuesFromScenario(...args),
			renderCustomerProposalEmail: (...args) =>
				this.renderCustomerProposalEmail(...args),
			injectDocxHyperlinks: (...args) => this.injectDocxHyperlinks(...args),
			embedInlineScreenshot: (...args) => this.embedInlineScreenshot(...args),
			removeImageAnchorText: (...args) => this.removeImageAnchorText(...args),
			injectDocumentsZipLink: (...args) => this.injectDocumentsZipLink(...args),
		});
	}

	createOpportunityListEmailLink(
		payload: CreateOpportunityListEmailLinkDto,
		options?: { pdfDownloadUrl?: string },
	): {
		url: string;
		expiresAt: string;
	} {
		return this.proposalEmailLinkWorkflowService.createOpportunityListEmailLink(
			payload,
			options,
		);
	}

	async renderOpportunityListEmailFromToken(
		dlToken: string | undefined,
	): Promise<Buffer> {
		return this.proposalEmailLinkWorkflowService.renderOpportunityListEmailFromToken(
			dlToken,
		);
	}

	createCustomerProposalEmailLink(
		payload: CreateCustomerProposalEmailLinkDto,
	): { url: string; expiresAt: string } {
		return this.proposalEmailLinkWorkflowService.createCustomerProposalEmailLink(
			payload,
		);
	}

	async renderCustomerProposalEmailFromToken(
		dlToken: string | undefined,
	): Promise<Buffer> {
		return this.proposalEmailLinkWorkflowService.renderCustomerProposalEmailFromToken(
			dlToken,
		);
	}

	createPartnerProposalEmailLink(payload: CreateCustomerProposalEmailLinkDto): {
		url: string;
		expiresAt: string;
	} {
		return this.proposalEmailLinkWorkflowService.createPartnerProposalEmailLink(
			payload,
		);
	}

	async renderPartnerProposalEmailFromToken(
		dlToken: string | undefined,
	): Promise<Buffer> {
		return this.proposalEmailLinkWorkflowService.renderPartnerProposalEmailFromToken(
			dlToken,
		);
	}

	createProposalAssetsBundleLink(
		payload: CreateProposalPptSessionDto,
		issuanceContext?: ProposalIssuanceContext,
	): {
		url: string;
		expiresAt: string;
	} {
		const scenarios = this.resolveProposalPptScenarios(payload);

		const tokenPayload: ProposalAssetsBundlePayload = {
			journey: payload.journey,
			customerId: payload.customerId,
			customerName: payload.customerName,
			fileName: payload.fileName,
			scenarios,
			useChatToPaidFlyers: payload.useChatToPaidFlyers,
			currency: payload.currency,
			partnerFilters: payload.partnerFilters,
		};

		const token = this.dlTokenService.createToken({
			scope: 'proposal-assets-bundle',
			tenantId: this.env.defaultTenantId,
			filters: EMPTY_FILTERS,
			sort: EMPTY_SORT,
			selectedSkuIds: scenarios.map((scenario) => scenario.endingSkuId),
			customerId: payload.customerId,
			proposalAssetsBundle: tokenPayload,
			ttlSeconds: this.env.proposalOptionsEmailTokenTtlSeconds,
		});
		this.recordProposalIssuanceForToken(token, issuanceContext);

		return {
			url: `/api/email/proposal-assets/download?dlToken=${encodeURIComponent(token)}`,
			expiresAt: new Date(
				Date.now() + this.env.proposalOptionsEmailTokenTtlSeconds * 1000,
			).toISOString(),
		};
	}

	async renderProposalAssetsBundleFromToken(
		dlToken: string | undefined,
		file?: 'ppt' | 'email',
	): Promise<{ fileName: string; buffer: Buffer; contentType: string }> {
		const tokenPayload = this.dlTokenService.verifyTokenForScope({
			token: dlToken,
			scope: 'proposal-assets-bundle',
		});
		const proposalAssetsBundle = tokenPayload.proposalAssetsBundle;
		if (!proposalAssetsBundle) {
			throw new UnauthorizedException(
				'Invalid proposal-assets bundle payload in download token',
			);
		}

		if (file === 'ppt') {
			const proposalPayload: ProposalPptPayload = {
				mode:
					proposalAssetsBundle.scenarios.length <= 1
						? 'single'
						: 'consolidated',
				journey: proposalAssetsBundle.journey,
				customerId: proposalAssetsBundle.customerId,
				customerName: proposalAssetsBundle.customerName,
				fileName: proposalAssetsBundle.fileName,
				scenarios: proposalAssetsBundle.scenarios,
				useChatToPaidFlyers: proposalAssetsBundle.useChatToPaidFlyers,
				currency: proposalAssetsBundle.currency,
			};
			const pptBuffer = await this.renderProposalPpt(proposalPayload);
			return {
				fileName: this.sanitizeProposalPptFileName(
					proposalAssetsBundle.fileName,
					proposalAssetsBundle.customerName,
				),
				buffer: pptBuffer,
				contentType: PPTX_CONTENT_TYPE,
			};
		}

		if (file === 'email') {
			const customerEmailPayload =
				this.buildCustomerProposalEmailPayloadFromProposalAssetsBundle(
					proposalAssetsBundle,
				);
			const emailBuffer =
				await this.renderCustomerProposalEmail(customerEmailPayload);
			return {
				fileName: this.sanitizeCustomerEmailFileName(
					proposalAssetsBundle.customerName,
				),
				buffer: emailBuffer,
				contentType: DOCX_CONTENT_TYPE,
			};
		}

		// Default: build ZIP bundle with consolidated + individual PPT assets and customer email.
		const proposalPayload: ProposalPptPayload = {
			mode:
				proposalAssetsBundle.scenarios.length <= 1 ? 'single' : 'consolidated',
			journey: proposalAssetsBundle.journey,
			customerId: proposalAssetsBundle.customerId,
			customerName: proposalAssetsBundle.customerName,
			fileName: proposalAssetsBundle.fileName,
			scenarios: proposalAssetsBundle.scenarios,
			useChatToPaidFlyers: proposalAssetsBundle.useChatToPaidFlyers,
			currency: proposalAssetsBundle.currency,
		};
		const primaryPptBuffer = await this.renderProposalPpt(proposalPayload);
		const primaryPptFileName = this.sanitizeProposalPptFileName(
			proposalAssetsBundle.fileName,
			proposalAssetsBundle.customerName,
		);
		const pptFiles: Array<{ fileName: string; buffer: Buffer }> = [
			{ fileName: primaryPptFileName, buffer: primaryPptBuffer },
		];

		if (proposalAssetsBundle.scenarios.length > 1) {
			const individualPptFiles = await Promise.all(
				proposalAssetsBundle.scenarios.map(async (scenario, index) => {
					const lineItem = this.buildLineItemMeta({
						scenario,
						documentIndex: index + 1,
						totalDocuments: proposalAssetsBundle.scenarios.length,
					});
					const fileName = this.sanitizeProposalPptFileName(
						lineItem.fileName,
						proposalAssetsBundle.customerName,
					);
					const buffer = await this.renderProposalPpt({
						mode: 'single',
						journey: proposalAssetsBundle.journey,
						customerId: proposalAssetsBundle.customerId,
						customerName: proposalAssetsBundle.customerName,
						fileName,
						scenarios: [scenario],
						useChatToPaidFlyers: proposalAssetsBundle.useChatToPaidFlyers,
					});
					return { fileName, buffer };
				}),
			);

			pptFiles.push(...individualPptFiles);
		}

		const customerEmailPayload =
			this.buildCustomerProposalEmailPayloadFromProposalAssetsBundle(
				proposalAssetsBundle,
			);
		const customerEmailBuffer =
			await this.renderCustomerProposalEmail(customerEmailPayload);

		const customerEmailFileName = this.sanitizeCustomerEmailFileName(
			proposalAssetsBundle.customerName,
		);
		const zipBuffer = this.buildProposalAssetsBundleZip({
			pptFiles,
			customerEmailFileName,
			customerEmailBuffer,
		});

		return {
			fileName: this.sanitizeProposalAssetsBundleFileName(
				proposalAssetsBundle.customerName,
			),
			buffer: zipBuffer,
			contentType: ZIP_CONTENT_TYPE,
		};
	}

	createProposalPptSession(
		payload: CreateProposalPptSessionDto,
		issuanceContext?: ProposalIssuanceContext,
	): {
		token: string;
		renderUrl: string;
		downloadUrl: string;
		expiresAt: string;
	} {
		const scenarios = this.resolveProposalPptScenarios(payload);
		const fileName = this.sanitizeProposalPptFileName(
			payload.fileName,
			payload.customerName,
		);

		const tokenPayload: ProposalPptPayload = {
			mode: payload.mode,
			journey: payload.journey,
			customerId: payload.customerId,
			customerName: payload.customerName,
			fileName,
			scenarios,
			useChatToPaidFlyers: payload.useChatToPaidFlyers,
			currency: payload.currency,
			partnerFilters: payload.partnerFilters,
		};

		const renderToken = this.dlTokenService.createToken({
			scope: 'proposal-ppt',
			tenantId: this.env.defaultTenantId,
			filters: EMPTY_FILTERS,
			sort: EMPTY_SORT,
			selectedSkuIds: scenarios.map((scenario) => scenario.endingSkuId),
			customerId: payload.customerId,
			proposalPpt: tokenPayload,
			ttlSeconds: this.env.proposalOptionsEmailTokenTtlSeconds,
		});
		const downloadToken = this.dlTokenService.createToken({
			scope: 'proposal-ppt',
			tenantId: this.env.defaultTenantId,
			filters: EMPTY_FILTERS,
			sort: EMPTY_SORT,
			selectedSkuIds: scenarios.map((scenario) => scenario.endingSkuId),
			customerId: payload.customerId,
			proposalPpt: tokenPayload,
			ttlSeconds: this.env.proposalOptionsEmailTokenTtlSeconds,
		});
		this.recordProposalIssuanceForToken(downloadToken, issuanceContext);
		const encodedRenderToken = encodeURIComponent(renderToken);
		const encodedDownloadToken = encodeURIComponent(downloadToken);

		return {
			token: renderToken,
			renderUrl: `/api/email/proposal-ppt/render?dlToken=${encodedRenderToken}`,
			downloadUrl: `/api/email/proposal-ppt/download?dlToken=${encodedDownloadToken}`,
			expiresAt: new Date(
				Date.now() + this.env.proposalOptionsEmailTokenTtlSeconds * 1000,
			).toISOString(),
		};
	}

	async renderProposalPptFromToken(
		dlToken: string | undefined,
	): Promise<{ fileName: string; buffer: Buffer }> {
		const tokenPayload = this.dlTokenService.verifyTokenForScope({
			token: dlToken,
			scope: 'proposal-ppt',
		});
		const proposalPpt = tokenPayload.proposalPpt;
		if (!proposalPpt) {
			throw new UnauthorizedException(
				'Invalid proposal-ppt payload in download token',
			);
		}

		const buffer = await this.renderProposalPpt(proposalPpt);
		return {
			fileName: this.sanitizeProposalPptFileName(
				proposalPpt.fileName,
				proposalPpt.customerName,
			),
			buffer,
		};
	}

	async uploadProposalPpts(dto: UploadProposalPptsDto): Promise<{
		results: Array<{
			key: string;
			blobUrl: string;
			fileName: string;
		}>;
		uploadedAt: string;
	}> {
		const scenarios = this.resolveProposalPptScenarios({
			mode: 'consolidated',
			journey: dto.journey,
			customerId: dto.customerId,
			customerName: dto.customerName,
			fileName: 'upload',
			scenarios: dto.scenarios,
		});

		const customerSlug = slugify(dto.customerName || 'customer');
		const timestamp = Date.now();

		interface RenderTask {
			key: string;
			fileName: string;
			payload: ProposalPptPayload;
		}

		const tasks: RenderTask[] = [];

		// Consolidated PPT (only when >1 scenario)
		if (scenarios.length > 1) {
			tasks.push({
				key: 'consolidated',
				fileName: `${customerSlug}-consolidated-proposals.pptx`,
				payload: {
					mode: 'consolidated',
					journey: dto.journey,
					customerId: dto.customerId,
					customerName: dto.customerName,
					fileName: `${customerSlug}-consolidated-proposals.pptx`,
					scenarios,
				},
			});
		}

		// Individual PPT per scenario
		for (const scenario of scenarios) {
			tasks.push({
				key: scenario.opportunityId,
				fileName: `${customerSlug}-${slugify(scenario.opportunityId)}-proposal.pptx`,
				payload: {
					mode: 'single',
					journey: dto.journey,
					customerId: dto.customerId,
					customerName: dto.customerName,
					fileName: `${customerSlug}-${slugify(scenario.opportunityId)}-proposal.pptx`,
					scenarios: [scenario],
				},
			});
		}

		const settled = await Promise.allSettled(
			tasks.map(async (task) => {
				const buffer = await this.renderProposalPpt(task.payload);
				const blobName = `proposal-ppts/${customerSlug}/${timestamp}-${slugify(task.key)}.pptx`;
				const blobUrl = await this.blobStorageService.upload(
					this.env.azureStorageContainerName,
					blobName,
					buffer,
					PPTX_CONTENT_TYPE,
				);
				return { key: task.key, blobUrl, fileName: task.fileName };
			}),
		);

		const results: Array<{ key: string; blobUrl: string; fileName: string }> =
			[];
		for (const outcome of settled) {
			if (outcome.status === 'fulfilled') {
				results.push(outcome.value);
			}
		}

		if (results.length === 0) {
			const firstRejection = settled.find(
				(outcome): outcome is PromiseRejectedResult =>
					outcome.status === 'rejected',
			);
			if (firstRejection && firstRejection.reason instanceof Error) {
				throw firstRejection.reason;
			}
			throw new InternalServerErrorException('All proposal PPT uploads failed');
		}

		return { results, uploadedAt: new Date().toISOString() };
	}

	async prepareProposalAssets(
		dto: UploadProposalPptsDto,
		issuanceContext?: ProposalIssuanceContext,
	): Promise<{
		results: Array<{ key: string; blobUrl: string; fileName: string }>;
		consolidatedDownloadUrl: string | null;
		bundleDownloadUrl: string;
		uploadedAt: string;
	}> {
		const uploadResult = await this.uploadProposalPpts(dto);
		const consolidated = uploadResult.results.find(
			(r) => r.key === 'consolidated',
		);
		// Single scenario: no 'consolidated' key, use the sole result
		const consolidatedDownloadUrl =
			consolidated?.blobUrl ??
			(uploadResult.results.length === 1
				? uploadResult.results[0].blobUrl
				: null);

		// Generate the JWT-based bundle download URL (synchronous — just token signing)
		const customerSlug = slugify(dto.customerName || 'customer');
		const { url: bundleDownloadUrl } = this.createProposalAssetsBundleLink(
			{
				mode: 'consolidated',
				journey: dto.journey,
				customerId: dto.customerId,
				customerName: dto.customerName,
				fileName: `${customerSlug}-consolidated-proposals.pptx`,
				scenarios: dto.scenarios,
			},
			issuanceContext,
		);

		return { ...uploadResult, consolidatedDownloadUrl, bundleDownloadUrl };
	}

	async loadProposalAssetsFromSubscriptions(params: {
		journey: ProposalOptionsJourney;
		customerId: string;
		customerName?: string;
		subscriptions: RenewalSubscription[];
		selections: ProposalAssetSelectionInput[];
		issuanceContext?: ProposalIssuanceContext;
		useChatToPaidFlyers?: boolean;
		currency?: RegionalCurrencyCode;
		partnerFilters?: PartnerFiltersPayload | null;
	}): Promise<ProposalAssetsLoadResponse> {
		const subscriptions = this.normalizeCustomerSubscriptions({
			customerId: params.customerId,
			subscriptions: params.subscriptions,
		});
		const customerName =
			params.customerName?.trim() ||
			subscriptions[0]?.customerName?.trim() ||
			'Customer';

		const selectedScenarios = this.resolveProposalAssetScenariosFromSelections({
			journey: params.journey,
			subscriptions,
			selections: params.selections,
		});
		const pricingContext = buildRegionalPricingContextForRegions(
			selectedScenarios.map((scenario) => scenario.region),
			{ currencyOverride: params.currency },
		);

		const summary = this.computeProposalAssetsSummary(
			selectedScenarios,
			params.journey,
			pricingContext,
			params.partnerFilters,
		);
		const lineItems = selectedScenarios.map((scenario, index) =>
			this.buildLineItemMeta({
				scenario,
				documentIndex: selectedScenarios.length > 1 ? index + 1 : null,
				totalDocuments: selectedScenarios.length,
			}),
		);

		let consolidated: { blobUrl: string; fileName: string } | null = null;
		let uploadedAt: string;

		if (selectedScenarios.length > 1) {
			const consolidatedAsset = await this.generateConsolidatedProposalPreview({
				journey: params.journey,
				customerId: params.customerId,
				customerName,
				selectedScenarios,
				useChatToPaidFlyers: params.useChatToPaidFlyers,
				currency: params.currency,
				partnerFilters: params.partnerFilters,
			});
			consolidated = {
				blobUrl: consolidatedAsset.blobUrl,
				fileName: consolidatedAsset.fileName,
			};
			uploadedAt = consolidatedAsset.uploadedAt;
		} else {
			uploadedAt = new Date().toISOString();
		}

		const isSingle = selectedScenarios.length <= 1;
		const { url: bundleDownloadUrl } = this.createProposalAssetsBundleLink(
			{
				mode: isSingle ? 'single' : 'consolidated',
				journey: params.journey,
				customerId: params.customerId,
				customerName,
				fileName: isSingle
					? (lineItems[0]?.fileName ?? 'proposal.pptx')
					: consolidated!.fileName,
				scenarios: selectedScenarios,
				useChatToPaidFlyers: params.useChatToPaidFlyers,
				currency: params.currency,
			},
			params.issuanceContext,
		);

		return {
			customer: {
				customerId: params.customerId,
				customerName,
			},
			selectedScenarios,
			summary,
			pricingContext: toPricingContextPayload(pricingContext),
			assets: {
				consolidated,
				lineItems,
				bundleDownloadUrl,
				uploadedAt,
			},
		};
	}

	async generateProposalLineItemAssetFromSubscriptions(params: {
		journey: ProposalOptionsJourney;
		customerId: string;
		customerName?: string;
		subscriptions: RenewalSubscription[];
		selection: ProposalAssetSelectionInput;
		selectionContext?: ProposalAssetSelectionInput[];
		useChatToPaidFlyers?: boolean;
		currency?: RegionalCurrencyCode;
		partnerFilters?: PartnerFiltersPayload | null;
	}): Promise<ProposalAssetLineItemResponse> {
		const subscriptions = this.normalizeCustomerSubscriptions({
			customerId: params.customerId,
			subscriptions: params.subscriptions,
		});
		const customerName =
			params.customerName?.trim() ||
			subscriptions[0]?.customerName?.trim() ||
			'Customer';
		const contextSelections =
			params.selectionContext && params.selectionContext.length > 0
				? params.selectionContext
				: [params.selection];

		const selectedScenarios = this.resolveProposalAssetScenariosFromSelections({
			journey: params.journey,
			subscriptions,
			selections: contextSelections,
		});
		const scenarioIndex = selectedScenarios.findIndex(
			(candidate) =>
				candidate.opportunityId === params.selection.opportunityId &&
				candidate.endingSkuId === params.selection.endingSkuId,
		);
		const hasMatchedScenario = scenarioIndex >= 0;
		const resolvedScenarioIndex = hasMatchedScenario ? scenarioIndex : 0;
		const scenario = hasMatchedScenario
			? selectedScenarios[scenarioIndex]
			: selectedScenarios[0];
		if (!scenario) {
			throw new UnprocessableEntityException(
				'Unable to resolve selected proposal scenario',
			);
		}

		const lineItem = this.buildLineItemMeta({
			scenario,
			documentIndex:
				hasMatchedScenario && selectedScenarios.length > 1
					? resolvedScenarioIndex + 1
					: null,
			totalDocuments: hasMatchedScenario ? selectedScenarios.length : 1,
		});
		const payload: ProposalPptPayload = {
			mode: 'single',
			journey: params.journey,
			customerId: params.customerId,
			customerName,
			fileName: lineItem.fileName,
			scenarios: [scenario],
			useChatToPaidFlyers: params.useChatToPaidFlyers,
			currency: params.currency,
			partnerFilters: params.partnerFilters ?? undefined,
		};
		const buffer = await this.renderProposalPpt(payload);
		const blobName = this.buildLineItemBlobName({
			journey: params.journey,
			customerId: params.customerId,
			customerName,
			scenario,
			fileName: lineItem.fileName,
			useChatToPaidFlyers: params.useChatToPaidFlyers,
		});
		const blobUrl = await this.blobStorageService.upload(
			this.env.azureStorageContainerName,
			blobName,
			buffer,
			PPTX_CONTENT_TYPE,
		);

		return {
			opportunityId: lineItem.opportunityId,
			endingSkuId: lineItem.endingSkuId,
			selectedSeats: lineItem.selectedSeats,
			label: lineItem.label,
			fileName: lineItem.fileName,
			blobUrl,
			uploadedAt: new Date().toISOString(),
		};
	}

	private normalizeCustomerSubscriptions(params: {
		customerId: string;
		subscriptions: RenewalSubscription[];
	}): RenewalSubscription[] {
		return this.assetMapperService.normalizeCustomerSubscriptions(params);
	}

	private computeProposalAssetsSummary(
		selectedScenarios: ProposalSelectedScenario[],
		journey: ProposalOptionsJourney,
		pricingContext?: RegionalPricingContext,
		partnerFilters?: PartnerFiltersPayload | null,
	): ProposalAssetsSummary {
		return this.assetMapperService.computeProposalAssetsSummary(
			selectedScenarios,
			journey,
			pricingContext,
			partnerFilters,
		);
	}

	private async generateConsolidatedProposalPreview(params: {
		journey: ProposalOptionsJourney;
		customerId: string;
		customerName: string;
		selectedScenarios: ProposalSelectedScenario[];
		useChatToPaidFlyers?: boolean;
		currency?: RegionalCurrencyCode;
		partnerFilters?: PartnerFiltersPayload | null;
	}): Promise<{ blobUrl: string; fileName: string; uploadedAt: string }> {
		const customerSlug = slugifyUnderscore(params.customerName || 'customer');
		const fileName = `${customerSlug}_consolidated_proposals.pptx`;
		const payload: ProposalPptPayload = {
			mode: params.selectedScenarios.length <= 1 ? 'single' : 'consolidated',
			journey: params.journey,
			customerId: params.customerId,
			customerName: params.customerName,
			fileName,
			scenarios: params.selectedScenarios,
			useChatToPaidFlyers: params.useChatToPaidFlyers,
			currency: params.currency,
			partnerFilters: params.partnerFilters ?? undefined,
		};
		const buffer = await this.renderProposalPpt(payload);
		const scenarioSignature = params.selectedScenarios
			.map(
				(scenario) =>
					`${scenario.opportunityId}:${scenario.endingSkuId}:${scenario.selectedSeats}`,
			)
			.join('|');
		const hash = this.buildAssetHash(
			`${params.journey}|${params.customerId}|consolidated|${scenarioSignature}|${params.useChatToPaidFlyers ? 'chat-to-paid' : 'standard'}`,
		);
		const blobName = [
			'proposal-ppts',
			slugify(params.customerName || 'customer'),
			'consolidated',
			`${customerSlug}_${hash}.pptx`,
		].join('/');
		const blobUrl = await this.blobStorageService.upload(
			this.env.azureStorageContainerName,
			blobName,
			buffer,
			PPTX_CONTENT_TYPE,
		);

		return {
			blobUrl,
			fileName,
			uploadedAt: new Date().toISOString(),
		};
	}

	private recordProposalIssuanceForToken(
		token: string,
		issuanceContext?: ProposalIssuanceContext,
	): void {
		if (!this.adminAnalyticsDownloadTrackingService) {
			return;
		}

		try {
			const tokenPayload = this.dlTokenService.readTokenPayload(token);
			void this.adminAnalyticsDownloadTrackingService.recordIssuance({
				tokenPayload,
				category: 'proposals',
				actorId: issuanceContext?.actorId ?? null,
				tenantId: issuanceContext?.tenantId ?? null,
				requestId: issuanceContext?.requestId ?? null,
				route: issuanceContext?.route ?? null,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			this.logger.warn(
				`Failed to record proposal issuance analytics: ${message}`,
			);
		}
	}

	private buildLineItemMeta(params: {
		scenario: ProposalLineItemScenario;
		documentIndex: number | null;
		totalDocuments: number;
	}): ProposalAssetsLineItemMeta {
		return this.assetMapperService.buildLineItemMeta(params);
	}

	private buildLineItemBlobName(params: {
		journey: ProposalOptionsJourney;
		customerId: string;
		customerName: string;
		scenario: {
			opportunityId: string;
			endingSkuId: string;
			selectedSeats: number;
		};
		fileName: string;
		useChatToPaidFlyers?: boolean;
	}): string {
		return this.assetMapperService.buildLineItemBlobName(params);
	}

	private buildAssetHash(input: string): string {
		return this.assetMapperService.buildAssetHash(input);
	}

	createSyntheticSubscriptionForNewCustomer(params: {
		customerId: string;
		subscriptionId?: string;
		partnerName: string;
		customerName: string;
		currentSku: string;
		seatCount: number;
		costPerUser: number;
		region: string;
	}): RenewalSubscription {
		const renewalDate = new Date();
		renewalDate.setDate(renewalDate.getDate() + 90);

		const skuCategoryMap: Record<string, SkuCategory> = {
			'Business Basic': SkuCategory.Basic,
			'Business Standard': SkuCategory.Standard,
			'Business Premium': SkuCategory.Premium,
			Other: SkuCategory.Other,
		};

		return {
			customerId: params.customerId,
			subscriptionId: params.subscriptionId ?? `local-${params.customerId}`,
			customerName: params.customerName,
			resellerName: params.partnerName,
			distributorName: '',
			pssAIWorkforceName: '',
			pssAISecurityName: '',
			psaName: '',
			pdmName: '',
			pmmName: '',
			currentProduct: params.currentSku,
			skuCategory: skuCategoryMap[params.currentSku] ?? SkuCategory.Other,
			seatCount: Math.max(0, Math.floor(params.seatCount)),
			annualRevenueRunRate: Math.max(
				0,
				Math.floor(params.seatCount) * params.costPerUser * 12,
			),
			renewalDate: renewalDate.toISOString(),
			termMonths: 12,
			autoRenew: false,
			multiYear: false,
			hasCopilot: false,
			hasPurview: false,
			hasSureStep: false,
			currentMargin: 20,
			customerSegment: '',
			region: params.region,
			notes: '',
		};
	}

	private resolveProposalAssetScenariosFromSelections(params: {
		journey: ProposalOptionsJourney;
		subscriptions: RenewalSubscription[];
		selections: ProposalAssetSelectionInput[];
	}): ProposalSelectedScenario[] {
		return this.assetMapperService.resolveProposalAssetScenariosFromSelections(
			params,
		);
	}

	private buildOpportunityIndexForSelections(
		subscriptions: RenewalSubscription[],
		journey: ProposalOptionsJourney,
	) {
		return this.assetMapperService.buildOpportunityIndexForSelections(
			subscriptions,
			journey,
		);
	}

	private toProposalExpiringArr(params: {
		journey: ProposalOptionsJourney;
		annualRevenueRunRate: number;
		region?: string | null;
		country?: string | null;
		currentProduct?: string | null;
		seatCount?: number | null;
	}): number {
		return this.assetMapperService.toProposalExpiringArr(params);
	}

	async createProposalOptionsEmailLink(params: {
		payload: CreateProposalOptionsEmailLinkPayloadDto;
		screenshotFile?: UploadedImageFile;
	}): Promise<{ url: string; expiresAt: string }> {
		return this.proposalOptionsWorkflowService.createProposalOptionsEmailLink(
			params,
		);
	}

	private async renderProposalPpt(
		payload: ProposalPptPayload,
	): Promise<Buffer> {
		if (payload.mode === 'single' || payload.scenarios.length <= 1) {
			return this.renderSingleProposalPpt(payload);
		}
		return this.renderMultiProposalPpt(payload);
	}

	private async renderSingleProposalPpt(
		payload: ProposalPptPayload,
	): Promise<Buffer> {
		const scenario = payload.scenarios[0];
		if (!scenario) {
			throw new UnprocessableEntityException(
				'Single proposal PPT generation requires exactly one scenario',
			);
		}

		const flyerRelativePath = resolveProposalFlyerTemplatePath({
			journey: payload.journey,
			startingSkuId: scenario.startingSkuId,
			endingSkuId: scenario.endingSkuId,
			useChatToPaidFlyers: payload.useChatToPaidFlyers,
		});
		if (!flyerRelativePath) {
			throw new UnprocessableEntityException(
				`No flyer template mapping found for ${payload.journey}:${scenario.startingSkuId}:${scenario.endingSkuId}`,
			);
		}

		const sourceBuffer = await this.loadFlyerTemplateBuffer(flyerRelativePath);
		const pricingContext = buildRegionalPricingContext({
			region: scenario.region,
			currencyOverride: payload.currency,
		});
		const replacements = this.buildFlyerPlaceholderValuesFromScenario(
			scenario,
			pricingContext,
			payload.journey,
			payload.partnerFilters,
		);

		const mainDeck = this.hydrateFlyerTemplateBuffer(
			sourceBuffer,
			replacements,
			{ strictValidation: true },
		);
		const disclaimerSourceBuffer = await this.loadFlyerTemplateBuffer(
			SINGLE_PROPOSAL_DISCLAIMER,
		);
		const disclaimerDeck = this.hydrateFlyerTemplateBuffer(
			disclaimerSourceBuffer,
			replacements,
			{ strictValidation: true },
		);
		return this.mergePptDecks([mainDeck, disclaimerDeck]);
	}

	private async renderMultiProposalPpt(
		payload: ProposalPptPayload,
	): Promise<Buffer> {
		const templatePaths = this.resolveMultiRenewalTemplatePaths(
			payload.scenarios,
			payload.journey,
		);
		const aggregatedReplacements = this.buildMultiRenewalFlyerValues(
			payload.scenarios,
			payload.journey,
			payload.currency,
			payload.partnerFilters,
		);
		const multiRenewalPricingContext = buildRegionalPricingContextForRegions(
			payload.scenarios.map((scenario) => scenario.region),
			{ currencyOverride: payload.currency },
		);
		const aiScenarioReplacementsQueue =
			this.buildInvestmentFlyerReplacementsByType({
				scenarios: payload.scenarios,
				upgradeType: UpgradeType.AI,
				pricingContext: multiRenewalPricingContext,
				journey: payload.journey,
				partnerFilters: payload.partnerFilters,
			});
		const securityScenarioReplacementsQueue =
			this.buildInvestmentFlyerReplacementsByType({
				scenarios: payload.scenarios,
				upgradeType: UpgradeType.SECURITY,
				pricingContext: multiRenewalPricingContext,
				journey: payload.journey,
				partnerFilters: payload.partnerFilters,
			});
		const decks: Buffer[] = [];

		for (const relativePath of templatePaths) {
			const loadPath = resolveMultiRenewalLoadPath(
				relativePath,
				payload.useChatToPaidFlyers,
			);
			let sourceBuffer = await this.loadFlyerTemplateBuffer(loadPath);
			let replacements = aggregatedReplacements;

			if (relativePath === MULTI_RENEWAL_FIRST_PAGE) {
				sourceBuffer = this.hydrateMultiRenewalFirstPageRows(
					sourceBuffer,
					payload.scenarios,
				);
			}
			if (MULTI_RENEWAL_INVESTMENT_AI_PATHS.has(relativePath)) {
				replacements =
					aiScenarioReplacementsQueue.shift() ?? aggregatedReplacements;
			}
			if (MULTI_RENEWAL_INVESTMENT_SECURITY_PATHS.has(relativePath)) {
				replacements =
					securityScenarioReplacementsQueue.shift() ?? aggregatedReplacements;
			}
			if (relativePath === MULTI_RENEWAL_INVESTMENT_SUMMARY_PAGE) {
				const summaryData = this.buildInvestmentSummaryData(
					payload.scenarios,
					multiRenewalPricingContext,
					payload.journey,
					payload.partnerFilters,
				);
				const hydratedBuffer = this.hydrateInvestmentSummaryPage(
					sourceBuffer,
					summaryData,
				);
				decks.push(hydratedBuffer);
				continue;
			}

			const hydrated = this.hydrateFlyerTemplateBuffer(
				sourceBuffer,
				replacements,
				{ strictValidation: true },
			);
			decks.push(hydrated);
		}

		return this.mergePptDecks(decks);
	}

	private resolveCustomerProposalScenarios(
		payload: CreateCustomerProposalEmailLinkDto,
	): CustomerProposalEmailScenarioPayload[] {
		return this.templateService.resolveCustomerProposalScenarios(payload);
	}

	private resolvePartnerProposalScenarios(
		payload: CreateCustomerProposalEmailLinkDto,
	): CustomerProposalEmailScenarioPayload[] {
		return this.templateService.resolvePartnerProposalScenarios(payload);
	}

	private resolveProposalPptScenarios(
		payload: CreateProposalPptSessionDto,
	): ProposalPptScenarioPayload[] {
		const ordered: ProposalPptScenarioPayload[] = [];
		const seenScenarioKeys = new Set<string>();

		for (const candidate of payload.scenarios) {
			const scenarioKey = buildScenarioSelectionKey(
				candidate.opportunityId,
				candidate.endingSkuId,
			);
			if (seenScenarioKeys.has(scenarioKey)) {
				continue;
			}

			const startingSku = STARTING_SKU_BY_ID.get(candidate.startingSkuId);
			if (!startingSku) {
				throw new UnprocessableEntityException(
					`Unknown starting SKU "${candidate.startingSkuId}"`,
				);
			}

			if (!ENDING_SKU_BY_ID.has(candidate.endingSkuId)) {
				throw new UnprocessableEntityException(
					`Unknown ending SKU "${candidate.endingSkuId}"`,
				);
			}

			seenScenarioKeys.add(scenarioKey);
			ordered.push({
				opportunityId: candidate.opportunityId,
				startingSkuId: candidate.startingSkuId,
				startingSkuName:
					candidate.startingSkuName?.trim().length > 0
						? candidate.startingSkuName.trim()
						: startingSku.name,
				endingSkuId: candidate.endingSkuId,
				selectedSeats: Math.max(0, Math.floor(candidate.selectedSeats)),
				originalSeats: Math.max(0, Math.floor(candidate.originalSeats)),
				expiringArr: Math.max(0, candidate.expiringArr),
				currentSkuCustomerPrice: normalizeOptionalRenewalPrice(
					candidate.currentSkuCustomerPrice,
				),
				currentSkuResellerPrice: normalizeOptionalRenewalPrice(
					candidate.currentSkuResellerPrice,
				),
				targetSkuCustomerPrice: normalizeOptionalRenewalPrice(
					candidate.targetSkuCustomerPrice,
				),
				targetSkuResellerPrice: normalizeOptionalRenewalPrice(
					candidate.targetSkuResellerPrice,
				),
				expiringSkuRenewalPrice: normalizeOptionalRenewalPrice(
					candidate.expiringSkuRenewalPrice,
				),
				targetSkuPrice: normalizeOptionalRenewalPrice(candidate.targetSkuPrice),
				region: candidate.region?.trim() ?? '',
			});
		}

		if (ordered.length === 0) {
			throw new UnprocessableEntityException(
				'At least one valid proposal scenario is required',
			);
		}

		if (payload.mode === 'single' && ordered.length !== 1) {
			throw new UnprocessableEntityException(
				'Single proposal PPT mode requires exactly one selected scenario',
			);
		}

		if (ordered.length > PROPOSAL_PPT_MAX_SCENARIOS) {
			throw new UnprocessableEntityException(
				`Proposal PPT supports up to ${PROPOSAL_PPT_MAX_SCENARIOS} scenarios`,
			);
		}

		if (payload.journey === 'renewal') {
			return applyRenewalAllocationIfNeeded(ordered);
		}

		return ordered;
	}

	private sanitizeProposalPptFileName(
		input: string,
		customerName: string,
	): string {
		const fallbackBase = `${slugify(customerName || 'customer')}-proposal`;
		const normalized = input
			.trim()
			.toLowerCase()
			.replace(/\.pptx$/i, '')
			.replace(/[^a-z0-9-_]+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 120);
		const base = normalized.length > 0 ? normalized : fallbackBase;
		return `${base}.pptx`;
	}

	private buildFlyerPlaceholderValuesFromScenario(
		scenarioPayload: ProposalPptScenarioPayload,
		pricingContext?: RegionalPricingContext,
		journey: ProposalOptionsJourney = 'renewal',
		partnerFilters?: PartnerFiltersPayload | null,
	): Record<string, string> {
		const rawStartingSku = STARTING_SKU_BY_ID.get(
			scenarioPayload.startingSkuId,
		);
		if (!rawStartingSku) {
			throw new UnprocessableEntityException(
				`Unknown starting SKU "${scenarioPayload.startingSkuId}"`,
			);
		}

		const effectivePricingContext =
			pricingContext ??
			buildRegionalPricingContext({
				region: scenarioPayload.region,
			});
		const regionalEndingSku = getValidUpgradePaths(
			scenarioPayload.startingSkuId,
			{
				region: scenarioPayload.region,
				country: effectivePricingContext.country,
			},
		).find((candidate) => candidate.id === scenarioPayload.endingSkuId);
		const endingSku =
			regionalEndingSku ?? ENDING_SKU_BY_ID.get(scenarioPayload.endingSkuId);
		if (!endingSku) {
			throw new UnprocessableEntityException(
				`Unknown ending SKU "${scenarioPayload.endingSkuId}"`,
			);
		}

		const startingSku = resolveEffectiveStartingSku(
			rawStartingSku,
			scenarioPayload,
		);
		const seats = Math.max(0, Math.floor(scenarioPayload.selectedSeats));
		const explicitPrices = resolveScenarioExplicitPrices({
			startingSku,
			endingSku,
			scenario: scenarioPayload,
		});
		const scenario = calculateScenarioFromExplicitPrices(
			startingSku,
			endingSku,
			seats,
			explicitPrices,
			{
				journey,
				expiringArr: scenarioPayload.expiringArr,
				originalSeats: scenarioPayload.originalSeats,
				// Unified seat policy: current and target legs both use the
				// partner-edited proposal seats. Without this, the rules engine
				// falls back to originalSeats (DB) for the current leg, producing
				// per-scenario incremental values that disagree with the email
				// data.
				currentSeats: seats,
				region: scenarioPayload.region,
				country: effectivePricingContext.country,
				isIncentiveEligible: isIncentiveEligibleFromFilters(partnerFilters),
			},
		);
		const incrementalPerUserAnnual = computeIncrementalCostPerUserAnnual({
			offerAnnualValue: scenario.offerAnnualValue,
			currentAnnualValue: scenario.currentAnnualValue,
			seats,
		});
		const actualPricePerUserAnnual =
			seats > 0
				? scenario.listAnnualValue / seats
				: roundCurrency(endingSku.listPrice * 12);
		const afterPromoPerUserAnnual = roundCurrency(
			explicitPrices.targetSkuCustomerPrice * 12,
		);
		const promoSavingsPerUserAnnual = roundCurrency(
			(endingSku.listPrice - explicitPrices.targetSkuCustomerPrice) * 12,
		);
		// Monthly cost tiles ("Actual cost per user", "Cost after promo",
		// savings %) come from the fixed regional list/promo prices in
		// packages/shared/src/regional-pricing.ts (independent of partner-
		// entered prices). `endingSku` was resolved via getValidUpgradePaths
		// with `effectivePricingContext.country`, which buildRegionalPricingContext
		// already flips to the override currency's country when a currency
		// override is set — so listPrice/promoPrice are already in
		// `effectivePricingContext.currency`. No further conversion needed.
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
		const currencyFormat = toCurrencyFormatOptions(effectivePricingContext);

		return {
			start_sku: scenarioPayload.startingSkuName,
			starting_sku: scenarioPayload.startingSkuName,
			target_sku: endingSku.name,
			add_proposed_seat: formatNumber(seats),
			// `{seats}` is used in the investment-snapshot template both for
			// the "# Seats" row and the "Total incremental annual investment
			// for {seats} seats" label, so it must reflect what the partner
			// entered on the scenario card (selectedSeats), not the original
			// DB seat count.
			seats: formatNumber(seats),
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

	private buildMultiRenewalFlyerValues(
		scenarios: ProposalPptScenarioPayload[],
		journey: ProposalOptionsJourney,
		currencyOverride?: RegionalCurrencyCode,
		partnerFilters?: PartnerFiltersPayload | null,
	): Record<string, string> {
		const isIncentiveEligible = isIncentiveEligibleFromFilters(partnerFilters);
		const pricingContext = buildRegionalPricingContextForRegions(
			scenarios.map((scenario) => scenario.region),
			{ currencyOverride },
		);
		const currencyFormat = toCurrencyFormatOptions(pricingContext);
		let totalSeats = 0;
		let totalOriginalSeats = 0;
		let totalExpiringArr = 0;
		let totalListAnnual = 0;
		let totalOfferAnnual = 0;
		let totalPromoSavingsAnnual = 0;
		let totalIncrementalCost = 0;
		let totalIncrementalCostForPerUser = 0;
		let totalCurrentIncentive = 0;
		let totalNewIncentive = 0;
		// Seat-weighted totals derived purely from regional-pricing.ts (no
		// partner overrides) — drives the monthly tile placeholders.
		let totalRegionalListMonthlyXSeats = 0;
		let totalRegionalPromoMonthlyXSeats = 0;
		const startSkuNames: string[] = [];
		const targetSkuNames: string[] = [];
		// Current-side aggregates (originalSeats, expiringArr, currentIncentive)
		// reflect the customer's actual current state. Multiple alternative
		// paths for the same opportunity must be counted once, not once per
		// alternative.
		const seenOpportunityIdsForCurrentAggregates = new Set<string>();

		for (const scenarioPayload of scenarios) {
			const rawStartingSku = STARTING_SKU_BY_ID.get(
				scenarioPayload.startingSkuId,
			);
			const endingSku =
				getValidUpgradePaths(scenarioPayload.startingSkuId, {
					region: scenarioPayload.region,
					country: pricingContext.country,
				}).find((candidate) => candidate.id === scenarioPayload.endingSkuId) ??
				ENDING_SKU_BY_ID.get(scenarioPayload.endingSkuId);
			if (!rawStartingSku || !endingSku) {
				throw new UnprocessableEntityException(
					`Invalid scenario SKU combination "${scenarioPayload.startingSkuId}:${scenarioPayload.endingSkuId}"`,
				);
			}

			if (!startSkuNames.includes(scenarioPayload.startingSkuName)) {
				startSkuNames.push(scenarioPayload.startingSkuName);
			}
			if (!targetSkuNames.includes(endingSku.name)) {
				targetSkuNames.push(endingSku.name);
			}

			const startingSku = resolveEffectiveStartingSku(
				rawStartingSku,
				scenarioPayload,
			);
			const seats = Math.max(0, Math.floor(scenarioPayload.selectedSeats));
			const explicitPrices = resolveScenarioExplicitPrices({
				startingSku,
				endingSku,
				scenario: scenarioPayload,
			});
			const scenario = calculateScenarioFromExplicitPrices(
				startingSku,
				endingSku,
				seats,
				explicitPrices,
				{
					journey,
					expiringArr: scenarioPayload.expiringArr,
					originalSeats: scenarioPayload.originalSeats,
					// Unified seat policy: current and target legs both use the
					// partner-edited proposal seats.
					currentSeats: seats,
					region: scenarioPayload.region,
					country: pricingContext.country,
					isIncentiveEligible,
				},
			);

			const isFirstAlternativeForOpportunity =
				!seenOpportunityIdsForCurrentAggregates.has(
					scenarioPayload.opportunityId,
				);
			if (isFirstAlternativeForOpportunity) {
				seenOpportunityIdsForCurrentAggregates.add(
					scenarioPayload.opportunityId,
				);
				totalOriginalSeats += Math.max(
					0,
					Math.floor(scenarioPayload.originalSeats),
				);
				totalExpiringArr += Math.max(0, scenarioPayload.expiringArr);
				totalCurrentIncentive += scenario.economics.currentIncentive;
			}
			totalSeats += seats;
			totalListAnnual += scenario.listAnnualValue;
			totalOfferAnnual += scenario.offerAnnualValue;
			totalPromoSavingsAnnual += scenario.promoSavingsAnnual;
			totalIncrementalCost += scenario.incrementalCost;
			totalIncrementalCostForPerUser +=
				computeIncrementalCostPerUserAnnual({
					offerAnnualValue: scenario.offerAnnualValue,
					currentAnnualValue: scenario.currentAnnualValue,
					seats,
				}) * seats;
			totalNewIncentive += scenario.economics.totalIncentive;
			// `endingSku` was resolved via getValidUpgradePaths with
			// `pricingContext.country`, which buildRegionalPricingContextForRegions
			// already flips to the override currency's country when an override
			// is set — so listPrice/promoPrice are already in
			// `pricingContext.currency`. No further conversion needed.
			totalRegionalListMonthlyXSeats += endingSku.listPrice * seats;
			totalRegionalPromoMonthlyXSeats += endingSku.promoPrice * seats;
		}

		const actualPricePerUserAnnual =
			totalSeats > 0 ? totalListAnnual / totalSeats : 0;
		const afterPromoPerUserAnnual =
			totalSeats > 0 ? totalOfferAnnual / totalSeats : 0;
		const promoSavingsPerUserAnnual =
			totalSeats > 0 ? totalPromoSavingsAnnual / totalSeats : 0;
		const incrementalCostPerUserAnnual =
			totalSeats > 0 ? totalIncrementalCostForPerUser / totalSeats : 0;
		// Monthly tiles use the fixed regional list/promo prices straight from
		// packages/shared/src/regional-pricing.ts (seat-weighted average across
		// the selected scenarios). Partner price overrides do not influence
		// these tiles.
		const actualCostPerUserMonthly =
			totalSeats > 0
				? roundCurrency(totalRegionalListMonthlyXSeats / totalSeats)
				: 0;
		const afterPromoPerUserMonthly =
			totalSeats > 0
				? roundCurrency(totalRegionalPromoMonthlyXSeats / totalSeats)
				: 0;
		const promoSavingsPercent =
			actualCostPerUserMonthly > 0
				? Math.round(
						((actualCostPerUserMonthly - afterPromoPerUserMonthly) /
							actualCostPerUserMonthly) *
							100,
					)
				: 0;

		return {
			start_sku: startSkuNames.join(', '),
			starting_sku: startSkuNames.join(', '),
			target_sku: targetSkuNames.join(', '),
			add_proposed_seat: formatNumber(totalSeats),
			// `{seats}` powers the "Current SKU → # Seats" row, so use the
			// per-opportunity-deduped DB seat count (matches per-card flyers).
			seats: formatNumber(totalOriginalSeats > 0 ? totalOriginalSeats : totalSeats),
			expiring_arr: formatCurrency(totalExpiringArr, currencyFormat),
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
				totalIncrementalCost,
				currencyFormat,
			),
			incremental_cost_per_user: formatCurrency(
				incrementalCostPerUserAnnual,
				currencyFormat,
			),
			current_incentive: formatCurrency(totalCurrentIncentive, currencyFormat),
			new_incentive: formatCurrency(totalNewIncentive, currencyFormat),
		};
	}

	private buildInvestmentFlyerReplacementsByType(params: {
		scenarios: ProposalPptScenarioPayload[];
		upgradeType: UpgradeType;
		pricingContext: RegionalPricingContext;
		journey: ProposalOptionsJourney;
		partnerFilters?: PartnerFiltersPayload | null;
	}): Array<Record<string, string>> {
		const replacements: Array<Record<string, string>> = [];

		for (const scenario of params.scenarios) {
			const endingSku = ENDING_SKU_BY_ID.get(scenario.endingSkuId);
			if (!endingSku) {
				throw new UnprocessableEntityException(
					`Unknown ending SKU "${scenario.endingSkuId}"`,
				);
			}
			if (endingSku.upgradeType !== params.upgradeType) {
				continue;
			}
			replacements.push(
				this.buildFlyerPlaceholderValuesFromScenario(
					scenario,
					params.pricingContext,
					params.journey,
					params.partnerFilters,
				),
			);
		}

		return replacements;
	}

	private buildInvestmentSummaryData(
		scenarios: ProposalPptScenarioPayload[],
		pricingContext: RegionalPricingContext,
		journey: ProposalOptionsJourney,
		partnerFilters?: PartnerFiltersPayload | null,
	): {
		scenarios: Array<{
			start_sku: string;
			target_sku: string;
			seats: string;
			incremental_cost_per_user: string;
			overall_incremental_cost: string;
		}>;
		total_overall_incremental_cost: string;
	} {
		const currencyFormat = toCurrencyFormatOptions(pricingContext);
		let totalIncrementalCost = 0;
		const rows: Array<{
			start_sku: string;
			target_sku: string;
			seats: string;
			incremental_cost_per_user: string;
			overall_incremental_cost: string;
		}> = [];

		for (const scenario of scenarios) {
			const values = this.buildFlyerPlaceholderValuesFromScenario(
				scenario,
				pricingContext,
				journey,
				partnerFilters,
			);

			rows.push({
				start_sku: values.start_sku,
				target_sku: values.target_sku,
				// Investment Summary's `# Seats` column should reflect each row's
				// proposed (selected) seats, since the cost columns are computed
				// from selectedSeats. `values.seats` is `originalSeats` for the
				// per-card "Current SKU → # Seats" row — wrong for this table.
				seats: values.add_proposed_seat,
				incremental_cost_per_user: values.incremental_cost_per_user,
				overall_incremental_cost: values.overall_incremental_cost,
			});

			const rawStartingSku = STARTING_SKU_BY_ID.get(scenario.startingSkuId);
			const endingSku =
				getValidUpgradePaths(scenario.startingSkuId, {
					region: scenario.region,
					country: pricingContext.country,
				}).find((c) => c.id === scenario.endingSkuId) ??
				ENDING_SKU_BY_ID.get(scenario.endingSkuId);
			if (!rawStartingSku || !endingSku) {
				throw new UnprocessableEntityException(
					`Invalid scenario SKU combination "${scenario.startingSkuId}:${scenario.endingSkuId}"`,
				);
			}

			const startingSku = resolveEffectiveStartingSku(rawStartingSku, scenario);
			const seats = Math.max(0, Math.floor(scenario.selectedSeats));
			const explicitPrices = resolveScenarioExplicitPrices({
				startingSku,
				endingSku,
				scenario,
			});
			const computed = calculateScenarioFromExplicitPrices(
				startingSku,
				endingSku,
				seats,
				explicitPrices,
				{
					journey,
					expiringArr: scenario.expiringArr,
					originalSeats: scenario.originalSeats,
					// Unified seat policy: current and target legs both use the
					// partner-edited proposal seats.
					currentSeats: seats,
					region: scenario.region,
					country: pricingContext.country,
					isIncentiveEligible: isIncentiveEligibleFromFilters(partnerFilters),
				},
			);
			totalIncrementalCost += computed.incrementalCost;
		}

		return {
			scenarios: rows,
			total_overall_incremental_cost: formatCurrency(
				totalIncrementalCost,
				currencyFormat,
			),
		};
	}

	private hydrateInvestmentSummaryPage(
		buffer: Buffer,
		data: {
			scenarios: Array<{
				start_sku: string;
				target_sku: string;
				seats: string;
				incremental_cost_per_user: string;
				overall_incremental_cost: string;
			}>;
			total_overall_incremental_cost: string;
		},
	): Buffer {
		const zip = new PizZip(buffer);
		const doc = new Docxtemplater(zip, {
			paragraphLoop: true,
			linebreaks: true,
		});
		doc.render(data);
		return doc.getZip().generate({
			type: 'nodebuffer',
			compression: 'DEFLATE',
			mimeType: PPTX_CONTENT_TYPE,
		});
	}

	private hydrateMultiRenewalFirstPageRows(
		sourceBuffer: Buffer,
		scenarios: ProposalPptScenarioPayload[],
	): Buffer {
		const rows = this.buildMultiRenewalFirstPageRows(scenarios);
		const zip = new PizZip(sourceBuffer);
		const firstSlidePath = 'ppt/slides/slide1.xml';
		const firstSlideFile = zip.file(firstSlidePath);
		if (!firstSlideFile) {
			throw new InternalServerErrorException(
				'Multi-renewal first-page template is missing slide1.xml',
			);
		}

		const updatedXml = this.renderMultiRenewalFirstPageTableRows(
			firstSlideFile.asText(),
			rows,
		);
		zip.file(firstSlidePath, updatedXml);
		return zip.generate({
			type: 'nodebuffer',
			compression: 'DEFLATE',
			mimeType: PPTX_CONTENT_TYPE,
		});
	}

	private buildMultiRenewalFirstPageRows(
		scenarios: ProposalPptScenarioPayload[],
	): Array<Record<'start_sku' | 'target_sku' | 'seats', string>> {
		const rows: Array<Record<'start_sku' | 'target_sku' | 'seats', string>> =
			[];

		for (const scenario of scenarios) {
			const endingSku = ENDING_SKU_BY_ID.get(scenario.endingSkuId);
			if (!endingSku) {
				throw new UnprocessableEntityException(
					`Unknown ending SKU "${scenario.endingSkuId}"`,
				);
			}
			rows.push({
				start_sku: scenario.startingSkuName,
				target_sku: endingSku.name,
				seats: formatNumber(scenario.selectedSeats),
			});
		}

		return rows;
	}

	private renderMultiRenewalFirstPageTableRows(
		xml: string,
		rows: Array<Record<'start_sku' | 'target_sku' | 'seats', string>>,
	): string {
		if (rows.length === 0) {
			throw new UnprocessableEntityException(
				'At least one scenario is required for the multi-renewal first page',
			);
		}

		let hasDynamicTemplateRow = false;
		const tablePattern = /<a:tbl>[\s\S]*?<\/a:tbl>/g;

		const hydratedXml = xml.replace(tablePattern, (tableXml) => {
			const rowPattern = /<a:tr\b[\s\S]*?<\/a:tr>/g;
			const rowMatches = [...tableXml.matchAll(rowPattern)];
			if (rowMatches.length === 0) {
				return tableXml;
			}

			const templateRowIndexes = rowMatches
				.map((match, index) => {
					const tokens = extractFlyerTemplateTokensFromDrawingXml(match[0]);
					const normalizedTokens = tokens
						.map((token) => normalizeFlyerPlaceholderName(token))
						.filter((token): token is string => token.length > 0);
					const isDynamicRow =
						normalizedTokens.includes('start_sku') &&
						normalizedTokens.includes('target_sku') &&
						normalizedTokens.includes('seats');

					return isDynamicRow ? index : -1;
				})
				.filter((index) => index >= 0);

			if (templateRowIndexes.length === 0) {
				return tableXml;
			}

			hasDynamicTemplateRow = true;

			const templateRowXml = rowMatches[templateRowIndexes[0]][0];
			const renderedRows = rows
				.map((row) => hydratePptXmlText(templateRowXml, row))
				.join('');

			const templateRowIndexSet = new Set(templateRowIndexes);
			let rebuiltTableXml = '';
			let cursor = 0;

			for (let rowIndex = 0; rowIndex < rowMatches.length; rowIndex += 1) {
				const rowMatch = rowMatches[rowIndex];
				const rowStart = rowMatch.index ?? 0;
				const rowEnd = rowStart + rowMatch[0].length;

				rebuiltTableXml += tableXml.slice(cursor, rowStart);
				if (rowIndex === templateRowIndexes[0]) {
					rebuiltTableXml += renderedRows;
				}
				if (!templateRowIndexSet.has(rowIndex)) {
					rebuiltTableXml += rowMatch[0];
				}
				cursor = rowEnd;
			}

			rebuiltTableXml += tableXml.slice(cursor);
			return rebuiltTableXml;
		});

		if (!hasDynamicTemplateRow) {
			throw new UnprocessableEntityException(
				'Multi-renewal first-page template is missing row placeholders for {start_sku}, {target_sku}, and {seats}',
			);
		}

		return hydratedXml;
	}

	private resolveMultiRenewalTemplatePaths(
		scenarios: ProposalPptScenarioPayload[],
		journey?: ProposalOptionsJourney,
	): string[] {
		const investmentAiPath =
			journey === 'new_customer'
				? MULTI_RENEWAL_INVESTMENT_AI_NEW_CUSTOMER
				: MULTI_RENEWAL_INVESTMENT_AI;
		const investmentSecurityPath =
			journey === 'new_customer'
				? MULTI_RENEWAL_INVESTMENT_SECURITY_NEW_CUSTOMER
				: MULTI_RENEWAL_INVESTMENT_SECURITY;
		const selectedEndingSkuIds = new Set(
			scenarios.map((scenario) => scenario.endingSkuId),
		);
		const templatePaths: string[] = [MULTI_RENEWAL_FIRST_PAGE];
		const pushUnique = (templatePath: string) => {
			if (!templatePaths.includes(templatePath)) {
				templatePaths.push(templatePath);
			}
		};
		const hasBsCb = selectedEndingSkuIds.has('bs_cb');
		const hasBpCb = selectedEndingSkuIds.has('bp_cb');
		const hasBpCbPurview = selectedEndingSkuIds.has('bp_cb_purview');
		const hasBpDefender = selectedEndingSkuIds.has('bp_defender');
		const hasBpPurview = selectedEndingSkuIds.has('bp_purview');
		const hasBpDefenderPurview = selectedEndingSkuIds.has(
			'bp_defender_purview',
		);

		if (hasBpCbPurview) {
			pushUnique(MULTI_RENEWAL_BP_AND_CB_AND_PURVIEW);
		} else if (hasBsCb || hasBpCb) {
			pushUnique(MULTI_RENEWAL_BS_OR_BP_AND_CB);
		}

		if (hasBpDefenderPurview) {
			pushUnique(MULTI_RENEWAL_DEFENDER_AND_PURVIEW);
		} else {
			if (hasBpDefender) {
				pushUnique(MULTI_RENEWAL_DEFENDER_SUITE);
			}
			if (hasBpPurview && !hasBpCbPurview) {
				pushUnique(MULTI_RENEWAL_PURVIEW_SUITE);
			}
		}

		let aiScenarioCount = 0;
		let securityScenarioCount = 0;
		for (const scenario of scenarios) {
			const endingSku = ENDING_SKU_BY_ID.get(scenario.endingSkuId);
			if (!endingSku) {
				throw new UnprocessableEntityException(
					`Unknown ending SKU "${scenario.endingSkuId}"`,
				);
			}
			if (endingSku.upgradeType === UpgradeType.AI) {
				aiScenarioCount += 1;
			} else {
				securityScenarioCount += 1;
			}
		}

		for (let index = 0; index < aiScenarioCount; index += 1) {
			templatePaths.push(investmentAiPath);
		}
		for (let index = 0; index < securityScenarioCount; index += 1) {
			templatePaths.push(investmentSecurityPath);
		}

		templatePaths.push(MULTI_RENEWAL_INVESTMENT_SUMMARY_PAGE);
		templatePaths.push(MULTI_RENEWAL_LAST_PAGE);
		templatePaths.push(MULTI_RENEWAL_DISCLAIMER_CONSOLIDATED);
		return templatePaths;
	}

	private resolveCustomerProposalTemplatePath(params: {
		journey: 'new_customer' | 'renewal';
		scenarios: CustomerProposalEmailScenarioPayload[];
	}): string {
		return this.templateService.resolveCustomerProposalTemplatePath(params);
	}

	private resolvePartnerProposalTemplatePath(params: {
		journey: 'new_customer' | 'renewal';
		scenarios: CustomerProposalEmailScenarioPayload[];
	}): string {
		return this.templateService.resolvePartnerProposalTemplatePath(params);
	}

	private async renderCustomerProposalEmail(
		payload: CustomerProposalEmailPayload,
	): Promise<Buffer> {
		const templateBuffer = await this.loadTemplateBuffer(payload.templatePath);
		const zip = new PizZip(templateBuffer);
		const doc = new Docxtemplater(zip, {
			paragraphLoop: true,
			linebreaks: true,
			nullGetter: () => '',
		});

		doc.render(this.buildCustomerProposalTemplateValues(payload));

		return doc.getZip().generate({
			type: 'nodebuffer',
			mimeType: DOCX_CONTENT_TYPE,
		});
	}

	private buildPartnerProposalTemplateValues(
		payload: CustomerProposalEmailPayload,
	): Record<string, unknown> {
		const values =
			this.templateService.buildPartnerProposalTemplateValues(payload);
		return {
			...values,
			link: PARTNER_PROPOSAL_BOM_LINK_TOKEN,
			url: PARTNER_PROPOSAL_UPLOAD_LINK_TOKEN,
		};
	}

	private buildPartnerProposalChunks(params: {
		scenarioValues: PartnerProposalScenarioValues[];
	}): Array<Record<string, string | boolean>> {
		return this.templateService.buildPartnerProposalChunks(params);
	}

	private buildCustomerProposalTemplateValues(
		payload: CustomerProposalEmailPayload,
	): Record<string, unknown> {
		return this.templateService.buildCustomerProposalTemplateValues(payload);
	}

	private buildCustomerProposalEmailPayloadFromProposalAssetsBundle(
		proposalAssetsBundle: ProposalAssetsBundlePayload,
	): CustomerProposalEmailPayload {
		const customerScenarios: CustomerProposalEmailScenarioPayload[] =
			proposalAssetsBundle.scenarios.map((scenario) => ({
				opportunityId: scenario.opportunityId,
				startingSkuId: scenario.startingSkuId,
				startingSkuName: scenario.startingSkuName,
				endingSkuId: scenario.endingSkuId,
				selectedSeats: scenario.selectedSeats,
				originalSeats: scenario.originalSeats,
				expiringArr: scenario.expiringArr,
				currentSkuCustomerPrice: scenario.currentSkuCustomerPrice,
				currentSkuResellerPrice: scenario.currentSkuResellerPrice,
				targetSkuCustomerPrice: scenario.targetSkuCustomerPrice,
				targetSkuResellerPrice: scenario.targetSkuResellerPrice,
				expiringSkuRenewalPrice: scenario.expiringSkuRenewalPrice,
				targetSkuPrice: scenario.targetSkuPrice,
				region: scenario.region,
			}));
		const pricingContext = buildRegionalPricingContextForRegions(
			customerScenarios.map((scenario) => scenario.region),
			{ currencyOverride: proposalAssetsBundle.currency },
		);

		return {
			templatePath: this.resolveCustomerProposalTemplatePath({
				journey: proposalAssetsBundle.journey,
				scenarios: customerScenarios,
			}),
			journey: proposalAssetsBundle.journey,
			customerId: proposalAssetsBundle.customerId,
			customerName: proposalAssetsBundle.customerName,
			pricingContext: toPricingContextPayload(pricingContext),
			scenarios: customerScenarios,
		};
	}

	private buildCustomerProposalScenarioValues(
		scenarioPayload: CustomerProposalEmailScenarioPayload,
		payload: Pick<CustomerProposalEmailPayload, 'journey' | 'pricingContext'>,
	): Record<string, string> {
		return this.templateService.buildCustomerProposalScenarioValues(
			scenarioPayload,
			payload,
		);
	}

	private formatBulletLines(values: string[] | null | undefined): string {
		return this.templateService.formatBulletLines(values);
	}

	async renderProposalOptionsEmailFromToken(
		dlToken: string | undefined,
	): Promise<Buffer> {
		return this.proposalOptionsWorkflowService.renderProposalOptionsEmailFromToken(
			dlToken,
		);
	}

	private resolveSelectedOpportunityListSkuIds(
		selectedSkuIds: string[],
	): string[] {
		const unique: string[] = [];
		for (const skuId of selectedSkuIds) {
			if (!ENDING_SKU_BY_ID.has(skuId)) continue;
			if (!unique.includes(skuId)) {
				unique.push(skuId);
			}
		}

		if (unique.length === 0) {
			throw new UnprocessableEntityException(
				'At least one valid ending SKU must be selected',
			);
		}

		return unique;
	}

	private buildOpportunityListSolutions(
		selectedSkuIds: string[],
	): OpportunityListEmailSolution[] {
		const selected = new Set(selectedSkuIds);
		const rows: OpportunityListEmailSolution[] = [];

		for (const sku of ENDING_SKUS) {
			if (!selected.has(sku.id)) continue;
			rows.push({
				solutionName: sku.name,
				bestFor: OPPORTUNITY_LIST_SKU_BEST_FOR[sku.id] ?? '',
			});
		}

		return rows;
	}

	private buildProposalAssetsBundleZip(params: {
		pptFiles: Array<{ fileName: string; buffer: Buffer }>;
		customerEmailFileName: string;
		customerEmailBuffer: Buffer;
	}): Buffer {
		const zip = new PizZip();
		for (const pptFile of params.pptFiles) {
			zip.file(pptFile.fileName, pptFile.buffer);
		}
		zip.file(params.customerEmailFileName, params.customerEmailBuffer);
		return zip.generate({ type: 'nodebuffer', mimeType: ZIP_CONTENT_TYPE });
	}

	private sanitizeCustomerEmailFileName(customerName: string): string {
		const slug = slugify(customerName || 'customer');
		return `${slug}-customer-proposal-email.docx`;
	}

	private sanitizeProposalAssetsBundleFileName(customerName: string): string {
		const slug = slugify(customerName || 'customer');
		return `${slug}-proposal-assets.zip`;
	}

	private hydrateFlyerTemplateBuffer(
		sourceBuffer: Buffer,
		replacements: Record<string, string>,
		options?: {
			strictValidation?: boolean;
		},
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
			compression: 'DEFLATE',
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

	private async loadFlyerTemplateBuffer(relativePath: string): Promise<Buffer> {
		return this.templateLoaderService.loadFlyerTemplateBuffer(relativePath);
	}

	mergePptDecks(decks: Buffer[]): Buffer {
		if (decks.length === 0) {
			throw new UnprocessableEntityException(
				'Cannot compose proposal PPT without source templates',
			);
		}
		if (decks.length === 1) {
			return decks[0];
		}

		const baseZip = new PizZip(decks[0]);
		let presentationXml = getRequiredZipText(
			baseZip,
			PPT_PRESENTATION_XML_PATH,
		);
		let presentationRelsXml = getRequiredZipText(
			baseZip,
			PPT_PRESENTATION_RELS_XML_PATH,
		);
		let contentTypesXml = getRequiredZipText(
			baseZip,
			PPT_CONTENT_TYPES_XML_PATH,
		);
		let nextSlideIndex = getNextSlideFileIndex(baseZip);
		let nextSlideId = getNextSlideId(presentationXml);
		let nextSlideMasterId = getNextSlideMasterId(presentationXml);
		let nextPresentationRelId = getNextPresentationRelId(presentationRelsXml);
		const registeredSlideMasterTargets =
			collectPresentationRelationshipTargetsByType({
				relsXml: presentationRelsXml,
				relationshipType: PPT_RELATIONSHIP_TYPE_SLIDE_MASTER,
			});
		const registeredNotesMasterTargets =
			collectPresentationRelationshipTargetsByType({
				relsXml: presentationRelsXml,
				relationshipType: PPT_RELATIONSHIP_TYPE_NOTES_MASTER,
			});
		const existingPaths = new Set(Object.keys(baseZip.files));
		const nextCanonicalPartIndexByCategory =
			createNextCanonicalPartIndexByCategory(existingPaths);
		const primaryNotesMasterPath =
			[...registeredNotesMasterTargets].sort()[0] ?? null;
		const mediaPartPathByHash = buildMediaPartPathByHashIndex(baseZip);

		for (let deckIndex = 1; deckIndex < decks.length; deckIndex += 1) {
			const sourceZip = new PizZip(decks[deckIndex]);
			const slidePaths = listSlidePaths(sourceZip);
			const sourceContentTypes = parsePptContentTypesXml(
				getRequiredZipText(sourceZip, PPT_CONTENT_TYPES_XML_PATH),
			);
			const contentTypesState = { value: contentTypesXml };
			const dependencyCopyState: MergeDependencyCopyState = {
				sourceZip,
				baseZip,
				sourceContentTypes,
				copiedParts: new Map<string, string>(),
				existingPaths,
				contentTypesState,
				nextCanonicalPartIndexByCategory,
				primaryNotesMasterPath,
				deckToken: `m${deckIndex + 1}`,
				mediaPartPathByHash,
			};

			for (const sourceSlidePath of slidePaths) {
				const sourceSlideFileName = path.posix.basename(sourceSlidePath);
				const sourceSlideRelsPath = `ppt/slides/_rels/${sourceSlideFileName}.rels`;
				const sourceSlideRelsXml = sourceZip
					.file(sourceSlideRelsPath)
					?.asText();

				const destinationSlidePath = `ppt/slides/slide${nextSlideIndex}.xml`;
				const destinationSlideRelsPath = `ppt/slides/_rels/slide${nextSlideIndex}.xml.rels`;
				const relationshipId = `rId${nextPresentationRelId}`;

				baseZip.file(
					destinationSlidePath,
					getRequiredZipBuffer(sourceZip, sourceSlidePath),
				);
				existingPaths.add(destinationSlidePath);
				dependencyCopyState.copiedParts.set(
					path.posix.normalize(sourceSlidePath),
					destinationSlidePath,
				);

				if (sourceSlideRelsXml) {
					const rewrittenSlideRelsXml = rewriteAndCopyInternalRelationships({
						relsXml: sourceSlideRelsXml,
						sourceRelsPath: sourceSlideRelsPath,
						destinationRelsPath: destinationSlideRelsPath,
						state: dependencyCopyState,
					});
					baseZip.file(destinationSlideRelsPath, rewrittenSlideRelsXml);
					existingPaths.add(destinationSlideRelsPath);
				}

				presentationRelsXml = appendPresentationRelationship(
					presentationRelsXml,
					relationshipId,
					`slides/slide${nextSlideIndex}.xml`,
					PPT_RELATIONSHIP_TYPE_SLIDE,
				);
				presentationXml = appendSlideReference(
					presentationXml,
					nextSlideId,
					relationshipId,
				);
				contentTypesState.value = ensureSlideOverride(
					contentTypesState.value,
					`/ppt/slides/slide${nextSlideIndex}.xml`,
				);

				nextSlideIndex += 1;
				nextSlideId += 1;
				nextPresentationRelId += 1;
			}

			const copiedPartPaths = new Set(dependencyCopyState.copiedParts.values());
			for (const copiedPartPath of copiedPartPaths) {
				if (copiedPartPath.startsWith(PPT_SLIDE_MASTER_PART_PREFIX)) {
					if (registeredSlideMasterTargets.has(copiedPartPath)) {
						continue;
					}
					const relationshipId = `rId${nextPresentationRelId}`;
					const target = buildRelativeRelationshipTarget({
						relsPath: PPT_PRESENTATION_RELS_XML_PATH,
						destinationPartPath: copiedPartPath,
					});
					presentationRelsXml = appendPresentationRelationship(
						presentationRelsXml,
						relationshipId,
						target,
						PPT_RELATIONSHIP_TYPE_SLIDE_MASTER,
					);
					presentationXml = appendSlideMasterReference(
						presentationXml,
						nextSlideMasterId,
						relationshipId,
					);
					registeredSlideMasterTargets.add(copiedPartPath);
					nextSlideMasterId += 1;
					nextPresentationRelId += 1;
					continue;
				}

				if (copiedPartPath.startsWith(PPT_NOTES_MASTER_PART_PREFIX)) {
					if (registeredNotesMasterTargets.has(copiedPartPath)) {
						continue;
					}
					const relationshipId = `rId${nextPresentationRelId}`;
					const target = buildRelativeRelationshipTarget({
						relsPath: PPT_PRESENTATION_RELS_XML_PATH,
						destinationPartPath: copiedPartPath,
					});
					presentationRelsXml = appendPresentationRelationship(
						presentationRelsXml,
						relationshipId,
						target,
						PPT_RELATIONSHIP_TYPE_NOTES_MASTER,
					);
					presentationXml = appendNotesMasterReference(
						presentationXml,
						relationshipId,
					);
					registeredNotesMasterTargets.add(copiedPartPath);
					nextPresentationRelId += 1;
				}
			}

			contentTypesXml = contentTypesState.value;
		}

		const sanitized = sanitizeMergedPptPackage({
			zip: baseZip,
			presentationXml,
			presentationRelsXml,
			contentTypesXml,
		});
		presentationXml = sanitized.presentationXml;
		presentationRelsXml = sanitized.presentationRelsXml;
		contentTypesXml = sanitized.contentTypesXml;

		normalizeSlideMasterLayoutIds({ zip: baseZip });
		const normalizedGlobalIds = normalizeGlobalPresentationIds({
			zip: baseZip,
			presentationXml,
		});
		presentationXml = normalizedGlobalIds.presentationXml;
		const crossPoolIdCollisions = listCrossPoolIdCollisions({
			zip: baseZip,
			presentationXml,
		});
		if (crossPoolIdCollisions.length > 0) {
			throw new InternalServerErrorException(
				`Merged PPT contains cross-pool presentation ID collisions: ${crossPoolIdCollisions
					.map((collision) => `${collision.id} (${collision.refs.join(', ')})`)
					.join('; ')}`,
			);
		}
		const duplicateSlideMasterLayoutIds = listDuplicateSlideMasterLayoutIds({
			zip: baseZip,
		});
		if (duplicateSlideMasterLayoutIds.length > 0) {
			throw new InternalServerErrorException(
				`Merged PPT contains duplicate slide layout IDs across masters: ${duplicateSlideMasterLayoutIds
					.map((item) => `${item.id} (${item.masterPaths.join(', ')})`)
					.join('; ')}`,
			);
		}

		baseZip.file(PPT_PRESENTATION_XML_PATH, presentationXml);
		baseZip.file(PPT_PRESENTATION_RELS_XML_PATH, presentationRelsXml);
		baseZip.file(PPT_CONTENT_TYPES_XML_PATH, contentTypesXml);
		regeneratePptAppXml({
			zip: baseZip,
			presentationXml,
			presentationRelsXml,
		});

		return generatePptxWithCompressionPolicy(baseZip);
	}

	private injectDocxHyperlinks(
		zip: PizZip,
		targets: DocxHyperlinkTarget[],
	): void {
		this.docxUtilsService.injectDocxHyperlinks(zip, targets);
	}

	private injectDocumentsZipLink(zip: PizZip, zipUrl: string): void {
		this.docxUtilsService.injectDocumentsZipLink(zip, zipUrl);
	}

	private removeImageAnchorText(zip: PizZip): void {
		this.docxUtilsService.removeImageAnchorText(zip);
	}

	private embedInlineScreenshot(params: {
		zip: PizZip;
		imageBuffer: Buffer;
		mimeType: string;
	}): void {
		this.docxUtilsService.embedInlineScreenshot(params);
	}

	private async loadTemplateBuffer(templatePath: string): Promise<Buffer> {
		return this.templateLoaderService.loadTemplateBuffer(templatePath);
	}

	private resolveFlyerSourcePath(relativePath: string): string {
		return this.templateLoaderService.resolveFlyerSourcePath(relativePath);
	}
}
