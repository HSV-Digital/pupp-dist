import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminAnalyticsModule } from '../admin-analytics/admin-analytics.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { BlobStorageModule } from '../blob-storage/blob-storage.module';
import { ProposalAssetModule } from '../proposal-asset/proposal-asset.module';
import { ResellerCustomersModule } from '../reseller-customers/reseller-customers.module';
import { DlTokenService } from './dl-token.service';
import { PdfRendererService } from './pdf-renderer.service';
import { PdfTelemetryService } from './pdf-telemetry.service';
import { PdfController } from './pdf.controller';
import { ResellerPdfController } from './reseller-pdf.controller';
import { PdfService } from './pdf.service';
import { PdfAsyncService } from './pdf-async.service';
import { PdfChunkService } from './pdf-chunk.service';
import { PdfAsyncWorker } from './pdf-async.worker';
import { PdfPasswordService } from './pdf-password.service';
import { PdfEncryptionService } from './pdf-encryption.service';
import { DemoDataService } from './demo-data.service';

@Module({
	imports: [
		AdminAnalyticsModule,
		AuditModule,
		AuthModule,
		DashboardModule,
		BlobStorageModule,
		BullModule.registerQueue({
			name: 'pdf-generation',
		}),
		ProposalAssetModule,
		ResellerCustomersModule,
	],
	controllers: [PdfController, ResellerPdfController],
	providers: [
		PdfService,
		DlTokenService,
		PdfRendererService,
		PdfTelemetryService,
		PdfAsyncService,
		PdfChunkService,
		PdfPasswordService,
		PdfEncryptionService,
		PdfAsyncWorker,
		DemoDataService,
	],
	exports: [DlTokenService, PdfAsyncService],
})
export class PdfModule {}
