import { parseApiErrorMessage } from './api-error';

describe('parseApiErrorMessage', () => {
	it('returns string message from payload', () => {
		expect(
			parseApiErrorMessage({ message: 'Something failed' }, 'fallback'),
		).toBe('Something failed');
	});

	it('returns joined message when message is a string array', () => {
		expect(parseApiErrorMessage({ message: ['one', 'two'] }, 'fallback')).toBe(
			'one, two',
		);
	});

	it('returns fallback when payload does not contain usable message', () => {
		expect(parseApiErrorMessage({ message: '' }, 'fallback')).toBe('fallback');
		expect(parseApiErrorMessage(null, 'fallback')).toBe('fallback');
	});
});
