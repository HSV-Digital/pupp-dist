import { randomUUID } from 'node:crypto';
import {
	BadRequestException,
	Body,
	Controller,
	ForbiddenException,
	Get,
	Header,
	HttpStatus,
	Logger,
	Optional,
	Post,
	Query,
	Req,
	Res,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { RenewalSubscription } from '@repo/types';
import { AdminAnalyticsDownloadTrackingService } from '../admin-analytics/admin-analytics-download-tracking.service';
import {
	resolveAuditActorContext,
	resolveAuthenticatedAuditActorContext,
} from '../audit/audit-actor-context';
import { AuditService } from '../audit/audit.service';
import { getErrorStatus, getRequestAuditFields } from '../audit/audit-request';
import { AllowedUserTypes } from '../auth/decorators/allowed-user-types.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type {
	AuthenticatedPrincipal,
	AuthUser,
} from '../auth/interfaces/auth-user.interface';
import { DemoThrottleGuard } from '../common/guards/demo-throttle.guard';
import { DemoModeGuard } from '../common/guards/demo-mode.guard';
import { PublicThrottleGuard } from '../common/guards/public-throttle.guard';
import { getEnv } from '../config/env';
import { ResellerCustomersService } from '../reseller-customers/reseller-customers.service';
import { MailService } from '../mail/mail.service';
import { DlTokenService } from '../pdf/dl-token.service';
import { PdfAsyncService } from '../pdf/pdf-async.service';
import { CreateCustomerProposalEmailLinkDto } from './dto/create-customer-proposal-email-link.dto';
import { CreateOpportunityListEmailLinkDto } from './dto/create-opportunity-list-email-link.dto';
import { CreateOpportunityListEmailWithPdfLinkDto } from './dto/create-opportunity-list-email-with-pdf-link.dto';
import { CreateProposalPptSessionDto } from './dto/create-proposal-ppt-session.dto';
import { UploadProposalPptsDto } from './dto/upload-proposal-ppts.dto';
import { CreateProposalOptionsEmailLinkPayloadDto } from './dto/create-proposal-options-email-link.dto';
import {
	GenerateProposalAssetLineItemDto,
	GenerateProposalAssetLineItemPublicDto,
	LoadProposalAssetsDto,
	LoadProposalAssetsPublicDto,
} from './dto/load-proposal-assets.dto';
import {
	type ProposalAssetLineItemResponse,
	type ProposalAssetsLoadResponse,
	type ProposalIssuanceContext,
	type ProposalAssetSelectionInput,
	ProposalOptionsEmailService,
	type UploadedImageFile,
} from './proposal-options-email.service';
import { ProposalGenerationTrackingService } from './proposal-generation-tracking.service';

const SCENARIO_SCREENSHOT_FIELD_NAME = 'scenarioCardsImage';
const MAX_SCENARIO_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const DOCX_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.presentationml.presentation';

interface FileFilterCandidate {
	mimetype?: string;
}

type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

type ProposalIssuanceUser = Pick<AuthenticatedPrincipal, 'tenantId' | 'userId'>;

function isUploadedImageFile(value: unknown): value is UploadedImageFile {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const maybeFile = value as Partial<UploadedImageFile>;
	return (
		typeof maybeFile.originalname === 'string' &&
		typeof maybeFile.mimetype === 'string' &&
		typeof maybeFile.size === 'number' &&
		Buffer.isBuffer(maybeFile.buffer)
	);
}

function parsePayloadField(
	value: unknown,
): CreateProposalOptionsEmailLinkPayloadDto {
	let raw: unknown = value;
	if (typeof value === 'string') {
		try {
			raw = JSON.parse(value);
		} catch {
			throw new BadRequestException('Invalid JSON in multipart payload field');
		}
	}

	const dto = plainToInstance(CreateProposalOptionsEmailLinkPayloadDto, raw);
	const errors = validateSync(dto, {
		whitelist: true,
		forbidNonWhitelisted: true,
	});
	if (errors.length > 0) {
		throw new BadRequestException(errors);
	}

	return dto;
}

@Controller('api/email')
export class EmailController {
	private readonly env = getEnv();
	private readonly logger = new Logger(EmailController.name);

	constructor(
		private readonly emailService: ProposalOptionsEmailService,
		private readonly auditService: AuditService,
		private readonly resellerCustomersService: ResellerCustomersService,
		private readonly proposalGenerationTrackingService: ProposalGenerationTrackingService,
		private readonly mailService: MailService,
		private readonly pdfAsyncService: PdfAsyncService,
		@Optional() private readonly dlTokenService?: DlTokenService,
		@Optional()
		private readonly adminAnalyticsDownloadTrackingService?: AdminAnalyticsDownloadTrackingService,
	) {}

	@Post('proposal-options/link')
	@UseInterceptors(
		FileInterceptor(SCENARIO_SCREENSHOT_FIELD_NAME, {
			limits: {
				fileSize: MAX_SCENARIO_SCREENSHOT_BYTES,
			},
			fileFilter: (
				_request: unknown,
				file: FileFilterCandidate,
				callback: FileFilterCallback,
			) => {
				const mimeType = file.mimetype?.toLowerCase() ?? '';
				if (
					mimeType.length > 0 &&
					mimeType !== 'image/png' &&
					mimeType !== 'image/jpeg' &&
					mimeType !== 'image/webp'
				) {
					callback(
						new BadRequestException('Screenshot must be PNG, JPEG, or WEBP'),
						false,
					);
					return;
				}
				callback(null, true);
			},
		}),
	)
	async createProposalOptionsLink(
		@Body('payload') payloadRaw: unknown,
		@UploadedFile() screenshotFile: unknown,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): Promise<{ url: string; expiresAt: string }> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		let payload: CreateProposalOptionsEmailLinkPayloadDto | null = null;

		try {
			payload = parsePayloadField(payloadRaw);
			const result = await this.emailService.createProposalOptionsEmailLink({
				payload: payload,
				screenshotFile: isUploadedImageFile(screenshotFile)
					? screenshotFile
					: undefined,
			});

			void this.auditService.recordEvent({
				eventName: 'email.proposal_options.link.create.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-options-email',
				targetId: payload.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: payload.journey,
					filter: payload.filter,
					startingSkuId: payload.startingSkuId,
					selectedEndingSkuCount: payload.selectedEndingSkuIds.length,
					screenshotIncluded: isUploadedImageFile(screenshotFile),
				},
			});

			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'email.proposal_options.link.create.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-options-email',
				targetId: payload?.customerId ?? null,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: payload?.journey,
					filter: payload?.filter,
					startingSkuId: payload?.startingSkuId,
					selectedEndingSkuCount: payload?.selectedEndingSkuIds.length,
					screenshotIncluded: isUploadedImageFile(screenshotFile),
					payloadValidationFailed: payload === null,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});

			throw error;
		}
	}

	@Post('opportunity-list/link')
	createOpportunityListLink(
		@Body() body: CreateOpportunityListEmailLinkDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): { url: string; expiresAt: string } {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result = this.emailService.createOpportunityListEmailLink(body);
			void this.auditService.recordEvent({
				eventName: 'email.opportunity_list.link.create.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'opportunity-list-email',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					viewMode: body.viewMode,
					selectedSkuCount: body.selectedSkuIds.length,
				},
			});
			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'email.opportunity_list.link.create.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'opportunity-list-email',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					viewMode: body.viewMode,
					selectedSkuCount: body.selectedSkuIds?.length,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});
			throw error;
		}
	}

	@Post('opportunity-list/link-with-pdf')
	async createOpportunityListLinkWithPdf(
		@Body() body: CreateOpportunityListEmailWithPdfLinkDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): Promise<{ url: string; expiresAt: string }> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			if (!user?.entraObjectId) {
				throw new ForbiddenException('Missing authenticated user context');
			}

			// Validate PDF job exists and belongs to current user
			const job = await this.pdfAsyncService.getJobByIdForOwner(
				body.pdfJobId,
				user.entraObjectId,
			);

			if (job.status !== 'completed') {
				throw new BadRequestException(
					'PDF job must be completed before generating email link',
				);
			}

			// Decrypt the PDF password
			const password = await this.pdfAsyncService.getJobPasswordForProcessing(
				body.pdfJobId,
			);

			// Generate DOCX email link with pdfDownloadUrl embedded
			const result = this.emailService.createOpportunityListEmailLink(body, {
				pdfDownloadUrl: body.pdfDownloadUrl,
			});

			// Fire-and-forget: send password email to current user
			const recipientEmail = user.canonicalEmail ?? user.email;
			const recipientName = user.name ?? recipientEmail;
			const listType =
				body.viewMode === 'reseller' ? 'Reseller List' : 'Customer List';

			void this.mailService.sendPdfPasswordEmail({
				to: recipientEmail,
				recipientName,
				password,
				listType,
			});

			// Mark password as revealed
			try {
				await this.pdfAsyncService.revealJobPasswordForOwner(
					body.pdfJobId,
					user.entraObjectId,
				);
			} catch {
				// Password may have already been revealed; not critical
			}

			void this.auditService.recordEvent({
				eventName:
					'email.opportunity_list.link.create.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'opportunity-list-email',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					viewMode: body.viewMode,
					selectedSkuCount: body.selectedSkuIds.length,
					pdfJobId: body.pdfJobId,
				},
			});

			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName:
					'email.opportunity_list.link.create.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'opportunity-list-email',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					viewMode: body.viewMode,
					selectedSkuCount: body.selectedSkuIds?.length,
					pdfJobId: body.pdfJobId,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});
			throw error;
		}
	}

	@Post('customer-proposal/link')
	createCustomerProposalLink(
		@Body() body: CreateCustomerProposalEmailLinkDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): { url: string; expiresAt: string } {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result = this.emailService.createCustomerProposalEmailLink(body);
			void this.auditService.recordEvent({
				eventName: 'email.customer_proposal.link.create.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'customer-proposal-email',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					scenarioCount: body.scenarios.length,
				},
			});
			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'email.customer_proposal.link.create.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'customer-proposal-email',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					scenarioCount: body.scenarios?.length,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});
			throw error;
		}
	}

	@Public()
	@UseGuards(PublicThrottleGuard)
	@Throttle({ default: { limit: 2, ttl: 60000 } })
	@Post('partner-proposal/link')
	createPartnerProposalLink(
		@Body() body: CreateCustomerProposalEmailLinkDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): { url: string; expiresAt: string } {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result = this.emailService.createPartnerProposalEmailLink(body);
			void this.auditService.recordEvent({
				eventName: 'email.partner_proposal.link.create.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'partner-proposal-email',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					scenarioCount: body.scenarios.length,
				},
			});
			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'email.partner_proposal.link.create.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'partner-proposal-email',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					scenarioCount: body.scenarios?.length,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});
			throw error;
		}
	}

	@Public()
	@UseGuards(PublicThrottleGuard)
	@Throttle({ default: { limit: 2, ttl: 60000 } })
	@Post('proposal-assets/link')
	createProposalAssetsBundleLink(
		@Body() body: CreateProposalPptSessionDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): { url: string; expiresAt: string } {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const issuanceContext = this.buildProposalIssuanceContext({
				user,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});
			const result = issuanceContext
				? this.emailService.createProposalAssetsBundleLink(
						body,
						issuanceContext,
					)
				: this.emailService.createProposalAssetsBundleLink(body);
			void this.auditService.recordEvent({
				eventName: 'proposal.assets.link.create.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-assets-bundle',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					mode: body.mode,
					journey: body.journey,
					scenarioCount: body.scenarios.length,
				},
			});
			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'proposal.assets.link.create.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-assets-bundle',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					mode: body.mode,
					journey: body.journey,
					scenarioCount: body.scenarios?.length,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});
			throw error;
		}
	}

	@Post('proposal-ppt/upload')
	async uploadProposalPpts(
		@Body() body: UploadProposalPptsDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): Promise<{
		results: Array<{ key: string; blobUrl: string; fileName: string }>;
		uploadedAt: string;
	}> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result = await this.emailService.uploadProposalPpts(body);
			void this.auditService.recordEvent({
				eventName: 'proposal.ppt.upload.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-ppt',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					scenarioCount: body.scenarios.length,
					uploadedCount: result.results.length,
				},
			});
			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'proposal.ppt.upload.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-ppt',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					scenarioCount: body.scenarios?.length,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});
			throw error;
		}
	}

	@Post('proposal-assets/load')
	@AllowedUserTypes('internal', 'reseller')
	async loadProposalAssets(
		@Body() body: LoadProposalAssetsDto,
		@CurrentUser() user: AuthenticatedPrincipal,
		@Req() request?: Request,
	): Promise<ProposalAssetsLoadResponse> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const generationRequestId = randomUUID();

		try {
			const subscriptions = await this.resolveAuthenticatedSubscriptions({
				customerId: body.customerId,
				customerSource: body.customerSource,
				user,
			});
			const customerName = subscriptions[0]?.customerName ?? body.customerId;
			const result =
				await this.emailService.loadProposalAssetsFromSubscriptions({
					journey: body.journey,
					customerId: body.customerId,
					customerName,
					subscriptions,
					selections: body.selections as ProposalAssetSelectionInput[],
					currency: body.currency,
					partnerFilters: body.partnerFilters,
					...this.withProposalIssuanceContext({
						user,
						requestId: requestAuditFields.requestId,
						route: requestAuditFields.route,
					}),
				});

			await this.proposalGenerationTrackingService.recordLoadSuccess({
				customerId: body.customerId,
				customerSource: body.customerSource,
				durationMs: Date.now() - startedAt,
				generationRequestId,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				journey: body.journey,
				lineItemCount: result.assets.lineItems.length,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				selectedScenarios: result.selectedScenarios,
				selections: body.selections as ProposalAssetSelectionInput[],
				subscriptionCount: subscriptions.length,
				user,
			});

			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'proposal.assets.load.failure',
				actionStatus: 'failure',
				...resolveAuthenticatedAuditActorContext(user),
				sourceSystem: 'api',
				targetType: 'proposal-assets',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					customerSource: body.customerSource,
					selectionCount: body.selections?.length,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});
			throw error;
		}
	}

	@Public()
	@Post('proposal-assets/load-public')
	async loadProposalAssetsPublic(
		@Body() body: LoadProposalAssetsPublicDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): Promise<ProposalAssetsLoadResponse> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result =
				await this.emailService.loadProposalAssetsFromSubscriptions({
					journey: body.journey,
					customerId: body.customerSnapshot.customerId,
					customerName: body.customerSnapshot.customerName,
					subscriptions: body.customerSnapshot
						.subscriptions as RenewalSubscription[],
					selections: body.selections as ProposalAssetSelectionInput[],
					useChatToPaidFlyers: body.useChatToPaidFlyers,
					currency: body.currency,
					partnerFilters: body.partnerFilters,
					...this.withProposalIssuanceContext({
						user,
						requestId: requestAuditFields.requestId,
						route: requestAuditFields.route,
					}),
				});

			void this.auditService.recordEvent({
				eventName: 'proposal.assets.load_public.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-assets',
				targetId: body.customerSnapshot.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					selectionCount: body.selections.length,
					subscriptionCount: body.customerSnapshot.subscriptions.length,
					lineItemCount: result.assets.lineItems.length,
				},
			});

			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'proposal.assets.load_public.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-assets',
				targetId: body.customerSnapshot?.customerId ?? null,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					selectionCount: body.selections?.length,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});
			throw error;
		}
	}

	@Post('proposal-assets/line-item/generate')
	@AllowedUserTypes('internal', 'reseller')
	async generateProposalAssetsLineItem(
		@Body() body: GenerateProposalAssetLineItemDto,
		@CurrentUser() user: AuthenticatedPrincipal,
		@Req() request?: Request,
	): Promise<ProposalAssetLineItemResponse> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const subscriptions = await this.resolveAuthenticatedSubscriptions({
				customerId: body.customerId,
				customerSource: body.customerSource,
				user,
			});
			const customerName = subscriptions[0]?.customerName ?? body.customerId;
			const result =
				await this.emailService.generateProposalLineItemAssetFromSubscriptions({
					journey: body.journey,
					customerId: body.customerId,
					customerName,
					subscriptions,
					selection: body.selection as ProposalAssetSelectionInput,
					selectionContext: body.selectionContext,
					currency: body.currency,
					partnerFilters: body.partnerFilters,
				});

			void this.auditService.recordEvent({
				eventName: 'proposal.assets.line_item.generate.success',
				actionStatus: 'success',
				...resolveAuthenticatedAuditActorContext(user),
				sourceSystem: 'api',
				targetType: 'proposal-assets',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					customerSource: body.customerSource,
					opportunityId: body.selection.opportunityId,
					endingSkuId: body.selection.endingSkuId,
					seats: body.selection.seats,
				},
			});

			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'proposal.assets.line_item.generate.failure',
				actionStatus: 'failure',
				...resolveAuthenticatedAuditActorContext(user),
				sourceSystem: 'api',
				targetType: 'proposal-assets',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					customerSource: body.customerSource,
					opportunityId: body.selection?.opportunityId,
					endingSkuId: body.selection?.endingSkuId,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});
			throw error;
		}
	}

	@Public()
	@Post('proposal-assets/line-item/generate-public')
	async generateProposalAssetsLineItemPublic(
		@Body() body: GenerateProposalAssetLineItemPublicDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): Promise<ProposalAssetLineItemResponse> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result =
				await this.emailService.generateProposalLineItemAssetFromSubscriptions({
					journey: body.journey,
					customerId: body.customerSnapshot.customerId,
					customerName: body.customerSnapshot.customerName,
					subscriptions: body.customerSnapshot
						.subscriptions as RenewalSubscription[],
					selection: body.selection as ProposalAssetSelectionInput,
					selectionContext: body.selectionContext,
					useChatToPaidFlyers: body.useChatToPaidFlyers,
					currency: body.currency,
					partnerFilters: body.partnerFilters,
				});

			void this.auditService.recordEvent({
				eventName: 'proposal.assets.line_item.generate_public.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-assets',
				targetId: body.customerSnapshot.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					opportunityId: body.selection.opportunityId,
					endingSkuId: body.selection.endingSkuId,
					seats: body.selection.seats,
				},
			});

			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'proposal.assets.line_item.generate_public.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-assets',
				targetId: body.customerSnapshot?.customerId ?? null,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: body.journey,
					opportunityId: body.selection?.opportunityId,
					endingSkuId: body.selection?.endingSkuId,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});
			throw error;
		}
	}

	@Post('proposal-ppt/session')
	createProposalPptSession(
		@Body() body: CreateProposalPptSessionDto,
		@CurrentUser() user?: AuthUser,
		@Req() request?: Request,
	): {
		token: string;
		renderUrl: string;
		downloadUrl: string;
		expiresAt: string;
	} {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const issuanceContext = this.buildProposalIssuanceContext({
				user,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});
			const result = issuanceContext
				? this.emailService.createProposalPptSession(body, issuanceContext)
				: this.emailService.createProposalPptSession(body);
			void this.auditService.recordEvent({
				eventName: 'proposal.ppt.session.create.success',
				actionStatus: 'success',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-ppt',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					mode: body.mode,
					journey: body.journey,
					scenarioCount: body.scenarios.length,
				},
			});
			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'proposal.ppt.session.create.failure',
				actionStatus: 'failure',
				...resolveAuditActorContext(user, this.env.defaultTenantId),
				sourceSystem: 'api',
				targetType: 'proposal-ppt',
				targetId: body.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					mode: body.mode,
					journey: body.journey,
					scenarioCount: body.scenarios?.length,
					errorType: error instanceof Error ? error.name : 'UnknownError',
				},
			});
			throw error;
		}
	}

	@Public()
	@UseGuards(DemoModeGuard, DemoThrottleGuard)
	@Post('demo/proposal-options/link')
	@UseInterceptors(
		FileInterceptor(SCENARIO_SCREENSHOT_FIELD_NAME, {
			limits: {
				fileSize: MAX_SCENARIO_SCREENSHOT_BYTES,
			},
			fileFilter: (
				_request: unknown,
				file: FileFilterCandidate,
				callback: FileFilterCallback,
			) => {
				const mimeType = file.mimetype?.toLowerCase() ?? '';
				if (
					mimeType.length > 0 &&
					mimeType !== 'image/png' &&
					mimeType !== 'image/jpeg' &&
					mimeType !== 'image/webp'
				) {
					callback(
						new BadRequestException('Screenshot must be PNG, JPEG, or WEBP'),
						false,
					);
					return;
				}
				callback(null, true);
			},
		}),
	)
	async createDemoProposalOptionsLink(
		@Body('payload') payloadRaw: unknown,
		@UploadedFile() screenshotFile: unknown,
		@Req() request?: Request,
	): Promise<{ url: string; expiresAt: string }> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		let payload: CreateProposalOptionsEmailLinkPayloadDto | null = null;

		try {
			payload = parsePayloadField(payloadRaw);
			const result = await this.emailService.createProposalOptionsEmailLink({
				payload: payload,
				screenshotFile: isUploadedImageFile(screenshotFile)
					? screenshotFile
					: undefined,
			});

			void this.auditService.recordEvent({
				eventName: 'email.demo.proposal_options.link.create.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'proposal-options-email',
				targetId: payload.customerId,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					journey: payload.journey,
					filter: payload.filter,
					startingSkuId: payload.startingSkuId,
					selectedEndingSkuCount: payload.selectedEndingSkuIds.length,
					screenshotIncluded: isUploadedImageFile(screenshotFile),
					demo: true,
				},
			});

			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'email.demo.proposal_options.link.create.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'proposal-options-email',
				targetId: payload?.customerId ?? null,
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
	@Post('demo/opportunity-list/link')
	createDemoOpportunityListLink(
		@Body() body: CreateOpportunityListEmailLinkDto,
		@Req() request?: Request,
	): { url: string; expiresAt: string } {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result = this.emailService.createOpportunityListEmailLink(body, {
				pdfDownloadUrl: body.pdfDownloadUrl,
			});
			void this.auditService.recordEvent({
				eventName: 'email.demo.opportunity_list.link.create.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'opportunity-list-email',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					viewMode: body.viewMode,
					selectedSkuCount: body.selectedSkuIds.length,
					demo: true,
				},
			});
			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'email.demo.opportunity_list.link.create.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'opportunity-list-email',
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

	private async resolveAuthenticatedSubscriptions(params: {
		customerId: string;
		customerSource: 'dashboard' | 'partner_customer' | 'reseller_customer';
		user: AuthenticatedPrincipal;
	}): Promise<RenewalSubscription[]> {
		if (params.customerSource !== 'reseller_customer') {
			throw new ForbiddenException(
				'Only reseller customer data is supported',
			);
		}
		if (!params.user.orgId) {
			throw new BadRequestException(
				'Reseller customer source requires an organization context',
			);
		}
		const resellerCustomers =
			await this.resellerCustomersService.findSubscriptionsByCustomerName(
				params.customerId,
				params.user.orgId,
			);

		return resellerCustomers.map((customer) =>
			this.emailService.createSyntheticSubscriptionForNewCustomer({
				customerId: params.customerId,
				subscriptionId: customer.id,
				partnerName: customer.orgId,
				customerName: customer.customerName,
				currentSku: customer.currentSku,
				seatCount: customer.seats,
				costPerUser: customer.costPerUser,
				region: customer.region,
			}),
		);
	}

	@Public()
	@UseGuards(PublicThrottleGuard)
	@Get('proposal-options/download')
	@Header('Content-Type', DOCX_CONTENT_TYPE)
	@Header('Cache-Control', 'no-store')
	async downloadProposalOptionsEmail(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			await this.dlTokenService?.assertTokenAvailable(dlToken);
			const buffer =
				await this.emailService.renderProposalOptionsEmailFromToken(dlToken);
			await this.dlTokenService?.consumeToken({
				token: dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});
			response.setHeader(
				'Content-Disposition',
				'attachment; filename="proposal-options-email.docx"',
			);
			response.status(HttpStatus.OK).send(buffer);

			void this.auditService.recordEvent({
				eventName: 'email.proposal_options.render.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'proposal-options-email',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'email.proposal_options.render.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'proposal-options-email',
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
	@Get('opportunity-list/download')
	@Header('Content-Type', DOCX_CONTENT_TYPE)
	@Header('Cache-Control', 'no-store')
	async downloadOpportunityListEmail(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			await this.dlTokenService?.assertTokenAvailable(dlToken);
			const buffer =
				await this.emailService.renderOpportunityListEmailFromToken(dlToken);
			await this.dlTokenService?.consumeToken({
				token: dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});
			response.setHeader(
				'Content-Disposition',
				'attachment; filename="opportunity-list-email.docx"',
			);
			response.status(HttpStatus.OK).send(buffer);

			void this.auditService.recordEvent({
				eventName: 'email.opportunity_list.render.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'opportunity-list-email',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'email.opportunity_list.render.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'opportunity-list-email',
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
	@Get('customer-proposal/download')
	@Header('Content-Type', DOCX_CONTENT_TYPE)
	@Header('Cache-Control', 'no-store')
	async downloadCustomerProposalEmail(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			await this.dlTokenService?.assertTokenAvailable(dlToken);
			const buffer =
				await this.emailService.renderCustomerProposalEmailFromToken(dlToken);
			await this.dlTokenService?.consumeToken({
				token: dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});
			response.setHeader(
				'Content-Disposition',
				'attachment; filename="customer-proposal-email.docx"',
			);
			response.status(HttpStatus.OK).send(buffer);

			void this.auditService.recordEvent({
				eventName: 'email.customer_proposal.render.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'customer-proposal-email',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'email.customer_proposal.render.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'customer-proposal-email',
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
	@Get('partner-proposal/download')
	@Header('Content-Type', DOCX_CONTENT_TYPE)
	@Header('Cache-Control', 'no-store')
	async downloadPartnerProposalEmail(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			await this.dlTokenService?.assertTokenAvailable(dlToken);
			const buffer =
				await this.emailService.renderPartnerProposalEmailFromToken(dlToken);
			await this.dlTokenService?.consumeToken({
				token: dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});
			response.setHeader(
				'Content-Disposition',
				'attachment; filename="partner-proposal-email.docx"',
			);
			response.status(HttpStatus.OK).send(buffer);

			void this.auditService.recordEvent({
				eventName: 'email.partner_proposal.render.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'partner-proposal-email',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'email.partner_proposal.render.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'partner-proposal-email',
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
	@Get('proposal-assets/download')
	@Header('Cache-Control', 'no-store')
	async downloadProposalAssetsBundle(
		@Query('dlToken') dlToken: string | undefined,
		@Query('file') file: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		if (file && file !== 'ppt' && file !== 'email') {
			throw new BadRequestException(
				`Invalid file parameter: "${file}". Must be "ppt" or "email".`,
			);
		}

		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result =
				await this.emailService.renderProposalAssetsBundleFromToken(
					dlToken,
					file as 'ppt' | 'email' | undefined,
				);
			response.setHeader('Content-Type', result.contentType);
			response.setHeader(
				'Content-Disposition',
				`attachment; filename="${result.fileName}"`,
			);
			response.status(HttpStatus.OK).send(result.buffer);

			void this.auditService.recordEvent({
				eventName: 'proposal.assets.download.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'proposal-assets-bundle',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});
			await this.recordProposalDownload({
				dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'proposal.assets.download.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'proposal-assets-bundle',
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
	@Get('proposal-ppt/render')
	@Header('Content-Type', PPTX_CONTENT_TYPE)
	@Header('Cache-Control', 'no-store')
	async renderProposalPpt(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			await this.dlTokenService?.assertTokenAvailable(dlToken);
			const result =
				await this.emailService.renderProposalPptFromToken(dlToken);
			await this.dlTokenService?.consumeToken({
				token: dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});
			response.setHeader(
				'Content-Disposition',
				`inline; filename="${result.fileName}"`,
			);
			response.status(HttpStatus.OK).send(result.buffer);

			void this.auditService.recordEvent({
				eventName: 'proposal.ppt.render.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'proposal-ppt',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'proposal.ppt.render.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'proposal-ppt',
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
	@Get('proposal-ppt/download')
	@Header('Content-Type', PPTX_CONTENT_TYPE)
	@Header('Cache-Control', 'no-store')
	async downloadProposalPpt(
		@Query('dlToken') dlToken: string | undefined,
		@Res() response: Response,
		@Req() request?: Request,
	): Promise<void> {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result =
				await this.emailService.renderProposalPptFromToken(dlToken);
			response.setHeader(
				'Content-Disposition',
				`attachment; filename="${result.fileName}"`,
			);
			response.status(HttpStatus.OK).send(result.buffer);

			void this.auditService.recordEvent({
				eventName: 'proposal.ppt.download.success',
				actionStatus: 'success',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'proposal-ppt',
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
				httpMethod: requestAuditFields.httpMethod,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});
			await this.recordProposalDownload({
				dlToken,
				requestId: requestAuditFields.requestId,
				route: requestAuditFields.route,
			});
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'proposal.ppt.download.failure',
				actionStatus: 'failure',
				actorType: 'anonymous',
				tenantId: this.env.defaultTenantId,
				sourceSystem: 'api',
				targetType: 'proposal-ppt',
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

	private async recordProposalDownload(params: {
		dlToken: string | undefined;
		requestId?: string | null;
		route?: string | null;
	}): Promise<void> {
		if (!this.dlTokenService || !this.adminAnalyticsDownloadTrackingService) {
			return;
		}

		try {
			const tokenPayload = this.dlTokenService.readTokenPayload(params.dlToken);
			await this.adminAnalyticsDownloadTrackingService.recordProposalDownload({
				tokenPayload,
				requestId: params.requestId,
				route: params.route,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			this.logger.warn(
				`Failed to record proposal download analytics: ${message}`,
			);
		}
	}

	private withProposalIssuanceContext(params: {
		user?: ProposalIssuanceUser;
		requestId?: string | null;
		route?: string | null;
	}): { issuanceContext: ProposalIssuanceContext } | Record<string, never> {
		const issuanceContext = this.buildProposalIssuanceContext(params);
		return issuanceContext ? { issuanceContext } : {};
	}

	private buildProposalIssuanceContext(params: {
		user?: ProposalIssuanceUser;
		requestId?: string | null;
		route?: string | null;
	}): ProposalIssuanceContext | undefined {
		const issuanceContext: ProposalIssuanceContext = {
			actorId: params.user?.userId ?? null,
			tenantId: params.user?.tenantId ?? null,
			requestId: params.requestId ?? null,
			route: params.route ?? null,
		};

		const hasContext = Object.values(issuanceContext).some(
			(value) => value !== null && value !== undefined,
		);

		return hasContext ? issuanceContext : undefined;
	}
}
