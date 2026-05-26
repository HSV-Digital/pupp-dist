'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { getCurrencySymbol, getCurrencyLocale } from '@repo/shared';
import { formatCurrency, type CurrencyDisplayOptions } from '@/lib/format-utils';
import type { ScenarioProposal } from '@/lib/proposal-types';
import { INCENTIVE_RATES, NEW_CUSTOMER_INCENTIVE_RATE } from '@/lib/upgrade-matrix';
import { getThemeConfig } from '@/lib/theme-config';
import { useCurrency } from '@/lib/currency-context';

interface ProposalCardProps {
	proposal: ScenarioProposal;
}

type RowTone = 'default' | 'emphasize' | 'highlight';

interface TableRowConfig {
	label: string;
	value: string;
	tone?: RowTone;
	showDivider?: boolean;
	testId?: string;
}

const TABLE_CLASSES =
	'w-full border-collapse font-ds-text text-sm leading-relaxed';
const SECTION_CARD_CLASSES =
	'rounded-lg border-2 border-white bg-white/70 px-4 py-3';
const SECTION_HEADER_CLASSES =
	'm-0 mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-(--ds-color-violet-900)';
const BASE_CELL_LABEL_CLASSES = 'py-2 pr-3 text-sm';
const BASE_CELL_VALUE_CLASSES = 'py-2 text-right text-sm font-mono';

function toPercent(value: number): string {
	return `${(value * 100).toFixed(2)}%`;
}

function ComparisonRow({ row }: { row: TableRowConfig }) {
	const isEmphasized = row.tone === 'emphasize' || row.tone === 'highlight';
	const shouldShowDivider = row.showDivider ?? isEmphasized;
	const rowClassName = [
		shouldShowDivider ? 'border-t border-gray-200' : '',
		row.tone === 'highlight' ? 'bg-(--ds-color-violet-50)' : '',
	]
		.filter(Boolean)
		.join(' ');
	const textClassName = isEmphasized
		? 'text-(--ds-color-violet-500) font-semibold'
		: 'font-normal';

	return (
		<tr data-testid={row.testId} className={rowClassName}>
			<td className={`${BASE_CELL_LABEL_CLASSES} ${textClassName}`}>
				{row.label}
			</td>
			<td className={`${BASE_CELL_VALUE_CLASSES} ${textClassName}`}>
				{row.value}
			</td>
		</tr>
	);
}

export function ProposalCard({ proposal }: ProposalCardProps) {
	const t = useTranslations('proposal');
	const { currency } = useCurrency();
	const { scenario } = proposal;
	const generatedAt = new Date().toLocaleString();
	const formatOptions = useMemo<CurrencyDisplayOptions>(
		() => ({
			currency,
			currencySymbol: getCurrencySymbol(currency),
			locale: getCurrencyLocale(currency),
		}),
		[currency],
	);
	const fmt = (value: number) => formatCurrency(value, formatOptions);
	const pricingRows: TableRowConfig[] = [
		{
			label: t('targetSkuCostListPrice'),
			value: fmt(scenario.listAnnualValue),
		},
		{
			label: t('costSavingsPromos'),
			value: fmt(scenario.promoSavingsAnnual),
			tone: 'emphasize',
			showDivider: false,
			testId: 'proposal-pricing-savings-row',
		},
		{
			label: t('targetSkuCostPromoPrice'),
			value: fmt(scenario.offerAnnualValue),
			showDivider: true,
		},
		{
			label: t('expiringSkuCost'),
			value: fmt(scenario.currentAnnualValue),
		},
		{
			label: t('incrementalCostEstimated'),
			value: fmt(scenario.incrementalCost),
			tone: 'emphasize',
			testId: 'proposal-pricing-incremental-row',
		},
	];
	const economicsRows: TableRowConfig[] = [
		{
			label: `${t('cspCore')} (${toPercent(INCENTIVE_RATES.cspCore)})`,
			value: fmt(scenario.economics.cspCore),
		},
		{
			label: `${t('strategicAccelerator')} (${toPercent(scenario.economics.strategicAcceleratorRate ?? INCENTIVE_RATES.strategicAccelerator)})`,
			value: fmt(scenario.economics.strategicAccelerator),
		},
		...(scenario.startingSkuId !== 'other'
			? [{
					label: `${t('growthAccelerator')} (${toPercent(INCENTIVE_RATES.growthAccelerator)})`,
					value: fmt(scenario.economics.growthAccelerator),
				}]
			: []),
		...(scenario.economics.newCustomerIncentive && scenario.economics.newCustomerIncentive > 0
			? [{
					label: `${t('newCustomerIncentive')} (${toPercent(NEW_CUSTOMER_INCENTIVE_RATE)})`,
					value: fmt(scenario.economics.newCustomerIncentive),
				}]
			: []),
		{
			label: t('totalIncentiveMargin'),
			value: fmt(scenario.economics.totalIncentive),
			tone: 'emphasize',
		},
		{
			label: t('currentIncentiveMargin'),
			value: fmt(scenario.economics.currentIncentive),
		},
		{
			label: t('incrementalIncentiveEstimated'),
			value: fmt(scenario.economics.incrementalIncentive),
			tone: 'emphasize',
			testId: 'proposal-economics-incremental-row',
		},
	];

	return (
		<div className="overflow-hidden rounded-xl bg-white border-2 border-white">
			<div className="h-64 bg-cover bg-position-[bottom_center] px-8 pb-7 pt-8" style={{ backgroundImage: `url('${getThemeConfig().assets.proposalCardBackground}')` }}>
				<p className={`mb-2 font-ds-display uppercase tracking-[0.12em] text-(--ds-color-twilight-purple-400) ${getThemeConfig().typography.proposalBadge}`}>
					Proposal
				</p>
				<h3 className={`mb-2 leading-tight tracking-tight ${getThemeConfig().typography.proposalTitle}`}>
					{scenario.endingSkuName}
				</h3>
				<p className="m-0 text-base text-gray-600">
					From {scenario.startingSkuName}
				</p>
			</div>

			<div className="px-8 py-6">
				<div
					className={SECTION_CARD_CLASSES}
					style={{ backdropFilter: 'blur(80px)' }}
				>
					<p className={SECTION_HEADER_CLASSES}>Pricing Comparison</p>
					<table data-testid="proposal-pricing-table" className={TABLE_CLASSES}>
						<tbody>
							{pricingRows.map((row) => (
								<ComparisonRow key={row.label} row={row} />
							))}
						</tbody>
					</table>
				</div>
			</div>

			<div className="px-8 pb-6">
				<div
					className={SECTION_CARD_CLASSES}
					style={{ backdropFilter: 'blur(80px)' }}
				>
					<p className={SECTION_HEADER_CLASSES}>Partner Profitability</p>
					<table
						data-testid="proposal-economics-table"
						className={TABLE_CLASSES}
					>
						<tbody>
							{economicsRows.map((row) => (
								<ComparisonRow key={row.label} row={row} />
							))}
						</tbody>
					</table>
				</div>
			</div>

			<div className="bg-(--ds-color-lavender-50) px-8 py-4 font-ds-text text-xs text-gray-500">
				Generated {generatedAt}
			</div>
		</div>
	);
}
