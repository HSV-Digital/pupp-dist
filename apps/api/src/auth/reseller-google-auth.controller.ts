import {
	Body,
	Controller,
	HttpException,
	HttpStatus,
	Post,
	Req,
	UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { getErrorStatus, getRequestAuditFields } from '../audit/audit-request';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { BootstrapResellerGoogleUserDto } from './dto/bootstrap-reseller-google-user.dto';
import { ResellerGoogleBootstrapAuthGuard } from './guards/reseller-google-bootstrap-auth.guard';
import type { ResellerBootstrapUser } from './interfaces/reseller-bootstrap-user.interface';
import { ResellerAuthService } from './reseller-auth.service';

@Controller('api/reseller/auth')
export class ResellerGoogleAuthController {
	constructor(
		private readonly resellerAuthService: ResellerAuthService,
		private readonly auditService: AuditService,
	) {}

	@Public()
	@UseGuards(ResellerGoogleBootstrapAuthGuard)
	@Post('google-bootstrap')
	async googleBootstrap(
		@Body() dto: BootstrapResellerGoogleUserDto,
		@CurrentUser() user: ResellerBootstrapUser,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			this.assertBootstrapPayloadMatchesAuthenticatedUser(dto, user);

			const bootstrapped = await this.resellerAuthService.bootstrapResellerUser(
				{
					provider: 'google',
					providerSubject: user.providerSubject,
					email: user.email,
					displayName: dto.displayName?.trim() || user.displayName,
					issuer: user.issuer,
					externalTenantId: user.externalTenantId,
				},
			);

			void this.auditService.recordEvent({
				eventName: 'auth.login.success',
				actionStatus: 'success',
				actorType: 'user',
				actorId: bootstrapped.user.userId,
				tenantId: bootstrapped.user.orgId,
				userType: 'reseller',
				sourceSystem: 'api',
				targetType: 'auth',
				targetId: bootstrapped.user.userId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: {
					orgId: bootstrapped.user.orgId,
					actorEmail: bootstrapped.user.email,
					externalTenantId: user.externalTenantId,
					provider: 'google',
				},
			});

			return bootstrapped;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'auth.login.failure',
				actionStatus: 'failure',
				actorType: 'user',
				actorId: null,
				tenantId: user.externalTenantId ?? 'reseller-google-bootstrap',
				userType: 'reseller',
				sourceSystem: 'api',
				targetType: 'auth',
				targetId: user.providerSubject,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					email: user.email,
					externalTenantId: user.externalTenantId,
					provider: 'google',
					errorType: error instanceof Error ? error.name : 'UnknownError',
					message:
						error instanceof HttpException
							? error.message
							: 'Reseller Google bootstrap failed unexpectedly',
				},
			});
			throw error;
		}
	}

	private assertBootstrapPayloadMatchesAuthenticatedUser(
		dto: BootstrapResellerGoogleUserDto,
		user: ResellerBootstrapUser,
	): void {
		if (dto.provider !== user.provider) {
			throw new HttpException(
				'Bootstrap provider mismatch',
				HttpStatus.FORBIDDEN,
			);
		}

		if (dto.providerSubject !== user.providerSubject) {
			throw new HttpException(
				'Bootstrap subject mismatch',
				HttpStatus.FORBIDDEN,
			);
		}

		if (dto.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
			throw new HttpException('Bootstrap email mismatch', HttpStatus.FORBIDDEN);
		}
	}
}
