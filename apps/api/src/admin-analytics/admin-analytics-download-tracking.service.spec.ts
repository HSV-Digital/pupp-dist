import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { AdminAnalyticsCacheService } from './admin-analytics-cache.service';
import type { ResellerCustomersService } from '../reseller-customers/reseller-customers.service';

const groupByQueue: unknown[] = [];
const limitQueue: unknown[] = [];
const insertCalls: unknown[] = [];

const mockGroupBy = vi.fn(() => Promise.resolve(groupByQueue.shift() ?? []));
const mockLimit = vi.fn(() => Promise.resolve(limitQueue.shift() ?? []));
const mockWhere = vi.fn(() => ({
	limit: mockLimit,
	groupBy: mockGroupBy,
}));
const mockFrom = vi.fn(() => ({
	where: mockWhere,
}));
const mockSelect = vi.fn(() => ({
	from: mockFrom,
}));

const mockInsert = vi.fn(() => ({
	values: vi.fn((values: unknown) => {
		insertCalls.push(values);

		if (insertCalls.length % 2 === 1) {
			return {
				onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
			};
		}

		return Promise.resolve(undefined);
	}),
}));

const mockSqlEnd = vi.fn().mockResolvedValue(undefined);

vi.mock('../database/connection', () => ({
	createDatabaseClient: () => ({
		db: {
			select: mockSelect,
			insert: mockInsert,
		},
		sql: {
			end: mockSqlEnd,
		},
	}),
}));

vi.mock('../database/database-url', () => ({
	resolveDatabaseUrl: () => 'postgres://localhost:5432/test',
}));

import { AdminAnalyticsDownloadTrackingService } from './admin-analytics-download-tracking.service';

describe('AdminAnalyticsDownloadTrackingService', () => {
	let cacheServiceMock: {
		deleteKeys: Mock;
	};
	let resellerCustomersServiceMock: {
		getAnalyticsCustomerEntityRows: Mock;
	};
	let service: AdminAnalyticsDownloadTrackingService;

	const tokenPayload = {
		jti: 'token-jti-1',
		scope: 'customer-list',
		tenantId: 'default-tenant',
		filters: {
			pssAIWorkforce: [],
			pssAISecurity: [],
			psa: [],
			distributor: [],
			reseller: [],
			customer: [],
			pdm: [],
			pmm: [],
			region: ['United States'],
			expSeats: [],
			expArr: [],
			renewalDate: [],
			search: '',
		},
		sort: {
			sortBy: 'totalARR',
			sortDir: 'descending',
		},
		selectedSkuIds: [],
		iat: 1,
		exp: 2,
		v: 2,
	} as const;

	beforeEach(() => {
		vi.clearAllMocks();
		groupByQueue.length = 0;
		limitQueue.length = 0;
		insertCalls.length = 0;

		cacheServiceMock = {
			deleteKeys: vi.fn().mockResolvedValue(undefined),
		};
		resellerCustomersServiceMock = {
			getAnalyticsCustomerEntityRows: vi.fn(),
		};

		service = new AdminAnalyticsDownloadTrackingService(
			cacheServiceMock as unknown as AdminAnalyticsCacheService,
			resellerCustomersServiceMock as unknown as ResellerCustomersService,
		);
	});

	it('records internal list job creation using issuance tenant context and invalidates activity-details cache', async () => {
		groupByQueue.push([{ entityId: 'cust-1', region: 'United States' }]);
		limitQueue.push([
			{
				tokenJti: 'token-jti-1',
				tenantId: 'tenant-real',
				actorId: 'user-1',
				requestId: 'req-1',
				route: '/api/pdf/list/link-async',
			},
		]);

		await service.recordCustomerListJobCreated({
			tokenPayload,
			actorId: 'user-1',
			tenantId: 'tenant-real',
			requestId: 'req-1',
			route: '/api/pdf/list/link-async',
		});

		expect(insertCalls).toHaveLength(2);
		expect(insertCalls[0]).toMatchObject({
			tokenJti: 'token-jti-1',
			category: 'customer-lists',
			tenantId: 'tenant-real',
			actorId: 'user-1',
		});
		expect(insertCalls[1]).toMatchObject({
			tokenJti: 'token-jti-1',
			category: 'customer-lists',
			tenantId: 'tenant-real',
			actorId: 'user-1',
			downloadCount: 1,
			entityCount: 1,
			usEntityCount: 1,
			canadaEntityCount: 0,
			latamEntityCount: 0,
		});
		expect(cacheServiceMock.deleteKeys).toHaveBeenCalledWith([
			'admin-analytics:activity-details:1d',
			'admin-analytics:activity-details:7d',
			'admin-analytics:activity-details:14d',
			'admin-analytics:activity-details:30d',
		]);
	});

	it('records reseller customer-list job creation from reseller customer entity rows', async () => {
		limitQueue.push([
			{
				tokenJti: 'token-jti-1',
				tenantId: 'org-1',
				actorId: 'reseller-user-1',
				requestId: 'req-2',
				route: '/api/reseller/pdf/list/link-async',
			},
		]);
		resellerCustomersServiceMock.getAnalyticsCustomerEntityRows.mockResolvedValue(
			[
				{ entityId: 'Contoso', region: 'United States' },
				{ entityId: 'Northwind', region: 'Canada' },
			],
		);

		await service.recordResellerCustomerListJobCreated({
			tokenPayload,
			orgId: 'org-1',
			resellerFilters: {
				region: ['US'],
			},
			actorId: 'reseller-user-1',
			tenantId: 'org-1',
			requestId: 'req-2',
			route: '/api/reseller/pdf/list/link-async',
		});

		expect(
			resellerCustomersServiceMock.getAnalyticsCustomerEntityRows,
		).toHaveBeenCalledWith('org-1', {
			region: ['US'],
		});
		expect(insertCalls[1]).toMatchObject({
			category: 'customer-lists',
			tenantId: 'org-1',
			actorId: 'reseller-user-1',
			entityCount: 2,
			usEntityCount: 1,
			canadaEntityCount: 1,
			latamEntityCount: 0,
		});
	});
});
