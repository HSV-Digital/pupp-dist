import { Module } from '@nestjs/common';
import { ResellerCustomersModule } from '../reseller-customers/reseller-customers.module';
import { AdminAnalyticsCacheService } from './admin-analytics-cache.service';
import { AdminAnalyticsDownloadTrackingService } from './admin-analytics-download-tracking.service';

@Module({
	imports: [ResellerCustomersModule],
	providers: [AdminAnalyticsCacheService, AdminAnalyticsDownloadTrackingService],
	exports: [AdminAnalyticsDownloadTrackingService],
})
export class AdminAnalyticsModule {}
