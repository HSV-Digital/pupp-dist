import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkuCategory, UpgradeType } from '@repo/types';
import type { RenewalSubscription } from '@repo/types';
import { formatCurrency } from '@/lib/format-utils';
import { calculateScenario } from '@/lib/rules-engine';
import { INCENTIVE_RATES } from '@/lib/upgrade-matrix';
import type { ScenarioProposal } from '@/lib/proposal-types';
import { ProposalCard } from './ProposalCard';

function makeSubscription(
	overrides: Partial<RenewalSubscription> = {},
): RenewalSubscription {
	return {
		customerId: 'cust-1',
		subscriptionId: 'sub-1',
		customerName: 'Contoso',
		resellerName: 'Reseller A',
		distributorName: 'Distributor A',
		pssAIWorkforceName: 'PSS A',
		pssAISecurityName: '',
		psaName: '',
		pdmName: 'PDM A',
		pmmName: 'PMM A',
		currentProduct: 'Microsoft 365 Business Standard',
		skuCategory: SkuCategory.Standard,
		seatCount: 40,
		annualRevenueRunRate: 6000,
		renewalDate: '2026-12-01',
		termMonths: 12,
		autoRenew: true,
		multiYear: false,
		hasCopilot: false,
		hasPurview: false,
		hasSureStep: false,
		currentMargin: 10,
		customerSegment: '',
		region: '',
		notes: '',
		...overrides,
	};
}

function makeProposal(): ScenarioProposal {
	const subscription = makeSubscription();
	const scenario = calculateScenario(
		{
			id: 'bs',
			name: 'Business Standard',
			monthlyPrice: 12.5,
		},
		{
			id: 'bs_cb',
			name: 'Business Standard + Copilot Business',
			upgradeType: UpgradeType.AI,
			listPrice: 32,
			promoPrice: 22,
			description: 'AI productivity upgrade.',
			planHighlights: ['Copilot included'],
		},
		30,
	);

	return {
		opportunityId: 'cust-1:sub-1',
		subscription,
		scenario,
	};
}

describe('ProposalCard', () => {
	it('renders ScenarioCard-aligned pricing comparison rows and values', () => {
		const proposal = makeProposal();
		render(<ProposalCard proposal={proposal} />);

		const pricingTable = screen.getByTestId('proposal-pricing-table');

		expect(
			within(pricingTable).getByText('Expiring SKU renewal cost to customer'),
		).toBeInTheDocument();
		expect(
			within(pricingTable).getByText(
				'Target SKU cost to Customer (as per list price)',
			),
		).toBeInTheDocument();
		expect(
			within(pricingTable).getByText('Cost savings from promos'),
		).toBeInTheDocument();
		expect(
			within(pricingTable).getByText(
				'Target SKU cost to Customer (Promo price)',
			),
		).toBeInTheDocument();
		expect(
			within(pricingTable).getByText(
				'Incremental Cost of Customer (Estimated)',
			),
		).toBeInTheDocument();
		expect(
			within(pricingTable).getByText(
				formatCurrency(proposal.scenario.currentAnnualValue),
			),
		).toBeInTheDocument();
		expect(
			within(pricingTable).getByText(
				formatCurrency(proposal.scenario.listAnnualValue),
			),
		).toBeInTheDocument();
		expect(
			within(pricingTable).getByText(
				formatCurrency(proposal.scenario.promoSavingsAnnual),
			),
		).toBeInTheDocument();
		expect(
			within(pricingTable).getByText(
				formatCurrency(proposal.scenario.offerAnnualValue),
			),
		).toBeInTheDocument();
		expect(
			within(pricingTable).getByText(
				formatCurrency(proposal.scenario.incrementalCost),
			),
		).toBeInTheDocument();
		expect(
			within(pricingTable).queryByText('Annual Delta'),
		).not.toBeInTheDocument();
		const pricingTableText = pricingTable.textContent ?? '';
		expect(
			pricingTableText.indexOf(
				'Target SKU cost to Customer (as per list price)',
			),
		).toBeLessThan(pricingTableText.indexOf('Cost savings from promos'));
		expect(pricingTableText.indexOf('Cost savings from promos')).toBeLessThan(
			pricingTableText.indexOf('Target SKU cost to Customer (Promo price)'),
		);
		expect(
			pricingTableText.indexOf('Target SKU cost to Customer (Promo price)'),
		).toBeLessThan(
			pricingTableText.indexOf('Expiring SKU renewal cost to customer'),
		);
		expect(
			pricingTableText.indexOf('Expiring SKU renewal cost to customer'),
		).toBeLessThan(
			pricingTableText.indexOf('Incremental Cost of Customer (Estimated)'),
		);

		const savingsRow = screen.getByTestId('proposal-pricing-savings-row');
		expect(savingsRow).toBeInTheDocument();
		expect(
			within(savingsRow).getByText('Cost savings from promos'),
		).toHaveClass('font-semibold');
		expect(savingsRow).not.toHaveClass('border-t', 'border-gray-200');

		const promoPriceRow = within(pricingTable)
			.getByText('Target SKU cost to Customer (Promo price)')
			.closest('tr');
		expect(promoPriceRow).toHaveClass('border-t', 'border-gray-200');

		const incrementalCostRow = screen.getByTestId(
			'proposal-pricing-incremental-row',
		);
		expect(incrementalCostRow).toBeInTheDocument();
		expect(
			within(incrementalCostRow).getByText(
				'Incremental Cost of Customer (Estimated)',
			),
		).toHaveClass('font-semibold');
	});

	it('renders partner economics rows with rate labels and incremental highlight row', () => {
		const proposal = makeProposal();
		render(<ProposalCard proposal={proposal} />);

		const economicsTable = screen.getByTestId('proposal-economics-table');

		expect(
			within(economicsTable).getByText(
				`CSP Core (${(INCENTIVE_RATES.cspCore * 100).toFixed(2)}%)`,
			),
		).toBeInTheDocument();
		expect(
			within(economicsTable).getByText(
				`Strategic Accelerator (${(INCENTIVE_RATES.strategicAccelerator * 100).toFixed(2)}%)`,
			),
		).toBeInTheDocument();
		expect(
			within(economicsTable).getByText(
				`Growth Accelerator (${(INCENTIVE_RATES.growthAccelerator * 100).toFixed(2)}%)`,
			),
		).toBeInTheDocument();
		expect(
			within(economicsTable).getByText('Total Incentive and Margin'),
		).toBeInTheDocument();
		expect(
			within(economicsTable).getByText('Current Incentive & Margin'),
		).toBeInTheDocument();
		expect(
			within(economicsTable).getByText('Incremental Incentive ( Estimated)'),
		).toBeInTheDocument();
		// Under the new incentive formula, totalIncentive === incrementalIncentive
		// (renewal base already nets out the current side) and currentIncentive
		// is 0 — so the same formatted value appears on multiple rows. Assert
		// presence via getAllByText rather than getByText.
		expect(
			within(economicsTable).getAllByText(
				formatCurrency(proposal.scenario.economics.totalIncentive),
			).length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(economicsTable).getAllByText(
				formatCurrency(proposal.scenario.economics.currentIncentive),
			).length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(economicsTable).getAllByText(
				formatCurrency(proposal.scenario.economics.incrementalIncentive),
			).length,
		).toBeGreaterThanOrEqual(1);

		const incrementalIncentiveRow = screen.getByTestId(
			'proposal-economics-incremental-row',
		);
		expect(incrementalIncentiveRow).toBeInTheDocument();
		expect(
			within(incrementalIncentiveRow).getByText(
				'Incremental Incentive ( Estimated)',
			),
		).toHaveClass('font-semibold');
	});
});
