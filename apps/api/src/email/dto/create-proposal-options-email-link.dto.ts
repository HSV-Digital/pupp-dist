import { Type } from 'class-transformer';
import {
	IsArray,
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
	type ProposalOptionsFilter,
	type ProposalOptionsJourney,
	type RegionalCurrencyCode,
	type StartingSkuId,
} from '@repo/shared';

const JOURNEYS: ProposalOptionsJourney[] = ['new_customer', 'renewal'];
const FILTERS: ProposalOptionsFilter[] = ['ai', 'security', 'all'];
const STARTING_SKU_IDS: StartingSkuId[] = ['bb', 'bs', 'bp', 'other'];

export class ProposalOptionsSelectedScenarioDto {
	@IsString()
	@MaxLength(300)
	opportunityId!: string;

	@IsString()
	@MaxLength(200)
	endingSkuId!: string;

	@Type(() => Number)
	@IsNumber()
	@Min(0)
	selectedSeats!: number;

	@Type(() => Number)
	@IsNumber()
	@Min(0)
	originalSeats!: number;

	@Type(() => Number)
	@IsNumber()
	@Min(0)
	expiringArr!: number;

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
}

export class CreateProposalOptionsEmailLinkPayloadDto {
	@IsIn(JOURNEYS)
	journey!: ProposalOptionsJourney;

	@IsIn(FILTERS)
	filter!: ProposalOptionsFilter;

	@IsString()
	@MaxLength(200)
	customerId!: string;

	@IsString()
	@MaxLength(200)
	customerName!: string;

	@IsString()
	@MaxLength(300)
	opportunityId!: string;

	@IsIn(STARTING_SKU_IDS)
	startingSkuId!: StartingSkuId;

	@IsString()
	@MaxLength(200)
	startingSkuName!: string;

	@IsOptional()
	@IsString()
	@MaxLength(200)
	region?: string;

	@IsOptional()
	@IsIn(SUPPORTED_CURRENCIES as readonly string[])
	currency?: RegionalCurrencyCode;

	@Type(() => Number)
	@IsNumber()
	@Min(0)
	seats!: number;

	@Type(() => Number)
	@IsNumber()
	@Min(0)
	expiringArr!: number;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	renewalDate?: string | null;

	@IsArray()
	@IsString({ each: true })
	selectedEndingSkuIds!: string[];

	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => ProposalOptionsSelectedScenarioDto)
	selectedScenarios?: ProposalOptionsSelectedScenarioDto[];
}
