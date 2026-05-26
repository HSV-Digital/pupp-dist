import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	ArrayNotEmpty,
	IsArray,
	IsString,
	ValidateNested,
} from 'class-validator';

export class GtmAssetSelectionDto {
	@IsString()
	endingSkuId!: string;

	@IsArray()
	@ArrayNotEmpty()
	@ArrayMaxSize(50)
	@IsString({ each: true })
	fileNames!: string[];
}

export class CreateGtmBundleLinkDto {
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(20)
	@ValidateNested({ each: true })
	@Type(() => GtmAssetSelectionDto)
	selectedAssets!: GtmAssetSelectionDto[];
}
