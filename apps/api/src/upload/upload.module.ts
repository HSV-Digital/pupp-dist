import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CspPartnerAnalyticsModule } from '../csp-partner-analytics/csp-partner-analytics.module';
import { MailModule } from '../mail/mail.module';
import { UploadController } from './upload.controller';
import { UploadDemoController } from './upload-demo.controller';
import { UploadService } from './upload.service';
import { UploadWorker } from './upload.worker';

@Module({
	imports: [
		BullModule.registerQueue({ name: 'csp-partner-file-upload' }),
		CspPartnerAnalyticsModule,
		MailModule,
	],
	controllers: [UploadController, UploadDemoController],
	providers: [UploadService, UploadWorker],
	exports: [UploadService],
})
export class UploadModule {}
