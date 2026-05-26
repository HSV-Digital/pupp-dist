import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ResellerCustomersService } from '../reseller-customers/reseller-customers.service';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import {
	analyticsDownloadFacts,
	analyticsDownloadIssuances,
	type AnalyticsDownloadIssuanceRow,
} from '../database/schema';
import type { DlTokenPayload } from '../pdf/types/dl-token.types';
import {
	ADMIN_ANALYTICS_DOWNLOAD_CATEGORY,
	buildProposalSummary,
	buildSubscriptionWhereClause,
	summarizeEntityRows,
	subscriptions,
	type AdminAnalyticsDownloadCategory,
	type DownloadSummary,
} from './admin-analytics-download-tracking.utils';
import { AdminAnalyticsCacheService } from './admin-analytics-cache.service';

export { ADMIN_ANALYTICS_DOWNLOAD_CATEGORY } from './admin-analytics-download-tracking.utils';
export type { AdminAnalyticsDownloadCategory } from './admin-analytics-download-tracking.utils';

const ACTIVITY_DETAILS_CACHE_KEYS = ['1d', '7d', '14d', '30d'].map(
	(range) => `admin-analytics:activity-details:${range}`,
);

@Injectable()
export class AdminAnalyticsDownloadTrackingService implements OnModuleDestroy {
	private readonly logger = new Logger(
		AdminAnalyticsDownloadTrackingService.name,
	);
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;
	private readonly sql = this.databaseClient.sql;

	constructor(
		private readonly cacheService: AdminAnalyticsCacheService,
		private readonly resellerCustomersService: ResellerCustomersService,
	) {}

	async recordIssuance(params: {
		tokenPayload: DlTokenPayload;
		category: AdminAnalyticsDownloadCategory;
		actorId?: string | null;
		tenantId?: string | null;
		parentTokenJti?: string;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		try {
			const parentIssuance = await this.resolveParentIssuance(
				params.parentTokenJti,
			);
			const actorId = params.actorId ?? parentIssuance?.actorId ?? null;
			const tenantId =
				params.tenantId?.trim() ||
				parentIssuance?.tenantId ||
				params.tokenPayload.tenantId;

			await this.db
				.insert(analyticsDownloadIssuances)
				.values({
					tokenJti: params.tokenPayload.jti,
					category: params.category,
					tokenScope: params.tokenPayload.scope,
					tenantId,
					actorId,
					requestId: params.requestId ?? null,
					route: params.route ?? null,
					issuedAt: new Date(params.tokenPayload.iat * 1000),
				})
				.onConflictDoNothing();
		} catch (error) {
			this.logger.warn(
				`Failed to record download issuance for ${params.category}: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	async recordNestedCustomerListIssuance(params: {
		tokenPayload: DlTokenPayload;
		parentTokenJti: string;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		await this.recordIssuance({
			tokenPayload: params.tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.customerLists,
			parentTokenJti: params.parentTokenJti,
			requestId: params.requestId,
			route: params.route,
		});
	}

	async recordResellerListJobCreated(params: {
		tokenPayload: DlTokenPayload;
		actorId?: string | null;
		tenantId?: string | null;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		await this.recordIssuance({
			tokenPayload: params.tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.resellerLists,
			actorId: params.actorId,
			tenantId: params.tenantId,
			requestId: params.requestId,
			route: params.route,
		});

		const summary = await this.buildResellerSummary(params.tokenPayload);
		await this.recordDownloadFact({
			tokenPayload: params.tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.resellerLists,
			requestId: params.requestId,
			route: params.route,
			summary,
		});
	}

	async recordCustomerListJobCreated(params: {
		tokenPayload: DlTokenPayload;
		actorId?: string | null;
		tenantId?: string | null;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		await this.recordIssuance({
			tokenPayload: params.tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.customerLists,
			actorId: params.actorId,
			tenantId: params.tenantId,
			requestId: params.requestId,
			route: params.route,
		});

		const summary = await this.buildCustomerSummary(params.tokenPayload);
		await this.recordDownloadFact({
			tokenPayload: params.tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.customerLists,
			requestId: params.requestId,
			route: params.route,
			summary,
		});
	}

	async recordResellerCustomerListJobCreated(params: {
		tokenPayload: DlTokenPayload;
		orgId: string;
		resellerFilters?: Record<string, string[]>;
		actorId?: string | null;
		tenantId?: string | null;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		await this.recordIssuance({
			tokenPayload: params.tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.customerLists,
			actorId: params.actorId,
			tenantId: params.tenantId,
			requestId: params.requestId,
			route: params.route,
		});

		const summary = await this.buildResellerCustomerSummary(
			params.orgId,
			params.resellerFilters,
		);
		await this.recordDownloadFact({
			tokenPayload: params.tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.customerLists,
			requestId: params.requestId,
			route: params.route,
			summary,
		});
	}

	async recordResellerListDownload(params: {
		tokenPayload: DlTokenPayload;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		const summary = await this.buildResellerSummary(params.tokenPayload);
		await this.recordDownloadFact({
			tokenPayload: params.tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.resellerLists,
			requestId: params.requestId,
			route: params.route,
			summary,
		});
	}

	async recordCustomerListDownload(params: {
		tokenPayload: DlTokenPayload;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		const summary = await this.buildCustomerSummary(params.tokenPayload);
		await this.recordDownloadFact({
			tokenPayload: params.tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.customerLists,
			requestId: params.requestId,
			route: params.route,
			summary,
		});
	}

	async recordProposalDownload(params: {
		tokenPayload: DlTokenPayload;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		const summary = this.buildProposalSummary(params.tokenPayload);
		await this.recordDownloadFact({
			tokenPayload: params.tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.proposals,
			requestId: params.requestId,
			route: params.route,
			summary,
		});
	}

	async findIssuanceByTokenJti(
		tokenJti: string,
	): Promise<AnalyticsDownloadIssuanceRow | null> {
		const [issuance] = await this.db
			.select()
			.from(analyticsDownloadIssuances)
			.where(eq(analyticsDownloadIssuances.tokenJti, tokenJti))
			.limit(1);

		return issuance ?? null;
	}

	async hasFactForTokenJti(tokenJti: string): Promise<boolean> {
		const [fact] = await this.db
			.select({ id: analyticsDownloadFacts.id })
			.from(analyticsDownloadFacts)
			.where(eq(analyticsDownloadFacts.tokenJti, tokenJti))
			.limit(1);

		return fact !== undefined;
	}

	async onModuleDestroy(): Promise<void> {
		await this.sql.end();
	}

	private async recordDownloadFact(params: {
		tokenPayload: DlTokenPayload;
		category: AdminAnalyticsDownloadCategory;
		requestId?: string | null;
		route?: string | null;
		summary: DownloadSummary;
	}): Promise<void> {
		try {
			const issuance = await this.findIssuanceByTokenJti(
				params.tokenPayload.jti,
			);
			await this.db.insert(analyticsDownloadFacts).values({
				id: randomUUID(),
				tokenJti: params.tokenPayload.jti,
				category: params.category,
				tenantId: issuance?.tenantId ?? params.tokenPayload.tenantId,
				actorId: issuance?.actorId ?? null,
				requestId: params.requestId ?? issuance?.requestId ?? null,
				route: params.route ?? issuance?.route ?? null,
				occurredAt: new Date(),
				downloadCount: 1,
				entityCount: params.summary.entityCount,
				usEntityCount: params.summary.usEntityCount,
				canadaEntityCount: params.summary.canadaEntityCount,
				latamEntityCount: params.summary.latamEntityCount,
			});
			await this.invalidateActivityDetailsCache();
		} catch (error) {
			this.logger.warn(
				`Failed to record download fact for ${params.category}: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	private async resolveParentIssuance(
		parentTokenJti?: string,
	): Promise<AnalyticsDownloadIssuanceRow | null> {
		if (!parentTokenJti) {
			return null;
		}

		return this.findIssuanceByTokenJti(parentTokenJti);
	}

	private async buildResellerSummary(
		tokenPayload: DlTokenPayload,
	): Promise<DownloadSummary> {
		const whereClause = buildSubscriptionWhereClause({
			tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.resellerLists,
		});
		const rows = await this.db
			.select({
				entityId: subscriptions.resellerName,
				region: subscriptions.region,
			})
			.from(subscriptions)
			.where(whereClause)
			.groupBy(subscriptions.resellerName, subscriptions.region);

		return summarizeEntityRows(rows);
	}

	private async buildCustomerSummary(
		tokenPayload: DlTokenPayload,
	): Promise<DownloadSummary> {
		const whereClause = buildSubscriptionWhereClause({
			tokenPayload,
			category: ADMIN_ANALYTICS_DOWNLOAD_CATEGORY.customerLists,
		});
		const rows = await this.db
			.select({
				entityId: subscriptions.customerId,
				region: subscriptions.region,
			})
			.from(subscriptions)
			.where(whereClause)
			.groupBy(subscriptions.customerId, subscriptions.region);

		return summarizeEntityRows(rows);
	}

	private async buildResellerCustomerSummary(
		orgId: string,
		resellerFilters?: Record<string, string[]>,
	): Promise<DownloadSummary> {
		const rows = await this.resellerCustomersService.getAnalyticsCustomerEntityRows(
			orgId,
			resellerFilters,
		);

		return summarizeEntityRows(rows);
	}

	private buildProposalSummary(tokenPayload: DlTokenPayload): DownloadSummary {
		return buildProposalSummary(tokenPayload);
	}

	private async invalidateActivityDetailsCache(): Promise<void> {
		try {
			await this.cacheService.deleteKeys(ACTIVITY_DETAILS_CACHE_KEYS);
		} catch (error) {
			this.logger.warn(
				`Failed to invalidate admin activity-details cache: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}
}
