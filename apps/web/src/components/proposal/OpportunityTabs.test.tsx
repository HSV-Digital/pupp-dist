import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SkuCategory } from '@repo/types';
import type { CustomerOpportunity } from '@/lib/opportunity-utils';
import { OpportunityTabs } from './OpportunityTabs';

function makeOpportunity(
	overrides: Partial<CustomerOpportunity> = {},
): CustomerOpportunity {
	return {
		opportunityId: 'cust-1:sub-1',
		customerId: 'cust-1',
		subscriptionId: 'sub-1',
		subscription: {
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
			seatCount: 50,
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
		},
		startingSku: {
			id: 'bs',
			name: 'Business Standard',
			monthlyPrice: 12.5,
		},
		endingSkus: [
			{
				id: 'bs_cb',
				name: 'Business Standard + Copilot Business',
				upgradeType: 'AI',
				listPrice: 32,
				promoPrice: 22,
				description: 'AI productivity upgrade.',
				planHighlights: ['Copilot included'],
			},
		],
		proposalExpiringArr: 6000,
		pricingContext: {
			country: 'US',
			regionCountry: 'US',
			currency: 'USD',
			currencySymbol: '$',
			locale: 'en-US',
			sourceRegion: 'United States',
			fallbackApplied: false,
			fallbackReason: 'none',
		},
		...overrides,
	};
}

describe('OpportunityTabs', () => {
	it('renders vertical opportunity tabs with one-line metadata', () => {
		const opportunities = [makeOpportunity()];

		render(
			<OpportunityTabs
				opportunities={opportunities}
				activeOpportunityId={opportunities[0].opportunityId}
				onChange={() => {}}
			/>,
		);

		expect(screen.getByRole('tablist')).toHaveAttribute(
			'aria-orientation',
			'vertical',
		);
		expect(
			screen.getByText('Microsoft 365 Business Standard'),
		).toBeInTheDocument();
		expect(screen.getByText('Seats')).toBeInTheDocument();
		expect(screen.getByText('50-99')).toBeInTheDocument();
		expect(screen.queryByText('ARR')).not.toBeInTheDocument();
		expect(screen.getByText(/December 2026/)).toBeInTheDocument();
		expect(screen.queryByText('Selected')).not.toBeInTheDocument();
	});

	it('calls onChange when an opportunity is clicked', () => {
		const opportunities = [
			makeOpportunity(),
			makeOpportunity({
				opportunityId: 'cust-1:sub-2',
				subscriptionId: 'sub-2',
				subscription: {
					...makeOpportunity().subscription,
					subscriptionId: 'sub-2',
					currentProduct: 'Microsoft 365 Business Basic',
				},
			}),
		];

		const onChange = vi.fn();

		render(
			<OpportunityTabs
				opportunities={opportunities}
				activeOpportunityId={opportunities[0].opportunityId}
				onChange={onChange}
			/>,
		);

		fireEvent.click(
			screen.getByRole('tab', { name: /Microsoft 365 Business Basic/i }),
		);
		expect(onChange).toHaveBeenCalledWith('cust-1:sub-2');
	});
});
