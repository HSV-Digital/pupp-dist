import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ResellerCustomersController } from './reseller-customers.controller';
import { ResellerCustomersDemoController } from './reseller-customers-demo.controller';
import { ResellerCustomersService } from './reseller-customers.service';

@Module({
	imports: [AuditModule, AuthModule],
	controllers: [ResellerCustomersController, ResellerCustomersDemoController],
	providers: [ResellerCustomersService],
	exports: [ResellerCustomersService],
})
export class ResellerCustomersModule {}
