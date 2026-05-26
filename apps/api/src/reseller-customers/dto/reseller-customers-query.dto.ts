import {
	ArrayMaxSize,
	IsArray,
	IsNumber,
	IsOptional,
	IsString,
	Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

function splitCommaSeparatedQueryValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value;
	}

	if (typeof value === 'string') {
		return [value];
	}

	return value;
}

export class ResellerCustomersQueryDto {
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(1)
	page?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(1)
	pageSize?: number;

	@IsOptional()
	@IsString()
	sortBy?: string;

	@IsOptional()
	@IsString()
	sortDir?: 'ascending' | 'descending';

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	customerName?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	currentSku?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	region?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	seats?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	currentArr?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	renewalDate?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	copilotFit?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	copilotIntent?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	copilotCluster?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	hasCompete?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	hasTransactedProduct?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	distributorName?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	customerTpid?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(10)
	@IsString({ each: true })
	copilotChatToPaid?: string[];

	@IsOptional()
	@Transform(({ value }: { value: unknown }) =>
		splitCommaSeparatedQueryValue(value),
	)
	@IsArray()
	@ArrayMaxSize(100)
	@IsString({ each: true })
	mwPaidSeatRange?: string[];

	@IsOptional()
	@IsString()
	includeParts?: string;
}
