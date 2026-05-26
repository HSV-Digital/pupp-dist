import { Type } from 'class-transformer';
import {
	IsArray,
	IsIn,
	IsNumber,
	IsString,
	Min,
	IsOptional,
} from 'class-validator';

const VIEW_MODES = ['reseller', 'customer', 'opportunity'] as const;

export class CreateOpportunityListEmailWithPdfLinkDto {
	@IsIn(VIEW_MODES)
	viewMode!: 'reseller' | 'customer' | 'opportunity';

	@Type(() => Number)
	@IsNumber()
	@Min(0)
	resellerCount!: number;

	@Type(() => Number)
	@IsNumber()
	@Min(0)
	customerCount!: number;

	@Type(() => Number)
	@IsNumber()
	@Min(0)
	totalRenewals!: number;

	@IsString()
	totalSeatsRange!: string;

	@IsArray()
	@IsString({ each: true })
	selectedSkuIds!: string[];

	@IsString()
	pdfJobId!: string;

	@IsString()
	pdfDownloadUrl!: string;

	@IsString()
	@IsOptional()
	pdfZipUrl?: string;
}
