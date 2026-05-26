import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents, proposalGenerationSelections } from '../database/schema';

interface InsertCall {
	table: unknown;
	values: unknown;
}

const insertCalls: InsertCall[] = [];
const transactionMock = vi.fn();
const sqlEndMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../database/connection', () => ({
	createDatabaseClient: () => ({
		db: {
			transaction: transactionMock,
		},
		sql: {
			end: sqlEndMock,
		},
	}),
}));

vi.mock('../database/database-url', () => ({
	resolveDatabaseUrl: () => 'postgres://localhost:5432/test',
}));

import { ProposalGenerationTrackingService } from './proposal-generation-tracking.service';

function buildTrackingParams() {
	return {
		customerId: 'cust-1',
		customerSource: 'dashboard' as const,
		durationMs: 125,
		generationRequestId: 'generation-1',
		httpMethod: 'POST',
		httpStatus: 201,
		journey: 'renewal' as const,
		lineItemCount: 2,
		requestId: 'req-1',
		route: '/api/email/proposal-assets/load',
		selectedScenarios: [
			{
				opportunityId: 'cust-1:sub-1',
				startingSkuId: 'bs' as const,
				startingSkuName: 'Business Standard',
				endingSkuId: 'bs_cb',
				selectedSeats: 30,
				originalSeats: 40,
				expiringArr: 6000,
				expiringSeatCount: 40,
				region: 'North America',
				distributorName: 'Ingram Micro',
				resellerName: 'Beacon Cloud',
				pssAIWorkforceName: 'Taylor',
				pssAISecurityName: 'Jordan',
				pdmName: 'Morgan',
				pmmName: 'Riley',
				subscriptionType: 'Renewal',
			},
			{
				opportunityId: 'cust-1:sub-2',
				startingSkuId: 'bp' as const,
				startingSkuName: 'Business Premium',
				endingSkuId: 'bp_cb',
				selectedSeats: 20,
				originalSeats: 25,
				expiringArr: 4800,
				expiringSeatCount: -5,
				region: '   ',
				distributorName: '',
				resellerName: '   ',
				pssAIWorkforceName: ' ',
				pssAISecurityName: undefined,
				pdmName: 'PDM Two',
				pmmName: undefined,
				subscriptionType: '',
			},
		],
		selections: [
			{
				opportunityId: 'cust-1:sub-1',
				endingSkuId: 'bs_cb',
				seats: 30,
				targetSkuPrice: 18.25,
				targetSkuMarginPercent: 22.5,
			},
			{
				opportunityId: 'cust-1:sub-2',
				endingSkuId: 'bp_cb',
				seats: 20,
			},
		],
		subscriptionCount: 3,
		user: {
			userId: 'user-1',
			tenantId: 'tenant-1',
			email: 'alex@microsoft.com',
			canonicalEmail: 'alex@microsoft.com',
			claimEmail: 'alex@microsoft.com',
			preferredUsername: 'alex@microsoft.com',
			subjectId: 'subject-1',
			entraObjectId: 'entra-1',
		},
	};
}

function getInsertValues(table: unknown): unknown {
	return insertCalls.find((call) => call.table === table)?.values;
}

function getRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Expected record value');
	}

	return value as Record<string, unknown>;
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) {
		throw new Error('Expected array value');
	}

	return value.map(getRecord);
}

describe('ProposalGenerationTrackingService', () => {
	let service: ProposalGenerationTrackingService;

	beforeEach(() => {
		insertCalls.length = 0;
		transactionMock.mockReset();
		sqlEndMock.mockClear();
		transactionMock.mockImplementation(
			async (callback: (tx: unknown) => Promise<unknown>) =>
				callback({
					insert: (table: unknown) => ({
						values: (values: unknown) => {
							insertCalls.push({ table, values });
							return values;
						},
					}),
				}),
		);
		service = new ProposalGenerationTrackingService();
	});

	it('writes one audit event and one fact row per selected scenario', async () => {
		await service.recordLoadSuccess(buildTrackingParams());

		expect(transactionMock).toHaveBeenCalledTimes(1);
		expect(insertCalls).toHaveLength(2);

		const auditValues = getRecord(getInsertValues(auditEvents));
		const metadata = getRecord(auditValues.metadata);
		expect(auditValues.eventName).toBe('proposal.assets.load.success');
		expect(auditValues.targetId).toBe('cust-1');
		expect(auditValues.requestId).toBe('req-1');
		expect(metadata.customerSource).toBe('dashboard');
		expect(metadata.endingSkuIds).toEqual(['bs_cb', 'bp_cb']);
		expect(metadata.endingSkuCount).toBe(2);
		expect(metadata.generationRequestId).toBe('generation-1');
		expect(metadata.journey).toBe('renewal');
		expect(metadata.lineItemCount).toBe(2);
		expect(metadata.selectionCount).toBe(2);
		expect(metadata.subscriptionCount).toBe(3);

		const selectionRows = getRecordArray(
			getInsertValues(proposalGenerationSelections),
		);
		expect(selectionRows).toHaveLength(2);
		expect(selectionRows[0]?.generationRequestId).toBe('generation-1');
		expect(selectionRows[0]?.tenantId).toBe('tenant-1');
		expect(selectionRows[0]?.actorId).toBe('user-1');
		expect(selectionRows[0]?.customerId).toBe('cust-1');
		expect(selectionRows[0]?.journey).toBe('renewal');
		expect(selectionRows[0]?.customerSource).toBe('dashboard');
		expect(selectionRows[0]?.opportunityId).toBe('cust-1:sub-1');
		expect(selectionRows[0]?.startingSkuId).toBe('bs');
		expect(selectionRows[0]?.endingSkuId).toBe('bs_cb');
		expect(selectionRows[0]?.region).toBe('North America');
		expect(selectionRows[0]?.distributorName).toBe('Ingram Micro');
		expect(selectionRows[0]?.resellerName).toBe('Beacon Cloud');
		expect(selectionRows[0]?.pssAIWorkforceName).toBe('Taylor');
		expect(selectionRows[0]?.pssAISecurityName).toBe('Jordan');
		expect(selectionRows[0]?.pdmName).toBe('Morgan');
		expect(selectionRows[0]?.pmmName).toBe('Riley');
		expect(selectionRows[0]?.subscriptionType).toBe('Renewal');
		expect(selectionRows[0]?.expiringSeatCount).toBe(40);
		expect(selectionRows[0]?.selectedSeats).toBe(30);
		expect(selectionRows[0]?.targetSkuPrice).toBe(18.25);
		expect(selectionRows[0]?.targetSkuMarginPercent).toBe(22.5);
		expect(selectionRows[0]?.requestId).toBe('req-1');
		expect(selectionRows[0]?.occurredAt).toBeInstanceOf(Date);
		expect(selectionRows[0]?.createdAt).toBeInstanceOf(Date);
		expect(selectionRows[1]?.generationRequestId).toBe('generation-1');
		expect(selectionRows[1]?.tenantId).toBe('tenant-1');
		expect(selectionRows[1]?.actorId).toBe('user-1');
		expect(selectionRows[1]?.customerId).toBe('cust-1');
		expect(selectionRows[1]?.journey).toBe('renewal');
		expect(selectionRows[1]?.customerSource).toBe('dashboard');
		expect(selectionRows[1]?.opportunityId).toBe('cust-1:sub-2');
		expect(selectionRows[1]?.startingSkuId).toBe('bp');
		expect(selectionRows[1]?.endingSkuId).toBe('bp_cb');
		expect(selectionRows[1]?.region).toBeNull();
		expect(selectionRows[1]?.distributorName).toBeNull();
		expect(selectionRows[1]?.resellerName).toBeNull();
		expect(selectionRows[1]?.pssAIWorkforceName).toBeNull();
		expect(selectionRows[1]?.pssAISecurityName).toBeNull();
		expect(selectionRows[1]?.pdmName).toBe('PDM Two');
		expect(selectionRows[1]?.pmmName).toBeNull();
		expect(selectionRows[1]?.subscriptionType).toBeNull();
		expect(selectionRows[1]?.expiringSeatCount).toBeNull();
		expect(selectionRows[1]?.selectedSeats).toBe(20);
		expect(selectionRows[1]?.targetSkuPrice).toBeNull();
		expect(selectionRows[1]?.targetSkuMarginPercent).toBeNull();
		expect(selectionRows[1]?.requestId).toBe('req-1');
		expect(selectionRows[1]?.occurredAt).toBeInstanceOf(Date);
		expect(selectionRows[1]?.createdAt).toBeInstanceOf(Date);
	});

	it('matches target pricing fields by opportunity id and ending SKU id', async () => {
		await service.recordLoadSuccess({
			...buildTrackingParams(),
			selectedScenarios: [
				{
					opportunityId: 'cust-1:sub-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bs_cb',
					selectedSeats: 30,
					originalSeats: 40,
					expiringArr: 6000,
				},
				{
					opportunityId: 'cust-1:sub-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bp_cb',
					selectedSeats: 30,
					originalSeats: 40,
					expiringArr: 6000,
				},
			],
			selections: [
				{
					opportunityId: 'cust-1:sub-1',
					endingSkuId: 'bs_cb',
					seats: 30,
					targetSkuPrice: 18.25,
					targetSkuMarginPercent: 22.5,
				},
				{
					opportunityId: 'cust-1:sub-1',
					endingSkuId: 'bp_cb',
					seats: 30,
					targetSkuPrice: 31.5,
					targetSkuMarginPercent: 17.25,
				},
			],
		});

		const selectionRows = getRecordArray(
			getInsertValues(proposalGenerationSelections),
		);
		expect(selectionRows).toHaveLength(2);
		expect(selectionRows[0]?.endingSkuId).toBe('bs_cb');
		expect(selectionRows[0]?.targetSkuPrice).toBe(18.25);
		expect(selectionRows[0]?.targetSkuMarginPercent).toBe(22.5);
		expect(selectionRows[1]?.endingSkuId).toBe('bp_cb');
		expect(selectionRows[1]?.targetSkuPrice).toBe(31.5);
		expect(selectionRows[1]?.targetSkuMarginPercent).toBe(17.25);
	});

	it('logs and swallows persistence failures', async () => {
		const loggerErrorSpy = vi
			.spyOn(Logger.prototype, 'error')
			.mockImplementation(() => undefined);
		transactionMock.mockRejectedValueOnce(new Error('database unavailable'));

		await expect(
			service.recordLoadSuccess({
				...buildTrackingParams(),
				generationRequestId: 'generation-2',
				lineItemCount: 1,
				requestId: 'req-2',
				selectedScenarios: [buildTrackingParams().selectedScenarios[0]],
				selections: [buildTrackingParams().selections[0]],
				subscriptionCount: 1,
			}),
		).resolves.toBeUndefined();

		expect(insertCalls).toHaveLength(0);
		expect(loggerErrorSpy).toHaveBeenCalledWith(
			'Failed to persist proposal generation tracking for request generation-2',
			expect.any(String),
		);
	});
});
