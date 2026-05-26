import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
	CSP_PARTNER_ANALYTICS_QUEUE,
	CSP_PARTNER_ANALYTICS_JOB_NAME,
	DEMO_TENANT_ORG_ID,
	type CspPartnerAnalyticsJobData,
	type EnqueueAnalyticsEventInput,
} from './csp-partner-analytics.types';
import {
	CSP_PARTNER_COUNTRY_VALUES,
	CSP_PARTNER_ENDING_SKU_IDS,
	CSP_PARTNER_EVENT_TYPES,
	CSP_PARTNER_STARTING_SKU_IDS,
} from '../database/schema';

@Injectable()
export class CspPartnerAnalyticsEmitter {
	private readonly logger = new Logger(CspPartnerAnalyticsEmitter.name);

	constructor(
		@InjectQueue(CSP_PARTNER_ANALYTICS_QUEUE) private readonly queue: Queue,
	) {}

	async enqueueEvent(input: EnqueueAnalyticsEventInput): Promise<void> {
		try {
			if (input.orgId === DEMO_TENANT_ORG_ID) {
				return;
			}

			if (!CSP_PARTNER_EVENT_TYPES.includes(input.eventType)) {
				this.logger.warn(
					`Rejecting csp-partner-analytics event with unknown eventType=${input.eventType}`,
				);
				return;
			}

			const country = input.country ?? null;
			if (country !== null && !CSP_PARTNER_COUNTRY_VALUES.includes(country)) {
				this.logger.warn(
					`Skipping csp-partner-analytics event with unknown country=${country}`,
				);
				return;
			}

			const startingSkuId = input.startingSkuId ?? null;
			if (
				startingSkuId !== null &&
				!CSP_PARTNER_STARTING_SKU_IDS.includes(startingSkuId)
			) {
				this.logger.warn(
					`Skipping csp-partner-analytics event with unknown startingSkuId=${startingSkuId}`,
				);
				return;
			}

			const endingSkuId = input.endingSkuId ?? null;
			if (
				endingSkuId !== null &&
				!CSP_PARTNER_ENDING_SKU_IDS.includes(endingSkuId)
			) {
				this.logger.warn(
					`Skipping csp-partner-analytics event with unknown endingSkuId=${endingSkuId}`,
				);
				return;
			}

			if (input.eventType === 'subscription_upload' && input.uploadCount == null) {
				this.logger.warn(
					'Skipping subscription_upload csp-partner-analytics event without uploadCount',
				);
				return;
			}

			if (input.eventType !== 'login' && country === null) {
				this.logger.warn(
					`Skipping ${input.eventType} csp-partner-analytics event without country`,
				);
				return;
			}

			const payload: CspPartnerAnalyticsJobData = {
				id: randomUUID(),
				orgId: input.orgId,
				actorId: input.actorId,
				eventType: input.eventType,
				country,
				startingSkuId,
				endingSkuId,
				uploadCount: input.uploadCount ?? null,
				metadata: input.metadata ?? {},
			};

			await this.queue.add(CSP_PARTNER_ANALYTICS_JOB_NAME, payload, {
				attempts: 3,
				backoff: { type: 'exponential', delay: 1000 },
				removeOnComplete: true,
				removeOnFail: false,
			});
		} catch (error) {
			this.logger.warn(
				`Failed to enqueue csp-partner-analytics event eventType=${input.eventType} orgId=${input.orgId}: ${error instanceof Error ? error.message : error}`,
			);
		}
	}
}
