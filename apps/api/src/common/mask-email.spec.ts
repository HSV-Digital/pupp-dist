import { maskEmail } from './mask-email';

describe('maskEmail', () => {
	it('masks most of the local part for typical emails', () => {
		expect(maskEmail('mohit@hsv.digital')).toBe('m***t@hsv.digital');
	});

	it('returns original value when local part is too short', () => {
		expect(maskEmail('a@example.com')).toBe('a@example.com');
	});

	it('returns original value when email is malformed', () => {
		expect(maskEmail('invalid-email')).toBe('invalid-email');
	});
});
