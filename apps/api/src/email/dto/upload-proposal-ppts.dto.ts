import { Type } from 'class-transformer';
import {
	IsArray,
	IsIn,
	IsString,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import type { ProposalOptionsJourney } from '@repo/shared';
import { ProposalPptScenarioDto } from './create-proposal-ppt-session.dto';

const JOURNEYS: ProposalOptionsJourney[] = ['new_customer', 'renewal'];

export class UploadProposalPptsDto {
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
	@Type(() => ProposalPptScenarioDto)
	scenarios!: ProposalPptScenarioDto[];
}
