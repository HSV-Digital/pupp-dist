import {
	Body,
	Controller,
	Get,
	HttpException,
	HttpStatus,
	Post,
	Req,
	UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { getErrorStatus, getRequestAuditFields } from '../audit/audit-request';
import { CspPartnerAnalyticsEmitter } from '../csp-partner-analytics/csp-partner-analytics.emitter';
import { AllowedUserTypes } from './decorators/allowed-user-types.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { BootstrapResellerUserDto } from './dto/bootstrap-reseller-user.dto';
import { ResellerBootstrapAuthGuard } from './guards/reseller-bootstrap-auth.guard';
import type { ResellerAuthUser } from './interfaces/auth-user.interface';
import type { ResellerBootstrapUser } from './interfaces/reseller-bootstrap-user.interface';
import { ResellerAuthService } from './reseller-auth.service';

@Controller('api/reseller/auth')
export class ResellerAuthController {
	constructor(
		private readonly resellerAuthService: ResellerAuthService,
		private readonly auditService: AuditService,
		private readonly cspPartnerAnalyticsEmitter: CspPartnerAnalyticsEmitter,
	) {}

	@Public()
	@UseGuards(ResellerBootstrapAuthGuard)
	@Post('bootstrap')
	async bootstrap(
		@Body() dto: BootstrapResellerUserDto,
		@CurrentUser() user: ResellerBootstrapUser,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			this.assertBootstrapPayloadMatchesAuthenticatedUser(dto, user);

			const bootstrapped = await this.resellerAuthService.bootstrapResellerUser(
				{
					provider: 'entra',
					providerSubject: user.providerSubject,
					email: user.email,
					displayName: dto.displayName?.trim() || user.displayName,
					issuer: user.issuer,
					externalTenantId: user.externalTenantId,
					mpnId: dto.mpnId ?? null,
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
					provider: user.provider,
				},
			});

			void this.cspPartnerAnalyticsEmitter.enqueueEvent({
				orgId: bootstrapped.user.orgId,
				actorId: bootstrapped.user.userId,
				eventType: 'login',
				metadata: {
					actorEmail: bootstrapped.user.email,
					provider: user.provider,
				},
			});

			return bootstrapped;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'auth.login.failure',
				actionStatus: 'failure',
				actorType: 'user',
				actorId: null,
				tenantId: user.externalTenantId ?? 'reseller-bootstrap',
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
					provider: user.provider,
					errorType: error instanceof Error ? error.name : 'UnknownError',
					message:
						error instanceof HttpException
							? error.message
							: 'Reseller bootstrap failed unexpectedly',
				},
			});
			throw error;
		}
	}

	@AllowedUserTypes('reseller')
	@Get('me')
	getMe(@CurrentUser() user: ResellerAuthUser, @Req() request?: Request) {
		const requestAuditFields = getRequestAuditFields(request);

		void this.auditService.recordEvent({
			eventName: 'auth.session.me.success',
			actionStatus: 'success',
			actorType: 'user',
			actorId: user.userId,
			tenantId: user.orgId,
			userType: 'reseller',
			sourceSystem: 'api',
			targetType: 'auth',
			targetId: user.userId,
			requestId: requestAuditFields.requestId,
			route: requestAuditFields.route,
			httpMethod: requestAuditFields.httpMethod,
			httpStatus: HttpStatus.OK,
			durationMs: requestAuditFields.durationMs,
			metadata: {
				orgId: user.orgId,
				actorEmail: user.email,
				externalTenantId: user.externalTenantId,
				provider: user.provider,
			},
		});

		return {
			userType: user.userType,
			userId: user.userId,
			orgId: user.orgId,
			email: user.email,
			displayName: user.displayName,
			externalTenantId: user.externalTenantId,
		};
	}

	private assertBootstrapPayloadMatchesAuthenticatedUser(
		dto: BootstrapResellerUserDto,
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

		if (dto.tenantId && dto.tenantId.trim() !== (user.externalTenantId ?? '')) {
			throw new HttpException(
				'Bootstrap tenant mismatch',
				HttpStatus.FORBIDDEN,
			);
		}

		if (dto.issuer && dto.issuer.trim() !== (user.issuer ?? '')) {
			throw new HttpException(
				'Bootstrap issuer mismatch',
				HttpStatus.FORBIDDEN,
			);
		}
	}
}
