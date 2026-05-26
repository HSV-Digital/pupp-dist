import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PdfModule } from '../pdf/pdf.module';
import { GtmController } from './gtm.controller';
import { GtmService } from './gtm.service';

@Module({
	imports: [AuditModule, PdfModule],
	controllers: [GtmController],
	providers: [GtmService],
})
export class GtmModule {}
