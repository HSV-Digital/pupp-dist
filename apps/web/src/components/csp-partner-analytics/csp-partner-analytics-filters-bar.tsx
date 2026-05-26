'use client';

import { ChevronsUpDown, X } from 'lucide-react';
import { AdminAnalyticsRangeToggle } from '@/components/admin-analytics/admin-analytics-range-toggle';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type {
	CspPartnerAnalyticsFilterOptions,
	CspPartnerAnalyticsRange,
} from './csp-partner-analytics-api';

interface Props {
	range: CspPartnerAnalyticsRange;
	partnerOrgId: string | null;
	countries: string[];
	options: CspPartnerAnalyticsFilterOptions | null;
	onRangeChange: (value: CspPartnerAnalyticsRange) => void;
	onPartnerChange: (value: string | null) => void;
	onCountriesChange: (next: string[]) => void;
}

export function CspPartnerAnalyticsFiltersBar({
	range,
	partnerOrgId,
	countries,
	options,
	onRangeChange,
	onPartnerChange,
	onCountriesChange,
}: Props) {
	const partners = options?.partners ?? [];
	const availableCountries = options?.countries ?? [];
	const selectedPartner = partners.find((p) => p.orgId === partnerOrgId);
	const countryLabel =
		countries.length === 0
			? 'Country'
			: countries.length === 1
				? `Country: ${countries[0]}`
				: `Country (${countries.length})`;

	const toggleCountry = (country: string) => {
		if (countries.includes(country)) {
			onCountriesChange(countries.filter((c) => c !== country));
		} else {
			onCountriesChange([...countries, country]);
		}
	};

	return (
		<div
			className=" space-y-4"
			data-testid="csp-partner-analytics-filters-bar"
		>
			<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
				<div className="flex flex-wrap gap-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className={cn(
									'text-sm border-stone-200 bg-white! shadow-none! text-stone-700 hover:bg-stone-50',
									partnerOrgId ? 'border-stone-800!' : '',
								)}
								data-testid="partner-filter-trigger"
							>
								<span className="text-stone-800 mt-[-3px] font-medium">
									Partner
								</span>
								<ChevronsUpDown className="h-3 w-3 text-stone-500" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							className="w-72 border-stone-200 p-1"
							data-testid="partner-filter-menu"
						>
							<DropdownMenuLabel className="flex items-center justify-between">
								<span>Partner</span>
								{partnerOrgId ? (
									<button
										type="button"
										className="text-xs font-medium text-stone-500 hover:text-stone-900"
										onClick={() => onPartnerChange(null)}
									>
										Clear
									</button>
								) : null}
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuRadioGroup
								value={partnerOrgId ?? ''}
								onValueChange={(v) => onPartnerChange(v || null)}
							>
								<DropdownMenuRadioItem value="">
									All partners
								</DropdownMenuRadioItem>
								{partners.length === 0 ? (
									<div className="px-2 py-3 text-sm text-stone-500">
										No partners in this range.
									</div>
								) : (
									partners.map((partner) => (
										<DropdownMenuRadioItem
											key={partner.orgId}
											value={partner.orgId}
										>
											{partner.name}
										</DropdownMenuRadioItem>
									))
								)}
							</DropdownMenuRadioGroup>
						</DropdownMenuContent>
					</DropdownMenu>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className={cn(
									'text-sm border-stone-200 bg-white! shadow-none! text-stone-700 hover:bg-stone-50',
									countries.length > 0 ? 'border-stone-800!' : '',
								)}
								data-testid="country-filter-trigger"
							>
								<span className="text-stone-800 mt-[-3px] font-medium">
									{countryLabel}
								</span>
								<ChevronsUpDown className="h-3 w-3 text-stone-500" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							className="w-72 border-stone-200 p-1 max-h-80 overflow-y-auto"
							data-testid="country-filter-menu"
						>
							<DropdownMenuLabel className="flex items-center justify-between">
								<span>Country</span>
								{countries.length > 0 ? (
									<button
										type="button"
										className="text-xs font-medium text-stone-500 hover:text-stone-900"
										onClick={() => onCountriesChange([])}
									>
										Clear
									</button>
								) : null}
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{availableCountries.length === 0 ? (
								<div className="px-2 py-3 text-sm text-stone-500">
									No countries in this range.
								</div>
							) : (
								availableCountries.map((value) => (
									<DropdownMenuCheckboxItem
										key={value}
										checked={countries.includes(value)}
										onSelect={(event) => event.preventDefault()}
										onCheckedChange={() => toggleCountry(value)}
									>
										{value}
									</DropdownMenuCheckboxItem>
								))
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<div className="flex justify-end">
					<AdminAnalyticsRangeToggle value={range} onChange={onRangeChange} />
				</div>
			</div>

			{selectedPartner || countries.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{selectedPartner ? (
						<button
							type="button"
							onClick={() => onPartnerChange(null)}
							className="flex items-center justify-center gap-1 cursor-pointer rounded-full border border-stone-200 bg-stone-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-stone-900"
							data-testid="selected-filter-chip-partner"
						>
							<span>Partner:</span>
							<span>{selectedPartner.name}</span>
							<X className="ml-2 h-3 w-3 shrink-0" />
						</button>
					) : null}
					{countries.map((country) => (
						<button
							key={country}
							type="button"
							onClick={() =>
								onCountriesChange(countries.filter((c) => c !== country))
							}
							className="flex items-center justify-center gap-1 cursor-pointer rounded-full border border-stone-200 bg-stone-800 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-stone-900"
							data-testid={`selected-filter-chip-country-${country}`}
						>
							<span>Country:</span>
							<span>{country}</span>
							<X className="ml-2 h-3 w-3 shrink-0" />
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
