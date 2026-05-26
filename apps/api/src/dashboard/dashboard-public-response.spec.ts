import { formatEstimatedSeatCount } from '@repo/shared';
import { toPublicDashboardResponse } from './dashboard-public-response';
import type { DashboardResponse } from './dashboard.types';

describe('formatEstimatedSeatCount', () => {
	it('formats compact seat counts with at most one decimal place', () => {
		expect(formatEstimatedSeatCount(5_178_530)).toBe('5.2M');
		expect(formatEstimatedSeatCount(4_500_000)).toBe('4.5M');
		expect(formatEstimatedSeatCount(4_000_000)).toBe('4M');
		expect(formatEstimatedSeatCount(150_000)).toBe('150k');
		expect(formatEstimatedSeatCount(999)).toBe('999');
	});
});

describe('toPublicDashboardResponse', () => {
	it('adds backend-formatted total seats display to summary payloads', () => {
		const response: DashboardResponse = {
			viewMode: 'customer',
			page: 1,
			pageSize: 15,
			total: 1,
			sortBy: 'totalSeats',
			sortDir: 'descending',
			summary: {
				totalRenewals: 10,
				totalSeats: 5_178_530,
				expiringARR: 0,
				copilotOpportunities: 6,
				totalCustomers: 4,
				totalResellers: 2,
			},
			availableOptions: undefined,
			rows: [
				{
					customerId: 'customer-1',
					customerName: 'Contoso',
					resellerName: 'Reseller',
					distributorName: 'Distributor',
					totalARR: 1000,
					totalSeats: 120,
					subscriptionCount: 3,
					subscriptionSkuCategories: ['Premium'],
					renewalDate: '2026-06-01',
				},
			],
		};

		const publicResponse = toPublicDashboardResponse(response);

		expect(publicResponse.summary).toMatchObject({
			totalSeats: 5_178_530,
			totalSeatsDisplay: '5.2M',
		});
	});

	it('masks opportunity seat counts and adds display fields', () => {
		const response: DashboardResponse = {
			viewMode: 'opportunity',
			page: 1,
			pageSize: 15,
			total: 1,
			sortBy: 'annualRevenueRunRate',
			sortDir: 'descending',
			rows: [
				{
					customerId: 'customer-1',
					subscriptionId: 'subscription-1',
					customerName: 'Contoso',
					resellerName: 'Reseller',
					distributorName: 'Distributor',
					pssAIWorkforceName: 'PSS',
					pssAISecurityName: 'Security',
					psaName: 'PSA',
					pdmName: 'PDM',
					pmmName: 'PMM',
					currentProduct: 'Microsoft 365 Business Premium',
					type: 'Renewal',
					skuCategory: 'Premium',
					seatCount: 63,
					annualRevenueRunRate: 12_000,
					renewalDate: '2026-12-01',
					termMonths: 12,
					autoRenew: false,
					multiYear: false,
					hasCopilot: false,
					hasPurview: false,
					hasSureStep: false,
					currentMargin: 20,
					customerSegment: 'SMB',
					region: 'United States',
					notes: '',
				},
			],
		};

		const publicResponse = toPublicDashboardResponse(response);
		const [row] = publicResponse.rows;

		expect(row).toMatchObject({
			seatCount: 50,
			seatRange: '50-99',
			closestRenewalLabel: 'December 2026',
		});
	});
});
