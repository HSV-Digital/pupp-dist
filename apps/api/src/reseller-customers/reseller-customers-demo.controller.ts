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
	UseGuards,
	ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { getErrorStatus, getRequestAuditFields } from '../audit/audit-request';
import { Public } from '../auth/decorators/public.decorator';
import { DemoModeGuard } from '../common/guards/demo-mode.guard';
import { getEnv } from '../config/env';
import { BulkCreateResellerCustomersDto } from './dto/bulk-create-reseller-customers.dto';
import { CreateResellerCustomerDto } from './dto/create-reseller-customer.dto';
import { ResellerCustomersQueryDto } from './dto/reseller-customers-query.dto';
import { UpdateResellerCustomerDto } from './dto/update-reseller-customer.dto';
import { ResellerCustomersService } from './reseller-customers.service';

@Public()
@UseGuards(DemoModeGuard)
@Controller('api/reseller/demo/customers')
export class ResellerCustomersDemoController {
	constructor(
		private readonly resellerCustomersService: ResellerCustomersService,
		private readonly auditService: AuditService,
	) {}

	private get demoOrgId(): string {
		return getEnv().demoResellerOrgId;
	}

	private get demoUserId(): string {
		return getEnv().demoResellerUserId;
	}

	private get auditActor() {
		return {
			actorType: 'anonymous' as const,
			actorId: null,
			tenantId: getEnv().defaultTenantId,
		};
	}

	@Get()
	async list(
		@Query() query: ResellerCustomersQueryDto,
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const result = await this.resellerCustomersService.queryDashboard(
				this.demoOrgId,
				query,
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.list.success',
				actionStatus: 'success',
				...this.auditActor,
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
				...this.auditActor,
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
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const subscriptions =
				await this.resellerCustomersService.findSubscriptionsByCustomerName(
					customerName,
					this.demoOrgId,
				);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.get.success',
				actionStatus: 'success',
				...this.auditActor,
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
				...this.auditActor,
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
		@Req() request?: Request,
	) {
		return this.findSubscriptionsByCustomerName(customerName, request);
	}

	@Get(':id')
	async findOne(@Param('id') id: string, @Req() request?: Request) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const customer = await this.resellerCustomersService.findById(
				id,
				this.demoOrgId,
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.get.success',
				actionStatus: 'success',
				...this.auditActor,
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
				...this.auditActor,
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
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const created = await this.resellerCustomersService.create(
				dto,
				this.demoOrgId,
				this.demoUserId,
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.create.success',
				actionStatus: 'success',
				...this.auditActor,
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
				...this.auditActor,
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
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const updated = await this.resellerCustomersService.update(
				id,
				dto,
				this.demoOrgId,
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.update.success',
				actionStatus: 'success',
				...this.auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				targetId: id,
				...requestAuditFields,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: { updatedFields: Object.keys(dto) },
			});

			return updated;
		} catch (error) {
			void this.auditService.recordEvent({
				eventName: 'reseller_customer.update.failure',
				actionStatus: 'failure',
				...this.auditActor,
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
	async remove(@Param('id') id: string, @Req() request?: Request) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			await this.resellerCustomersService.remove(id, this.demoOrgId);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.delete.success',
				actionStatus: 'success',
				...this.auditActor,
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
				...this.auditActor,
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

		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.flushHeaders();

		try {
			const created = await this.resellerCustomersService.bulkCreateStreaming(
				customers,
				this.demoOrgId,
				this.demoUserId,
				(saved, total) => {
					res.write(`data: ${JSON.stringify({ saved, total })}\n\n`);
				},
			);

			res.write(`data: ${JSON.stringify({ done: true, created })}\n\n`);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.bulk_create.success',
				actionStatus: 'success',
				...this.auditActor,
				sourceSystem: 'api',
				targetType: 'reseller_customer',
				...requestAuditFields,
				httpStatus: HttpStatus.OK,
				durationMs: Date.now() - startedAt,
				metadata: { count: created },
			});
		} catch (error) {
			res.write(
				`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`,
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.bulk_create.failure',
				actionStatus: 'failure',
				...this.auditActor,
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
		@Req() request?: Request,
	) {
		const requestAuditFields = getRequestAuditFields(request);
		const startedAt = Date.now();

		try {
			const created = await this.resellerCustomersService.bulkCreate(
				dto.customers,
				this.demoOrgId,
				this.demoUserId,
			);

			void this.auditService.recordEvent({
				eventName: 'reseller_customer.bulk_create.success',
				actionStatus: 'success',
				...this.auditActor,
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
				...this.auditActor,
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
