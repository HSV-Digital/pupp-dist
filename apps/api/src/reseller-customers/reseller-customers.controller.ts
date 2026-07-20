import {
	Body,
	Controller,
	Delete,
	Get,
	HttpStatus,
	Param,
	Patch,
	Post,
	Query,
	Req,
	Res,
	ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { serializeSseData } from '../common/sse';
import { resolveAuthenticatedAuditActorContext } from '../audit/audit-actor-context';
import { AuditService } from '../audit/audit.service';
import { getErrorStatus, getRequestAuditFields } from '../audit/audit-request';
import { AllowedUserTypes } from '../auth/decorators/allowed-user-types.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ResellerAuthUser } from '../auth/interfaces/auth-user.interface';
import { BulkCreateResellerCustomersDto } from './dto/bulk-create-reseller-customers.dto';
import { CreateResellerCustomerDto } from './dto/create-reseller-customer.dto';
import { ResellerCustomersQueryDto } from './dto/reseller-customers-query.dto';
import { UpdateResellerCustomerDto } from './dto/update-reseller-customer.dto';
import { ResellerCustomersService } from './reseller-customers.service';

@AllowedUserTypes('reseller')
@Controller('api/reseller/customers')
export class ResellerCustomersController {
	constructor(
		private readonly resellerCustomersService: ResellerCustomersService,
		private readonly auditService: AuditService,
	) {}

	@Get()
	async list(
		@Query() query: ResellerCustomersQueryDto,
		@CurrentUser() user: ResellerAuthUser,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuthenticatedAuditActorContext(user);

		try {
			const result = await this.resellerCustomersService.queryDashboard(
				user.orgId,
				query,
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.list.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				...requestAuditFields,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: {
					total: result.total,
					page: result.page,
					pageSize: result.pageSize,
				},
			});

			return result;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'reseller_customer.list.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				...requestAuditFields,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					error: error instanceof Error ? error.message : 'Unknown error',
				},
			});
			throw error;
		}
	}

	@Get('group/:customerName/subscriptions')
	async findSubscriptionsByCustomerName(
		@Param('customerName') customerName: string,
		@CurrentUser() user: ResellerAuthUser,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuthenticatedAuditActorContext(user);

		try {
			const subscriptions =
				await this.resellerCustomersService.findSubscriptionsByCustomerName(
					customerName,
					user.orgId,
				);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.get.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: customerName,
				...requestAuditFields,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: {
					subscriptionCount: subscriptions.length,
				},
			});

			return subscriptions;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'reseller_customer.get.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: customerName,
				...requestAuditFields,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					error: error instanceof Error ? error.message : 'Unknown error',
				},
			});
			throw error;
		}
	}

	@Get('subscriptions')
	async findSubscriptionsByCustomerNameQuery(
		@Query('customerName') customerName: string,
		@CurrentUser() user: ResellerAuthUser,
		@Req() request?: Request,
	) {
		return this.findSubscriptionsByCustomerName(customerName, user, request);
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
		@CurrentUser() user: ResellerAuthUser,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuthenticatedAuditActorContext(user);

		try {
			const customer = await this.resellerCustomersService.findById(
				id,
				user.orgId,
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.get.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: id,
				...requestAuditFields,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});

			return customer;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'reseller_customer.get.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: id,
				...requestAuditFields,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					error: error instanceof Error ? error.message : 'Unknown error',
				},
			});
			throw error;
		}
	}

	@Post()
	async create(
		@Body() dto: CreateResellerCustomerDto,
		@CurrentUser() user: ResellerAuthUser,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuthenticatedAuditActorContext(user);

		try {
			const created = await this.resellerCustomersService.create(
				dto,
				user.orgId,
				user.userId,
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.create.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: created.id,
				...requestAuditFields,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					customerName: dto.customerName,
					subscriptionName: dto.subscriptionName,
				},
			});

			return created;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'reseller_customer.create.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				...requestAuditFields,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					error: error instanceof Error ? error.message : 'Unknown error',
				},
			});
			throw error;
		}
	}

	@Patch(':id')
	async update(
		@Param('id') id: string,
		@Body() dto: UpdateResellerCustomerDto,
		@CurrentUser() user: ResellerAuthUser,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuthenticatedAuditActorContext(user);

		try {
			const updated = await this.resellerCustomersService.update(
				id,
				dto,
				user.orgId,
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.update.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: id,
				...requestAuditFields,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: {
					updatedFields: Object.keys(dto),
				},
			});

			return updated;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'reseller_customer.update.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: id,
				...requestAuditFields,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					error: error instanceof Error ? error.message : 'Unknown error',
				},
			});
			throw error;
		}
	}

	@Delete(':id')
	async remove(
		@Param('id') id: string,
		@CurrentUser() user: ResellerAuthUser,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuthenticatedAuditActorContext(user);

		try {
			await this.resellerCustomersService.remove(id, user.orgId);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.delete.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: id,
				...requestAuditFields,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
			});

			return { success: true };
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'reseller_customer.delete.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: id,
				...requestAuditFields,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					error: error instanceof Error ? error.message : 'Unknown error',
				},
			});
			throw error;
		}
	}

	@Post('bulk-stream')
	async bulkCreateStream(
		@Body(new ValidationPipe({ transform: false, whitelist: false }))
		body: { customers: CreateResellerCustomerDto[] },
		@CurrentUser() user: ResellerAuthUser,
		@Res() res: Response,
		@Req() request?: Request,
	) {
		const customers = body.customers;
		if (!Array.isArray(customers) || customers.length === 0) {
			res
				.status(HttpStatus.BAD_REQUEST)
				.json({ message: 'customers array is required' });
			return;
		}

		if (customers.length > 5000) {
			res
				.status(HttpStatus.BAD_REQUEST)
				.json({ message: 'Maximum 5000 customers per bulk request' });
			return;
		}

		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuthenticatedAuditActorContext(user);

		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.flushHeaders();

		try {
			const created = await this.resellerCustomersService.bulkCreateStreaming(
				customers,
				user.orgId,
				user.userId,
				(saved, total) => {
					res.write(serializeSseData({ saved, total }));
				},
			);

			res.write(serializeSseData({ done: true, created }));

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.bulk_create.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				...requestAuditFields,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: { count: created },
			});
		} catch (error) {
			res.write(
				serializeSseData({
					error: error instanceof Error ? error.message : 'Unknown error',
				}),
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.bulk_create.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				...requestAuditFields,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					count: customers.length,
					error: error instanceof Error ? error.message : 'Unknown error',
				},
			});
		} finally {
			res.end();
		}
	}

	@Post('bulk')
	async bulkCreate(
		@Body() dto: BulkCreateResellerCustomersDto,
		@CurrentUser() user: ResellerAuthUser,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();
		const auditActor = resolveAuthenticatedAuditActorContext(user);

		try {
			const created = await this.resellerCustomersService.bulkCreate(
				dto.customers,
				user.orgId,
				user.userId,
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.bulk_create.success',
				actionStatus: 'success',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				...requestAuditFields,
				httpStatus: HttpStatus.CREATED,
				durationMs: Date.now() - startedAt,
				metadata: {
					count: created.length,
				},
			});

			return { created: created.length, customers: created };
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'reseller_customer.bulk_create.failure',
				actionStatus: 'failure',
				...auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				...requestAuditFields,
				httpStatus: getErrorStatus(error) ?? HttpStatus.INTERNAL_SERVER_ERROR,
				durationMs: Date.now() - startedAt,
				metadata: {
					count: dto.customers.length,
					error: error instanceof Error ? error.message : 'Unknown error',
				},
			});
			throw error;
		}
	}
}
