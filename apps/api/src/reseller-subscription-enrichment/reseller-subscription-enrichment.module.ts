import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ResellerSubscriptionEnrichmentController } from './reseller-subscription-enrichment.controller';
import { ResellerSubscriptionEnrichmentDemoController } from './reseller-subscription-enrichment-demo.controller';
import { ResellerSubscriptionEnrichmentService } from './reseller-subscription-enrichment.service';
import { ResellerSubscriptionEnrichmentWorker } from './reseller-subscription-enrichment.worker';

@Module({
	imports: [
		BullModule.registerQueue({ name: 'reseller-subscription-enrichment' }),
	],
	controllers: [
		ResellerSubscriptionEnrichmentController,
		ResellerSubscriptionEnrichmentDemoController,
	],
	providers: [
		ResellerSubscriptionEnrichmentService,
		ResellerSubscriptionEnrichmentWorker,
	],
	exports: [ResellerSubscriptionEnrichmentService],
})
export class ResellerSubscriptionEnrichmentModule {}
