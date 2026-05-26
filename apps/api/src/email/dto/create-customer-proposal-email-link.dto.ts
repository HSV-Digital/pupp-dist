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
	type ProposalOptionsJourney,
	type RegionalCurrencyCode,
	type StartingSkuId,
} from '@repo/shared';
import { PartnerFiltersPayloadDto } from './load-proposal-assets.dto';

const JOURNEYS: ProposalOptionsJourney[] = ['new_customer', 'renewal'];
const STARTING_SKU_IDS: StartingSkuId[] = ['bb', 'bs', 'bp', 'other'];

export class CustomerProposalEmailScenarioDto {
	@IsString()
	@MaxLength(300)
	opportunityId!: string;

	@IsIn(STARTING_SKU_IDS)
	startingSkuId!: StartingSkuId;

	@IsString()
	@MaxLength(200)
	startingSkuName!: string;

	@IsString()
	@MaxLength(120)
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

	@IsOptional()
	@IsString()
	@MaxLength(200)
	region?: string;
}

export class CreateCustomerProposalEmailLinkDto {
	@IsIn(JOURNEYS)
	journey!: ProposalOptionsJourney;

	@IsString()
	@MaxLength(200)
	customerId!: string;

	@IsString()
	@MaxLength(200)
	customerName!: string;

	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => CustomerProposalEmailScenarioDto)
	scenarios!: CustomerProposalEmailScenarioDto[];

	@IsOptional()
	@IsIn(SUPPORTED_CURRENCIES as readonly string[])
	currency?: RegionalCurrencyCode;

	@IsOptional()
	@ValidateNested()
	@Type(() => PartnerFiltersPayloadDto)
	partnerFilters?: PartnerFiltersPayloadDto;
}
