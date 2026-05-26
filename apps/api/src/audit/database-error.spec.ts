import { formatDatabaseErrorDetails } from './database-error';

describe('formatDatabaseErrorDetails', () => {
	it('returns null for non-object values', () => {
		expect(formatDatabaseErrorDetails(undefined)).toBeNull();
		expect(formatDatabaseErrorDetails('error')).toBeNull();
		expect(formatDatabaseErrorDetails(10)).toBeNull();
	});

	it('extracts details from a postgres-like error object', () => {
		const details = formatDatabaseErrorDetails({
			code: '42703',
			severity: 'ERROR',
			schema: 'public',
			table: 'audit_events',
			column: 'action_status',
			detail: 'Column does not exist',
			hint: 'Run migrations',
		});

		expect(details).toBe(
			'code=42703 severity=ERROR schema=public table=audit_events column=action_status detail=Column does not exist hint=Run migrations',
		);
	});

	it('walks nested causes and deduplicates repeated keys', () => {
		const details = formatDatabaseErrorDetails({
			cause: {
				code: '42P01',
				table: 'audit_events',
				detail: 'relation "audit_events" does not exist',
			},
			detail: 'relation "audit_events" does not exist',
		});

		expect(details).toBe(
			'detail=relation "audit_events" does not exist code=42P01 table=audit_events',
		);
	});
});
