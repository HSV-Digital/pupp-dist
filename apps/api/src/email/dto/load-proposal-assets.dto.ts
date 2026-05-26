import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsEnum,
	IsIn,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import {
	SUPPORTED_CURRENCIES,
	type ProposalOptionsJourney,
	type RegionalCurrencyCode,
} from '@repo/shared';
import { SkuCategory, type PartnerFiltersPayload } from '@repo/types';

export class PartnerFiltersPayloadDto implements PartnerFiltersPayload {
	@IsOptional()
	@IsString()
	@MaxLength(50)
	partnerType?: string;

	@IsOptional()
	@IsBoolean()
	hasSolutionPartnerDesignation?: boolean;

	@IsOptional()
	@IsBoolean()
	hasOver25Points?: boolean;

	@IsOptional()
	@IsBoolean()
	isNewCustomerIncentive?: boolean;
}

const JOURNEYS: ProposalOptionsJourney[] = ['new_customer', 'renewal'];
const CUSTOMER_SOURCES = [
	'dashboard',
	'partner_customer',
	'reseller_customer',
] as const;

export class ProposalAssetSelectionDto {
	@IsString()
	@MaxLength(300)
	opportunityId!: string;

	@IsString()
	@MaxLength(120)
	endingSkuId!: string;

	@Type(() => Number)
	@IsNumber()
	@Min(0)
	seats!: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	currentSkuCustomerPrice?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	currentSkuResellerPrice?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	targetSkuCustomerPrice?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	targetSkuResellerPrice?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	expiringSkuRenewalPrice?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	targetSkuPrice?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	targetSkuMarginPercent?: number;
}

export class RenewalSubscriptionDto {
	@IsString()
	@MaxLength(200)
	customerId!: string;

	@IsString()
	@MaxLength(300)
	subscriptionId!: string;

	@IsString()
	@MaxLength(300)
	customerName!: string;

	@IsString()
	@MaxLength(300)
	resellerName!: string;

	@IsString()
	@MaxLength(300)
	distributorName!: string;

	@IsString()
	@MaxLength(300)
	pssAIWorkforceName!: string;

	@IsString()
	@MaxLength(300)
	pssAISecurityName!: string;

	@IsString()
	@MaxLength(300)
	psaName!: string;

	@IsString()
	@MaxLength(300)
	pdmName!: string;

	@IsString()
	@MaxLength(300)
	pmmName!: string;

	@IsString()
	@MaxLength(300)
	currentProduct!: string;

	@IsOptional()
	@IsString()
	@MaxLength(120)
	type?: string;

	@IsEnum(SkuCategory)
	skuCategory!: SkuCategory;

	@Type(() => Number)
	@IsNumber()
	@Min(0)
	seatCount!: number;

	@Type(() => Number)
	@IsNumber()
	annualRevenueRunRate!: number;

	@IsString()
	@MaxLength(120)
	renewalDate!: string;

	@Type(() => Number)
	@IsNumber()
	@Min(0)
	termMonths!: number;

	@IsBoolean()
	autoRenew!: boolean;

	@IsBoolean()
	multiYear!: boolean;

	@IsBoolean()
	hasCopilot!: boolean;

	@IsBoolean()
	hasPurview!: boolean;

	@IsBoolean()
	hasSureStep!: boolean;

	@Type(() => Number)
	@IsNumber()
	currentMargin!: number;

	@IsString()
	@MaxLength(200)
	customerSegment!: string;

	@IsString()
	@MaxLength(200)
	region!: string;

	@IsString()
	@MaxLength(1000)
	notes!: string;
}

export class ProposalAssetsCustomerSnapshotDto {
	@IsString()
	@MaxLength(200)
	customerId!: string;

	@IsString()
	@MaxLength(300)
	customerName!: string;

	@IsArray()
	@ArrayMaxSize(100)
	@ValidateNested({ each: true })
	@Type(() => RenewalSubscriptionDto)
	subscriptions!: RenewalSubscriptionDto[];
}

export class LoadProposalAssetsDto {
	@IsIn(JOURNEYS)
	journey!: ProposalOptionsJourney;

	@IsString()
	@MaxLength(200)
	customerId!: string;

	@IsIn(CUSTOMER_SOURCES)
	customerSource!: (typeof CUSTOMER_SOURCES)[number];

	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(50)
	@ValidateNested({ each: true })
	@Type(() => ProposalAssetSelectionDto)
	selections!: ProposalAssetSelectionDto[];

	@IsOptional()
	@IsIn(SUPPORTED_CURRENCIES as readonly string[])
	currency?: RegionalCurrencyCode;

	@IsOptional()
	@ValidateNested()
	@Type(() => PartnerFiltersPayloadDto)
	partnerFilters?: PartnerFiltersPayloadDto;
}

export class LoadProposalAssetsPublicDto {
	@IsIn(JOURNEYS)
	journey!: ProposalOptionsJourney;

	@ValidateNested()
	@Type(() => ProposalAssetsCustomerSnapshotDto)
	customerSnapshot!: ProposalAssetsCustomerSnapshotDto;

	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(50)
	@ValidateNested({ each: true })
	@Type(() => ProposalAssetSelectionDto)
	selections!: ProposalAssetSelectionDto[];

	@IsOptional()
	@IsBoolean()
	useChatToPaidFlyers?: boolean;

	@IsOptional()
	@IsIn(SUPPORTED_CURRENCIES as readonly string[])
	currency?: RegionalCurrencyCode;

	@IsOptional()
	@ValidateNested()
	@Type(() => PartnerFiltersPayloadDto)
	partnerFilters?: PartnerFiltersPayloadDto;
}

export class GenerateProposalAssetLineItemDto {
	@IsIn(JOURNEYS)
	journey!: ProposalOptionsJourney;

	@IsString()
	@MaxLength(200)
	customerId!: string;

	@IsIn(CUSTOMER_SOURCES)
	customerSource!: (typeof CUSTOMER_SOURCES)[number];

	@ValidateNested()
	@Type(() => ProposalAssetSelectionDto)
	selection!: ProposalAssetSelectionDto;

	@IsOptional()
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(50)
	@ValidateNested({ each: true })
	@Type(() => ProposalAssetSelectionDto)
	selectionContext?: ProposalAssetSelectionDto[];

	@IsOptional()
	@IsIn(SUPPORTED_CURRENCIES as readonly string[])
	currency?: RegionalCurrencyCode;

	@IsOptional()
	@ValidateNested()
	@Type(() => PartnerFiltersPayloadDto)
	partnerFilters?: PartnerFiltersPayloadDto;
}

export class GenerateProposalAssetLineItemPublicDto {
	@IsIn(JOURNEYS)
	journey!: ProposalOptionsJourney;

	@ValidateNested()
	@Type(() => ProposalAssetsCustomerSnapshotDto)
	customerSnapshot!: ProposalAssetsCustomerSnapshotDto;

	@ValidateNested()
	@Type(() => ProposalAssetSelectionDto)
	selection!: ProposalAssetSelectionDto;

	@IsOptional()
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(50)
	@ValidateNested({ each: true })
	@Type(() => ProposalAssetSelectionDto)
	selectionContext?: ProposalAssetSelectionDto[];

	@IsOptional()
	@IsBoolean()
	useChatToPaidFlyers?: boolean;

	@IsOptional()
	@IsIn(SUPPORTED_CURRENCIES as readonly string[])
	currency?: RegionalCurrencyCode;

	@IsOptional()
	@ValidateNested()
	@Type(() => PartnerFiltersPayloadDto)
	partnerFilters?: PartnerFiltersPayloadDto;
}
