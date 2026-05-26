import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsIn,
	IsInt,
	IsOptional,
	IsString,
	Max,
	Min,
} from 'class-validator';
import { toStringArray } from '../../common/query/query-normalizers';

export class DashboardQueryDto {
	@IsOptional()
	@IsIn(['customer', 'reseller', 'opportunity'])
	viewMode?: 'customer' | 'reseller' | 'opportunity';

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(10000)
	pageSize?: number;

	@IsOptional()
	@IsString()
	sortBy?: string;

	@IsOptional()
	@IsIn(['ascending', 'descending'])
	sortDir?: 'ascending' | 'descending';

	@IsOptional()
	@IsString()
	search?: string;

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	pssAIWorkforce?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	pssAISecurity?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	psa?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	distributor?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	reseller?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	customer?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	pdm?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	pmm?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	region?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	type?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	skuCategory?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	expSeats?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	renewalDate?: string[];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	pastRenewalDate?: string[];

	@IsOptional()
	@IsString()
	customerId?: string;

	@IsOptional()
	@IsIn(['rows', 'summary', 'options'])
	include?: 'rows' | 'summary' | 'options';

	@IsOptional()
	@IsString()
	includeParts?: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(500)
	optionsLimit?: number;
}
