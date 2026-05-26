import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '../audit/audit.module';
import { CspPartnerAnalyticsModule } from '../csp-partner-analytics/csp-partner-analytics.module';
import { MailModule } from '../mail/mail.module';
import { AllowedUserTypesGuard } from './guards/allowed-user-types.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ResellerBootstrapAuthGuard } from './guards/reseller-bootstrap-auth.guard';
import { ResellerGoogleBootstrapAuthGuard } from './guards/reseller-google-bootstrap-auth.guard';
import { ResellerApiTokenService } from './reseller-api-token.service';
import { ResellerAuthController } from './reseller-auth.controller';
import { ResellerGoogleAuthController } from './reseller-google-auth.controller';
import { ResellerOtpAuthController } from './reseller-otp-auth.controller';
import { ResellerAuthService } from './reseller-auth.service';
import { ResellerOtpService } from './reseller-otp.service';
import { ResellerBootstrapEntraStrategy } from './strategy/reseller-bootstrap-entra.strategy';
import { ResellerBootstrapGoogleStrategy } from './strategy/reseller-bootstrap-google.strategy';

@Module({
	imports: [
		AuditModule,
		CspPartnerAnalyticsModule,
		MailModule,
		PassportModule,
	],
	controllers: [
		ResellerAuthController,
		ResellerGoogleAuthController,
		ResellerOtpAuthController,
	],
	providers: [
		ResellerAuthService,
		ResellerOtpService,
		ResellerApiTokenService,
		ResellerBootstrapEntraStrategy,
		ResellerBootstrapGoogleStrategy,
		ResellerBootstrapAuthGuard,
		ResellerGoogleBootstrapAuthGuard,
		{
			provide: APP_GUARD,
			useClass: JwtAuthGuard,
		},
		{
			provide: APP_GUARD,
			useClass: AllowedUserTypesGuard,
		},
	],
	exports: [ResellerAuthService, ResellerApiTokenService],
})
export class AuthModule {}
