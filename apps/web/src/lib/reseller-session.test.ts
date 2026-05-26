import { describe, it, expect, beforeEach } from 'vitest';
import type { ResellerFormData } from './reseller-session';
import {
	writeResellerSession,
	readResellerSession,
	clearResellerSession,
} from './reseller-session';

const VALID_DATA: ResellerFormData = {
	customerId: 'abc-123',
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

describe('reseller-session', () => {
	it('round-trips write → read', () => {
		writeResellerSession(VALID_DATA);
		expect(readResellerSession()).toEqual(VALID_DATA);
	});

	it('returns null when key is missing', () => {
		expect(readResellerSession()).toBeNull();
	});

	it('returns null when stored JSON is corrupted', () => {
		sessionStorage.setItem('reseller-form-data', '{bad json!!!');
		expect(readResellerSession()).toBeNull();
	});

	it('returns null when shape is invalid (missing field)', () => {
		const incomplete = { customerId: 'x', partnerName: 'y' };
		sessionStorage.setItem('reseller-form-data', JSON.stringify(incomplete));
		expect(readResellerSession()).toBeNull();
	});

	it('returns null when a numeric field is a string', () => {
		const bad = { ...VALID_DATA, numberOfSeats: '500' };
		sessionStorage.setItem('reseller-form-data', JSON.stringify(bad));
		expect(readResellerSession()).toBeNull();
	});

	it('clearResellerSession removes the entry', () => {
		writeResellerSession(VALID_DATA);
		clearResellerSession();
		expect(readResellerSession()).toBeNull();
	});
});
