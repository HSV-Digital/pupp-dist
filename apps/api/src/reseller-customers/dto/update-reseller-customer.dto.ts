import {
	IsIn,
	IsNumber,
	IsOptional,
	IsString,
	Min,
	MinLength,
} from 'class-validator';
import { CustomerRegion } from '@repo/types';

const VALID_REGIONS = Object.values(CustomerRegion);

export class UpdateResellerCustomerDto {
	@IsOptional()
	@IsString()
	@MinLength(1)
	customerName?: string;

	@IsOptional()
	@IsString()
	customerTpid?: string;

	@IsOptional()
	@IsString()
	@MinLength(1)
	@IsIn(VALID_REGIONS)
	countryName?: string;

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

	// Distributor / partner
	@IsOptional()
	@IsString()
	distributorName?: string;

	@IsOptional()
	@IsString()
	distributorId?: string;

	@IsOptional()
	@IsString()
	partnerName?: string;

	@IsOptional()
	@IsString()
	partnerGlobalId?: string;

	@IsOptional()
	@IsString()
	mpnId?: string;

	// Copilot fit / intent
	@IsOptional()
	@IsString()
	copilotFit?: string;

	@IsOptional()
	@IsString()
	copilotIntent?: string;

	@IsOptional()
	@IsString()
	copilotCluster?: string;

	@IsOptional()
	@IsNumber()
	@Min(0)
	copilotEligibleM365Seats?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	freeCopilotChatMAU?: number;

	@IsOptional()
	@IsNumber()
	copilotMAUPercentage?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	copilotSeatsWhitespace?: number;

	@IsOptional()
	@IsNumber()
	@Min(0)
	allAgentMAU?: number;

	// MCI / engagement
	@IsOptional()
	@IsNumber()
	@Min(0)
	mciEligibility?: number;

	@IsOptional()
	@IsString()
	mciEngagementName?: string;

	@IsOptional()
	@IsString()
	adoptionStatus?: string;

	// Misc
	@IsOptional()
	@IsString()
	mwPaidSeatRange?: string;

	@IsOptional()
	@IsString()
	hasTransactedProduct?: string;

	@IsOptional()
	@IsString()
	hasCompete?: string;

	@IsOptional()
	@IsString()
	tenantIds?: string;

	@IsOptional()
	@IsString()
	type?: string;
}
