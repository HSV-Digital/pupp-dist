import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryCards } from './SummaryCards';

describe('SummaryCards', () => {
	it('renders backend-formatted estimated seats when provided', () => {
		render(
			<SummaryCards
				summary={{
					totalRenewals: 12,
					totalSeats: 5_178_530,
					totalSeatsDisplay: '5.2M',
					copilotOpportunities: 4,
				}}
				customerCount={45}
			/>,
		);

		expect(screen.getByText('Total Seats (Estimated)')).toBeInTheDocument();
		expect(screen.getByText('5.2M')).toBeInTheDocument();
	});

	it('falls back to compact formatting when display text is absent', () => {
		render(
			<SummaryCards
				summary={{
					totalRenewals: 12,
					totalSeats: 150_000,
					copilotOpportunities: 4,
				}}
				customerCount={45}
			/>,
		);

		expect(screen.getByText('150k')).toBeInTheDocument();
	});
});
