import {
	Body,
	Controller,
	Get,
	HttpStatus,
	Post,
	Query,
	Req,
	Res,
	UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PublicThrottleGuard } from '../common/guards/public-throttle.guard';
import { resolveAuditActorContext } from '../audit/audit-actor-context';
import { AuditService } from '../audit/audit.service';
import { getErrorStatus, getRequestAuditFields } from '../audit/audit-request';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { getEnv } from '../config/env';
import { CreateGtmBundleLinkDto } from './dto/create-gtm-bundle-link.dto';
import { GtmService } from './gtm.service';

@Controller('api/gtm')
export class GtmController {
	private readonly env = getEnv();

	constructor(
		private readonly gtmService: GtmService,
		private readonly auditService: AuditService,
	) {}

	@Public()
	@UseGuards(PublicThrottleGuard)
	@Post('bundle/link')
	createBundleLink(
		@Body() body: CreateGtmBundleLinkDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): { url: string } {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuditActorContext(user, this.env.defaultTenantId);

		try {
			const result = this.gtmService.createBundleLink(body.selectedAssets);

			void this.auditService.recordEvent({
				eventName: 'gtm.bundle_link.create.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'gtm-bundle',
				targetId: null,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					scenarioCount: body.selectedAssets.length,
					totalFileCount: body.selectedAssets.reduce(
						(sum, s) => sum + s.fileNames.length,
						0,
					),
				},
			});

			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'gtm.bundle_link.create.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'gtm-bundle',
				targetId: null,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});

			throw error;
		}
	}

	@Public()
	@UseGuards(PublicThrottleGuard)
	@Get('pax8-copilot-bundle')
	async downloadPax8CopilotBundle(
		@Res() response: Response,
	): Promise<void> {
		await this.gtmService.streamPax8CopilotBundle(response);
	}

	@Public()
	@UseGuards(PublicThrottleGuard)
	@Get('bundle')
	async downloadBundle(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			await this.gtmService.streamBundle(dlToken, response);

			void this.auditService.recordEvent({
				eventName: 'gtm.bundle.download.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'gtm-bundle',
				targetId: null,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'gtm.bundle.download.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'gtm-bundle',
				targetId: null,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});

			throw error;
		}
	}
}
