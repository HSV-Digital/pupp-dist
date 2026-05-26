import { Injectable } from '@nestjs/common';
import { toSeatRange } from '@repo/shared';
import type {
	DashboardOpportunityRow,
	DashboardResellerRow,
} from '../dashboard/dashboard.types';
import { PdfRendererService } from './pdf-renderer.service';
import {
	renderCustomerListHtml,
	renderResellerListHtml,
	type CustomerListRow,
	type PdfTemplateAssets,
	type ResellerListRow,
} from './pdf-html-templates';
import { DlTokenService } from './dl-token.service';
import { getEnv } from '../config/env';
import type { PdfFiltersPayload, PdfSortPayload } from './types/dl-token.types';

export interface PreparedCustomerListRow extends CustomerListRow {
	opportunityCount: number;
}

@Injectable()
export class PdfChunkService {
	private readonly env = getEnv();

	constructor(
		private readonly pdfRenderer: PdfRendererService,
		private readonly dlTokenService: DlTokenService,
	) {}

	/**
	 * Generate PDF for all rows (used by async worker).
	 */
	async generatePdf(
		rows: DashboardResellerRow[] | DashboardOpportunityRow[],
		assets: PdfTemplateAssets,
		viewMode: 'reseller' | 'customer',
		filters: PdfFiltersPayload,
		sort: PdfSortPayload,
		selectedSkuIds: string[],
		checkCancellation?: () => Promise<boolean>,
	): Promise<Buffer> {
		if (viewMode === 'customer') {
			const customerRows = this.buildCustomerListRows(
				rows as DashboardOpportunityRow[],
				filters,
				sort,
				selectedSkuIds,
			);
			return this.generatePdfFromPreparedRows(
				customerRows,
				assets,
				'customer',
				checkCancellation,
			);
		}

		const resellerRows = this.buildResellerListRows(
			rows as DashboardResellerRow[],
			filters,
			sort,
			selectedSkuIds,
		);
		return this.generatePdfFromPreparedRows(
			resellerRows,
			assets,
			'reseller',
			checkCancellation,
		);
	}

	async generatePdfFromPreparedRows(
		rows: ResellerListRow[] | PreparedCustomerListRow[],
		assets: PdfTemplateAssets,
		viewMode: 'reseller' | 'customer',
		checkCancellation?: () => Promise<boolean>,
	): Promise<Buffer> {
		let html: string;

		if (viewMode === 'customer') {
			const customerRows = rows as PreparedCustomerListRow[];
			const totalSeats = customerRows.reduce((sum, row) => sum + row.seats, 0);
			const totalOpportunities = customerRows.reduce(
				(sum, row) => sum + row.opportunityCount,
				0,
			);

			html = renderCustomerListHtml({
				rows: customerRows,
				summaryCards: [
					{ label: 'Customers', value: this.formatNumber(customerRows.length) },
					{
						label: 'Opportunities',
						value: this.formatNumber(totalOpportunities),
					},
					{ label: 'Seats', value: toSeatRange(totalSeats) },
				],
				assets,
			});
		} else {
			const documentRows = rows as ResellerListRow[];
			const totalCustomers = documentRows.reduce(
				(sum, row) => sum + row.customerCount,
				0,
			);
			const totalOpportunities = documentRows.reduce(
				(sum, row) => sum + row.opportunityCount,
				0,
			);
			const totalSeats = documentRows.reduce((sum, row) => sum + row.seats, 0);

			html = renderResellerListHtml({
				rows: documentRows,
				summaryCards: [
					{
						label: 'CSP Partners',
						value: this.formatNumber(documentRows.length),
					},
					{ label: 'Customers', value: this.formatNumber(totalCustomers) },
					{
						label: 'Opportunities',
						value: this.formatNumber(totalOpportunities),
					},
					{ label: 'Seats', value: toSeatRange(totalSeats) },
				],
				assets,
			});
		}

		return this.pdfRenderer.renderHtmlToPdf({
			html,
			checkCancellation,
		});
	}

	buildResellerListRows(
		rows: DashboardResellerRow[],
		filters: PdfFiltersPayload,
		sort: PdfSortPayload,
		selectedSkuIds: string[],
	): ResellerListRow[] {
		return rows.map((row) => {
			const token = this.dlTokenService.createToken({
				scope: 'customer-list',
				tenantId: this.env.defaultTenantId,
				filters,
				sort,
				selectedSkuIds,
				resellerId: row.resellerName,
			});

			return {
				resellerName: row.resellerName,
				customerCount: row.customerCount,
				opportunityCount: row.subscriptionCount,
				expiringArr: row.totalARR,
				seats: row.totalSeats,
				proposalLink: this.buildPublicLink(
					`/api/pdf/customer-list/${encodeURIComponent(row.resellerName)}?dlToken=${encodeURIComponent(token)}`,
				),
			};
		});
	}

	buildCustomerListRows(
		opportunityRows: DashboardOpportunityRow[],
		filters: PdfFiltersPayload,
		sort: PdfSortPayload,
		selectedSkuIds: string[],
	): PreparedCustomerListRow[] {
		const grouped = new Map<string, PreparedCustomerListRow>();

		for (const row of opportunityRows) {
			const existing = grouped.get(row.customerId) ?? {
				customerId: row.customerId,
				customerName: row.customerName,
				expiringArr: 0,
				seats: 0,
				basicSeats: 0,
				standardSeats: 0,
				premiumSeats: 0,
				opportunityCount: 0,
				proposalLink: '',
			};

			existing.expiringArr += row.annualRevenueRunRate;
			existing.seats += row.seatCount;
			existing.opportunityCount += 1;

			if (row.skuCategory === 'Basic') {
				existing.basicSeats += row.seatCount;
			} else if (row.skuCategory === 'Standard') {
				existing.standardSeats += row.seatCount;
			} else if (row.skuCategory === 'Premium') {
				existing.premiumSeats += row.seatCount;
			}

			grouped.set(row.customerId, existing);
		}

		const result: PreparedCustomerListRow[] = [];

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
					`/api/pdf/opportunities/${encodeURIComponent(row.customerId)}?dlToken=${encodeURIComponent(token)}`,
				),
			});
		}

		return result.sort((left, right) =>
			left.customerName.localeCompare(right.customerName),
		);
	}

	private buildPublicLink(path: string): string {
		return `${this.env.apiPublicBaseUrl}${path}`;
	}

	private formatNumber(value: number): string {
		return Math.round(value).toLocaleString('en-US');
	}
}
