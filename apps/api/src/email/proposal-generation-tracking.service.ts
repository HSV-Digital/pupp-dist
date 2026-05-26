import crypto from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
	buildAuditEventInsertValues,
	buildResellerAuditEventInsertValues,
	isResellerAuditUserType,
} from '../audit/audit.service';
import type {
	AuthenticatedPrincipal,
	AuthUser,
} from '../auth/interfaces/auth-user.interface';
import { CspPartnerAnalyticsEmitter } from '../csp-partner-analytics/csp-partner-analytics.emitter';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import {
	auditEvents,
	proposalGenerationSelections,
	resellerAuditEvents,
	resellerProposalGenerationSelections,
	CSP_PARTNER_COUNTRY_VALUES,
	CSP_PARTNER_ENDING_SKU_IDS,
	CSP_PARTNER_STARTING_SKU_IDS,
	type CspPartnerCountry,
	type CspPartnerEndingSkuId,
	type CspPartnerStartingSkuId,
} from '../database/schema';
import type {
	ProposalAssetSelectionInput,
	ProposalAssetsLoadResponse,
} from './proposal-options-email.service';

type ProposalAssetsCustomerSource =
	| 'dashboard'
	| 'partner_customer'
	| 'reseller_customer';
type ProposalJourney = 'new_customer' | 'renewal';

interface RecordLoadSuccessParams {
	customerId: string;
	customerSource: ProposalAssetsCustomerSource;
	durationMs: number;
	generationRequestId: string;
	httpMethod: string | null;
	httpStatus: number;
	journey: ProposalJourney;
	lineItemCount: number;
	requestId: string | null;
	route: string | null;
	selectedScenarios: ProposalAssetsLoadResponse['selectedScenarios'];
	selections: ProposalAssetSelectionInput[];
	subscriptionCount: number;
	user: AuthenticatedPrincipal | AuthUser;
}

@Injectable()
export class ProposalGenerationTrackingService implements OnModuleDestroy {
	private readonly logger = new Logger(ProposalGenerationTrackingService.name);
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;
	private readonly sql = this.databaseClient.sql;

	constructor(
		private readonly cspPartnerAnalyticsEmitter: CspPartnerAnalyticsEmitter,
	) {}

	async recordLoadSuccess(params: RecordLoadSuccessParams): Promise<void> {
		const occurredAt = new Date();
		const auditInput = {
			eventName: 'proposal.assets.load.success' as const,
			actionStatus: 'success' as const,
			actorType: 'user' as const,
			actorId: params.user.userId,
			tenantId: params.user.tenantId,
			orgId: params.user.orgId ?? null,
			userType: params.user.userType,
			sourceSystem: 'api' as const,
			targetType: 'proposal-assets',
			targetId: params.customerId,
			requestId: params.requestId,
			route: params.route,
			httpMethod: params.httpMethod,
			httpStatus: params.httpStatus,
			durationMs: params.durationMs,
			metadata: {
				customerSource: params.customerSource,
				endingSkuIds: params.selectedScenarios.map(
					(scenario) => scenario.endingSkuId,
				),
				endingSkuCount: params.selectedScenarios.length,
				generationRequestId: params.generationRequestId,
				journey: params.journey,
				lineItemCount: params.lineItemCount,
				selectionCount: params.selectedScenarios.length,
				subscriptionCount: params.subscriptionCount,
			},
		};
		const selectionRows = buildProposalGenerationSelectionRows({
			customerId: params.customerId,
			customerSource: params.customerSource,
			generationRequestId: params.generationRequestId,
			occurredAt,
			requestId: params.requestId,
			selectedScenarios: params.selectedScenarios,
			selections: params.selections,
			tenantId: params.user.tenantId,
			userId: params.user.userId,
			journey: params.journey,
		});

		try {
			await this.db.transaction(async (tx) => {
				if (isResellerAuditUserType(params.user.userType) && auditInput.orgId) {
					const auditRow = buildResellerAuditEventInsertValues(
						{ ...auditInput, orgId: auditInput.orgId },
						{ occurredAt },
					);
					await tx.insert(resellerAuditEvents).values(auditRow);
				} else {
					const auditRow = buildAuditEventInsertValues(auditInput, {
						occurredAt,
					});
					await tx.insert(auditEvents).values(auditRow);
				}
				if (selectionRows.length > 0) {
					if (
						isResellerAuditUserType(params.user.userType) &&
						auditInput.orgId
					) {
						const resellerRows = selectionRows.map((row) => ({
							...row,
							orgId: auditInput.orgId!,
						}));
						await tx
							.insert(resellerProposalGenerationSelections)
							.values(resellerRows);
					} else {
						await tx.insert(proposalGenerationSelections).values(selectionRows);
					}
				}
			});

			if (
				isResellerAuditUserType(params.user.userType) &&
				auditInput.orgId &&
				params.user.userId
			) {
				await this.emitCspPartnerProposalGeneratedEvents({
					orgId: auditInput.orgId,
					actorId: params.user.userId,
					generationRequestId: params.generationRequestId,
					customerId: params.customerId,
					journey: params.journey,
					selectedScenarios: params.selectedScenarios,
				});
			}
		} catch (error) {
			this.logger.error(
				`Failed to persist proposal generation tracking for request ${params.generationRequestId}`,
				error instanceof Error ? error.stack : undefined,
			);
		}
	}

	private async emitCspPartnerProposalGeneratedEvents(params: {
		orgId: string;
		actorId: string;
		generationRequestId: string;
		customerId: string;
		journey: ProposalJourney;
		selectedScenarios: ProposalAssetsLoadResponse['selectedScenarios'];
	}): Promise<void> {
		for (const scenario of params.selectedScenarios) {
			const country = toCspPartnerCountry(scenario.region);
			const startingSkuId = toStartingSkuId(scenario.startingSkuId);
			const endingSkuId = toEndingSkuId(scenario.endingSkuId);

			if (!country || !startingSkuId || !endingSkuId) {
				continue;
			}

			await this.cspPartnerAnalyticsEmitter.enqueueEvent({
				orgId: params.orgId,
				actorId: params.actorId,
				eventType: 'proposal_generated',
				country,
				startingSkuId,
				endingSkuId,
				metadata: {
					generationRequestId: params.generationRequestId,
					customerId: params.customerId,
					journey: params.journey,
					opportunityId: scenario.opportunityId,
				},
			});
		}
	}

	async onModuleDestroy(): Promise<void> {
		await this.sql.end();
	}
}

function buildProposalGenerationSelectionRows(params: {
	customerId: string;
	customerSource: ProposalAssetsCustomerSource;
	generationRequestId: string;
	journey: ProposalJourney;
	occurredAt: Date;
	requestId: string | null;
	selectedScenarios: ProposalAssetsLoadResponse['selectedScenarios'];
	selections: ProposalAssetSelectionInput[];
	tenantId: string;
	userId: string | null;
}) {
	const selectionByKey = new Map<string, ProposalAssetSelectionInput>();

	for (const selection of params.selections) {
		const selectionKey = buildSelectionKey(
			selection.opportunityId,
			selection.endingSkuId,
		);
		if (!selectionByKey.has(selectionKey)) {
			selectionByKey.set(selectionKey, selection);
		}
	}

	return params.selectedScenarios.map((scenario) => {
		const selection = selectionByKey.get(
			buildSelectionKey(scenario.opportunityId, scenario.endingSkuId),
		);

		return {
			id: crypto.randomUUID(),
			generationRequestId: params.generationRequestId,
			occurredAt: params.occurredAt,
			tenantId: params.tenantId,
			actorId: params.userId,
			customerId: params.customerId,
			journey: params.journey,
			customerSource: params.customerSource,
			opportunityId: scenario.opportunityId,
			startingSkuId: scenario.startingSkuId,
			endingSkuId: scenario.endingSkuId,
			region: normalizeOptionalText(scenario.region),
			distributorName: normalizeOptionalText(scenario.distributorName),
			resellerName: normalizeOptionalText(scenario.resellerName),
			pssAIWorkforceName: normalizeOptionalText(scenario.pssAIWorkforceName),
			pssAISecurityName: normalizeOptionalText(scenario.pssAISecurityName),
			pdmName: normalizeOptionalText(scenario.pdmName),
			pmmName: normalizeOptionalText(scenario.pmmName),
			subscriptionType: normalizeOptionalText(scenario.subscriptionType),
			expiringSeatCount: normalizeOptionalNonNegativeInteger(
				scenario.expiringSeatCount,
			),
			selectedSeats: scenario.selectedSeats,
			currentSkuCustomerPrice: normalizeOptionalNonNegativeNumber(
				selection?.currentSkuCustomerPrice,
			),
			currentSkuResellerPrice: normalizeOptionalNonNegativeNumber(
				selection?.currentSkuResellerPrice,
			),
			targetSkuCustomerPrice: normalizeOptionalNonNegativeNumber(
				selection?.targetSkuCustomerPrice,
			),
			targetSkuResellerPrice: normalizeOptionalNonNegativeNumber(
				selection?.targetSkuResellerPrice,
			),
			targetSkuPrice: normalizeOptionalNonNegativeNumber(
				selection?.targetSkuPrice,
			),
			targetSkuMarginPercent: normalizeOptionalMargin(
				selection?.targetSkuMarginPercent,
			),
			requestId: params.requestId,
			createdAt: params.occurredAt,
		};
	});
}

function buildSelectionKey(opportunityId: string, endingSkuId: string): string {
	return `${opportunityId}::${endingSkuId}`;
}

function normalizeOptionalNonNegativeNumber(value: unknown): number | null {
	if (value === undefined || value === null || value === '') {
		return null;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return null;
	}

	return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function normalizeOptionalMargin(value: unknown): number | null {
	const normalized = normalizeOptionalNonNegativeNumber(value);
	if (normalized === null) {
		return null;
	}

	return Math.min(100, normalized);
}

function normalizeOptionalText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function toCspPartnerCountry(value: unknown): CspPartnerCountry | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return CSP_PARTNER_COUNTRY_VALUES.includes(trimmed as CspPartnerCountry)
		? (trimmed as CspPartnerCountry)
		: null;
}

function toStartingSkuId(value: unknown): CspPartnerStartingSkuId | null {
	if (typeof value !== 'string') return null;
	return CSP_PARTNER_STARTING_SKU_IDS.includes(
		value as CspPartnerStartingSkuId,
	)
		? (value as CspPartnerStartingSkuId)
		: null;
}

function toEndingSkuId(value: unknown): CspPartnerEndingSkuId | null {
	if (typeof value !== 'string') return null;
	return CSP_PARTNER_ENDING_SKU_IDS.includes(value as CspPartnerEndingSkuId)
		? (value as CspPartnerEndingSkuId)
		: null;
}

function normalizeOptionalNonNegativeInteger(value: unknown): number | null {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return null;
	}

	return Math.floor(parsed);
}
