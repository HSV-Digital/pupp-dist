import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
	HttpException,
	Injectable,
	Logger,
	NotFoundException,
	Optional,
	UnprocessableEntityException,
} from '@nestjs/common';
import {
	convertUsdAmountToRegional,
	matchStartingSku,
	toSeatRange,
} from '@repo/shared';
import { AdminAnalyticsDownloadTrackingService } from '../admin-analytics/admin-analytics-download-tracking.service';
import { getEnv } from '../config/env';
import { DashboardService } from '../dashboard/dashboard.service';
import { ProposalAssetService } from '../proposal-asset/proposal-asset.service';
import type {
	DashboardFilterState,
	DashboardOpportunityRow,
	DashboardResellerRow,
	DashboardViewMode,
} from '../dashboard/dashboard.types';
import type {
	CreatePdfListLinkDto,
	PdfFiltersDto,
	PdfSortDto,
	RenderResellerListDto,
} from './dto/render-reseller-list.dto';
import { DlTokenService } from './dl-token.service';
import {
	renderCustomerListHtml,
	renderOpportunitiesHtml,
	renderResellerListHtml,
	type CustomerListRow,
	type OpportunityPageRow,
	type PdfTemplateAssets,
	type ResellerListRow,
} from './pdf-html-templates';
import { PdfRendererService } from './pdf-renderer.service';
import {
	PdfTelemetryService,
	type PdfOperation,
} from './pdf-telemetry.service';
import { buildProposalScenarios } from './pdf-rules';
import type {
	DlTokenPayload,
	PdfFiltersPayload,
	PdfSortPayload,
} from './types/dl-token.types';

function formatNumber(value: number): string {
	return Math.round(value).toLocaleString('en-US');
}

function normalizeFilters(filters: PdfFiltersDto): PdfFiltersPayload {
	return {
		pssAIWorkforce: filters.pssAIWorkforce ?? [],
		pssAISecurity: filters.pssAISecurity ?? [],
		psa: filters.psa ?? [],
		distributor: filters.distributor ?? [],
		reseller: filters.reseller ?? [],
		customer: filters.customer ?? [],
		pdm: filters.pdm ?? [],
		pmm: filters.pmm ?? [],
		region: filters.region ?? [],
		type: filters.type ?? [],
		skuCategory: filters.skuCategory ?? [],
		expSeats: filters.expSeats ?? [],
		renewalDate: filters.renewalDate ?? [],
		pastRenewalDate: filters.pastRenewalDate ?? [],
		search: filters.search?.trim() ?? '',
	};
}

function normalizeSort(sort: PdfSortDto): PdfSortPayload {
	return {
		sortBy: sort.sortBy,
		sortDir: sort.sortDir,
	};
}

function toDashboardFilters(filters: PdfFiltersPayload): DashboardFilterState {
	return {
		pssAIWorkforce: filters.pssAIWorkforce,
		pssAISecurity: filters.pssAISecurity,
		psa: filters.psa,
		distributor: filters.distributor,
		reseller: filters.reseller,
		customer: filters.customer,
		pdm: filters.pdm,
		pmm: filters.pmm,
		region: filters.region ?? [],
		type: filters.type ?? [],
		skuCategory: filters.skuCategory ?? [],
		expSeats: filters.expSeats,
		renewalDate: filters.renewalDate,
		pastRenewalDate: filters.pastRenewalDate ?? [],
	};
}

function withOverrideFilter(
	filters: PdfFiltersPayload,
	key: keyof Omit<PdfFiltersPayload, 'search'>,
	value: string,
): PdfFiltersPayload {
	return {
		...filters,
		[key]: [value],
	};
}

@Injectable()
export class PdfService {
	private readonly env = getEnv();
	private readonly logger = new Logger(PdfService.name);
	private cachedAssets: PdfTemplateAssets | null = null;

	constructor(
		private readonly dashboardService: DashboardService,
		private readonly dlTokenService: DlTokenService,
		private readonly pdfRenderer: PdfRendererService,
		private readonly proposalAssetService: ProposalAssetService,
		private readonly pdfTelemetry: PdfTelemetryService = new PdfTelemetryService(),
		@Optional()
		private readonly adminAnalyticsDownloadTrackingService?: AdminAnalyticsDownloadTrackingService,
	) {}

	createListLink(dto: CreatePdfListLinkDto): { url: string } {
		const startedAt = Date.now();

		try {
			const token =
				dto.viewMode === 'reseller'
					? this.createResellerListToken(dto)
					: this.createCustomerListToken(dto);
			const path =
				dto.viewMode === 'reseller'
					? '/api/pdf/reseller-list'
					: '/api/pdf/customer-list';

			const result = {
				url: `${path}?dlToken=${encodeURIComponent(token)}`,
			};

			this.recordOperationSuccess('create-list-link', startedAt, {
				viewMode: dto.viewMode,
				selectedSkuCount: dto.selectedSkuIds?.length ?? 0,
			});

			return result;
		} catch (error) {
			this.recordOperationFailure('create-list-link', startedAt, error, {
				viewMode: dto.viewMode,
			});
			throw error;
		}
	}

	createResellerListLink(dto: RenderResellerListDto): { url: string } {
		return this.createListLink({
			...dto,
			viewMode: 'reseller',
		});
	}

	async renderResellerListPdfFromToken(
		dlToken: string | undefined,
	): Promise<NodeJS.ReadableStream> {
		const startedAt = Date.now();

		try {
			const payload = this.verifyTokenForScope({
				token: dlToken,
				scope: 'reseller-list',
			});

			const stream = await this.renderResellerListPdfWithContext({
				filters: payload.filters,
				sort: payload.sort,
				selectedSkuIds: payload.selectedSkuIds ?? [],
				cacheSeed: dlToken ? `reseller-list:${dlToken}` : undefined,
				parentTokenJti: payload.jti,
			});

			this.recordOperationSuccess('render-reseller-list', startedAt, {
				source: 'token',
				selectedSkuCount: payload.selectedSkuIds?.length ?? 0,
			});

			return stream;
		} catch (error) {
			this.recordOperationFailure('render-reseller-list', startedAt, error, {
				source: 'token',
			});
			throw error;
		}
	}

	async renderResellerListPdf(
		dto: RenderResellerListDto,
	): Promise<NodeJS.ReadableStream> {
		const startedAt = Date.now();

		try {
			const stream = await this.renderResellerListPdfWithContext({
				filters: normalizeFilters(dto.filters),
				sort: normalizeSort(dto.sort),
				selectedSkuIds: dto.selectedSkuIds ?? [],
			});

			this.recordOperationSuccess('render-reseller-list', startedAt, {
				source: 'request',
				selectedSkuCount: dto.selectedSkuIds?.length ?? 0,
			});

			return stream;
		} catch (error) {
			this.recordOperationFailure('render-reseller-list', startedAt, error, {
				source: 'request',
			});
			throw error;
		}
	}

	async renderCustomerListPdf(params: {
		resellerId: string;
		dlToken: string | undefined;
	}): Promise<NodeJS.ReadableStream> {
		const startedAt = Date.now();

		try {
			const payload = this.verifyTokenForScope({
				token: params.dlToken,
				scope: 'customer-list',
				resellerId: params.resellerId,
			});

			const stream = await this.renderCustomerListPdfWithPayload(payload, {
				resellerId: params.resellerId,
				emptyRowsMessage: 'No customers found for this reseller scope',
				cacheSeed: params.dlToken
					? `customer-list:${params.resellerId}:${params.dlToken}`
					: undefined,
			});

			this.recordOperationSuccess('render-customer-list', startedAt, {
				source: 'reseller-route',
				resellerId: params.resellerId,
				selectedSkuCount: payload.selectedSkuIds?.length ?? 0,
			});

			return stream;
		} catch (error) {
			this.recordOperationFailure('render-customer-list', startedAt, error, {
				source: 'reseller-route',
				resellerId: params.resellerId,
			});
			throw error;
		}
	}

	async renderCustomerListPdfFromToken(
		dlToken: string | undefined,
	): Promise<NodeJS.ReadableStream> {
		const startedAt = Date.now();

		try {
			const payload = this.verifyTokenForScope({
				token: dlToken,
				scope: 'customer-list',
			});

			const stream = await this.renderCustomerListPdfWithPayload(payload, {
				resellerId: payload.resellerId,
				emptyRowsMessage: 'No customers found for this scope',
				cacheSeed: dlToken ? `customer-list:${dlToken}` : undefined,
			});

			this.recordOperationSuccess('render-customer-list', startedAt, {
				source: 'token',
				resellerId: payload.resellerId,
				selectedSkuCount: payload.selectedSkuIds?.length ?? 0,
			});

			return stream;
		} catch (error) {
			this.recordOperationFailure('render-customer-list', startedAt, error, {
				source: 'token',
			});
			throw error;
		}
	}

	// ── Preview methods (hardcoded sample data, no DB/token required) ──

	async renderPreviewResellerList(): Promise<NodeJS.ReadableStream> {
		const assets = await this.loadAssets();

		const sampleRows: ResellerListRow[] = [
			{
				resellerName: 'Contoso Reseller',
				customerCount: 12,
				opportunityCount: 34,
				expiringArr: 850_000,
				seats: 1_200,
				proposalLink: '#',
			},
			{
				resellerName: 'Fabrikam Partners',
				customerCount: 8,
				opportunityCount: 19,
				expiringArr: 420_000,
				seats: 640,
				proposalLink: '#',
			},
			{
				resellerName: 'Northwind IT',
				customerCount: 5,
				opportunityCount: 11,
				expiringArr: 275_000,
				seats: 380,
				proposalLink: '#',
			},
			{
				resellerName: 'Adventure Works',
				customerCount: 3,
				opportunityCount: 7,
				expiringArr: 180_000,
				seats: 210,
				proposalLink: '#',
			},
			{
				resellerName: 'Wide World Importers',
				customerCount: 2,
				opportunityCount: 4,
				expiringArr: 95_000,
				seats: 120,
				proposalLink: '#',
			},
		];

		const totalCustomers = sampleRows.reduce((s, r) => s + r.customerCount, 0);
		const totalOpportunities = sampleRows.reduce(
			(s, r) => s + r.opportunityCount,
			0,
		);
		const totalSeats = sampleRows.reduce((s, r) => s + r.seats, 0);

		const html = renderResellerListHtml({
			rows: sampleRows,
			summaryCards: [
				{ label: 'CSP Partners', value: formatNumber(sampleRows.length) },
				{ label: 'Customers', value: formatNumber(totalCustomers) },
				{ label: 'Opportunities', value: formatNumber(totalOpportunities) },
				{ label: 'Seats', value: toSeatRange(totalSeats) },
			],
			assets,
		});

		return this.renderStreamFromHtml({ html });
	}

	async renderPreviewCustomerList(): Promise<NodeJS.ReadableStream> {
		const assets = await this.loadAssets();

		const sampleRows: CustomerListRow[] = [
			{
				customerId: 'C001',
				customerName: 'Woodgrove Bank',
				expiringArr: 220_000,
				seats: 350,
				basicSeats: 100,
				standardSeats: 150,
				premiumSeats: 100,
				proposalLink: '#',
			},
			{
				customerId: 'C002',
				customerName: 'Tailspin Toys',
				expiringArr: 180_000,
				seats: 280,
				basicSeats: 80,
				standardSeats: 120,
				premiumSeats: 80,
				proposalLink: '#',
			},
			{
				customerId: 'C003',
				customerName: 'Litware Inc.',
				expiringArr: 150_000,
				seats: 200,
				basicSeats: 60,
				standardSeats: 90,
				premiumSeats: 50,
				proposalLink: '#',
			},
			{
				customerId: 'C004',
				customerName: 'Proseware Ltd.',
				expiringArr: 120_000,
				seats: 180,
				basicSeats: 50,
				standardSeats: 80,
				premiumSeats: 50,
				proposalLink: '#',
			},
			{
				customerId: 'C005',
				customerName: 'Consolidated Messenger',
				expiringArr: 80_000,
				seats: 110,
				basicSeats: 30,
				standardSeats: 50,
				premiumSeats: 30,
				proposalLink: '#',
			},
		];

		const totalSeats = sampleRows.reduce((s, r) => s + r.seats, 0);

		const html = renderCustomerListHtml({
			resellerId: 'Contoso Reseller',
			rows: sampleRows,
			summaryCards: [
				{ label: 'Customers', value: formatNumber(sampleRows.length) },
				{ label: 'Opportunities', value: formatNumber(12) },
				{ label: 'Seats', value: toSeatRange(totalSeats) },
			],
			assets,
		});

		return this.renderStreamFromHtml({ html });
	}

	async renderPreviewOpportunities(): Promise<NodeJS.ReadableStream> {
		const assets = await this.loadAssets();

		const sampleRows: OpportunityPageRow[] = [
			{
				customerId: 'C001',
				customerName: 'Woodgrove Bank',
				subscriptionId: 'SUB-001',
				resellerName: 'Contoso Reseller',
				currentProduct: 'Microsoft 365 Business Basic',
				seatCount: 100,
				expiringArr: 72_000,
				renewalDate: '2025-09-15',
				daysToRenewal: 30,
				scenarios: buildProposalScenarios({
					currentProduct: 'Microsoft 365 Business Basic',
					seatCount: 100,
					selectedSkuIds: [],
				}),
			},
			{
				customerId: 'C001',
				customerName: 'Woodgrove Bank',
				subscriptionId: 'SUB-002',
				resellerName: 'Contoso Reseller',
				currentProduct: 'Microsoft 365 Business Standard',
				seatCount: 150,
				expiringArr: 225_000,
				renewalDate: '2025-10-01',
				daysToRenewal: 45,
				scenarios: buildProposalScenarios({
					currentProduct: 'Microsoft 365 Business Standard',
					seatCount: 150,
					selectedSkuIds: [],
				}),
			},
		];

		const html = renderOpportunitiesHtml({ rows: sampleRows, assets });
		return this.renderStreamFromHtml({ html });
	}

	async renderOpportunitiesPdf(params: {
		customerId: string;
		dlToken: string | undefined;
	}): Promise<NodeJS.ReadableStream> {
		const startedAt = Date.now();

		try {
			const payload = this.verifyTokenForScope({
				token: params.dlToken,
				scope: 'opportunities',
				customerId: params.customerId,
			});

			const [rows, assets] = await Promise.all([
				this.fetchRows<DashboardOpportunityRow>(
					'opportunity',
					payload.filters,
					payload.sort,
				),
				this.loadAssets(),
			]);

			const customerRows = rows.filter(
				(row) => row.customerId === params.customerId,
			);

			if (customerRows.length === 0) {
				throw new NotFoundException(
					'No opportunities found for this customer scope',
				);
			}

			const pages = await this.buildOpportunityPages(
				customerRows,
				payload.selectedSkuIds ?? [],
			);

			const html = renderOpportunitiesHtml({ rows: pages, assets });
			const stream = await this.renderStreamFromHtml({
				html,
				cacheSeed: params.dlToken
					? `opportunities:${params.customerId}:${params.dlToken}`
					: undefined,
			});

			this.recordOperationSuccess('render-opportunities', startedAt, {
				customerId: params.customerId,
				selectedSkuCount: payload.selectedSkuIds?.length ?? 0,
				pageCount: pages.length,
			});

			return stream;
		} catch (error) {
			this.recordOperationFailure('render-opportunities', startedAt, error, {
				customerId: params.customerId,
			});
			throw error;
		}
	}

	private async loadAssets(): Promise<PdfTemplateAssets> {
		if (this.cachedAssets) return this.cachedAssets;
		const dir = path.join(process.cwd(), 'assets');
		const fontsDir = path.join(dir, 'fonts');
		const [bg, logo, fontRegular, fontSemibold, fontBold] = await Promise.all([
			readFile(path.join(dir, 'pdf-background.png')),
			readFile(path.join(dir, 'microsoft.png')),
			readFile(path.join(fontsDir, 'Segoe-UI-Variable-Static-Text.ttf')),
			readFile(
				path.join(fontsDir, 'Segoe-UI-Variable-Static-Text-Semibold.ttf'),
			),
			readFile(path.join(fontsDir, 'Segoe-UI-Variable-Static-Text-Bold.ttf')),
		]);
		this.cachedAssets = {
			backgroundDataUri: `data:image/png;base64,${bg.toString('base64')}`,
			logoDataUri: `data:image/png;base64,${logo.toString('base64')}`,
			fontRegularDataUri: `data:font/ttf;base64,${fontRegular.toString('base64')}`,
			fontSemiboldDataUri: `data:font/ttf;base64,${fontSemibold.toString('base64')}`,
			fontBoldDataUri: `data:font/ttf;base64,${fontBold.toString('base64')}`,
		};
		return this.cachedAssets;
	}

	async loadTemplateAssets(): Promise<PdfTemplateAssets> {
		return this.loadAssets();
	}

	private async fetchRows<TRow>(
		viewMode: DashboardViewMode,
		filters: PdfFiltersPayload,
		sort: PdfSortPayload,
	): Promise<TRow[]> {
		const rows = await this.dashboardService.getExportRows({
			viewMode,
			filters: toDashboardFilters(filters),
			search: filters.search,
			sortBy: sort.sortBy,
			sortDir: sort.sortDir,
		});

		return rows as TRow[];
	}

	private createResellerListToken(dto: RenderResellerListDto): string {
		const filters = normalizeFilters(dto.filters);
		const sort = normalizeSort(dto.sort);

		return this.dlTokenService.createToken({
			scope: 'reseller-list',
			tenantId: this.env.defaultTenantId,
			filters,
			sort,
			selectedSkuIds: dto.selectedSkuIds ?? [],
		});
	}

	private createCustomerListToken(dto: RenderResellerListDto): string {
		const filters = normalizeFilters(dto.filters);
		const sort = normalizeSort(dto.sort);

		return this.dlTokenService.createToken({
			scope: 'customer-list',
			tenantId: this.env.defaultTenantId,
			filters,
			sort,
			selectedSkuIds: dto.selectedSkuIds ?? [],
		});
	}

	private async renderCustomerListPdfWithPayload(
		payload: DlTokenPayload,
		options: {
			resellerId?: string;
			emptyRowsMessage: string;
			cacheSeed?: string;
		},
	): Promise<NodeJS.ReadableStream> {
		const effectiveFilters = this.resolveCustomerListFilters(payload);
		const [rows, assets] = await Promise.all([
			this.fetchRows<DashboardOpportunityRow>(
				'opportunity',
				effectiveFilters,
				payload.sort,
			),
			this.loadAssets(),
		]);

		if (rows.length === 0) {
			throw new NotFoundException(options.emptyRowsMessage);
		}

		const customerRows = this.buildCustomerListRows(
			rows,
			effectiveFilters,
			payload.sort,
			payload.selectedSkuIds ?? [],
		);

		const totalSeats = customerRows.reduce((sum, row) => sum + row.seats, 0);

		const html = renderCustomerListHtml({
			resellerId: options.resellerId,
			rows: customerRows,
			summaryCards: [
				{ label: 'Customers', value: formatNumber(customerRows.length) },
				{ label: 'Opportunities', value: formatNumber(rows.length) },
				{ label: 'Seats', value: toSeatRange(totalSeats) },
			],
			assets,
		});

		return await this.renderStreamFromHtml({
			html,
			cacheSeed: options.cacheSeed,
		});
	}

	private resolveCustomerListFilters(
		payload: DlTokenPayload,
	): PdfFiltersPayload {
		if (!payload.resellerId || payload.resellerId.trim().length === 0) {
			return payload.filters;
		}

		return withOverrideFilter(payload.filters, 'reseller', payload.resellerId);
	}

	private async renderResellerListPdfWithContext(context: {
		filters: PdfFiltersPayload;
		sort: PdfSortPayload;
		selectedSkuIds: string[];
		cacheSeed?: string;
		parentTokenJti?: string;
	}): Promise<NodeJS.ReadableStream> {
		const [rows, assets] = await Promise.all([
			this.fetchRows<DashboardResellerRow>(
				'reseller',
				context.filters,
				context.sort,
			),
			this.loadAssets(),
		]);

		if (rows.length === 0) {
			throw new UnprocessableEntityException(
				'No matching rows found for current filters. Update filters and try again.',
			);
		}

		const nestedIssuanceTasks: Promise<void>[] = [];
		const documentRows: ResellerListRow[] = rows.map((row) => {
			const token = this.dlTokenService.createToken({
				scope: 'customer-list',
				tenantId: this.env.defaultTenantId,
				filters: context.filters,
				sort: context.sort,
				selectedSkuIds: context.selectedSkuIds,
				resellerId: row.resellerName,
			});
			if (context.parentTokenJti) {
				nestedIssuanceTasks.push(
					this.adminAnalyticsDownloadTrackingService?.recordNestedCustomerListIssuance(
						{
							tokenPayload: this.dlTokenService.readTokenPayload(token),
							parentTokenJti: context.parentTokenJti,
							route: '/api/pdf/customer-list/:resellerId',
						},
					) ?? Promise.resolve(),
				);
			}

			return {
				resellerName: row.resellerName,
				customerCount: row.customerCount,
				opportunityCount: row.subscriptionCount,
				expiringArr: row.totalARR,
				seats: row.totalSeats,
				proposalLink: this.buildPublicLink(
					`/api/pdf/customer-list/${encodeURIComponent(
						row.resellerName,
					)}?dlToken=${encodeURIComponent(token)}`,
				),
			};
		});
		await Promise.all(nestedIssuanceTasks);

		const totalCustomers = documentRows.reduce(
			(sum, row) => sum + row.customerCount,
			0,
		);
		const totalOpportunities = documentRows.reduce(
			(sum, row) => sum + row.opportunityCount,
			0,
		);
		const totalSeats = documentRows.reduce((sum, row) => sum + row.seats, 0);

		const html = renderResellerListHtml({
			rows: documentRows,
			summaryCards: [
				{ label: 'CSP Partners', value: formatNumber(documentRows.length) },
				{ label: 'Customers', value: formatNumber(totalCustomers) },
				{ label: 'Opportunities', value: formatNumber(totalOpportunities) },
				{ label: 'Seats', value: toSeatRange(totalSeats) },
			],
			assets,
		});

		return await this.renderStreamFromHtml({
			html,
			cacheSeed: context.cacheSeed,
		});
	}

	private buildCustomerListRows(
		opportunityRows: DashboardOpportunityRow[],
		filters: PdfFiltersPayload,
		sort: PdfSortPayload,
		selectedSkuIds: string[],
	): CustomerListRow[] {
		const grouped = new Map<string, CustomerListRow>();

		for (const row of opportunityRows) {
			const existing = grouped.get(row.customerId) ?? {
				customerId: row.customerId,
				customerName: row.customerName,
				expiringArr: 0,
				seats: 0,
				basicSeats: 0,
				standardSeats: 0,
				premiumSeats: 0,
				proposalLink: '',
			};

			existing.expiringArr += row.annualRevenueRunRate;
			existing.seats += row.seatCount;

			if (row.skuCategory === 'Basic') {
				existing.basicSeats += row.seatCount;
			} else if (row.skuCategory === 'Standard') {
				existing.standardSeats += row.seatCount;
			} else if (row.skuCategory === 'Premium') {
				existing.premiumSeats += row.seatCount;
			}

			grouped.set(row.customerId, existing);
		}

		const result: CustomerListRow[] = [];

		for (const row of grouped.values()) {
			const token = this.dlTokenService.createToken({
				scope: 'opportunities',
				tenantId: this.env.defaultTenantId,
				filters,
				sort,
				selectedSkuIds,
				customerId: row.customerId,
			});

			result.push({
				...row,
				proposalLink: this.buildPublicLink(
					`/api/pdf/opportunities/${encodeURIComponent(
						row.customerId,
					)}?dlToken=${encodeURIComponent(token)}`,
				),
			});
		}

		return result.sort((left, right) =>
			left.customerName.localeCompare(right.customerName),
		);
	}

	private async buildOpportunityPages(
		rows: DashboardOpportunityRow[],
		selectedSkuIds: string[],
	): Promise<OpportunityPageRow[]> {
		const pages: OpportunityPageRow[] = rows.map((row) => {
			const daysToRenewal = Math.max(
				0,
				Math.ceil(
					(new Date(row.renewalDate).getTime() - Date.now()) / 86_400_000,
				),
			);
			const proposalExpiringArr = convertUsdAmountToRegional({
				amountUsd: row.annualRevenueRunRate,
				region: row.region,
			});

			return {
				customerId: row.customerId,
				customerName: row.customerName,
				subscriptionId: row.subscriptionId,
				resellerName: row.resellerName,
				currentProduct: row.currentProduct,
				seatCount: row.seatCount,
				expiringArr: proposalExpiringArr,
				region: row.region,
				renewalDate: row.renewalDate,
				daysToRenewal,
				scenarios: buildProposalScenarios({
					currentProduct: row.currentProduct,
					seatCount: row.seatCount,
					selectedSkuIds,
					expiringArr: proposalExpiringArr,
					journey: 'renewal',
					region: row.region,
				}),
			};
		});

		// Generate ZIP assets for each scenario in parallel
		const assetTasks: Array<{
			pageIndex: number;
			scenarioIndex: number;
			promise: Promise<{ endingSkuId: string; documentsZipUrl: string }>;
		}> = [];

		for (let p = 0; p < pages.length; p += 1) {
			const page = pages[p];
			const startingSku = matchStartingSku(page.currentProduct);
			if (!startingSku) continue;

			for (let s = 0; s < page.scenarios.length; s += 1) {
				const scenario = page.scenarios[s];
				assetTasks.push({
					pageIndex: p,
					scenarioIndex: s,
					promise: this.proposalAssetService.generateSolutionZip({
						journey: 'renewal',
						customerId: page.customerId,
						customerName: page.customerName,
						opportunityId: page.subscriptionId,
						startingSkuId: startingSku.id,
						startingSkuName: startingSku.name,
						endingSkuId: scenario.endingSkuId,
						seats: page.seatCount,
						expiringArr: page.expiringArr,
						region: page.region,
					}),
				});
			}
		}

		const results = await Promise.allSettled(
			assetTasks.map((task) => task.promise),
		);

		for (let i = 0; i < assetTasks.length; i += 1) {
			const task = assetTasks[i];
			const result = results[i];
			if (result.status === 'fulfilled') {
				pages[task.pageIndex].scenarios[task.scenarioIndex].proposalLink =
					result.value.documentsZipUrl;
			} else {
				this.logger.warn(
					JSON.stringify({
						event: 'pdf.asset_generation_failed',
						pageIndex: task.pageIndex,
						scenarioIndex: task.scenarioIndex,
						error: String(result.reason),
					}),
				);
			}
		}

		return pages;
	}

	async renderStreamFromHtml(params: {
		html: string;
		cacheSeed?: string;
	}): Promise<NodeJS.ReadableStream> {
		const buffer = await this.pdfRenderer.renderHtmlToPdf({
			html: params.html,
			cacheSeed: params.cacheSeed,
		});

		return Readable.from(buffer);
	}

	private verifyTokenForScope(params: {
		token: string | undefined;
		scope: 'reseller-list' | 'customer-list' | 'opportunities';
		resellerId?: string;
		customerId?: string;
	}): DlTokenPayload {
		try {
			return this.dlTokenService.verifyTokenForScope(params);
		} catch (error) {
			const reason = this.classifyError(error);
			this.pdfTelemetry.recordTokenVerificationFailure(reason);
			this.logger.warn(
				JSON.stringify({
					event: 'pdf.token_verification',
					result: 'failure',
					scope: params.scope,
					hasToken: Boolean(params.token),
					resellerId: params.resellerId,
					customerId: params.customerId,
					reason,
				}),
			);
			throw error;
		}
	}

	private recordOperationSuccess(
		operation: PdfOperation,
		startedAt: number,
		details: Record<string, unknown>,
	): void {
		const durationMs = this.getDurationMs(startedAt);
		this.pdfTelemetry.recordOperationSuccess(operation, durationMs);
		this.logger.log(
			JSON.stringify({
				event: 'pdf.operation',
				operation,
				result: 'success',
				durationMs,
				...details,
			}),
		);
	}

	private recordOperationFailure(
		operation: PdfOperation,
		startedAt: number,
		error: unknown,
		details: Record<string, unknown>,
	): void {
		const durationMs = this.getDurationMs(startedAt);
		const errorType = this.classifyError(error);
		this.pdfTelemetry.recordOperationFailure(operation, durationMs, errorType);
		this.logger.error(
			JSON.stringify({
				event: 'pdf.operation',
				operation,
				result: 'failure',
				durationMs,
				errorType,
				...details,
			}),
			error instanceof Error ? error.stack : undefined,
		);
	}

	private classifyError(error: unknown): string {
		if (error instanceof HttpException) {
			return `${error.getStatus()}_${error.name}`;
		}
		if (error instanceof Error) {
			return error.name || 'Error';
		}
		return 'UnknownError';
	}

	private getDurationMs(startedAt: number): number {
		const duration = Date.now() - startedAt;
		if (!Number.isFinite(duration) || duration < 0) {
			return 0;
		}
		return duration;
	}

	private buildPublicLink(path: string): string {
		return `${this.env.apiPublicBaseUrl}${path}`;
	}
}
