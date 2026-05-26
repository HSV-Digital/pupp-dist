import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsIn,
	IsNumber,
	IsOptional,
	IsString,
	ValidateNested,
} from 'class-validator';

class DemoCustomerListRowDto {
	@IsString()
	customerId!: string;

	@IsString()
	customerName!: string;

	@IsNumber()
	expiringArr!: number;

	@IsNumber()
	seats!: number;

	@IsNumber()
	basicSeats!: number;

	@IsNumber()
	standardSeats!: number;

	@IsNumber()
	premiumSeats!: number;

	@IsOptional()
	@IsString()
	proposalLink?: string;
}

class DemoResellerListRowDto {
	@IsString()
	resellerName!: string;

	@IsNumber()
	customerCount!: number;

	@IsNumber()
	opportunityCount!: number;

	@IsNumber()
	expiringArr!: number;

	@IsNumber()
	seats!: number;

	@IsOptional()
	@IsString()
	proposalLink?: string;
}

export class DemoRenderCustomerListDto {
	@IsIn(['customer'])
	viewMode!: 'customer';

	@IsArray()
	@ArrayMaxSize(5000)
	@ValidateNested({ each: true })
	@Type(() => DemoCustomerListRowDto)
	rows!: DemoCustomerListRowDto[];
}

export class DemoRenderResellerListDto {
	@IsIn(['reseller'])
	viewMode!: 'reseller';

	@IsArray()
	@ArrayMaxSize(5000)
	@ValidateNested({ each: true })
	@Type(() => DemoResellerListRowDto)
	rows!: DemoResellerListRowDto[];
}
