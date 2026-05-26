import {
	IsNumber,
	IsString,
	IsOptional,
	Min,
	MinLength,
	IsIn,
} from 'class-validator';
import { CustomerRegion } from '@repo/types';

const VALID_REGIONS = Object.values(CustomerRegion);

export class CreateResellerCustomerDto {
	@IsString()
	@MinLength(1)
	customerName!: string;

	@IsOptional()
	@IsString()
	customerTpid?: string;

	@IsString()
	@MinLength(1)
	@IsIn(VALID_REGIONS)
	countryName!: string;

	@IsOptional()
	@IsString()
	renewalDate?: string;

	@IsOptional()
	@IsString()
	renewalMonth?: string;

	@IsOptional()
	@IsString()
	subscriptionName?: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	licenseCount?: number;
}
