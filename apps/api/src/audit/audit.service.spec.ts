import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents, resellerAuditEvents } from '../database/schema';

const mockDbInsert = vi.fn();
const mockInsertValues = vi.fn();
const mockSqlEnd = vi.fn();

vi.mock('../database/connection', () => ({
	createDatabaseClient: () => ({
		db: {
			insert: mockDbInsert,
		},
		sql: { end: mockSqlEnd },
	}),
}));

vi.mock('../database/database-url', () => ({
	resolveDatabaseUrl: () => 'postgres://localhost:5432/test',
}));

import { AuditService } from './audit.service';

describe('AuditService.recordEvent', () => {
	const posthogService = {
		capture: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockDbInsert.mockReturnValue({ values: mockInsertValues });
		mockInsertValues.mockResolvedValue(undefined);
	});

	it('defaults to the internal audit sink', async () => {
		const service = new AuditService(posthogService as never);

		await service.recordEvent({
			eventName: 'auth.login.success',
			actionStatus: 'success',
			actorType: 'user',
			actorId: 'user-1',
			tenantId: 'tenant-1',
			sourceSystem: 'api',
		});

		expect(mockDbInsert).toHaveBeenCalledWith(auditEvents);
		expect(posthogService.capture).toHaveBeenCalledWith(
			expect.objectContaining({
				event: 'auth.login.success',
				properties: expect.objectContaining({
					userType: 'internal',
				}),
			}),
		);
	});

	it('routes reseller-authenticated activity to reseller_audit_events', async () => {
		const service = new AuditService(posthogService as never);

		await service.recordEvent({
			eventName: 'partner_customer.create.success',
			actionStatus: 'success',
			actorType: 'user',
			actorId: 'reseller-user-1',
			tenantId: 'org-1',
			orgId: 'org-1',
			userType: 'reseller',
			sourceSystem: 'api',
		});

		expect(mockDbInsert).toHaveBeenCalledWith(resellerAuditEvents);
		expect(posthogService.capture).toHaveBeenCalledWith(
			expect.objectContaining({
				event: 'partner_customer.create.success',
				properties: expect.objectContaining({
					userType: 'reseller',
				}),
			}),
		);
	});
});
