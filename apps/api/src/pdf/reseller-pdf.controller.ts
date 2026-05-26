import {
	Body,
	Controller,
	Delete,
	Get,
	HttpException,
	HttpStatus,
	Logger,
	Param,
	ParseUUIDPipe,
	Post,
	Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAnalyticsDownloadTrackingService } from '../admin-analytics/admin-analytics-download-tracking.service';
import { resolveAuthenticatedAuditActorContext } from '../audit/audit-actor-context';
import { AuditService } from '../audit/audit.service';
import { getErrorStatus, getRequestAuditFields } from '../audit/audit-request';
import { AllowedUserTypes } from '../auth/decorators/allowed-user-types.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ResellerAuthUser } from '../auth/interfaces/auth-user.interface';
import { DlTokenService } from './dl-token.service';
import { PdfAsyncService } from './pdf-async.service';
import { ResellerCustomersService } from '../reseller-customers/reseller-customers.service';
import { CreateResellerCustomerPdfDto } from './dto/create-reseller-customer-pdf.dto';
import { getEnv } from '../config/env';

@AllowedUserTypes('reseller')
@Controller('api/reseller/pdf')
export class ResellerPdfController {
	private readonly logger = new Logger(ResellerPdfController.name);
	private readonly env = getEnv();

	constructor(
		private readonly pdfAsyncService: PdfAsyncService,
		private readonly resellerCustomersService: ResellerCustomersService,
		private readonly auditService: AuditService,
		private readonly dlTokenService: DlTokenService,
		private readonly adminAnalyticsDownloadTrackingService: AdminAnalyticsDownloadTrackingService,
	) {}

	@Post('list/link-async')
	async createListLinkAsync(
		@Body() body: CreateResellerCustomerPdfDto,
		@CurrentUser() user: ResellerAuthUser,
		@Req() request?: Request,
	): Promise<{
		jobId: string;
		url: string;
		estimatedRows: number;
		totalChunks: number;
		totalParts: number;
	}> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuthenticatedAuditActorContext(user);

		try {
			const resellerFilters: Record<string, string[]> = {};
			if (body.filters?.customerName?.length)
				resellerFilters.customerName = body.filters.customerName;
			if (body.filters?.currentSku?.length)
				resellerFilters.currentSku = body.filters.currentSku;
			if (body.filters?.region?.length)
				resellerFilters.region = body.filters.region;
			if (body.filters?.seats?.length)
				resellerFilters.seats = body.filters.seats;
			if (body.filters?.currentArr?.length)
				resellerFilters.currentArr = body.filters.currentArr;
			if (body.filters?.renewalDate?.length)
				resellerFilters.renewalDate = body.filters.renewalDate;
			if (body.filters?.copilotFit?.length)
				resellerFilters.copilotFit = body.filters.copilotFit;
			if (body.filters?.copilotIntent?.length)
				resellerFilters.copilotIntent = body.filters.copilotIntent;
			if (body.filters?.copilotCluster?.length)
				resellerFilters.copilotCluster = body.filters.copilotCluster;
			if (body.filters?.hasCompete?.length)
				resellerFilters.hasCompete = body.filters.hasCompete;
			if (body.filters?.distributorName?.length)
				resellerFilters.distributorName = body.filters.distributorName;
			if (body.filters?.customerTpid?.length)
				resellerFilters.customerTpid = body.filters.customerTpid;
			if (body.filters?.copilotChatToPaid?.length)
				resellerFilters.copilotChatToPaid = body.filters.copilotChatToPaid;

			const totalRows = await this.resellerCustomersService.getExportRowCount(
				user.orgId,
				resellerFilters,
			);

			const {
				id: jobId,
				dlToken,
				totalChunks,
				totalParts,
			} = await this.pdfAsyncService.createResellerCustomerAsyncJob(
				user.orgId,
				user.userId,
				totalRows,
				resellerFilters,
				body.sort
					? {
							sortBy: body.sort.sortBy ?? 'createdAt',
							sortDir: body.sort.sortDir ?? 'descending',
						}
					: undefined,
				body.currency,
			);

			const baseUrl = `${this.env.apiPublicBaseUrl}/api/pdf/async/customer-list`;

			this.logger.debug(`Reseller async PDF link created for job ${jobId}`);

			await this.recordAsyncListJobCreated({
				dlToken,
				orgId: user.orgId,
				resellerFilters,
				actorId: user.userId,
				tenantId: user.tenantId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});

			void this.auditService.recordEvent({
				eventName: 'pdf.list_link.create.async.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: 'reseller-customer',
				...requestAuditFields,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					estimatedRows: totalRows,
					totalChunks,
					totalParts,
					jobId,
				},
			});

			return {
				jobId,
				url: `${baseUrl}?dlToken=${dlToken}`,
				estimatedRows: totalRows,
				totalChunks,
				totalParts,
			};
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.list_link.create.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: 'reseller-customer',
				...requestAuditFields,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					errorType: error instanceof Error ? error.name : 'UnknownError',
					message:
						error instanceof HttpException
							? error.message
							: 'Failed to create async PDF job',
				},
			});

			throw error;
		}
	}

	private async recordAsyncListJobCreated(params: {
		dlToken: string;
		orgId: string;
		resellerFilters: Record<string, string[]>;
		actorId: string;
		tenantId: string;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		try {
			const tokenPayload = this.dlTokenService.readTokenPayload(params.dlToken);
			await this.adminAnalyticsDownloadTrackingService.recordResellerCustomerListJobCreated(
				{
					tokenPayload,
					orgId: params.orgId,
					resellerFilters: params.resellerFilters,
					actorId: params.actorId,
					tenantId: params.tenantId,
					requestId: params.requestId,
					route: params.route,
				},
			);
		} catch (error) {
			this.logger.warn(
				`Failed to record reseller async PDF job analytics: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	@Get('async/status/:jobId')
	async getAsyncJobStatus(
		@Param('jobId', ParseUUIDPipe) jobId: string,
		@CurrentUser() user: ResellerAuthUser,
	) {
		const job = await this.pdfAsyncService.getJobByIdForOwner(
			jobId,
			user.userId,
			user.orgId,
		);

		return {
			id: job.id,
			status: job.status,
			progress: job.progress,
			totalChunks: job.totalChunks,
			completedChunks: job.completedChunks,
			partSize: job.partSize,
			totalParts: job.totalParts,
			completedParts: job.completedParts,
			totalRows: job.totalRows,
			azureBlobUrl: job.azureBlobUrl,
			parts: this.pdfAsyncService.getJobParts(job.parts),
			errorMessage: job.errorMessage,
			createdAt: job.createdAt,
			startedAt: job.startedAt,
			completedAt: job.completedAt,
			expiresAt: job.expiresAt,
			passwordAvailable:
				job.status === 'completed' &&
				typeof job.pdfPasswordCiphertext === 'string' &&
				job.pdfPasswordCiphertext.length > 0 &&
				!job.pdfPasswordRevealedAt &&
				!!job.expiresAt &&
				job.expiresAt.getTime() > Date.now(),
		};
	}

	@Post('async/:jobId/password/reveal')
	async revealAsyncJobPassword(
		@Param('jobId', ParseUUIDPipe) jobId: string,
		@CurrentUser() user: ResellerAuthUser,
		@Req() request?: Request,
	): Promise<{ password: string }> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuthenticatedAuditActorContext(user);

		try {
			const password = await this.pdfAsyncService.revealJobPasswordForOwner(
				jobId,
				user.userId,
				user.orgId,
			);

			void this.auditService.recordEvent({
				eventName: 'pdf.async.password.reveal.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: jobId,
				...requestAuditFields,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: { jobId },
			});

			return { password };
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.async.password.reveal.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: jobId,
				...requestAuditFields,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					errorType: error instanceof Error ? error.name : 'UnknownError',
					message:
						error instanceof Error
							? error.message
							: 'Failed to reveal PDF password',
				},
			});

			throw error;
		}
	}

	@Delete('async/:jobId')
	async cancelAsyncJob(
		@Param('jobId', ParseUUIDPipe) jobId: string,
		@CurrentUser() user: ResellerAuthUser,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuthenticatedAuditActorContext(user);

		try {
			await this.pdfAsyncService.cancelJobForOwner(
				jobId,
				user.userId,
				user.orgId,
			);

			void this.auditService.recordEvent({
				eventName: 'pdf.async.cancel.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: jobId,
				...requestAuditFields,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: { jobId },
			});

			return { success: true };
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.async.cancel.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: jobId,
				...requestAuditFields,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					errorType: error instanceof Error ? error.name : 'UnknownError',
					message:
						error instanceof Error ? error.message : 'Failed to cancel job',
				},
			});

			throw error;
		}
	}
}
