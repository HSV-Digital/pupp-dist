import {
	boolean,
	date,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { CustomerRegion } from '@repo/types';

export const subscriptions = pgTable(
	'subscriptions',
	{
		id: text('id').primaryKey(),
		customerId: text('customer_id').notNull(),
		subscriptionId: text('subscription_id').notNull(),
		customerName: text('customer_name').notNull(),
		resellerName: text('reseller_name').notNull(),
		distributorName: text('distributor_name').notNull(),
		pssAIWorkforceName: text('pss_ai_workforce_name').notNull().default(''),
		pssAISecurityName: text('pss_ai_security_name').notNull().default(''),
		psaName: text('psa_name').notNull().default(''),
		pdmName: text('pdm_name').notNull(),
		pmmName: text('pmm_name').notNull(),
		currentProduct: text('current_product').notNull(),
		type: text('type').notNull().default('Other'),
		skuCategory: text('sku_category').notNull(),
		seatCount: integer('seat_count').notNull(),
		annualRevenueRunRate: doublePrecision('annual_revenue_run_rate').notNull(),
		renewalDate: date('renewal_date').notNull(),
		termMonths: integer('term_months').notNull(),
		autoRenew: boolean('auto_renew').notNull(),
		multiYear: boolean('multi_year').notNull(),
		hasCopilot: boolean('has_copilot').notNull(),
		hasPurview: boolean('has_purview').notNull(),
		hasSureStep: boolean('has_sure_step').notNull(),
		currentMargin: doublePrecision('current_margin').notNull(),
		customerSegment: text('customer_segment').notNull(),
		region: text('region').notNull(),
		notes: text('notes').notNull().default(''),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex('subscriptions_subscription_uidx').on(table.subscriptionId),
		index('subscriptions_reseller_idx').on(table.resellerName),
		index('subscriptions_customer_idx').on(table.customerId),
		index('subscriptions_renewal_idx').on(table.renewalDate),
		index('subscriptions_arr_idx').on(table.annualRevenueRunRate),
		index('subscriptions_region_idx').on(table.region),
		index('subscriptions_customer_name_idx').on(table.customerName),
		index('subscriptions_distributor_idx').on(table.distributorName),
		index('subscriptions_type_idx').on(table.type),
		index('subscriptions_pss_ai_workforce_idx').on(table.pssAIWorkforceName),
		index('subscriptions_pss_ai_security_idx').on(table.pssAISecurityName),
		index('subscriptions_psa_idx').on(table.psaName),
		index('subscriptions_pdm_idx').on(table.pdmName),
		index('subscriptions_pmm_idx').on(table.pmmName),
		index('subscriptions_seat_count_idx').on(table.seatCount),
	],
);

export const users = pgTable(
	'users',
	{
		id: text('id').primaryKey(),
		entraObjectId: text('entra_object_id').notNull(),
		tenantId: text('tenant_id').notNull(),
		email: text('email').notNull(),
		displayName: text('display_name'),
		givenName: text('given_name'),
		surname: text('surname'),
		jobTitle: text('job_title'),
		department: text('department'),
		officeLocation: text('office_location'),
		companyName: text('company_name'),
		city: text('city'),
		country: text('country'),
		mobilePhone: text('mobile_phone'),
		businessPhones: jsonb('business_phones').$type<string[]>(),
		preferredLanguage: text('preferred_language'),
		employeeId: text('employee_id'),
		employeeType: text('employee_type'),
		userPrincipalName: text('user_principal_name'),
		photoUrl: text('photo_url'),
		roles: text('roles')
			.array()
			.notNull()
			.default(sql`ARRAY['MEMBER']::TEXT[]`),
		isActive: boolean('is_active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
	},
	(table) => [
		uniqueIndex('users_entra_object_id_uidx').on(table.entraObjectId),
		uniqueIndex('users_email_uidx').on(table.email),
		index('users_tenant_idx').on(table.tenantId),
		index('users_active_idx').on(table.isActive),
	],
);

export const userIdentityAliases = pgTable(
	'user_identity_aliases',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tenantId: text('tenant_id').notNull(),
		provider: text('provider').notNull(),
		identityType: text('identity_type').notNull(),
		identityValue: text('identity_value').notNull(),
		source: text('source').notNull(),
		firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex('user_identity_aliases_provider_type_value_uidx').on(
			table.provider,
			table.identityType,
			table.identityValue,
		),
		index('user_identity_aliases_user_idx').on(table.userId),
		index('user_identity_aliases_tenant_type_idx').on(
			table.tenantId,
			table.identityType,
		),
	],
);

export const resellerOrganizations = pgTable(
	'reseller_organization',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		primaryDomain: text('primary_domain').notNull(),
		normalizedDomain: text('normalized_domain').notNull(),
		mpnId: text('mpn_id'),
		isActive: boolean('is_active').notNull().default(true),
		createdBy: text('created_by'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex('reseller_organization_normalized_domain_uidx').on(
			table.normalizedDomain,
		),
		index('reseller_organization_active_idx').on(table.isActive),
	],
).enableRLS();

export const resellerUsers = pgTable(
	'reseller_users',
	{
		id: text('id').primaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => resellerOrganizations.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		displayName: text('display_name'),
		isActive: boolean('is_active').notNull().default(true),
		passwordHash: text('password_hash'),
		emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
		lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex('reseller_users_org_email_uidx').on(table.orgId, table.email),
		index('reseller_users_org_idx').on(table.orgId),
		index('reseller_users_email_idx').on(table.email),
		index('reseller_users_active_idx').on(table.isActive),
	],
).enableRLS();

export const resellerUserIdentityAliases = pgTable(
	'reseller_user_identity_aliases',
	{
		id: text('id').primaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => resellerOrganizations.id, { onDelete: 'cascade' }),
		resellerUserId: text('reseller_user_id')
			.notNull()
			.references(() => resellerUsers.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		providerSubject: text('provider_subject').notNull(),
		email: text('email').notNull(),
		issuer: text('issuer'),
		tenantId: text('tenant_id'),
		firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex('reseller_user_identity_aliases_provider_subject_uidx').on(
			table.provider,
			table.providerSubject,
		),
		index('reseller_user_identity_aliases_user_idx').on(table.resellerUserId),
		index('reseller_user_identity_aliases_email_idx').on(table.email),
		index('reseller_user_identity_aliases_tenant_idx').on(table.tenantId),
		index('reseller_user_identity_aliases_org_idx').on(table.orgId),
	],
).enableRLS();

export const auditEvents = pgTable(
	'audit_events',
	{
		id: text('id').primaryKey(),
		occurredAt: timestamp('occurred_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		eventName: text('event_name').notNull(),
		actionStatus: text('action_status').notNull(),
		actorType: text('actor_type').notNull(),
		actorId: text('actor_id'),
		tenantId: text('tenant_id').notNull(),
		sourceSystem: text('source_system').notNull(),
		targetType: text('target_type'),
		targetId: text('target_id'),
		requestId: text('request_id'),
		route: text('route'),
		httpMethod: text('http_method'),
		httpStatus: integer('http_status'),
		durationMs: integer('duration_ms'),
		metadata: jsonb('metadata')
			.notNull()
			.default(sql`'{}'::jsonb`),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('audit_events_occurred_idx').on(table.occurredAt),
		index('audit_events_event_name_idx').on(table.eventName),
		index('audit_events_actor_id_idx').on(table.actorId),
		index('audit_events_request_id_idx').on(table.requestId),
		index('audit_events_target_id_idx').on(table.targetId),
		index('audit_events_tenant_event_occurred_idx').on(
			table.tenantId,
			table.eventName,
			table.occurredAt,
		),
		index('audit_events_tenant_actor_occurred_idx').on(
			table.tenantId,
			table.actorId,
			table.occurredAt,
		),
		index('audit_events_tenant_occurred_idx').on(
			table.tenantId,
			table.occurredAt,
		),
	],
);

export const resellerAuditEvents = pgTable(
	'reseller_audit_events',
	{
		id: text('id').primaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => resellerOrganizations.id, { onDelete: 'cascade' }),
		occurredAt: timestamp('occurred_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		eventName: text('event_name').notNull(),
		actionStatus: text('action_status').notNull(),
		actorType: text('actor_type').notNull(),
		actorId: text('actor_id'),
		tenantId: text('tenant_id').notNull(),
		sourceSystem: text('source_system').notNull(),
		targetType: text('target_type'),
		targetId: text('target_id'),
		requestId: text('request_id'),
		route: text('route'),
		httpMethod: text('http_method'),
		httpStatus: integer('http_status'),
		durationMs: integer('duration_ms'),
		metadata: jsonb('metadata')
			.notNull()
			.default(sql`'{}'::jsonb`),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('reseller_audit_events_occurred_idx').on(table.occurredAt),
		index('reseller_audit_events_event_name_idx').on(table.eventName),
		index('reseller_audit_events_actor_id_idx').on(table.actorId),
		index('reseller_audit_events_request_id_idx').on(table.requestId),
		index('reseller_audit_events_target_id_idx').on(table.targetId),
		index('reseller_audit_events_tenant_event_occurred_idx').on(
			table.tenantId,
			table.eventName,
			table.occurredAt,
		),
		index('reseller_audit_events_tenant_actor_occurred_idx').on(
			table.tenantId,
			table.actorId,
			table.occurredAt,
		),
		index('reseller_audit_events_tenant_occurred_idx').on(
			table.tenantId,
			table.occurredAt,
		),
		index('reseller_audit_events_org_idx').on(table.orgId),
	],
).enableRLS();

export const proposalGenerationSelections = pgTable(
	'proposal_generation_selections',
	{
		id: text('id').primaryKey(),
		generationRequestId: text('generation_request_id').notNull(),
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
		tenantId: text('tenant_id').notNull(),
		actorId: text('actor_id'),
		customerId: text('customer_id').notNull(),
		journey: text('journey').notNull(),
		customerSource: text('customer_source').notNull(),
		opportunityId: text('opportunity_id').notNull(),
		startingSkuId: text('starting_sku_id').notNull(),
		endingSkuId: text('ending_sku_id').notNull(),
		region: text('region'),
		distributorName: text('distributor_name'),
		resellerName: text('reseller_name'),
		pssAIWorkforceName: text('pss_ai_workforce_name'),
		pssAISecurityName: text('pss_ai_security_name'),
		pdmName: text('pdm_name'),
		pmmName: text('pmm_name'),
		subscriptionType: text('subscription_type'),
		expiringSeatCount: integer('expiring_seat_count'),
		selectedSeats: integer('selected_seats').notNull(),
		currentSkuCustomerPrice: doublePrecision('current_sku_customer_price'),
		currentSkuResellerPrice: doublePrecision('current_sku_reseller_price'),
		targetSkuCustomerPrice: doublePrecision('target_sku_customer_price'),
		targetSkuResellerPrice: doublePrecision('target_sku_reseller_price'),
		targetSkuPrice: doublePrecision('target_sku_price'),
		targetSkuMarginPercent: doublePrecision('target_sku_margin_percent'),
		requestId: text('request_id'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex(
			'proposal_generation_selections_generation_request_scenario_uidx',
		).on(table.generationRequestId, table.opportunityId, table.endingSkuId),
		index('proposal_generation_selections_generation_request_idx').on(
			table.generationRequestId,
		),
		index('proposal_generation_selections_tenant_occurred_idx').on(
			table.tenantId,
			table.occurredAt,
		),
		index('proposal_generation_selections_tenant_ending_sku_occurred_idx').on(
			table.tenantId,
			table.endingSkuId,
			table.occurredAt,
		),
		index('proposal_generation_selections_tenant_actor_occurred_idx').on(
			table.tenantId,
			table.actorId,
			table.occurredAt,
		),
		index('proposal_generation_selections_tenant_distributor_occurred_idx').on(
			table.tenantId,
			table.distributorName,
			table.occurredAt,
		),
		index('proposal_generation_selections_tenant_reseller_occurred_idx').on(
			table.tenantId,
			table.resellerName,
			table.occurredAt,
		),
	],
);

export const analyticsDownloadIssuances = pgTable(
	'analytics_download_issuances',
	{
		tokenJti: text('token_jti').primaryKey(),
		category: text('category').notNull(),
		tokenScope: text('token_scope').notNull(),
		tenantId: text('tenant_id').notNull(),
		actorId: text('actor_id'),
		requestId: text('request_id'),
		route: text('route'),
		issuedAt: timestamp('issued_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('analytics_download_issuances_tenant_category_issued_idx').on(
			table.tenantId,
			table.category,
			table.issuedAt,
		),
		index('analytics_download_issuances_tenant_actor_issued_idx').on(
			table.tenantId,
			table.actorId,
			table.issuedAt,
		),
	],
);

export const analyticsDownloadFacts = pgTable(
	'analytics_download_facts',
	{
		id: text('id').primaryKey(),
		tokenJti: text('token_jti')
			.notNull()
			.references(() => analyticsDownloadIssuances.tokenJti, {
				onDelete: 'cascade',
			}),
		category: text('category').notNull(),
		tenantId: text('tenant_id').notNull(),
		actorId: text('actor_id'),
		requestId: text('request_id'),
		route: text('route'),
		occurredAt: timestamp('occurred_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		downloadCount: integer('download_count').notNull().default(1),
		entityCount: integer('entity_count').notNull().default(0),
		usEntityCount: integer('us_entity_count').notNull().default(0),
		canadaEntityCount: integer('canada_entity_count').notNull().default(0),
		latamEntityCount: integer('latam_entity_count').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('analytics_download_facts_tenant_category_occurred_idx').on(
			table.tenantId,
			table.category,
			table.occurredAt,
		),
		index('analytics_download_facts_tenant_actor_occurred_idx').on(
			table.tenantId,
			table.actorId,
			table.occurredAt,
		),
		index('analytics_download_facts_token_jti_idx').on(table.tokenJti),
	],
);

export const downloadTokenRedemptions = pgTable(
	'download_token_redemptions',
	{
		tokenJti: text('token_jti').primaryKey(),
		tokenScope: text('token_scope').notNull(),
		requestId: text('request_id'),
		route: text('route'),
		consumedAt: timestamp('consumed_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('download_token_redemptions_scope_consumed_idx').on(
			table.tokenScope,
			table.consumedAt,
		),
	],
);

export const externalSubscriptions = pgTable(
	'external_subscription',
	{
		id: text('id').primaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => resellerOrganizations.id, { onDelete: 'cascade' }),
		source: text('source').notNull(),
		distributorName: text('distributor_name'),
		distributorId: text('distributor_id'),
		partnerName: text('partner_name'),
		partnerGlobalId: text('partner_global_id'),
		mpnId: text('mpn_id'),
		customerTpid: text('customer_tpid'),
		accountName: text('account_name'),
		countryName: text('country_name'),
		copilotFit: text('copilot_fit'),
		copilotIntent: text('copilot_intent'),
		copilotCluster: text('copilot_cluster'),
		copilotEligibleM365Seats: integer('copilot_eligible_m365_seats'),
		freeCopilotChatMAU: integer('free_copilot_chat_mau'),
		copilotMAUPercentage: doublePrecision('copilot_mau_percentage'),
		copilotSeatsWhitespace: integer('copilot_seats_whitespace'),
		allAgentMAU: integer('all_agent_mau'),
		mciEligibility: integer('mci_eligibility'),
		mciEngagementName: text('mci_engagement_name'),
		adoptionStatus: text('adoption_status'),
		mwCspAnnualRenewal: text('mw_csp_annual_renewal'),
		mwPaidSeatRange: text('mw_paid_seat_range'),
		hasTransactedProduct: text('has_transacted_product'),
		hasCompete: text('has_compete'),
		tenantIds: text('tenant_ids'),
		subscriptionName: text('subscription_name'),
		licensesCount: integer('licenses_count'),
		subscriptionEndDate: date('subscription_end_date'),
		type: text('type'),
		dominantSkuGroup: text('dominant_sku_group'),
		dashboardVisible: boolean('dashboard_visible').notNull().default(true),
		createdBy: text('created_by')
			.notNull()
			.references(() => resellerUsers.id),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('external_subscription_org_idx').on(table.orgId),
		index('external_subscription_org_source_idx').on(
			table.orgId,
			table.source,
		),
		index('external_subscription_org_account_name_idx').on(
			table.orgId,
			table.accountName,
		),
		index('external_subscription_customer_tpid_idx').on(table.customerTpid),
		index('external_subscription_partner_global_id_idx').on(
			table.partnerGlobalId,
		),
		index('external_subscription_created_by_idx').on(table.createdBy),
		index('external_subscription_org_subscription_end_date_idx').on(
			table.orgId,
			table.subscriptionEndDate,
		),
		index('external_subscription_org_dashboard_visible_idx').on(
			table.orgId,
			table.dashboardVisible,
		),
	],
).enableRLS();

export const uploadJobs = pgTable(
	'upload_jobs',
	{
		id: text('id').primaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => resellerOrganizations.id, { onDelete: 'cascade' }),
		status: text('status').notNull().default('pending'),
		detectedSource: text('detected_source'),
		originalFilename: text('original_filename'),
		totalRows: integer('total_rows'),
		processedRows: integer('processed_rows').notNull().default(0),
		acceptedRows: integer('accepted_rows').notNull().default(0),
		rejectedRows: integer('rejected_rows').notNull().default(0),
		flaggedRowsData: text('flagged_rows_data'),
		errorMessage: text('error_message'),
		createdBy: text('created_by')
			.notNull()
			.references(() => resellerUsers.id),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		completedAt: timestamp('completed_at', { withTimezone: true }),
	},
	(table) => [
		index('upload_jobs_org_idx').on(table.orgId),
		index('upload_jobs_status_idx').on(table.status),
		index('upload_jobs_created_by_idx').on(table.createdBy),
		index('upload_jobs_created_at_idx').on(table.createdAt),
	],
).enableRLS();

export const resellerSubscriptionEnrichmentJobs = pgTable(
	'reseller_subscription_enrichment_jobs',
	{
		id: text('id').primaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => resellerOrganizations.id, { onDelete: 'cascade' }),
		status: text('status').notNull().default('pending'),
		originalFilename: text('original_filename').notNull(),
		totalRows: integer('total_rows').notNull().default(0),
		processedRows: integer('processed_rows').notNull().default(0),
		matchedRows: integer('matched_rows').notNull().default(0),
		unmatchedRows: integer('unmatched_rows').notNull().default(0),
		updatedSubscriptions: integer('updated_subscriptions').notNull().default(0),
		errorMessage: text('error_message'),
		createdByResellerUserId: text('created_by_reseller_user_id')
			.notNull()
			.references(() => resellerUsers.id),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		completedAt: timestamp('completed_at', { withTimezone: true }),
	},
	(table) => [
		index('reseller_subscription_enrichment_jobs_org_idx').on(table.orgId),
		index('reseller_subscription_enrichment_jobs_status_idx').on(table.status),
		index('reseller_subscription_enrichment_jobs_created_by_idx').on(
			table.createdByResellerUserId,
		),
		index('reseller_subscription_enrichment_jobs_created_at_idx').on(
			table.createdAt,
		),
	],
).enableRLS();

export type ResellerSubscriptionEnrichmentJobRow =
	typeof resellerSubscriptionEnrichmentJobs.$inferSelect;
export type InsertResellerSubscriptionEnrichmentJobRow =
	typeof resellerSubscriptionEnrichmentJobs.$inferInsert;

export const masterDistributors = pgTable(
	'master_distributor',
	{
		id: text('id').primaryKey(),
		distributorId: text('distributor_id'),
		name: text('name'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('master_distributor_distributor_id_idx').on(table.distributorId),
		index('master_distributor_name_idx').on(table.name),
	],
);

export const masterPartners = pgTable(
	'master_partner',
	{
		id: text('id').primaryKey(),
		globalId: text('global_id'),
		name: text('name'),
		mpnId: text('mpn_id'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('master_partner_global_id_idx').on(table.globalId),
		index('master_partner_name_idx').on(table.name),
		index('master_partner_mpn_id_idx').on(table.mpnId),
	],
);

export const masterCustomers = pgTable(
	'master_customer',
	{
		id: text('id').primaryKey(),
		customerTpid: text('customer_tpid'),
		customerName: text('customer_name'),
		countryName: text('country_name'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('master_customer_tpid_idx').on(table.customerTpid),
		index('master_customer_name_idx').on(table.customerName),
	],
);

export const flaggedRows = pgTable(
	'flagged_rows',
	{
		id: text('id').primaryKey(),
		uploadJobId: text('upload_job_id')
			.notNull()
			.references(() => uploadJobs.id, { onDelete: 'cascade' }),
		orgId: text('org_id')
			.notNull()
			.references(() => resellerOrganizations.id, { onDelete: 'cascade' }),
		reason: text('reason').notNull(),
		reasonDetail: text('reason_detail'),
		rawRow: text('raw_row').notNull(),
		candidateIds: text('candidate_ids'),
		status: text('status').notNull().default('pending'),
		resolvedBy: text('resolved_by'),
		resolvedAt: timestamp('resolved_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('flagged_rows_upload_job_idx').on(table.uploadJobId),
		index('flagged_rows_org_status_idx').on(table.orgId, table.status),
	],
);

export const resellerProposalGenerationSelections = pgTable(
	'reseller_proposal_generation_selections',
	{
		id: text('id').primaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => resellerOrganizations.id, { onDelete: 'cascade' }),
		generationRequestId: text('generation_request_id').notNull(),
		occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
		tenantId: text('tenant_id').notNull(),
		actorId: text('actor_id'),
		customerId: text('customer_id').notNull(),
		journey: text('journey').notNull(),
		customerSource: text('customer_source').notNull(),
		opportunityId: text('opportunity_id').notNull(),
		startingSkuId: text('starting_sku_id').notNull(),
		endingSkuId: text('ending_sku_id').notNull(),
		region: text('region'),
		distributorName: text('distributor_name'),
		resellerName: text('reseller_name'),
		pssAIWorkforceName: text('pss_ai_workforce_name'),
		pssAISecurityName: text('pss_ai_security_name'),
		pdmName: text('pdm_name'),
		pmmName: text('pmm_name'),
		subscriptionType: text('subscription_type'),
		expiringSeatCount: integer('expiring_seat_count'),
		selectedSeats: integer('selected_seats').notNull(),
		currentSkuCustomerPrice: doublePrecision('current_sku_customer_price'),
		currentSkuResellerPrice: doublePrecision('current_sku_reseller_price'),
		targetSkuCustomerPrice: doublePrecision('target_sku_customer_price'),
		targetSkuResellerPrice: doublePrecision('target_sku_reseller_price'),
		targetSkuPrice: doublePrecision('target_sku_price'),
		targetSkuMarginPercent: doublePrecision('target_sku_margin_percent'),
		requestId: text('request_id'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex('reseller_pgs_generation_request_scenario_uidx').on(
			table.generationRequestId,
			table.opportunityId,
			table.endingSkuId,
		),
		index('reseller_pgs_generation_request_idx').on(table.generationRequestId),
		index('reseller_pgs_org_occurred_idx').on(table.orgId, table.occurredAt),
		index('reseller_pgs_org_ending_sku_occurred_idx').on(
			table.orgId,
			table.endingSkuId,
			table.occurredAt,
		),
		index('reseller_pgs_org_actor_occurred_idx').on(
			table.orgId,
			table.actorId,
			table.occurredAt,
		),
		index('reseller_pgs_tenant_occurred_idx').on(
			table.tenantId,
			table.occurredAt,
		),
	],
).enableRLS();

export const pdfGenerationJobs = pgTable(
	'pdf_generation_jobs',
	{
		id: text('id').primaryKey(),
		dlToken: text('dl_token').notNull(),
		createdByEntraObjectId: text('created_by_entra_object_id').notNull(),
		orgId: text('org_id'),
		status: text('status').notNull().default('queued'),
		filters: jsonb('filters').notNull(),
		sort: jsonb('sort').notNull(),
		viewMode: text('view_mode').notNull(),
		selectedSkuIds: jsonb('selected_sku_ids'),
		totalRows: integer('total_rows').notNull(),
		totalChunks: integer('total_chunks').notNull(),
		completedChunks: integer('completed_chunks').notNull().default(0),
		partSize: integer('part_size').notNull().default(25_000),
		totalParts: integer('total_parts').notNull().default(1),
		completedParts: integer('completed_parts').notNull().default(0),
		parts: jsonb('parts')
			.notNull()
			.default(sql`'[]'::jsonb`),
		progress: integer('progress').notNull().default(0),
		azureBlobUrl: text('azure_blob_url'),
		errorMessage: text('error_message'),
		pdfPasswordCiphertext: text('pdf_password_ciphertext'),
		pdfPasswordRevealedAt: timestamp('pdf_password_revealed_at', {
			withTimezone: true,
		}),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
		startedAt: timestamp('started_at', { withTimezone: true }),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
	},
	(table) => [
		uniqueIndex('pdf_jobs_dl_token_uidx').on(table.dlToken),
		index('pdf_jobs_created_by_entra_object_id_idx').on(
			table.createdByEntraObjectId,
		),
		index('pdf_jobs_status_idx').on(table.status),
		index('pdf_jobs_created_idx').on(table.createdAt),
		index('pdf_jobs_org_id_idx').on(table.orgId),
	],
);

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type InsertSubscriptionRow = typeof subscriptions.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type InsertUserRow = typeof users.$inferInsert;
export type UserIdentityAliasRow = typeof userIdentityAliases.$inferSelect;
export type InsertUserIdentityAliasRow =
	typeof userIdentityAliases.$inferInsert;
export type ProposalGenerationSelectionRow =
	typeof proposalGenerationSelections.$inferSelect;
export type InsertProposalGenerationSelectionRow =
	typeof proposalGenerationSelections.$inferInsert;
export type AnalyticsDownloadIssuanceRow =
	typeof analyticsDownloadIssuances.$inferSelect;
export type InsertAnalyticsDownloadIssuanceRow =
	typeof analyticsDownloadIssuances.$inferInsert;
export type AnalyticsDownloadFactRow =
	typeof analyticsDownloadFacts.$inferSelect;
export type InsertAnalyticsDownloadFactRow =
	typeof analyticsDownloadFacts.$inferInsert;
export type DownloadTokenRedemptionRow =
	typeof downloadTokenRedemptions.$inferSelect;
export type InsertDownloadTokenRedemptionRow =
	typeof downloadTokenRedemptions.$inferInsert;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type InsertAuditEventRow = typeof auditEvents.$inferInsert;
export type ResellerOrganizationRow = typeof resellerOrganizations.$inferSelect;
export type InsertResellerOrganizationRow =
	typeof resellerOrganizations.$inferInsert;
export type ResellerUserRow = typeof resellerUsers.$inferSelect;
export type InsertResellerUserRow = typeof resellerUsers.$inferInsert;
export type ResellerUserIdentityAliasRow =
	typeof resellerUserIdentityAliases.$inferSelect;
export type InsertResellerUserIdentityAliasRow =
	typeof resellerUserIdentityAliases.$inferInsert;
export type ResellerAuditEventRow = typeof resellerAuditEvents.$inferSelect;
export type InsertResellerAuditEventRow =
	typeof resellerAuditEvents.$inferInsert;
export type ExternalSubscriptionRow = typeof externalSubscriptions.$inferSelect;
export type InsertExternalSubscriptionRow =
	typeof externalSubscriptions.$inferInsert;
export type UploadJobRow = typeof uploadJobs.$inferSelect;
export type InsertUploadJobRow = typeof uploadJobs.$inferInsert;
export type MasterDistributorRow = typeof masterDistributors.$inferSelect;
export type InsertMasterDistributorRow = typeof masterDistributors.$inferInsert;
export type MasterPartnerRow = typeof masterPartners.$inferSelect;
export type InsertMasterPartnerRow = typeof masterPartners.$inferInsert;
export type MasterCustomerRow = typeof masterCustomers.$inferSelect;
export type InsertMasterCustomerRow = typeof masterCustomers.$inferInsert;
export type FlaggedRowRow = typeof flaggedRows.$inferSelect;
export type InsertFlaggedRowRow = typeof flaggedRows.$inferInsert;
export type ResellerProposalGenerationSelectionRow =
	typeof resellerProposalGenerationSelections.$inferSelect;
export type InsertResellerProposalGenerationSelectionRow =
	typeof resellerProposalGenerationSelections.$inferInsert;
export type PdfGenerationJobRow = typeof pdfGenerationJobs.$inferSelect;
export type InsertPdfGenerationJobRow = typeof pdfGenerationJobs.$inferInsert;

export const resellerOtps = pgTable(
	'reseller_otps',
	{
		id: text('id').primaryKey(),
		email: text('email').notNull(),
		otpHash: text('otp_hash').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		attempts: integer('attempts').notNull().default(0),
		usedAt: timestamp('used_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('reseller_otps_email_idx').on(table.email),
		index('reseller_otps_expires_at_idx').on(table.expiresAt),
	],
).enableRLS();

export type ResellerOtpRow = typeof resellerOtps.$inferSelect;
export type InsertResellerOtpRow = typeof resellerOtps.$inferInsert;

export const CSP_PARTNER_EVENT_TYPES = [
	'login',
	'view_proposal',
	'proposal_generated',
	'subscription_upload',
] as const;
export type CspPartnerEventType = (typeof CSP_PARTNER_EVENT_TYPES)[number];

export const CSP_PARTNER_STARTING_SKU_IDS = ['bb', 'bs', 'bp', 'other'] as const;
export type CspPartnerStartingSkuId =
	(typeof CSP_PARTNER_STARTING_SKU_IDS)[number];

export const CSP_PARTNER_ENDING_SKU_IDS = [
	'bs_cb',
	'bp_cb',
	'bp_cb_purview',
	'bp_defender',
	'bp_purview',
	'bp_defender_purview',
] as const;
export type CspPartnerEndingSkuId =
	(typeof CSP_PARTNER_ENDING_SKU_IDS)[number];

export const CSP_PARTNER_COUNTRY_VALUES = Object.values(CustomerRegion) as [
	string,
	...string[],
];
export type CspPartnerCountry = (typeof CSP_PARTNER_COUNTRY_VALUES)[number];

export const cspPartnerEventTypeEnum = pgEnum(
	'csp_partner_event_type',
	CSP_PARTNER_EVENT_TYPES,
);

export const cspPartnerStartingSkuEnum = pgEnum(
	'csp_partner_starting_sku',
	CSP_PARTNER_STARTING_SKU_IDS,
);

export const cspPartnerEndingSkuEnum = pgEnum(
	'csp_partner_ending_sku',
	CSP_PARTNER_ENDING_SKU_IDS,
);

export const cspPartnerCountryEnum = pgEnum(
	'csp_partner_country',
	CSP_PARTNER_COUNTRY_VALUES,
);

export const cspPartnerAnalyticsEvents = pgTable(
	'csp_partner_analytics_events',
	{
		id: text('id').primaryKey(),
		orgId: text('org_id')
			.notNull()
			.references(() => resellerOrganizations.id, { onDelete: 'cascade' }),
		actorId: text('actor_id')
			.notNull()
			.references(() => resellerUsers.id, { onDelete: 'cascade' }),
		eventType: cspPartnerEventTypeEnum('event_type').notNull(),
		country: cspPartnerCountryEnum('country'),
		startingSkuId: cspPartnerStartingSkuEnum('starting_sku_id'),
		endingSkuId: cspPartnerEndingSkuEnum('ending_sku_id'),
		uploadCount: integer('upload_count'),
		metadata: jsonb('metadata')
			.notNull()
			.default(sql`'{}'::jsonb`),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index('csp_pae_org_created_idx').on(table.orgId, table.createdAt),
		index('csp_pae_event_created_idx').on(table.eventType, table.createdAt),
		index('csp_pae_country_created_idx').on(table.country, table.createdAt),
		index('csp_pae_org_event_created_idx').on(
			table.orgId,
			table.eventType,
			table.createdAt,
		),
		index('csp_pae_starting_sku_created_idx').on(
			table.startingSkuId,
			table.createdAt,
		),
		index('csp_pae_ending_sku_created_idx').on(
			table.endingSkuId,
			table.createdAt,
		),
	],
).enableRLS();

export type CspPartnerAnalyticsEventRow =
	typeof cspPartnerAnalyticsEvents.$inferSelect;
export type InsertCspPartnerAnalyticsEventRow =
	typeof cspPartnerAnalyticsEvents.$inferInsert;
