import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionResellers } from './use-session-resellers';
import type { ResellerFormData } from './reseller-session';

const VALID_FORM: ResellerFormData = {
	customerId: 'cust-1',
	partnerName: 'Contoso Partners',
	customerName: 'Northwind Traders',
	currentSku: 'Business Standard',
	numberOfSeats: 500,
	costPerUser: 12.5,
	region: 'United States',
};

beforeEach(() => {
	sessionStorage.clear();
});

describe('useSessionResellers', () => {
	it('starts with loading true, then resolves to empty', async () => {
		const { result } = renderHook(() => useSessionResellers());

		// After the useEffect runs, loading becomes false
		expect(result.current.loading).toBe(false);
		expect(result.current.resellers).toEqual([]);
	});

	it('reads existing entries from sessionStorage', () => {
		const entry = {
			...VALID_FORM,
			id: 'test-id',
			createdAt: '2025-01-01T00:00:00.000Z',
		};
		sessionStorage.setItem(
			'reseller-dashboard-entries',
			JSON.stringify([entry]),
		);

		const { result } = renderHook(() => useSessionResellers());
		expect(result.current.resellers).toHaveLength(1);
		expect(result.current.resellers[0].id).toBe('test-id');
	});

	it('addReseller appends entry and updates state', () => {
		vi.spyOn(crypto, 'randomUUID').mockReturnValue(
			'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
		);

		const { result } = renderHook(() => useSessionResellers());

		let entry: ReturnType<typeof result.current.addReseller>;
		act(() => {
			entry = result.current.addReseller(VALID_FORM);
		});

		expect(entry!.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
		expect(result.current.resellers).toHaveLength(1);

		vi.restoreAllMocks();
	});

	it('removeReseller removes entry and updates state', () => {
		const { result } = renderHook(() => useSessionResellers());

		let entry: ReturnType<typeof result.current.addReseller>;
		act(() => {
			entry = result.current.addReseller(VALID_FORM);
		});

		expect(result.current.resellers).toHaveLength(1);

		act(() => {
			result.current.removeReseller(entry!.id);
		});

		expect(result.current.resellers).toHaveLength(0);
	});
});
