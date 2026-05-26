import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminAnalyticsModule } from './admin-analytics/admin-analytics.module';
import { AuthModule } from './auth/auth.module';
import { CspPartnerAnalyticsModule } from './csp-partner-analytics/csp-partner-analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EmailModule } from './email/email.module';
import { GtmModule } from './gtm/gtm.module';
import { MailModule } from './mail/mail.module';
import { PdfModule } from './pdf/pdf.module';
import { PostHogModule } from './posthog/posthog.module';
import { ResellerCustomersModule } from './reseller-customers/reseller-customers.module';
import { ResellerSubscriptionEnrichmentModule } from './reseller-subscription-enrichment/reseller-subscription-enrichment.module';
import { UploadModule } from './upload/upload.module';
import { getEnv } from './config/env';

const env = getEnv();

@Module({
	imports: [
		ThrottlerModule.forRoot({
			throttlers: [{ ttl: 60000, limit: 5 }],
		}),
		BullModule.forRoot({
			connection: env.redisConnection,
		}),
		AdminAnalyticsModule,
		AuthModule,
		AuditModule,
		CspPartnerAnalyticsModule,
		DashboardModule,
		EmailModule,
		GtmModule,
		MailModule,
		PdfModule,
		PostHogModule,
		ResellerCustomersModule,
		ResellerSubscriptionEnrichmentModule,
		UploadModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}
