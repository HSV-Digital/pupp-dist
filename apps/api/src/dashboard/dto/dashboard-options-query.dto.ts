import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DashboardQueryDto } from './dashboard-query.dto';

const DASHBOARD_FILTER_DIMENSIONS = [
	'pssAIWorkforce',
	'pssAISecurity',
	'psa',
	'distributor',
	'reseller',
	'customer',
	'pdm',
	'pmm',
	'region',
	'type',
] as const;

export type DashboardFilterDimension =
	(typeof DASHBOARD_FILTER_DIMENSIONS)[number];

export class DashboardOptionsQueryDto extends DashboardQueryDto {
	@IsIn(DASHBOARD_FILTER_DIMENSIONS)
	dimension!: DashboardFilterDimension;

	@IsString()
	q!: string;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number;
}
