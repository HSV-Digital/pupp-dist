import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CspPartnerAnalyticsController } from './csp-partner-analytics.controller';
import { CspPartnerAnalyticsEmitter } from './csp-partner-analytics.emitter';
import { CspPartnerAnalyticsService } from './csp-partner-analytics.service';
import { CspPartnerAnalyticsWorker } from './csp-partner-analytics.worker';
import { CSP_PARTNER_ANALYTICS_QUEUE } from './csp-partner-analytics.types';

@Module({
	imports: [BullModule.registerQueue({ name: CSP_PARTNER_ANALYTICS_QUEUE })],
	controllers: [CspPartnerAnalyticsController],
	providers: [
		CspPartnerAnalyticsEmitter,
		CspPartnerAnalyticsService,
		CspPartnerAnalyticsWorker,
	],
	exports: [CspPartnerAnalyticsEmitter],
})
export class CspPartnerAnalyticsModule {}
