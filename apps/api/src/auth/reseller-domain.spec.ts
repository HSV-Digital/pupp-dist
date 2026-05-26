import { describe, expect, it } from 'vitest';
import {
	assertResellerCompanyDomain,
	assertResellerCompanyEmail,
	extractResellerEmailDomain,
	isGenericResellerDomain,
	normalizeResellerDomain,
} from './reseller-domain';

describe('reseller domain utilities', () => {
	it('normalizes valid company domains', () => {
		expect(normalizeResellerDomain('  @Sales.Contoso.COM. ')).toBe(
			'sales.contoso.com',
		);
	});

	it('extracts and normalizes the email domain', () => {
		expect(extractResellerEmailDomain('Partner.User@Contoso.com ')).toBe(
			'contoso.com',
		);
	});

	it('rejects malformed reseller domains', () => {
		expect(() => normalizeResellerDomain('localhost')).toThrow(
			'Invalid reseller domain',
		);
		expect(() => normalizeResellerDomain('bad domain.com')).toThrow(
			'Invalid reseller domain',
		);
	});

	it('flags hardcoded generic email domains', () => {
		expect(isGenericResellerDomain('gmail.com')).toBe(true);
		expect(() => assertResellerCompanyDomain('outlook.com')).toThrow(
			'Generic email domains are not allowed for reseller login',
		);
	});

	it('returns normalized reseller email and company domain', () => {
		expect(assertResellerCompanyEmail(' Reseller.User@Contoso.com ')).toEqual({
			email: 'reseller.user@contoso.com',
			domain: 'contoso.com',
		});
	});
});
