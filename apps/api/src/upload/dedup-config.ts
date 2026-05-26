import type { SourceType } from './upload.types';

// ─────────────────────────────────────────────────────────────────────
//  SUBSCRIPTION  dedup config  (external_subscriptions table)
// ─────────────────────────────────────────────────────────────────────
//
//  How matching works:
//   1. Fetch candidates from DB by  customer  +  orgId
//   2. Narrow in JS by  subscription  (normalized name comparison)
//   3. Narrow in JS by  partner  (same-type identifier must match,
//      no overlapping type = treat as same, both empty = treat as same)
//   4. 0 matches → create | 1 match → enrich | 2+ → flag ambiguous
//
//  CLAS sources have no subscription identity so step 2 is skipped;
//  they enrich ALL records that match customer + partner.
// ─────────────────────────────────────────────────────────────────────

export interface SubscriptionDedupRule {
	/** Columns used to locate the customer (checked in priority order) */
	customer: ('customerTpid' | 'accountName')[];
	/** Columns used to identify the partner (for same-partner check) */
	partner: ('partnerGlobalId' | 'mpnId' | 'partnerName')[];
	/** Columns used to match the subscription itself */
	subscription: ('subscriptionName')[];
	/** Can this source create a brand-new external_subscriptions row? */
	canCreate: boolean;
}

export const SUBSCRIPTION_DEDUP: Record<SourceType, SubscriptionDedupRule> = {
	/*
	 * Microsoft Renewal list
	 * Has: Distributor, Reseller Name, TPID, Customer Name, Product, Seats, End Date, Type
	 */
	RENEWAL_MICROSOFT: {
		customer: ['customerTpid', 'accountName'],
		partner: ['partnerName'],
		subscription: ['subscriptionName'],
		canCreate: true,
	},

	/*
	 * Partner Center renewal export
	 * Has: PGAMpnId, MpnId, CustomerName, SubscriptionName, LicensesCount, EndDate
	 * Missing: Distributor, Reseller Name, TPID, Type
	 */
	RENEWAL_PARTNER: {
		customer: ['accountName'],
		partner: ['partnerGlobalId', 'mpnId'],
		subscription: ['subscriptionName'],
		canCreate: true,
	},

	/*
	 * CLAS Microsoft list  (Copilot / AI enrichment)
	 * Has: Distributor, Partner Name, Partner Global/One ID, TPID, Account Name, CLAS fields
	 * No subscription-level identity → enriches all rows for the customer+partner
	 */
	CLAS_MICROSOFT: {
		customer: ['customerTpid', 'accountName'],
		partner: ['partnerName', 'partnerGlobalId', 'mpnId'],
		subscription: [],
		canCreate: true, // creates a stub row if nothing exists yet
	},

	/*
	 * CLAS Partner list
	 * Has: PartnerName, GlobalID, CustomerID, AccountName, CLAS fields
	 * No subscription-level identity
	 */
	CLAS_PARTNER: {
		customer: ['customerTpid', 'accountName'],
		partner: ['partnerName', 'partnerGlobalId'],
		subscription: [],
		canCreate: true,
	},

	/*
	 * Custom / generic CSV
	 * Has: Customer Name, Country (partner info optional)
	 */
	CUSTOM: {
		customer: ['accountName'],
		partner: [],
		subscription: ['subscriptionName'],
		canCreate: true,
	},
};

// ─────────────────────────────────────────────────────────────────────
//  PARTNER  dedup config  (master_partners table)
// ─────────────────────────────────────────────────────────────────────
//
//  How matching works:
//   1. For each column in `matchBy` (in order), search master_partners
//   2. First hit → enrich the existing row with any missing identifiers
//   3. No hit + canCreate = true → insert a new master_partners row
//   4. No hit + canCreate = false → skip (source lacks enough identity)
// ─────────────────────────────────────────────────────────────────────

export interface PartnerDedupRule {
	/** Columns to search for an existing master_partners row (priority order) */
	matchBy: ('globalId' | 'name' | 'mpnId')[];
	/** Can this source insert a new master_partners row? */
	canCreate: boolean;
}

export const PARTNER_DEDUP: Record<SourceType, PartnerDedupRule> = {
	RENEWAL_MICROSOFT: {
		matchBy: ['name'],
		canCreate: true, // has Reseller Name
	},

	RENEWAL_PARTNER: {
		matchBy: ['globalId', 'mpnId'],
		canCreate: true, // org's MPN ID is stamped as oneId on every row
	},

	CLAS_MICROSOFT: {
		matchBy: ['globalId', 'name', 'mpnId'],
		canCreate: true, // has Partner Name + Global/One ID
	},

	CLAS_PARTNER: {
		matchBy: ['globalId', 'name'],
		canCreate: true, // has PartnerName + GlobalID
	},

	CUSTOM: {
		matchBy: [],
		canCreate: false, // no partner info in custom uploads
	},
};

// ─────────────────────────────────────────────────────────────────────
//  DISTRIBUTOR  dedup config  (master_distributors table)
// ─────────────────────────────────────────────────────────────────────

export interface DistributorDedupRule {
	matchBy: ('distributorId' | 'name')[];
	canCreate: boolean;
}

export const DISTRIBUTOR_DEDUP: Record<SourceType, DistributorDedupRule> = {
	RENEWAL_MICROSOFT: {
		matchBy: ['distributorId', 'name'],
		canCreate: true,
	},

	RENEWAL_PARTNER: {
		matchBy: [],
		canCreate: false, // no distributor info
	},

	CLAS_MICROSOFT: {
		matchBy: ['name'],
		canCreate: true, // has Distributor Name
	},

	CLAS_PARTNER: {
		matchBy: [],
		canCreate: false, // no distributor info
	},

	CUSTOM: {
		matchBy: [],
		canCreate: false,
	},
};

// ─────────────────────────────────────────────────────────────────────
//  CUSTOMER  dedup config  (master_customers table)
// ─────────────────────────────────────────────────────────────────────

export interface CustomerDedupRule {
	matchBy: ('customerTpid' | 'accountName')[];
	canCreate: boolean;
}

export const CUSTOMER_DEDUP: Record<SourceType, CustomerDedupRule> = {
	RENEWAL_MICROSOFT: {
		matchBy: ['customerTpid', 'accountName'],
		canCreate: true,
	},

	RENEWAL_PARTNER: {
		matchBy: ['accountName'],
		canCreate: true,
	},

	CLAS_MICROSOFT: {
		matchBy: ['customerTpid', 'accountName'],
		canCreate: true,
	},

	CLAS_PARTNER: {
		matchBy: ['customerTpid', 'accountName'],
		canCreate: true,
	},

	CUSTOM: {
		matchBy: ['accountName'],
		canCreate: true,
	},
};
