import {
	BadRequestException,
	Body,
	Controller,
	ForbiddenException,
	Get,
	HttpCode,
	HttpStatus,
	Post,
	Query,
} from '@nestjs/common';
import { AllowedUserTypes } from '../auth/decorators/allowed-user-types.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { ResellerAuthUser } from '../auth/interfaces/auth-user.interface';
import {
	CSP_PARTNER_COUNTRY_VALUES,
	type CspPartnerCountry,
} from '../database/schema';
import { CspPartnerAnalyticsEmitter } from './csp-partner-analytics.emitter';
import { CspPartnerAnalyticsService } from './csp-partner-analytics.service';
import {
	CSP_PARTNER_ANALYTICS_RANGE_DAYS,
	type CspPartnerAnalyticsFilters,
	type CspPartnerAnalyticsRange,
} from './csp-partner-analytics.types';

const HSV_EMAIL_SUFFIX = '@hsv.digital';

function isHsvEmail(email: string | null | undefined): boolean {
	return Boolean(email && email.toLowerCase().endsWith(HSV_EMAIL_SUFFIX));
}

function parseRange(value: unknown): CspPartnerAnalyticsRange {
	if (
		typeof value === 'string' &&
		value in CSP_PARTNER_ANALYTICS_RANGE_DAYS
	) {
		return value as CspPartnerAnalyticsRange;
	}
	return '7d';
}

function parseCountries(value: unknown): CspPartnerCountry[] | undefined {
	const raw: string[] = Array.isArray(value)
		? value.filter((v): v is string => typeof v === 'string')
		: typeof value === 'string' && value.length > 0
			? value.split(',')
			: [];
	const cleaned = raw
		.map((v) => v.trim())
		.filter((v) => v.length > 0 && v !== 'all');
	const valid = cleaned.filter((v): v is CspPartnerCountry =>
		CSP_PARTNER_COUNTRY_VALUES.includes(v as CspPartnerCountry),
	);
	return valid.length > 0 ? valid : undefined;
}

function parsePartner(value: unknown): string | undefined {
	if (typeof value !== 'string' || value === '' || value === 'all') {
		return undefined;
	}
	return value;
}

@Controller('api/csp-partners/analytics')
export class CspPartnerAnalyticsController {
	constructor(
		private readonly service: CspPartnerAnalyticsService,
		private readonly emitter: CspPartnerAnalyticsEmitter,
	) {}

	@AllowedUserTypes('reseller')
	@Get('tile-counts')
	async getTileCounts(
		@CurrentUser() user: ResellerAuthUser,
		@Query('range') rangeRaw?: string,
		@Query('partner') partnerRaw?: string,
		@Query('country') countryRaw?: string | string[],
	) {
		this.assertHsv(user);
		const filters = this.buildFilters(rangeRaw, partnerRaw, countryRaw);
		return this.service.getTileCounts(filters);
	}

	@AllowedUserTypes('reseller')
	@Get('filter-options')
	async getFilterOptions(
		@CurrentUser() user: ResellerAuthUser,
		@Query('range') rangeRaw?: string,
		@Query('partner') partnerRaw?: string,
		@Query('country') countryRaw?: string | string[],
	) {
		this.assertHsv(user);
		const filters = this.buildFilters(rangeRaw, partnerRaw, countryRaw);
		return this.service.getFilterOptions(filters);
	}

	@AllowedUserTypes('reseller')
	@Get('by-country')
	async getByCountrySeries(
		@CurrentUser() user: ResellerAuthUser,
		@Query('range') rangeRaw?: string,
		@Query('partner') partnerRaw?: string,
		@Query('country') countryRaw?: string | string[],
	) {
		this.assertHsv(user);
		const filters = this.buildFilters(rangeRaw, partnerRaw, countryRaw);
		return this.service.getByCountrySeries(filters);
	}

	@AllowedUserTypes('reseller')
	@Get('sku-pie-grid')
	async getSkuPieGrid(
		@CurrentUser() user: ResellerAuthUser,
		@Query('range') rangeRaw?: string,
		@Query('partner') partnerRaw?: string,
		@Query('country') countryRaw?: string | string[],
	) {
		this.assertHsv(user);
		const filters = this.buildFilters(rangeRaw, partnerRaw, countryRaw);
		return this.service.getSkuPieGrid(filters);
	}

	@AllowedUserTypes('reseller')
	@Get('by-country-sku')
	async getByCountrySkuSeries(
		@CurrentUser() user: ResellerAuthUser,
		@Query('range') rangeRaw?: string,
		@Query('partner') partnerRaw?: string,
		@Query('country') countryRaw?: string | string[],
		@Query('dimension') dimensionRaw?: string,
		@Query('skuId') skuIdRaw?: string,
	) {
		this.assertHsv(user);
		if (dimensionRaw !== 'start' && dimensionRaw !== 'end') {
			throw new BadRequestException("dimension must be 'start' or 'end'");
		}
		const skuId =
			typeof skuIdRaw === 'string' && skuIdRaw.length > 0 ? skuIdRaw : 'all';
		const filters = this.buildFilters(rangeRaw, partnerRaw, countryRaw);
		return this.service.getByCountrySkuSeries(filters, dimensionRaw, skuId);
	}

	@AllowedUserTypes('reseller')
	@Get('sku-tab-totals')
	async getSkuTabTotals(
		@CurrentUser() user: ResellerAuthUser,
		@Query('range') rangeRaw?: string,
		@Query('partner') partnerRaw?: string,
		@Query('country') countryRaw?: string | string[],
		@Query('dimension') dimensionRaw?: string,
	) {
		this.assertHsv(user);
		if (dimensionRaw !== 'start' && dimensionRaw !== 'end') {
			throw new BadRequestException("dimension must be 'start' or 'end'");
		}
		const filters = this.buildFilters(rangeRaw, partnerRaw, countryRaw);
		return this.service.getSkuTabTotals(filters, dimensionRaw);
	}

	@AllowedUserTypes('reseller')
	@Post('events/view-proposal')
	@HttpCode(HttpStatus.ACCEPTED)
	async recordViewProposal(
		@CurrentUser() user: ResellerAuthUser,
		@Body() body: { customerName?: unknown },
	) {
		const identifier =
			typeof body?.customerName === 'string' ? body.customerName.trim() : '';
		if (!identifier) {
			throw new BadRequestException('customerName is required');
		}

		const country = await this.service.resolveCustomerCountry(
			user.orgId,
			identifier,
		);

		await this.emitter.enqueueEvent({
			orgId: user.orgId,
			actorId: user.userId,
			eventType: 'view_proposal',
			country,
			metadata: { customerIdentifier: identifier },
		});

		return { accepted: true };
	}

	private assertHsv(user: ResellerAuthUser): void {
		if (!isHsvEmail(user.email)) {
			throw new ForbiddenException(
				'CSP Partner analytics is restricted to HSV Digital users.',
			);
		}
	}

	private buildFilters(
		rangeRaw: unknown,
		partnerRaw: unknown,
		countryRaw: unknown,
	): CspPartnerAnalyticsFilters {
		return {
			range: parseRange(rangeRaw),
			partnerOrgId: parsePartner(partnerRaw),
			countries: parseCountries(countryRaw),
		};
	}
}
