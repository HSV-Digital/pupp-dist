import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DashboardService } from './dashboard.service';

@Module({
	imports: [AuditModule],
	providers: [DashboardService],
	exports: [DashboardService],
})
export class DashboardModule {}
