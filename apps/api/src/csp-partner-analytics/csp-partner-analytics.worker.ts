import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { Job } from 'bullmq';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import { cspPartnerAnalyticsEvents } from '../database/schema';
import {
	CSP_PARTNER_ANALYTICS_QUEUE,
	type CspPartnerAnalyticsJobData,
} from './csp-partner-analytics.types';

@Processor(CSP_PARTNER_ANALYTICS_QUEUE)
@Injectable()
export class CspPartnerAnalyticsWorker
	extends WorkerHost
	implements OnModuleDestroy
{
	private readonly logger = new Logger(CspPartnerAnalyticsWorker.name);
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;

	async onModuleDestroy() {
		await this.databaseClient.sql.end();
	}

	async process(job: Job<CspPartnerAnalyticsJobData>): Promise<void> {
		const data = job.data;

		await this.db.insert(cspPartnerAnalyticsEvents).values({
			id: data.id,
			orgId: data.orgId,
			actorId: data.actorId,
			eventType: data.eventType,
			country: data.country,
			startingSkuId: data.startingSkuId,
			endingSkuId: data.endingSkuId,
			uploadCount: data.uploadCount,
			metadata: data.metadata,
		});

		this.logger.debug(
			`Recorded csp-partner-analytics event ${data.eventType} for org ${data.orgId}`,
		);
	}
}
