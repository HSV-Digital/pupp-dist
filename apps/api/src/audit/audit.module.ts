import { Module } from '@nestjs/common';
import { PostHogModule } from '../posthog/posthog.module';
import { AuditService } from './audit.service';

@Module({
	imports: [PostHogModule],
	providers: [AuditService],
	exports: [AuditService],
})
export class AuditModule {}
