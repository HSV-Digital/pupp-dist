export type SourceType =
	| 'RENEWAL_MICROSOFT'
	| 'RENEWAL_PARTNER'
	| 'CLAS_MICROSOFT'
	| 'CLAS_PARTNER'
	| 'CUSTOM';

export type UploadSource =
	| 'form'
	| 'csv'
	| 'xlsx'
	| 'microsoft'
	| 'partner_center_api'
	| 'partner_center_upload';

export interface MappedRow {
	distributorName?: string;
	distributorId?: string;
	partnerName?: string;
	partnerGlobalId?: string;
	mpnId?: string;
	customerTpid?: string;
	accountName?: string;
	countryName?: string;
	copilotFit?: string;
	copilotIntent?: string;
	copilotCluster?: string;
	mwCspAnnualRenewal?: string;
	mwPaidSeatRange?: string;
	hasTransactedProduct?: string;
	hasCompete?: string;
	tenantIds?: string;
	subscriptionName?: string;
	licensesCount?: number;
	subscriptionEndDate?: string;
	type?: string;
	/** Raw Org Size range bounds from CLAS sheets; used for dashboard visibility. */
	orgSizeRange?: { lower: number; upper: number };
}

export interface ColumnMapper {
	sourceType: SourceType;
	mapRow(raw: Record<string, string>): MappedRow;
	validate(raw: Record<string, string>): { valid: boolean; errors: string[] };
}

export interface ParsedFile {
	headers: string[];
	rows: Record<string, string>[];
}

export interface UploadJobProgress {
	status: string;
	processed: number;
	total: number;
	accepted: number;
	rejected: number;
	flagged: number;
}
