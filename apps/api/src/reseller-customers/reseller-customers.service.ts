import { randomUUID } from 'node:crypto';
import {
	Injectable,
	Logger,
	NotFoundException,
	type OnModuleDestroy,
} from '@nestjs/common';
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNull,
	lt,
	lte,
	sql,
	type SQL,
} from 'drizzle-orm';
import {
	buildRegionalPricingContext,
	getRegionalStartingSkuMonthlyPrice,
	matchStartingSku,
	toSeatRange,
} from '@repo/shared';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import { externalSubscriptions } from '../database/schema';
import type { CreateResellerCustomerDto } from './dto/create-reseller-customer.dto';
import type { ResellerCustomersQueryDto } from './dto/reseller-customers-query.dto';
import type { UpdateResellerCustomerDto } from './dto/update-reseller-customer.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 15;
const MAX_PAGE_SIZE = 10_000;

const VALID_SORT_COLUMNS = [
	'customerName',
	'currentSku',
	'seats',
	'costPerUser',
	'region',
	'renewalDate',
	'currentArr',
	'createdAt',
] as const;

type SortColumn = (typeof VALID_SORT_COLUMNS)[number];

export const RESELLER_SEATS_BUCKET_OPTIONS = [
	'1-24',
	'25-49',
	'50-99',
	'100-299',
	'300-499',
	'500-999',
	'1000+',
] as const;

export const RESELLER_RENEWAL_BUCKET_OPTIONS = [
	'Within 1 month',
	'Within 2 months',
	'Within 3 months',
	'More than 3 months',
	'N/A',
] as const;

export interface NumericBucketRange {
	min?: number;
	max?: number;
	minInclusive?: boolean;
	maxInclusive?: boolean;
}

export function resolveResellerCurrentArrBucketRange(
	bucket: string,
): NumericBucketRange | null {
	switch (bucket) {
		case '<$100,000':
			return {
				max: 100_000,
				maxInclusive: false,
			};
		case '$100,000-$200,000':
			return {
				min: 100_000,
				max: 200_000,
				minInclusive: true,
				maxInclusive: true,
			};
		case '$200,000-$500,000':
			return {
				min: 200_000,
				max: 500_000,
				minInclusive: false,
				maxInclusive: true,
			};
		case '>$500,000':
			return {
				min: 500_000,
				minInclusive: false,
			};
		default:
			return null;
	}
}

export interface ResellerCustomerEntity {
	id: string;
	orgId: string;
	customerName: string;
	customerTpid: string | null;
	renewalDate: string | null;
	renewalMonth: string | null;
	seats: number;
	currentArr: number;
	currentSku: string;
	region: string;
	costPerUser: number;
	distributorName: string | null;
	distributorId: string | null;
	partnerName: string | null;
	partnerGlobalId: string | null;
	mpnId: string | null;
	copilotFit: string | null;
	copilotIntent: string | null;
	copilotCluster: string | null;
	copilotEligibleM365Seats: number | null;
	freeCopilotChatMAU: number | null;
	copilotMAUPercentage: number | null;
	copilotSeatsWhitespace: number | null;
	allAgentMAU: number | null;
	mciEligibility: number | null;
	mciEngagementName: string | null;
	adoptionStatus: string | null;
	mwPaidSeatRange: string | null;
	hasTransactedProduct: string | null;
	hasCompete: string | null;
	tenantIds: string | null;
	type: string | null;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
}

export interface ResellerCustomerSummary {
	totalCustomers: number;
	totalSubscriptions: number;
	totalSeats: number;
	totalArr: number;
}

export interface ResellerCustomersDashboardResponse {
	page: number;
	pageSize: number;
	total: number;
	sortBy: string;
	sortDir: 'ascending' | 'descending';
	rows: ResellerDashboardCustomerRow[];
	summary?: ResellerCustomerSummary;
	availableOptions?: Record<string, string[]>;
}

export interface ResellerDashboardCustomerRow {
	customerId: string;
	customerName: string;
	totalSeatsRange: string;
	totalArr: number;
	subscriptionCount: number;
	subscriptionSkuNames: string[];
	closestRenewalLabel: string;
	copilotMAUPercentage: number | null;
}

interface ResellerDashboardCustomerAggregateRow {
	customerId: string;
	customerName: string;
	totalSeats: number;
	totalArr: number;
	subscriptionCount: number;
	subscriptionSkuNames: string[];
	renewalDate: string | null;
	copilotMAUPercentage: number | null;
}

@Injectable()
export class ResellerCustomersService implements OnModuleDestroy {
	private readonly logger = new Logger(ResellerCustomersService.name);
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;
	private readonly sqlClient = this.databaseClient.sql;

	async create(
		dto: CreateResellerCustomerDto,
		orgId: string,
		createdBy: string,
	): Promise<ResellerCustomerEntity> {
		const now = new Date();
		const subscriptionName = normalizeSubscriptionName(dto.subscriptionName);
		const subscriptionDedupKey = subscriptionName
			? subscriptionName.trim().toLowerCase()
			: EMPTY_SUBSCRIPTION_DEDUP_KEY;

		// Check for existing record with same customer + subscription + org
		const conditions: SQL[] = [
			eq(externalSubscriptions.orgId, orgId),
			eq(
				sql`lower(trim(${externalSubscriptions.accountName}))`,
				dto.customerName.trim().toLowerCase(),
			),
			eq(
				sql`lower(trim(coalesce(${externalSubscriptions.subscriptionName}, ${EMPTY_SUBSCRIPTION_DEDUP_KEY})))`,
				subscriptionDedupKey,
			),
		];

		const [existing] = await this.db
			.select()
			.from(externalSubscriptions)
			.where(and(...conditions))
			.limit(1);

		if (existing) {
			// Enrich existing record with any new data
			const updates: Record<string, unknown> = { updatedAt: now };
			if (dto.customerTpid && !existing.customerTpid)
				updates.customerTpid = dto.customerTpid;
			if (dto.countryName && !existing.countryName)
				updates.countryName = dto.countryName;
			if (dto.renewalDate && dto.renewalDate.trim() !== '' && !existing.subscriptionEndDate)
				updates.subscriptionEndDate = dto.renewalDate;
			if (dto.renewalMonth && !existing.mwCspAnnualRenewal)
				updates.mwCspAnnualRenewal = dto.renewalMonth;
			if (dto.licenseCount != null && !existing.licensesCount)
				updates.licensesCount = dto.licenseCount;

			if (Object.keys(updates).length > 1) {
				const [updated] = await this.db
					.update(externalSubscriptions)
					.set(updates)
					.where(eq(externalSubscriptions.id, existing.id))
					.returning();
				return this.toEntity(updated);
			}
			return this.toEntity(existing);
		}

		const [row] = await this.db
			.insert(externalSubscriptions)
			.values({
				id: randomUUID(),
				orgId,
				source: 'form',
				accountName: dto.customerName,
				customerTpid: dto.customerTpid || null,
				countryName: dto.countryName,
				subscriptionEndDate: dto.renewalDate && dto.renewalDate.trim() !== '' ? dto.renewalDate : null,
				mwCspAnnualRenewal: dto.renewalMonth || null,
				subscriptionName,
				licensesCount: dto.licenseCount ?? null,
				createdBy,
				createdAt: now,
				updatedAt: now,
			})
			.returning();

		return this.toEntity(row);
	}

	async bulkCreate(
		dtos: CreateResellerCustomerDto[],
		orgId: string,
		createdBy: string,
	): Promise<ResellerCustomerEntity[]> {
		const now = new Date();
		const values = dtos.map((dto) => ({
			id: randomUUID(),
			orgId,
			source: 'csv' as const,
			accountName: dto.customerName,
			customerTpid: dto.customerTpid || null,
			countryName: dto.countryName,
			mwCspAnnualRenewal: dto.renewalMonth || null,
			subscriptionName: normalizeSubscriptionName(dto.subscriptionName),
			licensesCount: dto.licenseCount ?? null,
			createdBy,
			createdAt: now,
			updatedAt: now,
		}));

		const rows = await this.db
			.insert(externalSubscriptions)
			.values(values)
			.returning();

		return rows.map((r) => this.toEntity(r));
	}

	async bulkCreateStreaming(
		dtos: CreateResellerCustomerDto[],
		orgId: string,
		createdBy: string,
		onProgress: (saved: number, total: number) => void,
	): Promise<number> {
		const MICRO_BATCH = 100;
		const total = dtos.length;
		const now = new Date();
		let saved = 0;

		for (let i = 0; i < total; i += MICRO_BATCH) {
			const batch = dtos.slice(i, i + MICRO_BATCH);
			const values = batch.map((dto) => ({
				id: randomUUID(),
				orgId,
				source: 'csv' as const,
				accountName: dto.customerName,
				customerTpid: dto.customerTpid || null,
				countryName: dto.countryName,
				subscriptionEndDate: dto.renewalDate && dto.renewalDate.trim() !== '' ? dto.renewalDate : null,
				mwCspAnnualRenewal: dto.renewalMonth || null,
				subscriptionName: normalizeSubscriptionName(dto.subscriptionName),
				licensesCount: dto.licenseCount ?? null,
				createdBy,
				createdAt: now,
				updatedAt: now,
			}));

			await this.db.insert(externalSubscriptions).values(values);
			saved += batch.length;
			onProgress(saved, total);
		}

		return saved;
	}

	async findById(id: string, orgId: string): Promise<ResellerCustomerEntity> {
		const rows = await this.db
			.select()
			.from(externalSubscriptions)
			.where(
				and(
					eq(externalSubscriptions.id, id),
					eq(externalSubscriptions.orgId, orgId),
				),
			)
			.limit(1);

		if (rows.length === 0) {
			throw new NotFoundException(`Reseller customer not found: ${id}`);
		}

		return this.toEntity(rows[0]);
	}

	async update(
		id: string,
		dto: UpdateResellerCustomerDto,
		orgId: string,
	): Promise<ResellerCustomerEntity> {
		const updates: Record<string, unknown> = { updatedAt: new Date() };

		if (dto.customerName !== undefined) {
			updates.accountName = dto.customerName.trim();
		}
		if (dto.customerTpid !== undefined) {
			updates.customerTpid = dto.customerTpid.trim() || null;
		}
		if (dto.countryName !== undefined) {
			updates.countryName = dto.countryName;
		}
		if (dto.renewalDate !== undefined) {
			updates.subscriptionEndDate =
				dto.renewalDate && dto.renewalDate.trim() !== ''
					? dto.renewalDate
					: null;
		}
		if (dto.renewalMonth !== undefined) {
			updates.mwCspAnnualRenewal = dto.renewalMonth || null;
		}
		if (dto.subscriptionName !== undefined) {
			updates.subscriptionName = dto.subscriptionName || null;
		}
		if (dto.licenseCount !== undefined) {
			updates.licensesCount = dto.licenseCount;
		}
		if (dto.distributorName !== undefined) {
			updates.distributorName = dto.distributorName.trim() || null;
		}
		if (dto.distributorId !== undefined) {
			updates.distributorId = dto.distributorId.trim() || null;
		}
		if (dto.partnerName !== undefined) {
			updates.partnerName = dto.partnerName.trim() || null;
		}
		if (dto.partnerGlobalId !== undefined) {
			updates.partnerGlobalId = dto.partnerGlobalId.trim() || null;
		}
		if (dto.mpnId !== undefined) {
			updates.mpnId = dto.mpnId.trim() || null;
		}
		if (dto.copilotFit !== undefined) {
			updates.copilotFit = dto.copilotFit.trim() || null;
		}
		if (dto.copilotIntent !== undefined) {
			updates.copilotIntent = dto.copilotIntent.trim() || null;
		}
		if (dto.copilotCluster !== undefined) {
			updates.copilotCluster = dto.copilotCluster.trim() || null;
		}
		if (dto.copilotEligibleM365Seats !== undefined) {
			updates.copilotEligibleM365Seats = dto.copilotEligibleM365Seats;
		}
		if (dto.freeCopilotChatMAU !== undefined) {
			updates.freeCopilotChatMAU = dto.freeCopilotChatMAU;
		}
		if (dto.copilotMAUPercentage !== undefined) {
			updates.copilotMAUPercentage = dto.copilotMAUPercentage;
		}
		if (dto.copilotSeatsWhitespace !== undefined) {
			updates.copilotSeatsWhitespace = dto.copilotSeatsWhitespace;
		}
		if (dto.allAgentMAU !== undefined) {
			updates.allAgentMAU = dto.allAgentMAU;
		}
		if (dto.mciEligibility !== undefined) {
			updates.mciEligibility = dto.mciEligibility;
		}
		if (dto.mciEngagementName !== undefined) {
			updates.mciEngagementName = dto.mciEngagementName.trim() || null;
		}
		if (dto.adoptionStatus !== undefined) {
			updates.adoptionStatus = dto.adoptionStatus.trim() || null;
		}
		if (dto.mwPaidSeatRange !== undefined) {
			updates.mwPaidSeatRange = dto.mwPaidSeatRange.trim() || null;
		}
		if (dto.hasTransactedProduct !== undefined) {
			updates.hasTransactedProduct = dto.hasTransactedProduct.trim() || null;
		}
		if (dto.hasCompete !== undefined) {
			updates.hasCompete = dto.hasCompete.trim() || null;
		}
		if (dto.tenantIds !== undefined) {
			updates.tenantIds = dto.tenantIds.trim() || null;
		}
		if (dto.type !== undefined) {
			updates.type = dto.type.trim() || null;
		}

		// Derive Copilot MAU % from numerator/denominator whenever either changes.
		// Falls back to the persisted row when only one side is in the patch.
		if (
			dto.freeCopilotChatMAU !== undefined ||
			dto.copilotEligibleM365Seats !== undefined
		) {
			const [existing] = await this.db
				.select({
					freeCopilotChatMAU: externalSubscriptions.freeCopilotChatMAU,
					copilotEligibleM365Seats:
						externalSubscriptions.copilotEligibleM365Seats,
				})
				.from(externalSubscriptions)
				.where(
					and(
						eq(externalSubscriptions.id, id),
						eq(externalSubscriptions.orgId, orgId),
					),
				)
				.limit(1);
			const numerator =
				dto.freeCopilotChatMAU !== undefined
					? dto.freeCopilotChatMAU
					: (existing?.freeCopilotChatMAU ?? null);
			const denominator =
				dto.copilotEligibleM365Seats !== undefined
					? dto.copilotEligibleM365Seats
					: (existing?.copilotEligibleM365Seats ?? null);
			updates.copilotMAUPercentage =
				numerator !== null && denominator !== null && denominator > 0
					? numerator / denominator
					: null;
		}

		const [updated] = await this.db
			.update(externalSubscriptions)
			.set(updates)
			.where(
				and(
					eq(externalSubscriptions.id, id),
					eq(externalSubscriptions.orgId, orgId),
				),
			)
			.returning();

		if (!updated) {
			throw new NotFoundException(`Reseller customer not found: ${id}`);
		}

		return this.toEntity(updated);
	}

	async remove(id: string, orgId: string): Promise<void> {
		const rows = await this.db
			.delete(externalSubscriptions)
			.where(
				and(
					eq(externalSubscriptions.id, id),
					eq(externalSubscriptions.orgId, orgId),
				),
			)
			.returning({ id: externalSubscriptions.id });

		if (rows.length === 0) {
			throw new NotFoundException(`Reseller customer not found: ${id}`);
		}
	}

	async queryDashboard(
		orgId: string,
		query: ResellerCustomersQueryDto,
	): Promise<ResellerCustomersDashboardResponse> {
		const page = sanitizePage(query.page);
		const pageSize = sanitizePageSize(query.pageSize);
		const sortBy = sanitizeSortColumn(query.sortBy);
		const sortDir = query.sortDir ?? 'descending';
		const offset = (page - 1) * pageSize;
		const includePlan = resolveIncludeParts(query.includeParts);

		const whereClause = this.buildWhereClause(orgId, query);
		const havingClause = this.buildHavingClause(query);
		// Filter dropdowns should reflect every value present for this org, not
		// just the values that survive the currently-applied filters — otherwise
		// applying one filter silently narrows the choices in every other filter.
		const optionsWhereClause = this.buildWhereClause(orgId, {});

		const [rows, summaryResult, optionsResult] = await Promise.all([
			this.queryGroupedRows(
				whereClause,
				sortBy,
				sortDir,
				pageSize,
				offset,
				havingClause,
			),
			includePlan.summary
				? this.querySummary(whereClause)
				: Promise.resolve(undefined),
			includePlan.options
				? this.queryAvailableOptions(optionsWhereClause)
				: Promise.resolve(undefined),
		]);

		return {
			page,
			pageSize,
			total: rows.total,
			sortBy,
			sortDir,
			rows: rows.data.map((row) => ({
				customerId: row.customerId,
				customerName: row.customerName,
				totalSeatsRange: toSeatRange(row.totalSeats),
				totalArr: row.totalArr,
				subscriptionCount: row.subscriptionCount,
				subscriptionSkuNames: row.subscriptionSkuNames,
				closestRenewalLabel: this.formatClosestRenewal(row.renewalDate),
				copilotMAUPercentage: row.copilotMAUPercentage,
			})),
			summary: summaryResult,
			availableOptions: optionsResult,
		};
	}

	async findSubscriptionsByCustomerName(
		customerName: string,
		orgId: string,
	): Promise<ResellerCustomerEntity[]> {
		const rows = await this.db
			.select()
			.from(externalSubscriptions)
			.where(
				and(
					eq(externalSubscriptions.orgId, orgId),
					sql`lower(trim(${externalSubscriptions.accountName})) = lower(trim(${customerName}))`,
				),
			)
			.orderBy(
				desc(externalSubscriptions.licensesCount),
				asc(externalSubscriptions.subscriptionEndDate),
				asc(externalSubscriptions.subscriptionName),
			);

		if (rows.length === 0) {
			throw new NotFoundException(
				`Reseller customer not found: ${customerName}`,
			);
		}

		return rows.map((row) => this.toEntity(row));
	}

	private async queryGroupedRows(
		whereClause: SQL,
		sortBy: string,
		sortDir: 'ascending' | 'descending',
		pageSize: number,
		offset: number,
		havingClause?: SQL,
	): Promise<{ data: ResellerDashboardCustomerAggregateRow[]; total: number }> {
		const countQuery = this.db
			.select({
				customerName: externalSubscriptions.accountName,
			})
			.from(externalSubscriptions)
			.where(whereClause)
			.groupBy(externalSubscriptions.accountName);

		if (havingClause) {
			countQuery.having(havingClause);
		}

		const countSubquery = countQuery.as('filtered_customers');
		const [totalResult] = await this.db
			.select({ value: sql<number>`COUNT(*)` })
			.from(countSubquery);

		const total = Number(totalResult?.value ?? 0);

		if (total === 0) {
			return { data: [], total: 0 };
		}

		const orderBy = this.buildGroupedOrderBy(sortBy, sortDir);
		const dataQuery = this.db
			.select({
				customerName: externalSubscriptions.accountName,
				totalSeats: sql<number>`COALESCE(SUM(${externalSubscriptions.licensesCount}), 0)`,
				subscriptionCount: sql<number>`COUNT(*)`,
				subscriptionSkuNames: sql<
					string[]
				>`COALESCE(ARRAY_AGG(DISTINCT ${externalSubscriptions.subscriptionName} ORDER BY ${externalSubscriptions.subscriptionName}), ARRAY[]::text[])`,
				renewalDate: sql<string>`COALESCE(MIN(${externalSubscriptions.subscriptionEndDate}) FILTER (WHERE ${externalSubscriptions.subscriptionEndDate} >= CURRENT_DATE), MAX(${externalSubscriptions.subscriptionEndDate}))::text`,
				copilotMAUPercentage: sql<
					number | null
				>`MAX(${externalSubscriptions.copilotMAUPercentage})`,
			})
			.from(externalSubscriptions)
			.where(whereClause)
			.groupBy(externalSubscriptions.accountName)
			.orderBy(orderBy)
			.limit(pageSize)
			.offset(offset);

		if (havingClause) {
			dataQuery.having(havingClause);
		}

		const rows = await dataQuery;

		return {
			data: rows.map((row) => ({
				customerId: row.customerName ?? '',
				customerName: row.customerName ?? '',
				totalSeats: Number(row.totalSeats ?? 0),
				totalArr: 0,
				subscriptionCount: Number(row.subscriptionCount ?? 0),
				subscriptionSkuNames: this.parseSkuNames(row.subscriptionSkuNames),
				renewalDate: row.renewalDate,
				copilotMAUPercentage:
					row.copilotMAUPercentage === null ||
					row.copilotMAUPercentage === undefined
						? null
						: Number(row.copilotMAUPercentage),
			})),
			total,
		};
	}

	private async querySummary(
		whereClause: SQL,
	): Promise<ResellerCustomerSummary> {
		const [result] = await this.db
			.select({
				totalCustomers: sql<number>`COUNT(DISTINCT ${externalSubscriptions.accountName})`,
				totalSubscriptions: sql<number>`COUNT(*)`,
				totalSeats: sql<number>`COALESCE(SUM(${externalSubscriptions.licensesCount}), 0)`,
			})
			.from(externalSubscriptions)
			.where(whereClause);

		return {
			totalCustomers: Number(result.totalCustomers),
			totalSubscriptions: Number(result.totalSubscriptions),
			totalSeats: Number(result.totalSeats),
			totalArr: 0,
		};
	}

	private async queryAvailableOptions(
		whereClause: SQL,
	): Promise<Record<string, string[]>> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const distinctQuery = (column: any) =>
			this.db
				.selectDistinct({ value: column })
				.from(externalSubscriptions)
				.where(whereClause)
				.orderBy(asc(column)) as Promise<{ value: string | null }[]>;

		const toStrings = (rows: { value: string | null }[]) =>
			rows.map((r) => r.value).filter((v): v is string => v !== null);

		const [
			accountNames,
			subscriptionNames,
			countryNames,
			copilotFitValues,
			copilotIntentValues,
			copilotClusterValues,
			hasCompeteValues,
			hasTransactedProductValues,
			distributorNameValues,
			customerTpidValues,
			mwPaidSeatRangeValues,
			chatToPaidProbe,
			missingSubscriptionNameProbe,
			bucketCounts,
		] = await Promise.all([
			distinctQuery(externalSubscriptions.accountName),
			distinctQuery(externalSubscriptions.subscriptionName),
			distinctQuery(externalSubscriptions.countryName),
			distinctQuery(externalSubscriptions.copilotFit),
			distinctQuery(externalSubscriptions.copilotIntent),
			distinctQuery(externalSubscriptions.copilotCluster),
			distinctQuery(externalSubscriptions.hasCompete),
			distinctQuery(externalSubscriptions.hasTransactedProduct),
			distinctQuery(externalSubscriptions.distributorName),
			distinctQuery(externalSubscriptions.customerTpid),
			distinctQuery(externalSubscriptions.mwPaidSeatRange),
			this.db
				.select({ value: externalSubscriptions.id })
				.from(externalSubscriptions)
				.where(
					and(
						whereClause,
						sql`${externalSubscriptions.copilotMAUPercentage} IS NOT NULL`,
					),
				)
				.limit(1),
			this.db
				.select({ value: externalSubscriptions.id })
				.from(externalSubscriptions)
				.where(
					and(
						whereClause,
						sql`${externalSubscriptions.subscriptionName} IS NULL OR ${externalSubscriptions.subscriptionName} = ''`,
					),
				)
				.limit(1),
			this.queryBucketCounts(whereClause),
		]);

		const hasAnyChatToPaidValue = chatToPaidProbe.length > 0;
		const hasAnyMissingSubscriptionName = missingSubscriptionNameProbe.length > 0;

		return {
			customerName: toStrings(accountNames),
			currentSku: toStrings(subscriptionNames),
			region: toStrings(countryNames),
			copilotFit: toStrings(copilotFitValues),
			copilotIntent: toStrings(copilotIntentValues),
			copilotCluster: toStrings(copilotClusterValues),
			hasCompete: toStrings(hasCompeteValues),
			hasTransactedProduct: hasAnyMissingSubscriptionName
				? toStrings(hasTransactedProductValues)
				: [],
			distributorName: toStrings(distributorNameValues),
			customerTpid: toStrings(customerTpidValues),
			mwPaidSeatRange: toStrings(mwPaidSeatRangeValues),
			copilotChatToPaid: hasAnyChatToPaidValue
				? ['YES', 'NO', 'No information available']
				: [],
			seats: bucketCounts.seats,
			renewalDate: bucketCounts.renewalDate,
		};
	}

	private async queryBucketCounts(
		whereClause: SQL,
	): Promise<{ seats: string[]; renewalDate: string[] }> {
		const seats = externalSubscriptions.licensesCount;
		const endDate = externalSubscriptions.subscriptionEndDate;

		const [row] = await this.db
			.select({
				seats_1_24: sql<number>`COUNT(*) FILTER (WHERE ${seats} BETWEEN 1 AND 24)`,
				seats_25_49: sql<number>`COUNT(*) FILTER (WHERE ${seats} BETWEEN 25 AND 49)`,
				seats_50_99: sql<number>`COUNT(*) FILTER (WHERE ${seats} BETWEEN 50 AND 99)`,
				seats_100_299: sql<number>`COUNT(*) FILTER (WHERE ${seats} BETWEEN 100 AND 299)`,
				seats_300_499: sql<number>`COUNT(*) FILTER (WHERE ${seats} BETWEEN 300 AND 499)`,
				seats_500_999: sql<number>`COUNT(*) FILTER (WHERE ${seats} BETWEEN 500 AND 999)`,
				seats_1000_plus: sql<number>`COUNT(*) FILTER (WHERE ${seats} >= 1000)`,
				renewal_within_1: sql<number>`COUNT(*) FILTER (WHERE ${endDate} >= CURRENT_DATE AND ${endDate} <= CURRENT_DATE + INTERVAL '30 days')`,
				renewal_within_2: sql<number>`COUNT(*) FILTER (WHERE ${endDate} >= CURRENT_DATE AND ${endDate} <= CURRENT_DATE + INTERVAL '60 days')`,
				renewal_within_3: sql<number>`COUNT(*) FILTER (WHERE ${endDate} >= CURRENT_DATE AND ${endDate} <= CURRENT_DATE + INTERVAL '90 days')`,
				renewal_more_than_3: sql<number>`COUNT(*) FILTER (WHERE ${endDate} >= CURRENT_DATE + INTERVAL '91 days')`,
				renewal_na: sql<number>`COUNT(*) FILTER (WHERE ${endDate} IS NULL)`,
			})
			.from(externalSubscriptions)
			.where(whereClause);

		const seatBucketsByKey: Array<[string, number]> = [
			['1-24', Number(row?.seats_1_24 ?? 0)],
			['25-49', Number(row?.seats_25_49 ?? 0)],
			['50-99', Number(row?.seats_50_99 ?? 0)],
			['100-299', Number(row?.seats_100_299 ?? 0)],
			['300-499', Number(row?.seats_300_499 ?? 0)],
			['500-999', Number(row?.seats_500_999 ?? 0)],
			['1000+', Number(row?.seats_1000_plus ?? 0)],
		];
		const renewalBucketsByKey: Array<[string, number]> = [
			['Within 1 month', Number(row?.renewal_within_1 ?? 0)],
			['Within 2 months', Number(row?.renewal_within_2 ?? 0)],
			['Within 3 months', Number(row?.renewal_within_3 ?? 0)],
			['More than 3 months', Number(row?.renewal_more_than_3 ?? 0)],
			['N/A', Number(row?.renewal_na ?? 0)],
		];

		return {
			seats: seatBucketsByKey.filter(([, c]) => c > 0).map(([k]) => k),
			renewalDate: renewalBucketsByKey.filter(([, c]) => c > 0).map(([k]) => k),
		};
	}

	private parseSkuNames(value: unknown): string[] {
		if (Array.isArray(value)) return value;
		if (typeof value === 'string') {
			// Handle Postgres array literal e.g. "{Business Premium,Other}"
			const trimmed = value.replace(/^\{/, '').replace(/\}$/, '').trim();
			if (trimmed === '') return [];
			return trimmed
				.split(',')
				.map((s) => s.replace(/^"|"$/g, '').trim())
				.filter(Boolean);
		}
		return [];
	}

	private buildWhereClause(
		orgId: string,
		query: ResellerCustomersQueryDto,
	): SQL {
		const conditions: SQL[] = [
			eq(externalSubscriptions.orgId, orgId),
			eq(externalSubscriptions.dashboardVisible, true),
		];

		if (query.customerName?.length) {
			conditions.push(
				sql`${externalSubscriptions.accountName} IN (${sql.join(query.customerName.map(n => sql`${n}`), sql`, `)})`,
			);
		}

		if (query.currentSku?.length) {
			const skuConditions = query.currentSku.map(
				(sku) => sql`${externalSubscriptions.subscriptionName} ILIKE ${'%' + sku + '%'}`,
			);
			conditions.push(
				skuConditions.length === 1
					? skuConditions[0]
					: sql`(${sql.join(skuConditions, sql` OR `)})`,
			);
		}

		if (query.region?.length) {
			conditions.push(
				sql`${externalSubscriptions.countryName} IN (${sql.join(query.region.map(n => sql`${n}`), sql`, `)})`,
			);
		}

		if (query.seats?.length) {
			const seatConditions = query.seats
				.map((bucket) => this.parseSeatsBucket(bucket))
				.filter(Boolean) as SQL[];
			if (seatConditions.length > 0) {
				conditions.push(
					seatConditions.length === 1
						? seatConditions[0]
						: sql`(${sql.join(seatConditions, sql` OR `)})`,
				);
			}
		}

		if (query.renewalDate?.length) {
			const dateConditions = query.renewalDate
				.map((bucket) => this.parseRenewalDateBucket(bucket))
				.filter(Boolean) as SQL[];
			if (dateConditions.length > 0) {
				conditions.push(
					dateConditions.length === 1
						? dateConditions[0]
						: sql`(${sql.join(dateConditions, sql` OR `)})`,
				);
			}
		}

		if (query.copilotFit?.length) {
			conditions.push(inArray(externalSubscriptions.copilotFit, query.copilotFit));
		}

		if (query.copilotIntent?.length) {
			conditions.push(inArray(externalSubscriptions.copilotIntent, query.copilotIntent));
		}

		if (query.copilotCluster?.length) {
			conditions.push(inArray(externalSubscriptions.copilotCluster, query.copilotCluster));
		}

		if (query.hasCompete?.length) {
			conditions.push(inArray(externalSubscriptions.hasCompete, query.hasCompete));
		}

		if (query.hasTransactedProduct?.length) {
			conditions.push(
				inArray(
					externalSubscriptions.hasTransactedProduct,
					query.hasTransactedProduct,
				),
			);
		}

		if (query.distributorName?.length) {
			conditions.push(inArray(externalSubscriptions.distributorName, query.distributorName));
		}

		if (query.customerTpid?.length) {
			conditions.push(inArray(externalSubscriptions.customerTpid, query.customerTpid));
		}

		if (query.mwPaidSeatRange?.length) {
			conditions.push(
				inArray(externalSubscriptions.mwPaidSeatRange, query.mwPaidSeatRange),
			);
		}

		if (query.copilotChatToPaid?.length) {
			const parts = query.copilotChatToPaid
				.map((bucket) => {
					if (bucket === 'YES')
						return sql`${externalSubscriptions.copilotMAUPercentage} IS NOT NULL AND ${externalSubscriptions.copilotMAUPercentage} >= 0.05`;
					if (bucket === 'NO')
						return sql`${externalSubscriptions.copilotMAUPercentage} IS NOT NULL AND ${externalSubscriptions.copilotMAUPercentage} < 0.05`;
					if (bucket === 'No information available')
						return sql`${externalSubscriptions.copilotMAUPercentage} IS NULL`;
					return null;
				})
				.filter(Boolean) as SQL[];
			if (parts.length > 0) {
				conditions.push(
					parts.length === 1 ? parts[0] : sql`(${sql.join(parts, sql` OR `)})`,
				);
			}
		}

		return and(...conditions)!;
	}

	private buildHavingClause(_query: ResellerCustomersQueryDto): SQL | undefined {
		// ARR filtering removed — currentArr column no longer exists
		return undefined;
	}

	private parseSeatsBucket(bucket: string): SQL | null {
		switch (bucket) {
			case '1-24':
				return and(
					gte(externalSubscriptions.licensesCount, 1),
					lte(externalSubscriptions.licensesCount, 24),
				)!;
			case '25-49':
				return and(
					gte(externalSubscriptions.licensesCount, 25),
					lte(externalSubscriptions.licensesCount, 49),
				)!;
			case '50-99':
				return and(
					gte(externalSubscriptions.licensesCount, 50),
					lte(externalSubscriptions.licensesCount, 99),
				)!;
			case '100-299':
				return and(
					gte(externalSubscriptions.licensesCount, 100),
					lte(externalSubscriptions.licensesCount, 299),
				)!;
			case '300-499':
				return and(
					gte(externalSubscriptions.licensesCount, 300),
					lte(externalSubscriptions.licensesCount, 499),
				)!;
			case '500-999':
				return and(
					gte(externalSubscriptions.licensesCount, 500),
					lte(externalSubscriptions.licensesCount, 999),
				)!;
			case '1000+':
				return gte(externalSubscriptions.licensesCount, 1000);
			default:
				return null;
		}
	}

	private formatClosestRenewal(value: string | null): string {
		if (!value) {
			return 'N/A';
		}

		const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
		if (Number.isNaN(date.getTime())) {
			return 'N/A';
		}

		return date.toLocaleDateString('en-US', {
			month: 'long',
			year: 'numeric',
		});
	}

	// parseCurrentArrBucket removed — currentArr column no longer exists

	private parseRenewalDateBucket(bucket: string): SQL | null {
		const now = new Date();
		const addDays = (d: Date, days: number) => {
			const result = new Date(d);
			result.setDate(result.getDate() + days);
			return result;
		};

		switch (bucket) {
			case 'Within 1 month':
				return and(
					gte(
						externalSubscriptions.subscriptionEndDate,
						now.toISOString().slice(0, 10),
					),
					lte(
						externalSubscriptions.subscriptionEndDate,
						addDays(now, 30).toISOString().slice(0, 10),
					),
				)!;
			case 'Within 2 months':
				return and(
					gte(
						externalSubscriptions.subscriptionEndDate,
						now.toISOString().slice(0, 10),
					),
					lte(
						externalSubscriptions.subscriptionEndDate,
						addDays(now, 60).toISOString().slice(0, 10),
					),
				)!;
			case 'Within 3 months':
				return and(
					gte(
						externalSubscriptions.subscriptionEndDate,
						now.toISOString().slice(0, 10),
					),
					lte(
						externalSubscriptions.subscriptionEndDate,
						addDays(now, 90).toISOString().slice(0, 10),
					),
				)!;
			case 'More than 3 months':
				return gte(
					externalSubscriptions.subscriptionEndDate,
					addDays(now, 91).toISOString().slice(0, 10),
				);
			case 'N/A':
				return isNull(externalSubscriptions.subscriptionEndDate);
			default:
				return null;
		}
	}

	private buildGroupedOrderBy(
		sortBy: string,
		sortDir: 'ascending' | 'descending',
	): SQL {
		const order = sortDir === 'ascending' ? asc : desc;

		switch (sortBy) {
			case 'customerName':
				return order(externalSubscriptions.accountName);
			case 'seats':
				return order(
					sql<number>`COALESCE(SUM(${externalSubscriptions.licensesCount}), 0)`,
				);
			case 'renewalDate':
				return order(
					sql<string>`COALESCE(MIN(${externalSubscriptions.subscriptionEndDate}) FILTER (WHERE ${externalSubscriptions.subscriptionEndDate} >= CURRENT_DATE), MAX(${externalSubscriptions.subscriptionEndDate}))::text`,
				);
			case 'currentSku':
				return order(sql<string>`MIN(${externalSubscriptions.subscriptionName})`);
			case 'createdAt':
				return order(sql<Date>`MAX(${externalSubscriptions.createdAt})`);
			case 'region':
				return order(sql<string>`MIN(${externalSubscriptions.countryName})`);
			case 'subscriptionCount':
				return order(sql<number>`COUNT(*)`);
			default:
				return order(sql<Date>`MAX(${externalSubscriptions.createdAt})`);
		}
	}

	private resolveOrderColumn(sortBy: string) {
		switch (sortBy) {
			case 'customerName':
				return externalSubscriptions.accountName;
			case 'currentSku':
				return externalSubscriptions.subscriptionName;
			case 'seats':
				return externalSubscriptions.licensesCount;
			case 'region':
				return externalSubscriptions.countryName;
			case 'renewalDate':
				return externalSubscriptions.subscriptionEndDate;
			case 'createdAt':
			default:
				return externalSubscriptions.createdAt;
		}
	}

	async getExportRowCount(
		orgId: string,
		filters?: Record<string, string[]>,
	): Promise<number> {
		const whereClause = this.buildWhereClauseFromRecord(orgId, filters);
		const [result] = await this.db
			.select({ value: count() })
			.from(externalSubscriptions)
			.where(whereClause);
		return Number(result?.value ?? 0);
	}

	async getExportRows(
		orgId: string,
		filters?: Record<string, string[]>,
		sortBy = 'createdAt',
		sortDir: 'ascending' | 'descending' = 'descending',
	): Promise<ResellerCustomerEntity[]> {
		const whereClause = this.buildWhereClauseFromRecord(orgId, filters);
		const orderColumn = this.resolveOrderColumn(sanitizeSortColumn(sortBy));
		const orderFn = sortDir === 'ascending' ? asc : desc;

		const rows = await this.db
			.select()
			.from(externalSubscriptions)
			.where(whereClause)
			.orderBy(orderFn(orderColumn));

		return rows.map((r) => this.toEntity(r));
	}

	async getAnalyticsCustomerEntityRows(
		orgId: string,
		filters?: Record<string, string[]>,
	): Promise<Array<{ entityId: string; region: string }>> {
		const whereClause = this.buildWhereClauseFromRecord(orgId, filters);

		const rows = await this.db
			.select({
				entityId: externalSubscriptions.accountName,
				countryName: externalSubscriptions.countryName,
			})
			.from(externalSubscriptions)
			.where(whereClause)
			.groupBy(
				externalSubscriptions.accountName,
				externalSubscriptions.countryName,
			);

		return rows.map((r) => ({
			entityId: r.entityId ?? '',
			region: r.countryName ?? '',
		}));
	}

	private buildWhereClauseFromRecord(
		orgId: string,
		filters?: Record<string, string[]>,
	): SQL {
		const query: ResellerCustomersQueryDto = {};
		if (filters?.customerName?.length)
			query.customerName = filters.customerName;
		if (filters?.currentSku?.length) query.currentSku = filters.currentSku;
		if (filters?.region?.length) query.region = filters.region;
		if (filters?.seats?.length) query.seats = filters.seats;
		if (filters?.currentArr?.length) query.currentArr = filters.currentArr;
		if (filters?.renewalDate?.length) query.renewalDate = filters.renewalDate;
		if (filters?.copilotFit?.length) query.copilotFit = filters.copilotFit;
		if (filters?.copilotIntent?.length) query.copilotIntent = filters.copilotIntent;
		if (filters?.copilotCluster?.length) query.copilotCluster = filters.copilotCluster;
		if (filters?.hasCompete?.length) query.hasCompete = filters.hasCompete;
		if (filters?.hasTransactedProduct?.length)
			query.hasTransactedProduct = filters.hasTransactedProduct;
		if (filters?.distributorName?.length) query.distributorName = filters.distributorName;
		if (filters?.customerTpid?.length) query.customerTpid = filters.customerTpid;
		if (filters?.copilotChatToPaid?.length)
			query.copilotChatToPaid = filters.copilotChatToPaid;
		if (filters?.mwPaidSeatRange?.length)
			query.mwPaidSeatRange = filters.mwPaidSeatRange;
		return this.buildWhereClause(orgId, query);
	}

	async onModuleDestroy(): Promise<void> {
		await this.sqlClient.end();
	}

	private toEntity(
		row: typeof externalSubscriptions.$inferSelect,
	): ResellerCustomerEntity {
		const seats = row.licensesCount ?? 0;
		// Surface a null subscription as an empty string so the web side's
		// `matchStartingSku` returns null and the proposal page renders the
		// "No eligible upgrade opportunities" view — leaving room for a later
		// upload (Partner Center, etc.) to enrich the SKU on this row.
		const currentSku = row.subscriptionName ?? '';
		const region = row.countryName ?? '';
		// `external_subscription` rows don't store ARR or per-user cost. For
		// known M365 SKUs (BB/BS/BP) we derive both from the regional SKU
		// price so downstream proposal flows show a real "current investment"
		// instead of $0.
		const startingSku = matchStartingSku(currentSku);
		const pricingContext = buildRegionalPricingContext({ region });
		const regionalMonthlyPrice = startingSku
			? getRegionalStartingSkuMonthlyPrice({
					startingSkuId: startingSku.id,
					region,
					country: pricingContext.country,
				})
			: null;
		const costPerUser = regionalMonthlyPrice ?? 0;
		const currentArr = costPerUser * seats * 12;
		return {
			id: row.id,
			orgId: row.orgId,
			customerName: row.accountName ?? '',
			customerTpid: row.customerTpid ?? null,
			renewalDate: row.subscriptionEndDate ?? null,
			renewalMonth: row.mwCspAnnualRenewal ?? null,
			seats,
			currentArr,
			currentSku,
			region,
			costPerUser,
			distributorName: row.distributorName ?? null,
			distributorId: row.distributorId ?? null,
			partnerName: row.partnerName ?? null,
			partnerGlobalId: row.partnerGlobalId ?? null,
			mpnId: row.mpnId ?? null,
			copilotFit: row.copilotFit ?? null,
			copilotIntent: row.copilotIntent ?? null,
			copilotCluster: row.copilotCluster ?? null,
			copilotEligibleM365Seats: row.copilotEligibleM365Seats ?? null,
			freeCopilotChatMAU: row.freeCopilotChatMAU ?? null,
			copilotMAUPercentage: row.copilotMAUPercentage ?? null,
			copilotSeatsWhitespace: row.copilotSeatsWhitespace ?? null,
			allAgentMAU: row.allAgentMAU ?? null,
			mciEligibility: row.mciEligibility ?? null,
			mciEngagementName: row.mciEngagementName ?? null,
			adoptionStatus: row.adoptionStatus ?? null,
			mwPaidSeatRange: row.mwPaidSeatRange ?? null,
			hasTransactedProduct: row.hasTransactedProduct ?? null,
			hasCompete: row.hasCompete ?? null,
			tenantIds: row.tenantIds ?? null,
			type: row.type ?? null,
			createdBy: row.createdBy,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		};
	}
}

// Empty subscription names are stored as null so a follow-up upload (e.g. a
// Partner Center sheet that does carry the SKU) can enrich the row in place.
// Storing a sentinel like "Other" would mark the field as already populated and
// block enrichment.
function normalizeSubscriptionName(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : null;
}

// Stable comparison value used in dedup WHERE clauses so that a null stored
// subscription and an empty incoming subscription resolve to the same key.
const EMPTY_SUBSCRIPTION_DEDUP_KEY = '__no_subscription__';

function sanitizePage(value?: number): number {
	if (!value || !Number.isFinite(value) || value < 1) return DEFAULT_PAGE;
	return Math.floor(value);
}

function sanitizePageSize(value?: number): number {
	if (!value || !Number.isFinite(value) || value < 1) return DEFAULT_PAGE_SIZE;
	return Math.min(MAX_PAGE_SIZE, Math.floor(value));
}

function sanitizeSortColumn(value?: string): SortColumn {
	if (!value) return 'createdAt';
	return (VALID_SORT_COLUMNS as readonly string[]).includes(value)
		? (value as SortColumn)
		: 'createdAt';
}

function resolveIncludeParts(includeParts?: string): {
	summary: boolean;
	options: boolean;
} {
	if (!includeParts) {
		return { summary: true, options: true };
	}

	const parts = includeParts.split(',').map((p) => p.trim());
	return {
		summary: parts.includes('summary'),
		options: parts.includes('options'),
	};
}
