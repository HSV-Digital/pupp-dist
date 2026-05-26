import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AddResellerDialog } from './AddResellerDialog';

const onOpenChangeMock = vi.fn();
const onAddMock = vi.fn().mockResolvedValue({});
const onBulkAddMock = vi.fn().mockResolvedValue({ created: 0 });
const onBulkAddStreamMock = vi.fn().mockResolvedValue({ created: 0 });

vi.mock('@/lib/rules-engine', () => ({
	STARTING_SKUS: [
		{ id: 'bb', name: 'Business Basic', monthlyPrice: 6.0 },
		{ id: 'bs', name: 'Business Standard', monthlyPrice: 12.5 },
		{ id: 'bp', name: 'Business Premium', monthlyPrice: 22.0 },
	],
	buildRegionalPricingContext: () => ({ currencySymbol: '$' }),
	getRegionalStartingSkuMonthlyPrice: ({ startingSkuId }: { startingSkuId: string }) =>
		({ bb: 6, bs: 12.5, bp: 22 } as Record<string, number>)[startingSkuId] ??
		null,
}));

beforeEach(() => {
	onOpenChangeMock.mockReset();
	onAddMock.mockReset();
});

describe('AddResellerDialog', () => {
	it('renders dialog title when open', () => {
		render(
			<AddResellerDialog
				open={true}
				onOpenChange={onOpenChangeMock}
				onAdd={onAddMock}
				onBulkAdd={onBulkAddMock}
			onBulkAddStream={onBulkAddStreamMock}
			/>,
		);
		expect(screen.getByText('Add Customer')).toBeInTheDocument();
	});

	it('renders bulk upload tab by default with Upload Customers List button', () => {
		render(
			<AddResellerDialog
				open={true}
				onOpenChange={onOpenChangeMock}
				onAdd={onAddMock}
				onBulkAdd={onBulkAddMock}
			onBulkAddStream={onBulkAddStreamMock}
			/>,
		);
		expect(
			screen.getByRole('button', { name: 'Upload Customers List' }),
		).toBeInTheDocument();
	});

	it('renders single customer form when switching tabs', () => {
		render(
			<AddResellerDialog
				open={true}
				onOpenChange={onOpenChangeMock}
				onAdd={onAddMock}
				onBulkAdd={onBulkAddMock}
			onBulkAddStream={onBulkAddStreamMock}
			/>,
		);
		fireEvent.click(screen.getByRole('button', { name: /Add Single Customer/i }));
		expect(
			screen.getByRole('button', { name: 'Add Customer' }),
		).toBeInTheDocument();
	});

	it('does not render dialog content when closed', () => {
		render(
			<AddResellerDialog
				open={false}
				onOpenChange={onOpenChangeMock}
				onAdd={onAddMock}
				onBulkAdd={onBulkAddMock}
			onBulkAddStream={onBulkAddStreamMock}
			/>,
		);
		expect(
			screen.queryByText('Add Customer'),
		).not.toBeInTheDocument();
	});
});
