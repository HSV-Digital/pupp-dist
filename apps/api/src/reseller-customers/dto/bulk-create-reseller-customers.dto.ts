import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	ValidateNested,
} from 'class-validator';
import { CreateResellerCustomerDto } from './create-reseller-customer.dto';

export class BulkCreateResellerCustomersDto {
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(5000)
	@ValidateNested({ each: true })
	@Type(() => CreateResellerCustomerDto)
	customers!: CreateResellerCustomerDto[];
}
