import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ResellerFormData } from './reseller-session';
import {
	readResellerDashboardEntries,
	writeResellerDashboardEntries,
	addResellerDashboardEntry,
	removeResellerDashboardEntry,
} from './reseller-dashboard-session';

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

describe('readResellerDashboardEntries', () => {
	it('returns empty array when key is missing', () => {
		expect(readResellerDashboardEntries()).toEqual([]);
	});

	it('returns empty array for corrupted JSON', () => {
		sessionStorage.setItem('reseller-dashboard-entries', '{not json!');
		expect(readResellerDashboardEntries()).toEqual([]);
	});

	it('returns empty array when stored value is not an array', () => {
		sessionStorage.setItem(
			'reseller-dashboard-entries',
			JSON.stringify({ foo: 'bar' }),
		);
		expect(readResellerDashboardEntries()).toEqual([]);
	});

	it('filters out entries with invalid shape', () => {
		const valid = {
			...VALID_FORM,
			id: 'id-1',
			createdAt: '2025-01-01T00:00:00.000Z',
		};
		const invalid = { id: 'id-2', partnerName: 'only-partial' };
		sessionStorage.setItem(
			'reseller-dashboard-entries',
			JSON.stringify([valid, invalid]),
		);
		const result = readResellerDashboardEntries();
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('id-1');
	});
});

describe('writeResellerDashboardEntries', () => {
	it('round-trips write → read', () => {
		const entries = [
			{
				...VALID_FORM,
				id: 'id-1',
				createdAt: '2025-01-01T00:00:00.000Z',
			},
		];
		writeResellerDashboardEntries(entries);
		expect(readResellerDashboardEntries()).toEqual(entries);
	});
});

describe('addResellerDashboardEntry', () => {
	it('appends entry with generated id and createdAt', () => {
		vi.spyOn(crypto, 'randomUUID').mockReturnValue(
			'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
		);

		const entry = addResellerDashboardEntry(VALID_FORM);

		expect(entry.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
		expect(entry.createdAt).toBeTruthy();
		expect(entry.customerName).toBe('Northwind Traders');

		const stored = readResellerDashboardEntries();
		expect(stored).toHaveLength(1);
		expect(stored[0].id).toBe(entry.id);

		vi.restoreAllMocks();
	});

	it('appends to existing entries', () => {
		addResellerDashboardEntry(VALID_FORM);
		addResellerDashboardEntry({ ...VALID_FORM, customerName: 'Second' });

		expect(readResellerDashboardEntries()).toHaveLength(2);
	});
});

describe('removeResellerDashboardEntry', () => {
	it('removes entry by id', () => {
		const entry = addResellerDashboardEntry(VALID_FORM);
		expect(readResellerDashboardEntries()).toHaveLength(1);

		removeResellerDashboardEntry(entry.id);
		expect(readResellerDashboardEntries()).toHaveLength(0);
	});

	it('does nothing when id is not found', () => {
		addResellerDashboardEntry(VALID_FORM);
		removeResellerDashboardEntry('nonexistent-id');
		expect(readResellerDashboardEntries()).toHaveLength(1);
	});
});
