import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	GoneException,
	Get,
	Header,
	HttpException,
	HttpStatus,
	Logger,
	Optional,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	Req,
	Res,
	UnauthorizedException,
	UseGuards,
} from '@nestjs/common';
import archiver from 'archiver';
import { finished } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { AdminAnalyticsDownloadTrackingService } from '../admin-analytics/admin-analytics-download-tracking.service';
import { PublicThrottleGuard } from '../common/guards/public-throttle.guard';
import { DemoThrottleGuard } from '../common/guards/demo-throttle.guard';
import { DemoModeGuard } from '../common/guards/demo-mode.guard';
import { resolveAuditActorContext } from '../audit/audit-actor-context';
import { AuditService } from '../audit/audit.service';
import { getErrorStatus, getRequestAuditFields } from '../audit/audit-request';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { getEnv } from '../config/env';
import {
	CreatePdfListLinkDto,
	RenderResellerListDto,
} from './dto/render-reseller-list.dto';
import { DlTokenService } from './dl-token.service';
import { PdfService } from './pdf.service';
import { PdfAsyncService } from './pdf-async.service';
import { PdfChunkService } from './pdf-chunk.service';
import type { PreparedCustomerListRow } from './pdf-chunk.service';
import { BlobStorageService } from '../blob-storage/blob-storage.service';
import type { PdfAsyncJobPart } from './types/pdf-async-job.types';
import type { ResellerListRow } from './pdf-html-templates';
import { renderOpportunitiesHtml } from './pdf-html-templates';
import type { OpportunityPageRow } from './pdf-html-templates';
import { DemoDataService } from './demo-data.service';
import { PdfRendererService } from './pdf-renderer.service';
import { buildProposalScenarios } from './pdf-rules';
import { convertUsdAmountToRegional, matchStartingSku } from '@repo/shared';
import type { RenewalSubscription } from '@repo/types';
import { ProposalAssetService } from '../proposal-asset/proposal-asset.service';
import { ResellerCustomersService } from '../reseller-customers/reseller-customers.service';

@Controller('api/pdf')
export class PdfController {
	private readonly env = getEnv();
	private readonly logger = new Logger(PdfController.name);

	constructor(
		private readonly pdfService: PdfService,
		private readonly pdfAsyncService: PdfAsyncService,
		private readonly pdfChunkService: PdfChunkService,
		private readonly blobStorage: BlobStorageService,
		private readonly auditService: AuditService,
		private readonly demoDataService: DemoDataService,
		private readonly pdfRenderer: PdfRendererService,
		private readonly proposalAssetService: ProposalAssetService,
		private readonly resellerCustomersService: ResellerCustomersService,
		@Optional() private readonly dlTokenService?: DlTokenService,
		@Optional()
		private readonly adminAnalyticsDownloadTrackingService?: AdminAnalyticsDownloadTrackingService,
	) {}

	@Post('list/link')
	createListLink(
		@Body() body: CreatePdfListLinkDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): {
		url: string;
	} {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result = this.pdfService.createListLink(body);
			this.recordIssuedDownloadLink({
				url: result.url,
				category:
					body.viewMode === 'reseller' ? 'reseller-lists' : 'customer-lists',
				actorId: user?.userId ?? null,
				tenantId: user?.tenantId ?? null,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});
			void this.auditService.recordEvent({
				eventName: 'pdf.list_link.create.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: body.viewMode,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					viewMode: body.viewMode,
					selectedSkuCount: body.selectedSkuIds?.length ?? 0,
				},
			});

			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.list_link.create.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: body.viewMode,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					errorType: error instanceof Error ? error.name : 'UnknownError',
					message:
						error instanceof HttpException
							? error.message
							: 'Failed to create PDF list link',
				},
			});

			throw error;
		}
	}

	@Post('reseller-list/link')
	createResellerListLink(
		@Body() body: RenderResellerListDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): {
		url: string;
	} {
		return this.createListLink(
			{
				...body,
				viewMode: 'reseller',
			},
			user,
			request,
		);
	}

	@Post('list/link-async')
	async createListLinkAsync(
		@Body() body: CreatePdfListLinkDto,
		@CurrentUser() user?: AuthUser,
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

		try {
			if (!user?.entraObjectId) {
				throw new UnauthorizedException('Missing authenticated user context');
			}

			const {
				id: jobId,
				dlToken,
				totalRows,
				totalChunks,
				totalParts,
			} = await this.pdfAsyncService.createAsyncJob(body, user.entraObjectId);

			const baseUrl =
				body.viewMode === 'reseller'
					? `${this.env.apiPublicBaseUrl}/api/pdf/async/reseller-list`
					: `${this.env.apiPublicBaseUrl}/api/pdf/async/customer-list`;

			this.logger.debug(
				`Async PDF link created for job ${jobId} (${body.viewMode})`,
			);
			await this.recordAsyncListJobCreated({
				dlToken,
				category:
					body.viewMode === 'reseller' ? 'reseller-lists' : 'customer-lists',
				actorId: user.userId,
				tenantId: user.tenantId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});

			void this.auditService.recordEvent({
				eventName: 'pdf.list_link.create.async.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: body.viewMode,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					viewMode: body.viewMode,
					selectedSkuCount: body.selectedSkuIds?.length ?? 0,
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
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: body.viewMode,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
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

	@Get('async/status/:jobId')
	async getAsyncJobStatus(
		@Param('jobId', ParseUUIDPipe) jobId: string,
		@CurrentUser() user?: AuthUser,
	) {
		if (!user?.entraObjectId) {
			throw new UnauthorizedException('Missing authenticated user context');
		}

		const job = await this.pdfAsyncService.getJobByIdForOwner(
			jobId,
			user.entraObjectId,
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
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): Promise<{ password: string }> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			if (!user?.entraObjectId) {
				throw new UnauthorizedException('Missing authenticated user context');
			}

			const password = await this.pdfAsyncService.revealJobPasswordForOwner(
				jobId,
				user.entraObjectId,
			);

			void this.auditService.recordEvent({
				eventName: 'pdf.async.password.reveal.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: jobId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: { jobId },
			});

			return { password };
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.async.password.reveal.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: jobId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
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
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			if (!user?.entraObjectId) {
				throw new UnauthorizedException('Missing authenticated user context');
			}

			await this.pdfAsyncService.cancelJobForOwner(jobId, user.entraObjectId);

			void this.auditService.recordEvent({
				eventName: 'pdf.async.cancel.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: jobId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: { jobId },
			});

			return { success: true };
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.async.cancel.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: jobId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
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

	@Public()
	@UseGuards(PublicThrottleGuard)
	@Get('async/reseller-list')
	@Header('Cache-Control', 'no-store')
	async renderAsyncResellerList(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		await this.renderAsyncList({
			dlToken,
			response,
			request,
			targetId: 'reseller-list',
			fileName: 'reseller-list.pdf',
			successEventName: 'pdf.render.reseller.async.success',
			failureEventName: 'pdf.render.reseller.async.failure',
		});
	}

	@Public()
	@UseGuards(PublicThrottleGuard)
	@Get('async/customer-list')
	@Header('Cache-Control', 'no-store')
	async renderAsyncCustomerList(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		await this.renderAsyncList({
			dlToken,
			response,
			request,
			targetId: 'customer-list',
			fileName: 'customer-list.pdf',
			successEventName: 'pdf.render.customer.async.success',
			failureEventName: 'pdf.render.customer.async.failure',
		});
	}

	private async renderAsyncList(params: {
		dlToken: string | undefined;
		response: Response;
		request?: Request;
		targetId: 'reseller-list' | 'customer-list';
		fileName: string;
		successEventName:
			| 'pdf.render.reseller.async.success'
			| 'pdf.render.customer.async.success';
		failureEventName:
			| 'pdf.render.reseller.async.failure'
			| 'pdf.render.customer.async.failure';
	}): Promise<void> {
		const requestAuditFields = getRequestAuditFields(params.request);
		const startedAt = Date.now();

		try {
			await this.assertTokenAvailable(params.dlToken);
			const asyncJob = params.dlToken
				? await this.pdfAsyncService.findJobByToken(params.dlToken)
				: null;

			if (!asyncJob) {
				throw new HttpException(
					'Invalid or expired token',
					HttpStatus.NOT_FOUND,
				);
			}

			if (asyncJob.status === 'failed') {
				throw new HttpException(
					asyncJob.errorMessage || 'PDF generation failed',
					HttpStatus.INTERNAL_SERVER_ERROR,
				);
			}

			if (asyncJob.status !== 'completed') {
				throw new HttpException(
					'PDF is still being generated. Please check job status.',
					HttpStatus.ACCEPTED,
				);
			}

			if (!asyncJob.expiresAt || asyncJob.expiresAt.getTime() <= Date.now()) {
				throw new GoneException('PDF download has expired');
			}

			const parts = this.pdfAsyncService.getJobParts(asyncJob.parts);
			const completedParts = this.resolveCompletedParts(parts);
			if (completedParts.length === 0) {
				throw new HttpException(
					'No downloadable PDF parts found',
					HttpStatus.NOT_FOUND,
				);
			}

			let deliveryType: 'pdf' | 'zip' = 'pdf';
			if (completedParts.length > 1) {
				deliveryType = 'zip';
				await this.consumeDownloadToken({
					dlToken: params.dlToken,
					requestId: requestAuditFields.requestId,
					route: requestAuditFields.route,
				});
				await this.streamZipFromParts({
					jobId: asyncJob.id,
					targetId: params.targetId,
					parts: completedParts,
					response: params.response,
				});
			} else {
				const firstPart = completedParts[0];
				const blobName = firstPart.blobName ?? `${asyncJob.id}.pdf`;
				const fileName = firstPart.fileName ?? params.fileName;
				const pdfBuffer = await this.blobStorage.download(
					'pdf-exports',
					blobName,
				);
				await this.consumeDownloadToken({
					dlToken: params.dlToken,
					requestId: requestAuditFields.requestId,
					route: requestAuditFields.route,
				});

				params.response.setHeader('Content-Type', 'application/pdf');
				params.response.setHeader(
					'Content-Disposition',
					`inline; filename="${fileName}"`,
				);
				params.response.send(pdfBuffer);
			}

			void this.auditService.recordEvent({
				eventName: params.successEventName,
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: params.targetId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: {
					jobId: asyncJob.id,
					source: 'azure-blob',
					deliveryType,
					completedPartCount: completedParts.length,
				},
			});
			await this.recordAsyncDownloadFromTokenIfMissing({
				dlToken: params.dlToken,
				category:
					params.targetId === 'reseller-list'
						? 'reseller-lists'
						: 'customer-lists',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: params.failureEventName,
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: params.targetId,
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

	private resolveCompletedParts(parts: PdfAsyncJobPart[]): PdfAsyncJobPart[] {
		return parts
			.filter((part) => part.status === 'completed' && part.blobName)
			.sort((left, right) => left.partNumber - right.partNumber);
	}

	private async streamZipFromParts(params: {
		jobId: string;
		targetId: 'reseller-list' | 'customer-list';
		parts: PdfAsyncJobPart[];
		response: Response;
	}): Promise<void> {
		const zipFileName = `${params.targetId}-${params.jobId}.zip`;
		params.response.setHeader('Content-Type', 'application/zip');
		params.response.setHeader(
			'Content-Disposition',
			`attachment; filename="${zipFileName}"`,
		);

		const archive = archiver('zip', { zlib: { level: 0 } });
		archive.pipe(params.response);

		archive.on('error', (error) => {
			this.logger.error(
				`Archive stream failed for async PDF zip job ${params.jobId}`,
				error instanceof Error ? error.stack : undefined,
			);
			if (!params.response.destroyed) {
				params.response.destroy(error);
			}
		});

		try {
			for (const part of params.parts) {
				if (!part.blobName) {
					continue;
				}
				const buffer = await this.blobStorage.download(
					'pdf-exports',
					part.blobName,
				);
				const fileName =
					part.fileName?.trim().length > 0
						? part.fileName
						: `part-${part.partNumber}.pdf`;
				archive.append(buffer, { name: fileName });
			}

			const responseFinished = finished(params.response, { readable: false });
			await archive.finalize();
			await responseFinished;
		} catch (error) {
			archive.abort();
			if (!params.response.destroyed) {
				params.response.destroy(error as Error);
			}
			this.logger.error(
				`Failed to generate ZIP for async PDF job ${params.jobId}`,
				error instanceof Error ? error.stack : undefined,
			);
			throw new HttpException(
				'Failed to generate ZIP for PDF parts',
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}
	}

	@Public()
	@UseGuards(DemoModeGuard, DemoThrottleGuard)
	@Post('demo/list/render')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async renderDemoList(
		@Body()
		body: {
			viewMode: string;
			selectedSkuIds?: string[];
			filters?: Record<string, string[]>;
			searchTerm?: string;
		},
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const viewMode = body.viewMode;
			if (viewMode !== 'customer' && viewMode !== 'reseller') {
				throw new BadRequestException(
					'viewMode must be "customer" or "reseller"',
				);
			}

			const selectedSkuIds = Array.isArray(body.selectedSkuIds)
				? body.selectedSkuIds
				: [];

			const pdfBuffer = await this.generateDemoPdfBuffer(
				viewMode,
				selectedSkuIds,
				body.filters as Record<string, string[]>,
				body.searchTerm,
			);

			response.setHeader(
				'Content-Disposition',
				`attachment; filename="demo-${viewMode}-list.pdf"`,
			);
			response.status(HttpStatus.OK).send(pdfBuffer);

			void this.auditService.recordEvent({
				eventName: 'pdf.demo.render.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: `demo-${viewMode}`,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: {
					viewMode,
					demo: true,
				},
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.demo.render.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: `demo-${body.viewMode ?? 'unknown'}`,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					demo: true,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});

			throw error;
		}
	}

	@Public()
	@UseGuards(DemoModeGuard, DemoThrottleGuard)
	@Post('demo/list/link')
	createDemoListLink(
		@Body()
		body: {
			viewMode: string;
			selectedSkuIds?: string[];
			filters?: Record<string, string[]>;
			searchTerm?: string;
		},
	): { url: string; expiresAt: string } {
		const viewMode = body.viewMode;
		if (viewMode !== 'customer' && viewMode !== 'reseller') {
			throw new BadRequestException(
				'viewMode must be "customer" or "reseller"',
			);
		}

		if (!this.dlTokenService) {
			throw new BadRequestException('Token service unavailable');
		}

		const selectedSkuIds = Array.isArray(body.selectedSkuIds)
			? body.selectedSkuIds
			: [];

		const token = this.dlTokenService.createToken({
			scope: 'demo-pdf-list',
			tenantId: this.env.defaultTenantId,
			filters: {
				pssAIWorkforce: [],
				pssAISecurity: [],
				psa: [],
				distributor: [],
				reseller: [],
				customer: [],
				pdm: [],
				pmm: [],
				expSeats: [],
				renewalDate: [],
				search: '',
			},
			sort: { sortBy: '', sortDir: 'ascending' },
			selectedSkuIds,
			demoPdfList: {
				viewMode,
				selectedSkuIds,
				filters: body.filters,
				searchTerm: body.searchTerm,
			},
		});

		const ttlSeconds = this.env.pdfDlTokenTtlSeconds;
		const url = `/api/pdf/demo/list/download?dlToken=${encodeURIComponent(token)}`;
		const expiresAt = new Date(
			Date.now() + ttlSeconds * 1000,
		).toISOString();

		return { url, expiresAt };
	}

	@Public()
	@UseGuards(DemoModeGuard, PublicThrottleGuard)
	@Get('demo/list/download')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async downloadDemoList(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
	): Promise<void> {
		if (!this.dlTokenService) {
			throw new BadRequestException('Token service unavailable');
		}

		if (!dlToken || dlToken.trim().length === 0) {
			throw new BadRequestException('Missing download token');
		}

		const payload = this.dlTokenService.readTokenPayload(dlToken);
		if (payload.scope !== 'demo-pdf-list' || !payload.demoPdfList) {
			throw new BadRequestException('Invalid token scope');
		}

		const { viewMode, selectedSkuIds, filters, searchTerm } =
			payload.demoPdfList;

		const pdfBuffer = await this.generateDemoPdfBuffer(
			viewMode,
			selectedSkuIds,
			filters,
			searchTerm,
		);

		response.setHeader(
			'Content-Disposition',
			`attachment; filename="demo-${viewMode}-list.pdf"`,
		);
		response.status(HttpStatus.OK).send(pdfBuffer);
	}

	@Public()
	@UseGuards(DemoModeGuard, DemoThrottleGuard)
	@Get('demo/customer-list/:resellerName')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async renderDemoCustomerList(
		@Param('resellerName') resellerName: string,
		@Query('skus') skus: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const selectedSkuIds = skus ? skus.split(',').filter(Boolean) : [];
			const subscriptions = this.demoDataService.getByReseller(
				decodeURIComponent(resellerName),
			);

			if (subscriptions.length === 0) {
				throw new BadRequestException(
					'No subscriptions found for this reseller',
				);
			}

			const apiBase = this.env.apiPublicBaseUrl;
			const preparedRows = this.buildDemoCustomerRows(
				subscriptions,
				selectedSkuIds,
				apiBase,
			);

			const assets = await this.pdfService.loadTemplateAssets();
			const pdfBuffer = await this.pdfChunkService.generatePdfFromPreparedRows(
				preparedRows,
				assets,
				'customer',
			);

			response.setHeader(
				'Content-Disposition',
				`inline; filename="demo-customer-list-${encodeURIComponent(resellerName)}.pdf"`,
			);
			response.status(HttpStatus.OK).send(pdfBuffer);

			void this.auditService.recordEvent({
				eventName: 'pdf.demo.render.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: `demo-customer-list`,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: { resellerName, demo: true },
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.demo.render.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: `demo-customer-list`,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					demo: true,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});

			throw error;
		}
	}

	@Public()
	@UseGuards(DemoModeGuard, DemoThrottleGuard)
	@Get('demo/opportunities/:customerId')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async renderDemoOpportunities(
		@Param('customerId') customerId: string,
		@Query('skus') skus: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const selectedSkuIds = skus ? skus.split(',').filter(Boolean) : [];
			const subscriptions = this.demoDataService.getByCustomer(customerId);

			if (subscriptions.length === 0) {
				throw new BadRequestException(
					'No subscriptions found for this customer',
				);
			}

			const pages: OpportunityPageRow[] = subscriptions.map((sub) => {
				const daysToRenewal = Math.max(
					0,
					Math.ceil(
						(new Date(sub.renewalDate).getTime() - Date.now()) / 86_400_000,
					),
				);
				const proposalExpiringArr = convertUsdAmountToRegional({
					amountUsd: sub.annualRevenueRunRate,
					region: sub.region,
				});

				return {
					customerId: sub.customerId,
					customerName: sub.customerName,
					subscriptionId: sub.subscriptionId,
					resellerName: sub.resellerName,
					currentProduct: sub.currentProduct,
					seatCount: sub.seatCount,
					expiringArr: proposalExpiringArr,
					region: sub.region,
					renewalDate: sub.renewalDate,
					daysToRenewal,
					scenarios: buildProposalScenarios({
						currentProduct: sub.currentProduct,
						seatCount: sub.seatCount,
						selectedSkuIds,
						expiringArr: proposalExpiringArr,
						journey: 'renewal',
						region: sub.region,
					}),
				};
			});

			// Generate ZIP assets for each scenario (same as auth flow)
			const assetTasks: Array<{
				pageIndex: number;
				scenarioIndex: number;
				promise: Promise<{
					endingSkuId: string;
					documentsZipUrl: string;
				}>;
			}> = [];

			for (let p = 0; p < pages.length; p += 1) {
				const page = pages[p];
				const startingSku = matchStartingSku(page.currentProduct);
				if (!startingSku) continue;

				for (let s = 0; s < page.scenarios.length; s += 1) {
					const scenario = page.scenarios[s];
					assetTasks.push({
						pageIndex: p,
						scenarioIndex: s,
						promise: this.proposalAssetService.generateSolutionZip({
							journey: 'renewal',
							customerId: page.customerId,
							customerName: page.customerName,
							opportunityId: page.subscriptionId,
							startingSkuId: startingSku.id,
							startingSkuName: startingSku.name,
							endingSkuId: scenario.endingSkuId,
							seats: page.seatCount,
							expiringArr: page.expiringArr,
							region: page.region,
						}),
					});
				}
			}

			const results = await Promise.allSettled(
				assetTasks.map((task) => task.promise),
			);

			for (let i = 0; i < assetTasks.length; i += 1) {
				const task = assetTasks[i];
				const result = results[i];
				if (result.status === 'fulfilled') {
					pages[task.pageIndex].scenarios[task.scenarioIndex].proposalLink =
						result.value.documentsZipUrl;
				} else {
					this.logger.warn(
						`Demo ZIP asset generation failed for page ${task.pageIndex}, scenario ${task.scenarioIndex}: ${
							result.reason instanceof Error
								? result.reason.message
								: String(result.reason)
						}`,
					);
				}
			}

			const assets = await this.pdfService.loadTemplateAssets();
			const html = renderOpportunitiesHtml({ rows: pages, assets });
			const pdfBuffer = await this.pdfRenderer.renderHtmlToPdf({ html });

			response.setHeader(
				'Content-Disposition',
				`inline; filename="demo-opportunities-${encodeURIComponent(customerId)}.pdf"`,
			);
			response.status(HttpStatus.OK).send(pdfBuffer);

			void this.auditService.recordEvent({
				eventName: 'pdf.demo.render.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: `demo-opportunities`,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: { customerId, demo: true },
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.demo.render.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: `demo-opportunities`,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					demo: true,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});

			throw error;
		}
	}

	private async generateDemoPdfBuffer(
		viewMode: 'customer' | 'reseller',
		selectedSkuIds: string[],
		filters?: Record<string, string[]>,
		searchTerm?: string,
	): Promise<Buffer> {
		const subscriptions = this.demoDataService.loadFilteredSubscriptions({
			filters: filters as any,
			searchTerm,
		});

		if (subscriptions.length === 0) {
			throw new BadRequestException(
				'No subscriptions match the current filters',
			);
		}

		const assets = await this.pdfService.loadTemplateAssets();
		const apiBase = this.env.apiPublicBaseUrl;

		if (viewMode === 'customer') {
			const preparedRows = this.buildDemoCustomerRows(
				subscriptions,
				selectedSkuIds,
				apiBase,
			);
			return this.pdfChunkService.generatePdfFromPreparedRows(
				preparedRows,
				assets,
				'customer',
			);
		}

		const resellerRows = this.buildDemoResellerRows(
			subscriptions,
			selectedSkuIds,
			apiBase,
		);
		return this.pdfChunkService.generatePdfFromPreparedRows(
			resellerRows,
			assets,
			'reseller',
		);
	}

	// ── Demo row aggregation helpers ──

	private buildDemoCustomerRows(
		subscriptions: RenewalSubscription[],
		selectedSkuIds: string[],
		apiBase: string,
	): PreparedCustomerListRow[] {
		const skuParam = selectedSkuIds.join(',');
		const map = new Map<
			string,
			PreparedCustomerListRow & { subCount: number }
		>();

		for (const sub of subscriptions) {
			const existing = map.get(sub.customerId);
			if (existing) {
				existing.seats += sub.seatCount;
				existing.expiringArr += sub.annualRevenueRunRate;
				existing.subCount += 1;
				if (sub.skuCategory === 'Basic') existing.basicSeats += sub.seatCount;
				else if (sub.skuCategory === 'Standard')
					existing.standardSeats += sub.seatCount;
				else if (sub.skuCategory === 'Premium')
					existing.premiumSeats += sub.seatCount;
			} else {
				map.set(sub.customerId, {
					customerId: sub.customerId,
					customerName: sub.customerName,
					expiringArr: sub.annualRevenueRunRate,
					seats: sub.seatCount,
					basicSeats: sub.skuCategory === 'Basic' ? sub.seatCount : 0,
					standardSeats: sub.skuCategory === 'Standard' ? sub.seatCount : 0,
					premiumSeats: sub.skuCategory === 'Premium' ? sub.seatCount : 0,
					proposalLink: `${apiBase}/api/pdf/demo/opportunities/${encodeURIComponent(sub.customerId)}${skuParam ? `?skus=${skuParam}` : ''}`,
					opportunityCount: 1,
					subCount: 1,
				});
			}
		}

		return [...map.values()].map(({ subCount, ...row }) => ({
			...row,
			opportunityCount: subCount,
		}));
	}

	private buildDemoResellerRows(
		subscriptions: RenewalSubscription[],
		selectedSkuIds: string[],
		apiBase: string,
	): ResellerListRow[] {
		const skuParam = selectedSkuIds.join(',');
		const map = new Map<
			string,
			{
				resellerName: string;
				customerIds: Set<string>;
				subscriptionCount: number;
				expiringArr: number;
				seats: number;
			}
		>();

		for (const sub of subscriptions) {
			const existing = map.get(sub.resellerName);
			if (existing) {
				existing.customerIds.add(sub.customerId);
				existing.subscriptionCount += 1;
				existing.expiringArr += sub.annualRevenueRunRate;
				existing.seats += sub.seatCount;
			} else {
				map.set(sub.resellerName, {
					resellerName: sub.resellerName,
					customerIds: new Set([sub.customerId]),
					subscriptionCount: 1,
					expiringArr: sub.annualRevenueRunRate,
					seats: sub.seatCount,
				});
			}
		}

		return [...map.values()].map((r) => ({
			resellerName: r.resellerName,
			customerCount: r.customerIds.size,
			opportunityCount: r.subscriptionCount,
			expiringArr: r.expiringArr,
			seats: r.seats,
			proposalLink: `${apiBase}/api/pdf/demo/customer-list/${encodeURIComponent(r.resellerName)}${skuParam ? `?skus=${skuParam}` : ''}`,
		}));
	}

	// ── Preview routes (non-production only, no token required) ──

	@Public()
	@Get('preview/reseller-list')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async previewResellerList(@Res() response: Response): Promise<void> {
		if (this.env.isProduction) {
			response.status(404).json({ message: 'Not found' });
			return;
		}
		const stream = await this.pdfService.renderPreviewResellerList();
		response.setHeader(
			'Content-Disposition',
			'inline; filename="preview-reseller-list.pdf"',
		);
		stream.pipe(response);
	}

	@Public()
	@Get('preview/customer-list')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async previewCustomerList(@Res() response: Response): Promise<void> {
		if (this.env.isProduction) {
			response.status(404).json({ message: 'Not found' });
			return;
		}
		const stream = await this.pdfService.renderPreviewCustomerList();
		response.setHeader(
			'Content-Disposition',
			'inline; filename="preview-customer-list.pdf"',
		);
		stream.pipe(response);
	}

	@Public()
	@Get('preview/opportunities')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async previewOpportunities(@Res() response: Response): Promise<void> {
		if (this.env.isProduction) {
			response.status(404).json({ message: 'Not found' });
			return;
		}
		const stream = await this.pdfService.renderPreviewOpportunities();
		response.setHeader(
			'Content-Disposition',
			'inline; filename="preview-opportunities.pdf"',
		);
		stream.pipe(response);
	}

	@Public()
	@UseGuards(PublicThrottleGuard)
	@Get('reseller-list')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async renderResellerListByToken(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			await this.assertTokenAvailable(dlToken);
			const stream =
				await this.pdfService.renderResellerListPdfFromToken(dlToken);

			response.setHeader(
				'Content-Disposition',
				'inline; filename="reseller-list.pdf"',
			);
			await this.consumeDownloadToken({
				dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});

			void this.auditService.recordEvent({
				eventName: 'pdf.render.reseller.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: 'reseller-list',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});
			await this.recordDownloadFromToken({
				dlToken,
				category: 'reseller-lists',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});

			stream.pipe(response);
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.render.reseller.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: 'reseller-list',
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
	@Get('customer-list')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async renderCustomerListByToken(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			await this.assertTokenAvailable(dlToken);
			const stream =
				await this.pdfService.renderCustomerListPdfFromToken(dlToken);

			response.setHeader(
				'Content-Disposition',
				'inline; filename="customer-list.pdf"',
			);
			await this.consumeDownloadToken({
				dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});

			void this.auditService.recordEvent({
				eventName: 'pdf.render.customer.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: 'customer-list',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});
			await this.recordDownloadFromToken({
				dlToken,
				category: 'customer-lists',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});

			stream.pipe(response);
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.render.customer.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'pdf',
				targetId: 'customer-list',
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
	@Get('customer-list/:resellerId')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async renderCustomerList(
		@Param('resellerId') resellerId: string,
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			await this.assertTokenAvailable(dlToken);
			const stream = await this.pdfService.renderCustomerListPdf({
				resellerId,
				dlToken,
			});

			response.setHeader(
				'Content-Disposition',
				`inline; filename="customer-list-${encodeURIComponent(resellerId)}.pdf"`,
			);
			await this.consumeDownloadToken({
				dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});

			void this.auditService.recordEvent({
				eventName: 'pdf.render.customer.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'reseller',
				targetId: resellerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});
			await this.recordDownloadFromToken({
				dlToken,
				category: 'customer-lists',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});

			stream.pipe(response);
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.render.customer.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'reseller',
				targetId: resellerId,
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

	private async assertTokenAvailable(
		dlToken: string | undefined,
	): Promise<void> {
		await this.dlTokenService?.assertTokenAvailable(dlToken);
	}

	private async recordAsyncListJobCreated(params: {
		dlToken: string;
		category: 'customer-lists' | 'reseller-lists';
		actorId: string | null;
		tenantId: string | null;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		if (!this.dlTokenService || !this.adminAnalyticsDownloadTrackingService) {
			return;
		}

		try {
			const tokenPayload = this.dlTokenService.readTokenPayload(params.dlToken);
			if (params.category === 'reseller-lists') {
				await this.adminAnalyticsDownloadTrackingService.recordResellerListJobCreated(
					{
						tokenPayload,
						actorId: params.actorId,
						tenantId: params.tenantId,
						requestId: params.requestId,
						route: params.route,
					},
				);
				return;
			}

			await this.adminAnalyticsDownloadTrackingService.recordCustomerListJobCreated(
				{
					tokenPayload,
					actorId: params.actorId,
					tenantId: params.tenantId,
					requestId: params.requestId,
					route: params.route,
				},
			);
		} catch (error) {
			this.logger.warn(
				`Failed to record async PDF job analytics: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	private recordIssuedDownloadLink(params: {
		url: string;
		category: 'customer-lists' | 'reseller-lists';
		actorId: string | null;
		tenantId: string | null;
		requestId?: string | null;
		route?: string | null;
	}): void {
		if (!this.dlTokenService || !this.adminAnalyticsDownloadTrackingService) {
			return;
		}

		try {
			const dlToken = extractDlToken(params.url, this.env.apiPublicBaseUrl);
			if (!dlToken) {
				return;
			}

			const tokenPayload = this.dlTokenService.readTokenPayload(dlToken);
			void this.adminAnalyticsDownloadTrackingService.recordIssuance({
				tokenPayload,
				category: params.category,
				actorId: params.actorId,
				tenantId: params.tenantId,
				requestId: params.requestId,
				route: params.route,
			});
		} catch (error) {
			this.logger.warn(
				`Failed to record PDF download issuance: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	private async consumeDownloadToken(params: {
		dlToken: string | undefined;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		await this.dlTokenService?.consumeToken({
			token: params.dlToken,
			requestId: params.requestId,
			route: params.route,
		});
	}

	private async recordAsyncDownloadFromTokenIfMissing(params: {
		dlToken: string | undefined;
		category: 'customer-lists' | 'reseller-lists';
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		if (!this.dlTokenService || !this.adminAnalyticsDownloadTrackingService) {
			return;
		}

		try {
			const tokenPayload = this.dlTokenService.readTokenPayload(params.dlToken);
			const factAlreadyRecorded =
				await this.adminAnalyticsDownloadTrackingService.hasFactForTokenJti(
					tokenPayload.jti,
				);
			if (factAlreadyRecorded) {
				return;
			}

			await this.recordDownloadFromToken(params);
		} catch (error) {
			this.logger.warn(
				`Failed to reconcile async PDF download analytics: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	private async recordDownloadFromToken(params: {
		dlToken: string | undefined;
		category: 'customer-lists' | 'reseller-lists';
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		if (!this.dlTokenService || !this.adminAnalyticsDownloadTrackingService) {
			return;
		}

		try {
			const tokenPayload = this.dlTokenService.readTokenPayload(params.dlToken);
			if (params.category === 'reseller-lists') {
				await this.adminAnalyticsDownloadTrackingService.recordResellerListDownload(
					{
						tokenPayload,
						requestId: params.requestId,
						route: params.route,
					},
				);
				return;
			}

			await this.adminAnalyticsDownloadTrackingService.recordCustomerListDownload(
				{
					tokenPayload,
					requestId: params.requestId,
					route: params.route,
				},
			);
		} catch (error) {
			this.logger.warn(
				`Failed to record PDF download fact: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	@Public()
	@UseGuards(PublicThrottleGuard)
	@Get('reseller-opportunities/:customerName')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async renderResellerOpportunities(
		@Param('customerName') customerName: string,
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			if (!this.dlTokenService) {
				throw new UnauthorizedException('Token service unavailable');
			}

			const decodedName = decodeURIComponent(customerName);
			await this.assertTokenAvailable(dlToken);
			const payload = this.dlTokenService.verifyTokenForScope({
				token: dlToken,
				scope: 'reseller-opportunities',
				customerId: decodedName,
			});
			const orgId = payload.orgId;
			if (!orgId) {
				throw new UnauthorizedException('Token missing organization context');
			}
			const customers =
				await this.resellerCustomersService.findSubscriptionsByCustomerName(
					decodedName,
					orgId,
				);

			const assets = await this.pdfService.loadTemplateAssets();

			const pages: OpportunityPageRow[] = customers.map((customer) => {
				const daysToRenewal = customer.renewalDate
					? Math.max(
							0,
							Math.ceil(
								(new Date(customer.renewalDate).getTime() - Date.now()) /
									86_400_000,
							),
						)
					: 0;
				// `currentArr` from ResellerCustomerEntity is already denominated in
				// the customer's regional currency (cost-per-user × seats × 12 using
				// the regional SKU price). Do NOT convert again — that would
				// double-multiply by USD_TO_COUNTRY_RATE and inflate INR/etc by ~94×.
				const expiringArr = customer.currentArr;

				return {
					customerId: customer.id,
					customerName: customer.customerName,
					subscriptionId: customer.id,
					resellerName: orgId,
					currentProduct: customer.currentSku,
					seatCount: customer.seats,
					expiringArr,
					region: customer.region,
					renewalDate: customer.renewalDate ?? '',
					daysToRenewal,
					scenarios: buildProposalScenarios({
						currentProduct: customer.currentSku,
						seatCount: customer.seats,
						selectedSkuIds: payload.selectedSkuIds ?? [],
						expiringArr,
						journey: 'renewal',
						region: customer.region,
					}),
				};
			});

			// Generate ZIP assets for each scenario (proposal document links)
			const assetTasks: Array<{
				pageIndex: number;
				scenarioIndex: number;
				promise: Promise<{
					endingSkuId: string;
					documentsZipUrl: string;
				}>;
			}> = [];

			for (let p = 0; p < pages.length; p += 1) {
				const page = pages[p];
				const startingSku = matchStartingSku(page.currentProduct);
				if (!startingSku) continue;

				for (let s = 0; s < page.scenarios.length; s += 1) {
					const scenario = page.scenarios[s];
					assetTasks.push({
						pageIndex: p,
						scenarioIndex: s,
						promise: this.proposalAssetService.generateSolutionZip({
							journey: 'renewal',
							customerId: page.customerId,
							customerName: page.customerName,
							opportunityId: page.subscriptionId,
							startingSkuId: startingSku.id,
							startingSkuName: startingSku.name,
							endingSkuId: scenario.endingSkuId,
							seats: page.seatCount,
							expiringArr: page.expiringArr,
							region: page.region,
						}),
					});
				}
			}

			const assetResults = await Promise.allSettled(
				assetTasks.map((task) => task.promise),
			);

			for (let i = 0; i < assetTasks.length; i += 1) {
				const task = assetTasks[i];
				const result = assetResults[i];
				if (result.status === 'fulfilled') {
					pages[task.pageIndex].scenarios[task.scenarioIndex].proposalLink =
						result.value.documentsZipUrl;
				} else {
					this.logger.warn(
						`Reseller ZIP asset generation failed for page ${task.pageIndex}, scenario ${task.scenarioIndex}: ${
							result.reason instanceof Error
								? result.reason.message
								: String(result.reason)
						}`,
					);
				}
			}

			const html = renderOpportunitiesHtml({ rows: pages, assets });
			const stream = await this.pdfService.renderStreamFromHtml({
				html,
			});

			response.setHeader(
				'Content-Disposition',
				`inline; filename="reseller-opportunities-${encodeURIComponent(decodedName)}.pdf"`,
			);
			await this.consumeDownloadToken({
				dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});

			void this.auditService.recordEvent({
				eventName: 'pdf.render.reseller_opportunities.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: decodedName,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});

			stream.pipe(response);
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.render.reseller_opportunities.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: customerName,
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
	@Get('opportunities/:customerId')
	@Header('Content-Type', 'application/pdf')
	@Header('Cache-Control', 'no-store')
	async renderOpportunities(
		@Param('customerId') customerId: string,
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			await this.assertTokenAvailable(dlToken);
			const stream = await this.pdfService.renderOpportunitiesPdf({
				customerId,
				dlToken,
			});

			response.setHeader(
				'Content-Disposition',
				`inline; filename="opportunities-${encodeURIComponent(customerId)}.pdf"`,
			);
			await this.consumeDownloadToken({
				dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});

			void this.auditService.recordEvent({
				eventName: 'pdf.render.opportunities.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'customer',
				targetId: customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});

			stream.pipe(response);
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'pdf.render.opportunities.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'customer',
				targetId: customerId,
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

function extractDlToken(url: string, baseUrl: string): string | null {
	try {
		return new URL(url, baseUrl).searchParams.get('dlToken');
	} catch {
		return null;
	}
}
