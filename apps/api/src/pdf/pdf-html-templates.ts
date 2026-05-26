import {
	buildRegionalPricingContext,
	getSeatRangeLowerBound,
	toSeatRange,
	type RegionalCurrencyCode,
} from '@repo/shared';

export interface PdfTemplateAssets {
	backgroundDataUri: string;
	logoDataUri: string;
	fontRegularDataUri: string;
	fontSemiboldDataUri: string;
	fontBoldDataUri: string;
}

export interface ResellerListRow {
	resellerName: string;
	customerCount: number;
	opportunityCount: number;
	expiringArr: number;
	seats: number;
	proposalLink: string;
}

export interface CustomerListRow {
	customerId: string;
	customerName: string;
	expiringArr: number;
	seats: number;
	basicSeats: number;
	standardSeats: number;
	premiumSeats: number;
	proposalLink: string;
}

export interface OpportunityScenarioRow {
	endingSkuId: string;
	endingSkuName: string;
	endingSkuType: string;
	offerAnnualValue: number;
	currentAnnualValue: number;
	incrementalCost: number;
	totalIncentive: number;
	promoMonthlyPerUser: number;
	listMonthlyPerUser: number;
	proposalLink?: string;
}

export interface OpportunityPageRow {
	customerId: string;
	customerName: string;
	subscriptionId: string;
	resellerName: string;
	currentProduct: string;
	seatCount: number;
	expiringArr: number;
	region?: string;
	renewalDate: string;
	daysToRenewal: number;
	scenarios: OpportunityScenarioRow[];
}

interface SummaryCard {
	label: string;
	value: string;
}

const TAGLINE = 'Proactive Proposals For H2 Renewal Subscriptions';

// ---------- Utility helpers ----------

interface CurrencyFormatOptions {
	currencySymbol?: string;
	locale?: string;
	decimals?: number;
}

function formatCurrency(
	value: number,
	options?: CurrencyFormatOptions,
): string {
	const symbol = options?.currencySymbol ?? '$';
	const locale = options?.locale ?? 'en-US';
	const decimals = options?.decimals ?? 0;
	return `${symbol}${Number(value || 0).toLocaleString(locale, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	})}`;
}

/** Convert exact count to a display range string */
function formatRange(value: number): string {
	return toSeatRange(value);
}

/** Get the lower bound of the range for a given count */
function getRangeLowerBound(value: number): number {
	return getSeatRangeLowerBound(toSeatRange(value));
}

/** Format a date string to "Month Year" (e.g. "January 2026") */
function formatRenewalDate(dateStr: string): string {
	const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
	if (isNaN(date.getTime())) return dateStr;
	const months = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December',
	];
	return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function escapeHtml(value: string): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

type HeaderVariant = 'reseller' | 'customer' | 'opportunity';

/** A4 page height in mm */
const A4_HEIGHT_MM = 297;

// ---------- Shared sub-templates ----------

function renderPageHeader(params: {
	variant: HeaderVariant;
	entityName?: string;
	assets: PdfTemplateAssets;
}): string {
	const entity =
		params.entityName && params.entityName.trim()
			? `<p class="entity-title ${
					params.variant === 'opportunity' ? 'opportunity' : 'customer'
				}">${escapeHtml(params.entityName)}</p>`
			: '';

	return `
    <header class="header">
      <img class="header-logo" src="${params.assets.logoDataUri}" alt="Microsoft" />
      ${entity}
      <p class="header-subtitle">${escapeHtml(TAGLINE)}</p>
    </header>
  `;
}

function renderDocument(
	title: string,
	body: string,
	assets: PdfTemplateAssets,
	options?: {
		pageWidthMm?: number;
		pageHeightMm?: number;
	},
): string {
	const pageWidthMm = options?.pageWidthMm ?? 210;
	const pageHeightMm = options?.pageHeightMm ?? 297;

	return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          @font-face {
            font-family: "Segoe UI";
            font-weight: 400;
            font-style: normal;
            src: url(${assets.fontRegularDataUri}) format("truetype");
          }
          @font-face {
            font-family: "Segoe UI";
            font-weight: 600;
            font-style: normal;
            src: url(${assets.fontSemiboldDataUri}) format("truetype");
          }
          @font-face {
            font-family: "Segoe UI";
            font-weight: 700;
            font-style: normal;
            src: url(${assets.fontBoldDataUri}) format("truetype");
          }

          :root {
            --pdf-bg: #F7F7FA;
            --pdf-surface: #FFFFFF;
            --pdf-surface-soft: #FBFAFC;
            --pdf-border: #D9D9E3;
            --pdf-border-soft: #ECEAF0;

            --pdf-text: #111827;
            --pdf-text-strong: #0F172A;
            --pdf-text-muted: #667085;
            --pdf-text-faint: #A7B0C0;

            --pdf-accent: #AF35B6;
            --pdf-accent-dark: #8E2299;
            --pdf-accent-soft: #F4E7F6;

            --pdf-link: #9F2FAE;
            --pdf-link-hover: #7F1D8D;

            --pdf-panel-tint: #F5F1F7;
          }

          @page {
            size: ${pageWidthMm}mm ${pageHeightMm}mm;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            padding: 0;
          }

          body {
            color: var(--pdf-text);
            font-family: "Segoe UI", Arial, sans-serif;
            background-image: url(${assets.backgroundDataUri});
            background-repeat: repeat-y;
            background-size: 100% auto;
            background-position: center top;
            background-color: var(--pdf-bg);
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .page {
            padding: 36px 34px 34px;
            min-height: auto;
          }

          .page-break-after {
            page-break-after: always;
          }

          /* ---------- Header ---------- */

          .header {
            margin-bottom: 18px;
          }

          .header-logo {
            height: 34px;
            width: auto;
            display: block;
            margin-bottom: 24px;
          }

          .entity-title {
            margin: 0 0 8px 0;
            line-height: 1.08;
          }

          .entity-title.customer {
            font-size: 28px;
            font-weight: 700;
            color: var(--pdf-text-strong);
          }

          .entity-title.opportunity {
            font-size: 28px;
            font-weight: 700;
            color: var(--pdf-text-strong);
          }

          .header-subtitle {
            margin: 0;
            line-height: 1.18;
            font-size: 28px;
            font-weight: 600;
            background: linear-gradient(90deg, #0F172A 0%, #AF35B6 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            color: transparent;
          }

          /* ---------- KPI blocks ---------- */

          .kpi-panel {
            
            border: 1px solid var(--pdf-border-soft);
            border-radius: 16px;
            
            margin: 0 0 18px 0;
          }

          .kpi-grid {
            display: grid;
            gap: 12px;
          }

          .kpi-grid-5 {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }

          .kpi-item-panel {
            background: var(--pdf-surface);
            border: 1px solid var(--pdf-border-soft);
            border-radius: 16px;
            padding: 18px 18px 16px;
           
          }

          .kpi-card-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 16px;
            margin: 0 0 18px 0;
          }

          .kpi-card {
            background: var(--pdf-surface);
            border: 1px solid var(--pdf-border-soft);
            border-radius: 16px;
            padding: 18px 18px 16px;
            min-height: 118px;
          }

          .kpi-icon {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            height: 34px;
            margin-bottom: 10px;
            color: var(--pdf-accent);
          }

          .kpi-icon svg {
            width: auto;
            height: 28px;
            max-width: 40px;
          }

          .kpi-label {
            margin: 0 0 6px 0;
            color: var(--pdf-accent);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.2;
          }

          .kpi-value {
            margin: 0;
            color: var(--pdf-text-strong);
            font-size: 18px;
            font-weight: 700;
            line-height: 1.15;
          }

          /* ---------- Tables ---------- */

          .table-panel {
            background: var(--pdf-surface);
            border: 1px solid var(--pdf-border-soft);
            border-radius: 16px;
            padding: 14px 14px 16px;
          }

          table.report-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0 4px;
            table-layout: fixed;
          }

          table.report-table thead th {
            background: transparent;
            color: var(--pdf-text-strong);
            font-size: 10px;
            font-weight: 700;
            text-align: left;
            vertical-align: top;
            padding: 4px 10px 12px;
            line-height: 1.18;
            position: relative;
            white-space: normal;
          }

          table.report-table thead th.nowrap {
            white-space: nowrap;
          }

          table.report-table thead th.with-bar {
            padding-left: 14px;
          }

          table.report-table thead th.with-bar::before {
            content: "";
            position: absolute;
            left: 5px;
            top: 4px;
            bottom: 8px;
            width: 2px;
            background: var(--pdf-accent);
            border-radius: 2px;
          }

          table.report-table tbody td {
            background: #F6F4F8;
            color: var(--pdf-text);
            font-size: 10px;
            line-height: 1.2;
            padding: 9px 10px;
            border: 0;
            vertical-align: middle;
          }

          table.report-table tbody tr td:first-child {
            border-top-left-radius: 8px;
            border-bottom-left-radius: 8px;
          }

          table.report-table tbody tr td:last-child {
            border-top-right-radius: 8px;
            border-bottom-right-radius: 8px;
          }

          .name-cell {
            color: var(--pdf-text);
            line-height: 1.15;
            word-break: break-word;
          }

          .link-cell a {
            color: var(--pdf-link);
            text-decoration: none;
            font-weight: 600;
            font-size: 10px;
            white-space: nowrap;
          }

          .sub-pill {
            display: inline-block;
            background: var(--pdf-accent-soft);
            color: var(--pdf-accent-dark);
            border-radius: 6px;
            padding: 4px 7px 3px;
            font-size: 8px;
            line-height: 1.05;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            text-align: center;
            min-width: 70px;
          }

          /* ---------- Opportunity page ---------- */

          .opp-panel {
            background: var(--pdf-surface);
            border: 1px solid var(--pdf-border-soft);
            border-radius: 18px;
            padding: 24px;
            margin-top: 10px;
          }

          .opp-meta-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 24px;
          }

          .opp-meta-cell {
            background: var(--pdf-panel-tint);
            border: 1px solid var(--pdf-border-soft);
            border-radius: 12px;
            padding: 12px 14px 11px;
            min-height: 56px;
          }

          .opp-meta-label {
            margin: 0 0 5px 0;
            color: var(--pdf-accent);
            font-size: 9px;
            line-height: 1.08;
            font-weight: 700;
            text-transform: uppercase;
          }

          .opp-meta-value {
            margin: 0;
            color: var(--pdf-text-strong);
            font-size: 14px;
            line-height: 1.18;
            font-weight: 700;
            word-break: break-word;
          }

          .opp-proposals-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            column-gap: 16px;
            row-gap: 16px;
            align-items: start;
          }

          .opp-proposal {
            background: var(--pdf-surface-soft);
            border: 1px solid var(--pdf-border);
            border-radius: 16px;
            padding: 18px 16px 16px;
          }

          .opp-proposal-title {
            margin: 0 0 12px 0;
            color: var(--pdf-text-strong);
            font-size: 12px;
            line-height: 1.25;
            font-weight: 700;
            min-height: 44px;
          }

          .opp-price-row {
            display: flex;
            align-items: baseline;
            gap: 6px;
            margin: 0 0 8px 0;
            flex-wrap: wrap;
          }

          .opp-price-promo {
            color: var(--pdf-text-strong);
            font-size: 20px;
            font-weight: 700;
            line-height: 1;
          }

          .opp-price-list {
            color: var(--pdf-text-faint);
            font-size: 9px;
            line-height: 1.1;
            white-space: normal;
          }

          .opp-price-list .strike {
            text-decoration: line-through;
            margin-right: 2px;
          }

          .opp-line {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 12px;
            margin: 16px 12px 12px 0px;
          }

          .opp-line-label {
            color: var(--pdf-text-muted);
            font-size: 10px;
            line-height: 1.18;
            flex: 1;
          }

          .opp-line-value {
            color: var(--pdf-text-strong);
            font-size: 10px;
            line-height: 1;
            font-weight: 700;
            white-space: nowrap;
          }

          .opp-link {
            display: inline-block;
            margin-top: 8px;
            color: var(--pdf-link);
            text-decoration: none;
            font-size: 10px;
            font-weight: 600;
          }

          .opp-link-disabled {
            color: #A8AFBE;
            cursor: default;
          }

          .opp-empty {
            font-size: 11px;
            color: var(--pdf-text-muted);
            margin: 0;
          }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `;
}

// ---------- Report render functions ----------

export function renderResellerListHtml(params: {
	rows: ResellerListRow[];
	summaryCards: SummaryCard[];
	assets: PdfTemplateAssets;
}): string {
	const body = `
    <main class="page">
      ${renderPageHeader({ variant: 'reseller', assets: params.assets })}

      <section class="table-panel">
        <table class="report-table">
          <colgroup>
            <col style="width: 28%">
            <col style="width: 22%">
            <col style="width: 22%">
            <col style="width: 28%">
          </colgroup>
          <thead>
            <tr>
              <th>Reseller name</th>
              <th class="with-bar">Number of opportunities</th>
              <th class="with-bar">Number of seats</th>
              <th class="nowrap">Proposal options</th>
            </tr>
          </thead>
          <tbody>
            ${params.rows
							.map(
								(row) => `
                <tr>
                  <td class="name-cell">${escapeHtml(row.resellerName)}</td>
                  <td>${escapeHtml(formatRange(row.opportunityCount))}</td>
                  <td>${escapeHtml(formatRange(row.seats))}</td>
                  <td class="link-cell"><a href="${escapeHtml(row.proposalLink)}">Review Customers ›</a></td>
                </tr>
              `,
							)
							.join('')}
          </tbody>
        </table>
      </section>
    </main>
  `;

	return renderDocument('Reseller Opportunity List', body, params.assets, {
		pageHeightMm: A4_HEIGHT_MM,
	});
}

export function renderCustomerListHtml(params: {
	resellerId?: string;
	rows: CustomerListRow[];
	summaryCards: SummaryCard[];
	assets: PdfTemplateAssets;
}): string {
	const body = `
    <main class="page">
      ${renderPageHeader({
				variant: 'customer',
				entityName: params.resellerId,
				assets: params.assets,
			})}

      <section class="table-panel">
        <table class="report-table">
          <colgroup>
            <col style="width: 20%">
            <col style="width: 14%">
            <col style="width: 14%">
            <col style="width: 14%">
            <col style="width: 14%">
            <col style="width: 24%">
          </colgroup>
          <thead>
            <tr>
              <th>Customer<br/>name</th>
              <th class="with-bar">Number of<br/>seats</th>
              <th><span class="sub-pill">Business<br/>Basic</span></th>
              <th><span class="sub-pill">Business<br/>Standard</span></th>
              <th><span class="sub-pill">Business<br/>Premium</span></th>
              <th class="nowrap">Proposal options</th>
            </tr>
          </thead>
          <tbody>
            ${params.rows
							.map(
								(row) => `
                <tr>
                  <td class="name-cell">${escapeHtml(row.customerName)}</td>
                  <td>${escapeHtml(formatRange(row.seats))}</td>
                  <td>${escapeHtml(formatRange(row.basicSeats))}</td>
                  <td>${escapeHtml(formatRange(row.standardSeats))}</td>
                  <td>${escapeHtml(formatRange(row.premiumSeats))}</td>
                  <td class="link-cell"><a href="${escapeHtml(row.proposalLink)}">Review opportunities ›</a></td>
                </tr>
              `,
							)
							.join('')}
          </tbody>
        </table>
      </section>
    </main>
  `;

	return renderDocument('Customer Opportunity List', body, params.assets, {
		pageHeightMm: A4_HEIGHT_MM,
	});
}

export function renderOpportunitiesHtml(params: {
	rows: OpportunityPageRow[];
	assets: PdfTemplateAssets;
	currency?: RegionalCurrencyCode;
}): string {
	const body = params.rows
		.map((row, index) => {
			const pricingContext = buildRegionalPricingContext({
				region: row.region,
				currencyOverride: params.currency,
			});
			const currencyFormat = {
				currencySymbol: pricingContext.currencySymbol,
				locale: pricingContext.locale,
			};
			const scenariosHtml =
				row.scenarios.length === 0
					? `<p class="opp-empty">No eligible proposals found for selected options.</p>`
					: `
              <div class="opp-proposals-grid">
                ${row.scenarios
									.map((scenario) => {
										const showStrike =
											Number(scenario.listMonthlyPerUser) >
											Number(scenario.promoMonthlyPerUser);

										// Calculate per-seat values, then multiply by range lower bound
										const lowerBound = getRangeLowerBound(row.seatCount);
										const perSeatIncrementalCost = row.seatCount > 0 ? scenario.incrementalCost / row.seatCount : 0;
										const perSeatIncentive = row.seatCount > 0 ? scenario.totalIncentive / row.seatCount : 0;
										const rangeIncrementalCost = perSeatIncrementalCost * lowerBound;
										const rangeIncentive = perSeatIncentive * lowerBound;

										return `
                      <article class="opp-proposal">
                        <p class="opp-proposal-title">${escapeHtml(
													scenario.endingSkuName,
												)}</p>

                        <div class="opp-price-row">
                          <span class="opp-price-promo">${escapeHtml(
														formatCurrency(
															scenario.promoMonthlyPerUser,
															currencyFormat,
														),
													)}</span>
                          <span class="opp-price-list">
                            ${
															showStrike
																? `<span class="strike">${escapeHtml(
																		formatCurrency(
																			scenario.listMonthlyPerUser,
																			currencyFormat,
																		),
																	)}</span>`
																: ''
														}
                            user/month, paid yearly
                          </span>
                        </div>

                        <div class="opp-line">
                          <span class="opp-line-label">Incremental Cost to Customer</span>
                          <span class="opp-line-value">${escapeHtml(
														formatCurrency(
															rangeIncrementalCost,
															currencyFormat,
														),
													)}</span>
                        </div>

                        <div class="opp-line">
                          <span class="opp-line-label">Incremental Partner Incentive (Estimated)</span>
                          <span class="opp-line-value">${escapeHtml(
														formatCurrency(
															rangeIncentive,
															currencyFormat,
														),
													)}</span>
                        </div>

                        ${
													scenario.proposalLink
														? `<a class="opp-link" href="${escapeHtml(scenario.proposalLink)}">View Proposal documents ›</a>`
														: '<span class="opp-link opp-link-disabled">View Proposal documents ›</span>'
												}
                      </article>
                    `;
									})
									.join('')}
              </div>
            `;

			return `
        <main class="page ${index < params.rows.length - 1 ? 'page-break-after' : ''}">
          ${renderPageHeader({
						variant: 'opportunity',
						entityName: row.customerName,
						assets: params.assets,
					})}

          <section class="opp-panel">
            <div class="opp-meta-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
              <div class="opp-meta-cell">
                <p class="opp-meta-label">Starting SKU</p>
                <p class="opp-meta-value">${escapeHtml(row.currentProduct)}</p>
              </div>
              <div class="opp-meta-cell">
                <p class="opp-meta-label">Total Seats</p>
                <p class="opp-meta-value">${escapeHtml(
									formatRange(row.seatCount),
								)}</p>
              </div>
              <div class="opp-meta-cell">
                <p class="opp-meta-label">Renewal Date</p>
                <p class="opp-meta-value">${escapeHtml(
									formatRenewalDate(row.renewalDate),
								)}</p>
              </div>
            </div>

            ${scenariosHtml}
          </section>
        </main>
      `;
		})
		.join('');

	return renderDocument('Opportunity Proposal Paths', body, params.assets, {
		pageHeightMm: A4_HEIGHT_MM,
	});
}
