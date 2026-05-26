import {
	Body,
	Controller,
	HttpException,
	HttpStatus,
	Post,
	Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { getErrorStatus, getRequestAuditFields } from '../audit/audit-request';
import { Public } from './decorators/public.decorator';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResellerOtpService } from './reseller-otp.service';

@Controller('api/reseller/auth/otp')
export class ResellerOtpAuthController {
	constructor(
		private readonly otpService: ResellerOtpService,
		private readonly auditService: AuditService,
	) {}

	@Public()
	@Post('request')
	async requestOtp(@Body() dto: RequestOtpDto, @Req() request?: Request) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result = await this.otpService.requestOtp(dto.email);

			void this.auditService.recordEvent({
				eventName: 'auth.otp.request.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				actorId: null,
				tenantId: 'reseller-otp',
				userType: 'reseller',
				sourceSystem: 'api',
				targetType: 'auth',
				targetId: dto.email,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: { email: result.email },
			});

			return { message: 'Verification code sent', expiresInSeconds: result.expiresInSeconds };
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'auth.otp.request.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				actorId: null,
				tenantId: 'reseller-otp',
				userType: 'reseller',
				sourceSystem: 'api',
				targetType: 'auth',
				targetId: dto.email,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					email: dto.email,
					errorType: error instanceof Error ? error.name : 'UnknownError',
					message:
						error instanceof HttpException
							? error.message
							: 'OTP request failed',
				},
			});
			throw error;
		}
	}

	@Public()
	@Post('verify')
	async verifyOtp(@Body() dto: VerifyOtpDto, @Req() request?: Request) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result = await this.otpService.verifyOtp(dto.email, dto.code);

			void this.auditService.recordEvent({
				eventName: 'auth.otp.verify.success',
				actionStatus: 'success',
				actorType: 'user',
				actorId: result.user.userId,
				tenantId: result.user.orgId,
				userType: 'reseller',
				sourceSystem: 'api',
				targetType: 'auth',
				targetId: result.user.userId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: {
					email: result.user.email,
					orgId: result.user.orgId,
				},
			});

			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'auth.otp.verify.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				actorId: null,
				tenantId: 'reseller-otp',
				userType: 'reseller',
				sourceSystem: 'api',
				targetType: 'auth',
				targetId: dto.email,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					email: dto.email,
					errorType: error instanceof Error ? error.name : 'UnknownError',
					message:
						error instanceof HttpException
							? error.message
							: 'OTP verification failed',
				},
			});
			throw error;
		}
	}
}
