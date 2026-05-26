import {
	UnauthorizedException,
	UnprocessableEntityException,
} from '@nestjs/common';
import {
	resolveOpportunityListTemplatePath,
	type RegionalPricingContext,
} from '@repo/shared';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { CreateCustomerProposalEmailLinkDto } from '../dto/create-customer-proposal-email-link.dto';
import type { CreateOpportunityListEmailLinkDto } from '../dto/create-opportunity-list-email-link.dto';
import { DlTokenService } from '../../pdf/dl-token.service';
import type {
	CustomerProposalEmailPayload,
	CustomerProposalEmailScenarioPayload,
	OpportunityListEmailPayload,
	OpportunityListEmailSolution,
	PdfFiltersPayload,
	PdfSortPayload,
	PricingContextPayload,
} from '../../pdf/types/dl-token.types';

const DOCX_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const OPPORTUNITY_UPLOAD_LINK_TOKEN = '__OPPORTUNITY_UPLOAD_LINK__';
const PDF_DOWNLOAD_LINK_TOKEN = '__PDF_DOWNLOAD_LINK__';

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

/** Partner proposal download links do not expire (10-year TTL). */
const PARTNER_PROPOSAL_TOKEN_TTL_SECONDS = 315_360_000;

interface EnvLike {
	defaultTenantId: string;
	proposalOptionsEmailTokenTtlSeconds: number;
	partnerUploadUrl: string;
}

interface LinkWorkflowDeps {
	env: EnvLike;
	dlTokenService: DlTokenService;
	resolveSelectedOpportunityListSkuIds: (selectedSkuIds: string[]) => string[];
	buildOpportunityListSolutions: (
		selectedSkuIds: string[],
	) => OpportunityListEmailSolution[];
	loadTemplateBuffer: (templatePath: string) => Promise<Buffer>;
	injectDocxHyperlinks: (
		zip: PizZip,
		targets: Array<{ token: string; url: string; displayText: string }>,
	) => void;
	resolveCustomerProposalScenarios: (
		payload: CreateCustomerProposalEmailLinkDto,
	) => CustomerProposalEmailScenarioPayload[];
	resolvePartnerProposalScenarios: (
		payload: CreateCustomerProposalEmailLinkDto,
	) => CustomerProposalEmailScenarioPayload[];
	resolveCustomerProposalTemplatePath: (params: {
		journey: 'new_customer' | 'renewal';
		scenarios: CustomerProposalEmailScenarioPayload[];
	}) => string;
	resolvePartnerProposalTemplatePath: (params: {
		journey: 'new_customer' | 'renewal';
		scenarios: CustomerProposalEmailScenarioPayload[];
	}) => string;
	renderCustomerProposalEmail: (
		payload: CustomerProposalEmailPayload,
	) => Promise<Buffer>;
	buildPartnerProposalTemplateValues: (
		payload: CustomerProposalEmailPayload,
	) => Record<string, unknown>;
	toPricingContextPayload: (
		pricingContext: RegionalPricingContext,
	) => PricingContextPayload;
	buildRegionalPricingContextForRegions: (
		regions: Array<string | undefined>,
		options?: { currencyOverride?: string | null },
	) => RegionalPricingContext;
}

function formatNumber(value: number): string {
	return Math.max(0, Math.floor(value)).toLocaleString('en-US');
}

export class ProposalEmailLinkWorkflowService {
	constructor(private readonly deps: LinkWorkflowDeps) {}

	createOpportunityListEmailLink(
		payload: CreateOpportunityListEmailLinkDto,
		options?: { pdfDownloadUrl?: string },
	): {
		url: string;
		expiresAt: string;
	} {
		const selectedSkuIds = this.deps.resolveSelectedOpportunityListSkuIds(
			payload.selectedSkuIds,
		);
		const templatePath = resolveOpportunityListTemplatePath({
			viewMode: payload.viewMode,
			selectedSkuIds,
		});
		if (!templatePath) {
			throw new UnprocessableEntityException(
				'No valid SKU category selected for opportunity-list email template',
			);
		}

		const tokenPayload: OpportunityListEmailPayload = {
			templatePath,
			viewMode: payload.viewMode,
			resellerCount: Math.max(0, Math.floor(payload.resellerCount)),
			customerCount: Math.max(0, Math.floor(payload.customerCount)),
			totalRenewals: Math.max(0, Math.floor(payload.totalRenewals)),
			totalSeatsRange: payload.totalSeatsRange,
			url: this.deps.env.partnerUploadUrl,
			solutions: this.deps.buildOpportunityListSolutions(selectedSkuIds),
			pdfDownloadUrl: options?.pdfDownloadUrl,
		};

		const token = this.deps.dlTokenService.createToken({
			scope: 'opportunity-list-email',
			tenantId: this.deps.env.defaultTenantId,
			filters: EMPTY_FILTERS,
			sort: EMPTY_SORT,
			selectedSkuIds,
			opportunityListEmail: tokenPayload,
			ttlSeconds: this.deps.env.proposalOptionsEmailTokenTtlSeconds,
		});

		return {
			url: `/api/email/opportunity-list/download?dlToken=${encodeURIComponent(token)}`,
			expiresAt: new Date(
				Date.now() + this.deps.env.proposalOptionsEmailTokenTtlSeconds * 1000,
			).toISOString(),
		};
	}

	async renderOpportunityListEmailFromToken(
		dlToken: string | undefined,
	): Promise<Buffer> {
		const tokenPayload = this.deps.dlTokenService.verifyTokenForScope({
			token: dlToken,
			scope: 'opportunity-list-email',
		});
		const opportunityListEmail = tokenPayload.opportunityListEmail;
		if (!opportunityListEmail) {
			throw new UnauthorizedException(
				'Invalid opportunity-list email payload in download token',
			);
		}

		const templateBuffer = await this.deps.loadTemplateBuffer(
			opportunityListEmail.templatePath,
		);
		const zip = new PizZip(templateBuffer);
		const doc = new Docxtemplater(zip, {
			paragraphLoop: true,
			linebreaks: true,
		});

		doc.render({
			resellers:
				opportunityListEmail.viewMode === 'reseller'
					? formatNumber(opportunityListEmail.resellerCount)
					: '',
			customers: formatNumber(opportunityListEmail.customerCount),
			opportunities: formatNumber(opportunityListEmail.totalRenewals),
			seats: opportunityListEmail.totalSeatsRange,
			expiring_arr: '',
			url: OPPORTUNITY_UPLOAD_LINK_TOKEN,
			list_url: opportunityListEmail.pdfDownloadUrl
				? PDF_DOWNLOAD_LINK_TOKEN
				: '',
			solutions: opportunityListEmail.solutions.map((solution) => ({
				name: solution.solutionName,
				bestFor: solution.bestFor,
			})),
		});

		const renderedZip = doc.getZip();
		const hyperlinkTargets = [
			{
				token: OPPORTUNITY_UPLOAD_LINK_TOKEN,
				url: opportunityListEmail.url,
				displayText: opportunityListEmail.url,
			},
		];

		if (opportunityListEmail.pdfDownloadUrl) {
			hyperlinkTargets.push({
				token: PDF_DOWNLOAD_LINK_TOKEN,
				url: opportunityListEmail.pdfDownloadUrl,
				displayText: 'Download PDF List',
			});
		}

		this.deps.injectDocxHyperlinks(renderedZip, hyperlinkTargets);

		return renderedZip.generate({
			type: 'nodebuffer',
			mimeType: DOCX_CONTENT_TYPE,
		});
	}

	createCustomerProposalEmailLink(
		payload: CreateCustomerProposalEmailLinkDto,
	): { url: string; expiresAt: string } {
		const normalizedScenarios =
			this.deps.resolveCustomerProposalScenarios(payload);
		const pricingContext = this.deps.buildRegionalPricingContextForRegions(
			normalizedScenarios.map((scenario) => scenario.region),
			{ currencyOverride: payload.currency },
		);
		const templatePath = this.deps.resolveCustomerProposalTemplatePath({
			journey: payload.journey,
			scenarios: normalizedScenarios,
		});

		const tokenPayload: CustomerProposalEmailPayload = {
			templatePath,
			journey: payload.journey,
			customerId: payload.customerId,
			customerName: payload.customerName,
			pricingContext: this.deps.toPricingContextPayload(pricingContext),
			scenarios: normalizedScenarios,
			partnerFilters: payload.partnerFilters,
		};

		const selectedSkuIds = normalizedScenarios.map(
			(scenario) => scenario.endingSkuId,
		);
		const token = this.deps.dlTokenService.createToken({
			scope: 'customer-proposal-email',
			tenantId: this.deps.env.defaultTenantId,
			filters: EMPTY_FILTERS,
			sort: EMPTY_SORT,
			selectedSkuIds,
			customerId: payload.customerId,
			customerProposalEmail: tokenPayload,
			ttlSeconds: this.deps.env.proposalOptionsEmailTokenTtlSeconds,
		});

		return {
			url: `/api/email/customer-proposal/download?dlToken=${encodeURIComponent(token)}`,
			expiresAt: new Date(
				Date.now() + this.deps.env.proposalOptionsEmailTokenTtlSeconds * 1000,
			).toISOString(),
		};
	}

	async renderCustomerProposalEmailFromToken(
		dlToken: string | undefined,
	): Promise<Buffer> {
		const tokenPayload = this.deps.dlTokenService.verifyTokenForScope({
			token: dlToken,
			scope: 'customer-proposal-email',
		});
		const customerProposalEmail = tokenPayload.customerProposalEmail;
		if (!customerProposalEmail) {
			throw new UnauthorizedException(
				'Invalid customer-proposal email payload in download token',
			);
		}
		return this.deps.renderCustomerProposalEmail(customerProposalEmail);
	}

	createPartnerProposalEmailLink(payload: CreateCustomerProposalEmailLinkDto): {
		url: string;
		expiresAt: string;
	} {
		const normalizedScenarios =
			this.deps.resolvePartnerProposalScenarios(payload);
		const pricingContext = this.deps.buildRegionalPricingContextForRegions(
			normalizedScenarios.map((scenario) => scenario.region),
			{ currencyOverride: payload.currency },
		);
		const templatePath = this.deps.resolvePartnerProposalTemplatePath({
			journey: payload.journey,
			scenarios: normalizedScenarios,
		});

		const tokenPayload: CustomerProposalEmailPayload = {
			templatePath,
			journey: payload.journey,
			customerId: payload.customerId,
			customerName: payload.customerName,
			pricingContext: this.deps.toPricingContextPayload(pricingContext),
			scenarios: normalizedScenarios,
			partnerFilters: payload.partnerFilters,
		};

		const token = this.deps.dlTokenService.createToken({
			scope: 'partner-proposal-email',
			tenantId: this.deps.env.defaultTenantId,
			filters: EMPTY_FILTERS,
			sort: EMPTY_SORT,
			selectedSkuIds: normalizedScenarios.map(
				(scenario) => scenario.endingSkuId,
			),
			customerId: payload.customerId,
			partnerProposalEmail: tokenPayload,
			singleUse: false,
			ttlSeconds: this.deps.env.proposalOptionsEmailTokenTtlSeconds,
		});

		return {
			url: `/api/email/partner-proposal/download?dlToken=${encodeURIComponent(token)}`,
			expiresAt: new Date(
				Date.now() + PARTNER_PROPOSAL_TOKEN_TTL_SECONDS * 1000,
			).toISOString(),
		};
	}

	async renderPartnerProposalEmailFromToken(
		dlToken: string | undefined,
	): Promise<Buffer> {
		const tokenPayload = this.deps.dlTokenService.verifyTokenForScope({
			token: dlToken,
			scope: 'partner-proposal-email',
		});
		const partnerProposalEmail = tokenPayload.partnerProposalEmail;
		if (!partnerProposalEmail) {
			throw new UnauthorizedException(
				'Invalid partner-proposal email payload in download token',
			);
		}

		const templateBuffer = await this.deps.loadTemplateBuffer(
			partnerProposalEmail.templatePath,
		);
		const zip = new PizZip(templateBuffer);
		const doc = new Docxtemplater(zip, {
			paragraphLoop: true,
			linebreaks: true,
			nullGetter: () => '',
		});

		doc.render(
			this.deps.buildPartnerProposalTemplateValues(partnerProposalEmail),
		);

		const renderedZip = doc.getZip();
		const partnerDocumentXml =
			renderedZip.file('word/document.xml')?.asText() ?? '';
		const partnerLinkTargets = [
			{
				token: '__PARTNER_PROPOSAL_BOM_LINK__',
				url: this.deps.env.partnerUploadUrl,
				displayText: this.deps.env.partnerUploadUrl,
			},
			{
				token: '__PARTNER_PROPOSAL_UPLOAD_LINK__',
				url: this.deps.env.partnerUploadUrl,
				displayText: this.deps.env.partnerUploadUrl,
			},
		].filter((target) => partnerDocumentXml.includes(target.token));
		this.deps.injectDocxHyperlinks(renderedZip, partnerLinkTargets);

		return renderedZip.generate({
			type: 'nodebuffer',
			mimeType: DOCX_CONTENT_TYPE,
		});
	}
}
