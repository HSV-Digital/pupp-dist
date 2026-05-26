import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerForm } from './CustomerForm';

vi.mock('@/lib/rules-engine', () => ({
	STARTING_SKUS: [
		{ id: 'bb', name: 'Business Basic', monthlyPrice: 6.0 },
		{ id: 'bs', name: 'Business Standard', monthlyPrice: 12.5 },
		{ id: 'bp', name: 'Business Premium', monthlyPrice: 22.0 },
		{ id: 'other', name: 'Other', monthlyPrice: 0 },
	],
	buildRegionalPricingContext: ({ region }: { region?: string }) => {
		if (region === 'Canada') {
			return { currencySymbol: 'CA$' };
		}
		if (region === 'Brazil') {
			return { currencySymbol: 'R$' };
		}
		return { currencySymbol: '$' };
	},
	getRegionalStartingSkuMonthlyPrice: ({
		startingSkuId,
		region,
	}: {
		startingSkuId: string;
		region?: string;
	}) => {
		const map: Record<string, Record<string, number>> = {
			US: { bb: 6, bs: 12.5, bp: 22 },
			CA: { bb: 8.1, bs: 17, bp: 29.8 },
			BR: { bb: 28.6, bs: 71.6, bp: 126 },
		};
		const country =
			region === 'Canada' ? 'CA' : region === 'Brazil' ? 'BR' : 'US';
		return map[country]?.[startingSkuId] ?? null;
	},
}));

function setBasicFields() {
	fireEvent.change(screen.getByPlaceholderText('e.g. Contoso Partners'), {
		target: { value: 'Contoso Partners' },
	});
	fireEvent.change(screen.getByPlaceholderText('e.g. Northwind Traders'), {
		target: { value: 'Northwind Traders' },
	});
	fireEvent.change(screen.getByPlaceholderText('e.g. 500'), {
		target: { value: '120' },
	});
}

describe('CustomerForm', () => {
	it('submit button is disabled when form is empty', () => {
		render(<CustomerForm onSubmit={vi.fn()} />);
		expect(
			screen.getByRole('button', { name: /Explore AI and Security Options/i }),
		).toBeDisabled();
	});

	it('auto-fills known SKU price for selected region', () => {
		render(<CustomerForm onSubmit={vi.fn()} />);

		fireEvent.click(screen.getByPlaceholderText('Select a region'));
		fireEvent.click(screen.getByText('Canada'));

		fireEvent.click(screen.getByPlaceholderText('Select a SKU'));
		fireEvent.click(screen.getByText('Business Standard'));

		expect(screen.getByDisplayValue('17')).toBeInTheDocument();
	});

	it('updates known SKU price when region changes', () => {
		render(<CustomerForm onSubmit={vi.fn()} />);

		fireEvent.click(screen.getByPlaceholderText('Select a SKU'));
		fireEvent.click(screen.getByText('Business Premium'));
		expect(screen.getByDisplayValue('22')).toBeInTheDocument();

		fireEvent.click(screen.getByPlaceholderText('Select a region'));
		fireEvent.click(screen.getByText('Brazil'));
		expect(screen.getByDisplayValue('126')).toBeInTheDocument();
	});

	it('keeps cost editable for Other SKU', () => {
		render(<CustomerForm onSubmit={vi.fn()} />);

		fireEvent.click(screen.getByPlaceholderText('Select a SKU'));
		fireEvent.click(screen.getByText('Other'));

		const costInput = screen.getByPlaceholderText('e.g. 12.50');
		expect(costInput).not.toBeDisabled();

		fireEvent.change(costInput, { target: { value: '41.3' } });
		expect(costInput).toHaveValue(41.3);
	});

	it('submits with selected regional known-SKU pricing', () => {
		const onSubmit = vi.fn();
		render(<CustomerForm onSubmit={onSubmit} />);

		setBasicFields();
		fireEvent.click(screen.getByPlaceholderText('Select a region'));
		fireEvent.click(screen.getByText('Canada'));
		fireEvent.click(screen.getByPlaceholderText('Select a SKU'));
		fireEvent.click(screen.getByText('Business Basic'));

		fireEvent.click(
			screen.getByRole('button', { name: /Explore AI and Security Options/i }),
		);

		expect(onSubmit).toHaveBeenCalledWith({
			partnerName: 'Contoso Partners',
			customerName: 'Northwind Traders',
			currentSku: 'Business Basic',
			numberOfSeats: 120,
			costPerUser: 8.1,
			region: 'Canada',
		});
	});
});
