import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsIn,
	IsOptional,
	IsString,
	ValidateNested,
} from 'class-validator';
import type {
	DashboardSortDirection,
	DashboardViewMode,
} from '../../dashboard/dashboard.types';
import {
	SUPPORTED_CURRENCIES,
	type RegionalCurrencyCode,
} from '@repo/shared';
import { toStringArray } from '../../common/query/query-normalizers';

export class PdfFiltersDto {
	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	pssAIWorkforce: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	pssAISecurity: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	psa: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	distributor: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	reseller: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	customer: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	pdm: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	pmm: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	region: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	type: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	skuCategory: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	expSeats: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	renewalDate: string[] = [];

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	pastRenewalDate: string[] = [];

	@IsOptional()
	@IsString()
	search = '';
}

export class PdfSortDto {
	@IsString()
	sortBy!: string;

	@IsIn(['ascending', 'descending'])
	sortDir!: DashboardSortDirection;
}

export class RenderResellerListDto {
	@ValidateNested()
	@Type(() => PdfFiltersDto)
	filters!: PdfFiltersDto;

	@ValidateNested()
	@Type(() => PdfSortDto)
	sort!: PdfSortDto;

	@IsOptional()
	@Transform(({ value }) => toStringArray(value))
	@IsArray()
	@IsString({ each: true })
	selectedSkuIds: string[] = [];

	@IsOptional()
	@IsIn(SUPPORTED_CURRENCIES as readonly string[])
	currency?: RegionalCurrencyCode;
}

export class CreatePdfListLinkDto extends RenderResellerListDto {
	@IsIn(['reseller', 'customer', 'opportunity'])
	viewMode!: DashboardViewMode;
}
