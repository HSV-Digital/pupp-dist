import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import {
	SUPPORTED_CURRENCIES,
	type RegionalCurrencyCode,
} from '@repo/shared';

export class ResellerCustomerPdfFiltersDto {
	@IsOptional()
	@IsString({ each: true })
	customerName?: string[];

	@IsOptional()
	@IsString({ each: true })
	currentSku?: string[];

	@IsOptional()
	@IsString({ each: true })
	region?: string[];

	@IsOptional()
	@IsString({ each: true })
	seats?: string[];

	@IsOptional()
	@IsString({ each: true })
	currentArr?: string[];

	@IsOptional()
	@IsString({ each: true })
	renewalDate?: string[];

	@IsOptional()
	@IsString({ each: true })
	copilotFit?: string[];

	@IsOptional()
	@IsString({ each: true })
	copilotIntent?: string[];

	@IsOptional()
	@IsString({ each: true })
	copilotCluster?: string[];

	@IsOptional()
	@IsString({ each: true })
	hasCompete?: string[];

	@IsOptional()
	@IsString({ each: true })
	distributorName?: string[];

	@IsOptional()
	@IsString({ each: true })
	customerTpid?: string[];

	@IsOptional()
	@IsString({ each: true })
	copilotChatToPaid?: string[];
}

export class ResellerCustomerPdfSortDto {
	@IsOptional()
	@IsString()
	sortBy?: string;

	@IsOptional()
	@IsIn(['ascending', 'descending'])
	sortDir?: 'ascending' | 'descending';
}

export class CreateResellerCustomerPdfDto {
	@IsOptional()
	@ValidateNested()
	@Type(() => ResellerCustomerPdfFiltersDto)
	filters?: ResellerCustomerPdfFiltersDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => ResellerCustomerPdfSortDto)
	sort?: ResellerCustomerPdfSortDto;

	@IsOptional()
	@IsIn(SUPPORTED_CURRENCIES as readonly string[])
	currency?: RegionalCurrencyCode;
}
