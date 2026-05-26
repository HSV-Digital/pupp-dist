import crypto from 'node:crypto';
import {
	and,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	lte,
	or,
	sql,
	type SQL,
} from 'drizzle-orm';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import { auditEvents, resellerAuditEvents, users } from '../database/schema';
import { PostHogService } from '../posthog/posthog.service';
import { formatDatabaseErrorDetails } from './database-error';
import type {
	AuditEventListResponse,
	AuditEventQuery,
	AuditEventRecord,
	AuditUserType,
	CreateAuditEventInput,
} from './audit.types';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

interface AuditEventInsertOverrides {
	id?: string;
	occurredAt?: Date;
}

export function buildAuditEventInsertValues(
	input: CreateAuditEventInput,
	overrides: AuditEventInsertOverrides = {},
) {
	return {
		id: overrides.id ?? crypto.randomUUID(),
		occurredAt: overrides.occurredAt ?? new Date(),
		eventName: input.eventName,
		actionStatus: input.actionStatus,
		actorType: input.actorType,
		actorId: input.actorId ?? null,
		tenantId: input.tenantId,
		sourceSystem: input.sourceSystem,
		targetType: input.targetType ?? null,
		targetId: input.targetId ?? null,
		requestId: input.requestId ?? null,
		route: input.route ?? null,
		httpMethod: input.httpMethod ?? null,
		httpStatus: input.httpStatus ?? null,
		durationMs: input.durationMs ?? null,
		metadata: input.metadata ?? {},
	};
}

export function buildResellerAuditEventInsertValues(
	input: CreateAuditEventInput & { orgId: string },
	overrides: AuditEventInsertOverrides = {},
) {
	return {
		...buildAuditEventInsertValues(input, overrides),
		orgId: input.orgId,
	};
}

export function isResellerAuditUserType(
	userType: AuditUserType | undefined,
): userType is 'reseller' {
	return userType === 'reseller';
}

@Injectable()
export class AuditService implements OnModuleDestroy {
	private readonly logger = new Logger(AuditService.name);
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;
	private readonly sql = this.databaseClient.sql;

	constructor(private readonly posthogService: PostHogService) {}

	async recordEvent(input: CreateAuditEventInput): Promise<void> {
		try {
			if (isResellerAuditUserType(input.userType) && input.orgId) {
				const values = buildResellerAuditEventInsertValues({
					...input,
					orgId: input.orgId,
				});
				await this.db.insert(resellerAuditEvents).values(values);
			} else {
				const values = buildAuditEventInsertValues(input);
				await this.db.insert(auditEvents).values(values);
			}

			this.posthogService.capture({
				event: input.eventName,
				properties: {
					userType: input.userType ?? 'internal',
					actionStatus: input.actionStatus,
					actorType: input.actorType,
					actorId: input.actorId ?? null,
					tenantId: input.tenantId,
					sourceSystem: input.sourceSystem,
					targetType: input.targetType ?? null,
					targetId: input.targetId ?? null,
					requestId: input.requestId ?? null,
					route: input.route ?? null,
					httpMethod: input.httpMethod ?? null,
					httpStatus: input.httpStatus ?? null,
					durationMs: input.durationMs ?? null,
					metadata: input.metadata ?? {},
				},
			});
		} catch (error) {
			const details = formatDatabaseErrorDetails(error);
			const message = details
				? `Failed to persist audit event ${input.eventName}. ${details}`
				: `Failed to persist audit event ${input.eventName}`;
			this.logger.error(
				message,
				error instanceof Error ? error.stack : undefined,
			);
		}
	}

	async listEvents(query: AuditEventQuery): Promise<AuditEventListResponse> {
		const page = sanitizePage(query.page);
		const pageSize = sanitizePageSize(query.pageSize);
		const offset = (page - 1) * pageSize;
		const whereClause = buildWhereClause(query);
		const actorJoinCondition = buildActorJoinCondition();

		const totalRows = whereClause
			? await this.db
					.select({ value: sql<number>`count(*)` })
					.from(auditEvents)
					.leftJoin(users, actorJoinCondition)
					.where(whereClause)
			: await this.db
					.select({ value: sql<number>`count(*)` })
					.from(auditEvents)
					.leftJoin(users, actorJoinCondition);

		const total = Number(totalRows[0]?.value ?? 0);

		const rows = whereClause
			? await this.db
					.select(AUDIT_EVENT_ROW_SELECTION)
					.from(auditEvents)
					.leftJoin(users, actorJoinCondition)
					.where(whereClause)
					.orderBy(desc(auditEvents.occurredAt))
					.limit(pageSize)
					.offset(offset)
			: await this.db
					.select(AUDIT_EVENT_ROW_SELECTION)
					.from(auditEvents)
					.leftJoin(users, actorJoinCondition)
					.orderBy(desc(auditEvents.occurredAt))
					.limit(pageSize)
					.offset(offset);

		return {
			page,
			pageSize,
			total,
			rows: rows.map(mapAuditRecord),
		};
	}

	async getEventById(id: string): Promise<AuditEventRecord | null> {
		const [row] = await this.db
			.select(AUDIT_EVENT_ROW_SELECTION)
			.from(auditEvents)
			.leftJoin(users, buildActorJoinCondition())
			.where(eq(auditEvents.id, id))
			.limit(1);

		if (!row) {
			return null;
		}

		return mapAuditRecord(row);
	}

	async onModuleDestroy(): Promise<void> {
		await this.sql.end();
	}
}

const AUDIT_EVENT_ROW_SELECTION = {
	id: auditEvents.id,
	occurredAt: auditEvents.occurredAt,
	eventName: auditEvents.eventName,
	actionStatus: auditEvents.actionStatus,
	actorType: auditEvents.actorType,
	actorId: auditEvents.actorId,
	tenantId: auditEvents.tenantId,
	sourceSystem: auditEvents.sourceSystem,
	targetType: auditEvents.targetType,
	targetId: auditEvents.targetId,
	requestId: auditEvents.requestId,
	route: auditEvents.route,
	httpMethod: auditEvents.httpMethod,
	httpStatus: auditEvents.httpStatus,
	durationMs: auditEvents.durationMs,
	metadata: auditEvents.metadata,
	actorEmail: users.email,
	actorDisplayName: users.displayName,
} as const;

type AuditEventRow = {
	id: string;
	occurredAt: Date;
	eventName: string;
	actionStatus: string;
	actorType: string;
	actorId: string | null;
	tenantId: string;
	sourceSystem: string;
	targetType: string | null;
	targetId: string | null;
	requestId: string | null;
	route: string | null;
	httpMethod: string | null;
	httpStatus: number | null;
	durationMs: number | null;
	metadata: unknown;
	actorEmail: string | null;
	actorDisplayName: string | null;
};

function sanitizePage(value?: number): number {
	if (!value || !Number.isFinite(value) || value < 1) {
		return DEFAULT_PAGE;
	}

	return Math.floor(value);
}

function sanitizePageSize(value?: number): number {
	if (!value || !Number.isFinite(value) || value < 1) {
		return DEFAULT_PAGE_SIZE;
	}

	return Math.min(MAX_PAGE_SIZE, Math.floor(value));
}

function parseDate(value?: string): Date | null {
	if (!value || value.trim().length === 0) {
		return null;
	}

	const parsed = new Date(value);
	return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function buildWhereClause(query: AuditEventQuery): SQL | undefined {
	const conditions: SQL[] = [];

	const from = parseDate(query.from);
	if (from) {
		conditions.push(gte(auditEvents.occurredAt, from));
	}

	const to = parseDate(query.to);
	if (to) {
		conditions.push(lte(auditEvents.occurredAt, to));
	}

	if (query.eventName && query.eventName.length > 0) {
		conditions.push(inArray(auditEvents.eventName, query.eventName));
	}

	if (query.actionStatus) {
		conditions.push(eq(auditEvents.actionStatus, query.actionStatus));
	}

	const actorId = query.actorId?.trim();
	if (actorId) {
		conditions.push(
			or(
				eq(auditEvents.actorId, actorId),
				sql`LOWER(COALESCE(${users.email}, '')) = ${actorId.toLowerCase()}`,
			)!,
		);
	}

	const targetType = query.targetType?.trim();
	if (targetType) {
		conditions.push(eq(auditEvents.targetType, targetType));
	}

	const targetId = query.targetId?.trim();
	if (targetId) {
		conditions.push(eq(auditEvents.targetId, targetId));
	}

	const requestId = query.requestId?.trim();
	if (requestId) {
		conditions.push(eq(auditEvents.requestId, requestId));
	}

	const search = query.search?.trim();
	if (search) {
		const pattern = `%${search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
		conditions.push(
			or(
				ilike(auditEvents.eventName, pattern),
				ilike(auditEvents.actorId, pattern),
				ilike(users.email, pattern),
				ilike(users.displayName, pattern),
				ilike(auditEvents.targetId, pattern),
				ilike(auditEvents.requestId, pattern),
				ilike(auditEvents.route, pattern),
			)!,
		);
	}

	if (conditions.length === 0) {
		return undefined;
	}

	if (conditions.length === 1) {
		return conditions[0];
	}

	return and(...conditions);
}

function buildActorJoinCondition(): SQL {
	return or(
		eq(users.id, auditEvents.actorId),
		and(
			eq(users.tenantId, auditEvents.tenantId),
			sql`LOWER(${users.email}) = LOWER(${auditEvents.actorId})`,
		),
	)!;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	return value as Record<string, unknown>;
}

function normalizeOptionalString(
	value: string | null | undefined,
): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function mapAuditRecord(row: AuditEventRow): AuditEventRecord {
	return {
		id: row.id,
		occurredAt: row.occurredAt.toISOString(),
		eventName: row.eventName as AuditEventRecord['eventName'],
		actionStatus: row.actionStatus as AuditEventRecord['actionStatus'],
		actorType: row.actorType as AuditEventRecord['actorType'],
		actorId: row.actorId,
		actorEmail: normalizeOptionalString(row.actorEmail),
		actorDisplayName: normalizeOptionalString(row.actorDisplayName),
		tenantId: row.tenantId,
		sourceSystem: row.sourceSystem as AuditEventRecord['sourceSystem'],
		targetType: row.targetType,
		targetId: row.targetId,
		requestId: row.requestId,
		route: row.route,
		httpMethod: row.httpMethod,
		httpStatus: row.httpStatus,
		durationMs: row.durationMs,
		metadata: normalizeMetadata(row.metadata),
	};
}
