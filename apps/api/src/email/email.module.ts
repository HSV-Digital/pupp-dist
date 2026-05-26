import { forwardRef, Module } from '@nestjs/common';
import { AdminAnalyticsModule } from '../admin-analytics/admin-analytics.module';
import { AuditModule } from '../audit/audit.module';
import { BlobStorageModule } from '../blob-storage/blob-storage.module';
import { CspPartnerAnalyticsModule } from '../csp-partner-analytics/csp-partner-analytics.module';
import { ResellerCustomersModule } from '../reseller-customers/reseller-customers.module';
import { MailModule } from '../mail/mail.module';
import { PdfModule } from '../pdf/pdf.module';
import { ProposalAssetModule } from '../proposal-asset/proposal-asset.module';
import { EmailController } from './email.controller';
import { ProposalGenerationTrackingService } from './proposal-generation-tracking.service';
import { ProposalOptionsEmailService } from './proposal-options-email.service';

@Module({
	imports: [
		AdminAnalyticsModule,
		AuditModule,
		BlobStorageModule,
		CspPartnerAnalyticsModule,
		MailModule,
		ResellerCustomersModule,
		PdfModule,
		forwardRef(() => ProposalAssetModule),
	],
	controllers: [EmailController],
	providers: [ProposalOptionsEmailService, ProposalGenerationTrackingService],
	exports: [ProposalOptionsEmailService],
})
export class EmailModule {}
