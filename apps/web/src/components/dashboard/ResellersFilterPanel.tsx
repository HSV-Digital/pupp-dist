'use client';

import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
	Button,
	Checkbox,
	Combobox,
	InteractionTag,
	InteractionTagPrimary,
	InteractionTagSecondary,
	Label,
	Option,
} from '@fluentui/react-components';
import type { ComboboxProps } from '@fluentui/react-components';
import {
	Person12Regular,
	Briefcase20Regular,
	Globe20Regular,
	People20Regular,
	CalendarLtr20Regular,
	Bot20Regular,
	ArrowTrending20Regular,
	TargetArrow20Regular,
	Shield20Regular,
	Tag20Regular,
} from '@fluentui/react-icons';
import type { FluentIcon } from '@fluentui/react-icons';

export interface ResellersFilters {
	customerName: string[];
	currentSku: string[];
	region: string[];
	seats: string[];
	renewalDate: string[];
	copilotFit: string[];
	copilotIntent: string[];
	copilotCluster: string[];
	hasCompete: string[];
	hasTransactedProduct: string[];
	distributorName: string[];
	customerTpid: string[];
	copilotChatToPaid: string[];
	mwPaidSeatRange: string[];
}

interface ResellersFilterPanelProps {
	filters: ResellersFilters;
	onFiltersChange: (filters: ResellersFilters) => void;
	onClearAll: () => void;
	availableOptions: Partial<Record<keyof ResellersFilters, string[]>>;
}

const RENDER_LIMIT = 50;

type FilterDropdownDimension = {
	key: keyof ResellersFilters;
	labelKey: string;
	icon: FluentIcon;
};

const BY_CUSTOMER_DROPDOWNS: FilterDropdownDimension[] = [
	{ key: 'customerName', labelKey: 'table.customerName', icon: Person12Regular },
	{ key: 'region', labelKey: 'forms.region', icon: Globe20Regular },
	{ key: 'customerTpid', labelKey: 'forms.customerTpid', icon: Tag20Regular },
];

const BY_COPILOT_PROPENSITY_DROPDOWNS: FilterDropdownDimension[] = [
	{ key: 'copilotFit', labelKey: 'filters.copilotFit', icon: Bot20Regular },
	{ key: 'copilotIntent', labelKey: 'filters.copilotIntent', icon: TargetArrow20Regular },
	{ key: 'copilotCluster', labelKey: 'filters.copilotCluster', icon: ArrowTrending20Regular },
	{ key: 'hasCompete', labelKey: 'filters.compete', icon: Shield20Regular },
	{
		key: 'hasTransactedProduct',
		labelKey: 'filters.hasTransactedProduct',
		icon: Briefcase20Regular,
	},
];

export const RESELLER_SKU_OPTIONS = [
	'Business Basic',
	'Business Standard',
	'Business Premium',
] as const;

export const RESELLER_SEATS_BUCKETS = [
	'1-24',
	'25-49',
	'50-99',
	'100-299',
	'300-499',
	'500-999',
	'1000+',
] as const;

export const RESELLER_CURRENT_ARR_BUCKETS = [
	'<$100,000',
	'$100,000-$200,000',
	'$200,000-$500,000',
	'>$500,000',
] as const;

export const RESELLER_RENEWAL_BUCKETS = [
	'Within 1 month',
	'Within 2 months',
	'Within 3 months',
	'More than 3 months',
	'N/A',
] as const;

export const RESELLER_COPILOT_CHAT_TO_PAID_BUCKETS = [
	'YES',
	'NO',
	'No information available',
] as const;

interface SmartFilterCheckboxGroupProps {
	label: string;
	Icon: FluentIcon;
	options: readonly string[];
	selected: string[];
	onChange: (next: string[]) => void;
	monospaceLabels?: boolean;
	bucketLabel?: (bucket: string) => string;
}

function SmartFilterCheckboxGroup({
	label,
	Icon,
	options,
	selected,
	onChange,
	monospaceLabels = false,
	bucketLabel,
}: SmartFilterCheckboxGroupProps) {
	const selectedSet = new Set(selected);
	const renderedOptions = [
		...options,
		...selected.filter((option) => !options.includes(option)),
	];

	return (
		<div className="flex flex-col gap-1">
			<Label className="flex items-center bg-(--colorNeutralBackground3) rounded-lg px-2.5 py-1.5">
				<Icon className="size-3.5" fill="#242424" primaryFill="#242424" />
				<span className="pl-2">{label}</span>
			</Label>
			<div className="flex flex-col gap-0.5 pl-1">
				{renderedOptions.map((bucket) => (
					<Checkbox
						key={bucket}
						label={
							<span className={monospaceLabels ? 'text-[13px] font-mono' : ''}>
								{bucketLabel ? bucketLabel(bucket) : bucket}
							</span>
						}
						size="medium"
						checked={selectedSet.has(bucket)}
						onChange={(_, data) => {
							const nextSelected = new Set(selected);
							if (data.checked) {
								nextSelected.add(bucket);
							} else {
								nextSelected.delete(bucket);
							}

							onChange([
								...options.filter((option) => nextSelected.has(option)),
								...selected.filter(
									(option) =>
										nextSelected.has(option) && !options.includes(option),
								),
							]);
						}}
					/>
				))}
			</div>
		</div>
	);
}

interface FilterComboboxProps {
	filterKey: keyof ResellersFilters;
	label: string;
	Icon: FluentIcon;
	options: string[];
	selectedOptions: string[];
	onOptionSelect: ComboboxProps['onOptionSelect'];
	onDeselect: (value: string) => void;
}

function FilterCombobox({
	filterKey,
	label,
	Icon,
	options,
	selectedOptions,
	onOptionSelect,
	onDeselect,
}: FilterComboboxProps) {
	const [searchText, setSearchText] = useState('');

	const handleChange = useCallback(
		(ev: React.ChangeEvent<HTMLInputElement>) => {
			setSearchText(ev.target.value);
		},
		[],
	);

	const handleOptionSelect: ComboboxProps['onOptionSelect'] = useCallback(
		(...args: Parameters<NonNullable<ComboboxProps['onOptionSelect']>>) => {
			setSearchText('');
			onOptionSelect?.(...args);
		},
		[onOptionSelect],
	);

	const handleOpenChange: ComboboxProps['onOpenChange'] = useCallback(
		(...[, data]: Parameters<NonNullable<ComboboxProps['onOpenChange']>>) => {
			if (!data.open) {
				setSearchText('');
			}
		},
		[],
	);

	const { rendered, hiddenCount } = useMemo(() => {
		const selectedSet = new Set(selectedOptions);
		const needle = searchText.toLowerCase();

		const selected: string[] = [];
		const unselectedMatches: string[] = [];

		for (const opt of options) {
			if (selectedSet.has(opt)) {
				selected.push(opt);
			} else if (opt.toLowerCase().includes(needle)) {
				unselectedMatches.push(opt);
			}
		}

		const truncated = unselectedMatches.slice(0, RENDER_LIMIT);
		const hidden = unselectedMatches.length - truncated.length;

		return { rendered: [...selected, ...truncated], hiddenCount: hidden };
	}, [options, selectedOptions, searchText]);

	const displayValue =
		searchText !== ''
			? searchText
			: selectedOptions.length > 0
				? `${selectedOptions.length} selected`
				: '';

	return (
		<div className="flex flex-col gap-1 min-w-0">
			<div className="relative">
				<div className="flex items-center justify-center size-4 z-10 absolute left-2 top-2 bottom-0">
					<Icon className="size-3.5" fill="#242424" primaryFill="#242424" />
				</div>
				<Combobox
					id={`reseller-filter-${filterKey}`}
					multiselect
					appearance="filled-darker"
					placeholder={`${label}`}
					selectedOptions={selectedOptions}
					value={displayValue}
					onChange={handleChange}
					onOptionSelect={handleOptionSelect}
					onOpenChange={handleOpenChange}
					positioning={{ autoSize: 'width' }}
					style={{
						minWidth: '0px',
						paddingLeft: '20px',
						width: '100%',
					}}
					listbox={{ style: { maxHeight: '300px' } }}
				>
					{rendered.map((opt) => (
						<Option key={opt} value={opt}>
							{opt}
						</Option>
					))}
					{hiddenCount > 0 && (
						<Option key="__more__" value="" text="" disabled>
							Type to search {hiddenCount.toLocaleString()} more…
						</Option>
					)}
				</Combobox>
			</div>
			{selectedOptions.length > 0 && (
				<div className="flex flex-wrap gap-1 min-w-0 max-w-full overflow-hidden">
					{selectedOptions.map((val) => (
						<InteractionTag
							key={val}
							size="small"
							shape="rounded"
							appearance="outline"
							title={val}
							style={{ maxWidth: '100%', minWidth: 0 }}
						>
							<InteractionTagPrimary
								style={{
									borderTopRightRadius: 0,
									borderBottomRightRadius: 0,
									borderRight: 0,
									maxWidth: '100%',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									display: 'inline-block',
								}}
							>
								{val}
							</InteractionTagPrimary>
							<InteractionTagSecondary
								aria-label={`Remove ${val}`}
								onClick={() => onDeselect(val)}
							/>
						</InteractionTag>
					))}
				</div>
			)}
		</div>
	);
}

function FilterSectionHeading({ title }: { title: string }) {
	return <Label weight="semibold">{title}</Label>;
}

export function ResellersFilterPanel({
	filters,
	onFiltersChange,
	onClearAll,
	availableOptions,
}: ResellersFilterPanelProps) {
	const t = useTranslations();
	const hasActiveFilters = Object.values(filters).some((v) => v.length > 0);

	const renewalBucketLabel: Record<(typeof RESELLER_RENEWAL_BUCKETS)[number], string> = {
		'Within 1 month': t('filters.within1Month'),
		'Within 2 months': t('filters.within2Months'),
		'Within 3 months': t('filters.within3Months'),
		'More than 3 months': t('filters.moreThan3Months'),
		'N/A': 'N/A',
	};

	const hasOptions = (key: keyof ResellersFilters): boolean =>
		(availableOptions[key]?.length ?? 0) > 0;

	const renderDropdown = ({ key, labelKey, icon }: FilterDropdownDimension) => {
		if (!hasOptions(key)) return null;
		return (
			<FilterCombobox
				key={key}
				filterKey={key}
				label={t(labelKey)}
				Icon={icon}
				options={availableOptions[key] ?? []}
				selectedOptions={filters[key]}
				onOptionSelect={(_ev, data) => {
					onFiltersChange({ ...filters, [key]: data.selectedOptions });
				}}
				onDeselect={(value) => {
					onFiltersChange({
						...filters,
						[key]: filters[key].filter((v) => v !== value),
					});
				}}
			/>
		);
	};

	const byCustomerItems = BY_CUSTOMER_DROPDOWNS.map(renderDropdown).filter(
		Boolean,
	);

	const copilotDropdownItems = BY_COPILOT_PROPENSITY_DROPDOWNS.map(
		renderDropdown,
	).filter(Boolean);
	const chatToPaidBucketLabel: Record<
		(typeof RESELLER_COPILOT_CHAT_TO_PAID_BUCKETS)[number],
		string
	> = {
		YES: t('filters.yes'),
		NO: t('filters.no'),
		'No information available': t('filters.noInformationAvailable'),
	};
	const hasChatToPaidData = (availableOptions.copilotChatToPaid?.length ?? 0) > 0;
	const availableSubscriptionNames = availableOptions.currentSku ?? [];
	const hasAnyCurrentSku = RESELLER_SKU_OPTIONS.some((sku) => {
		const needle = sku.toLowerCase();
		return availableSubscriptionNames.some((name) =>
			name.toLowerCase().includes(needle),
		);
	});

	const byCopilotItems: ReactNode[] = [
		...(hasChatToPaidData
			? [
					<SmartFilterCheckboxGroup
						key="copilotChatToPaid"
						label={t('table.chatToPaidOpportunity')}
						Icon={Bot20Regular}
						options={RESELLER_COPILOT_CHAT_TO_PAID_BUCKETS}
						selected={filters.copilotChatToPaid}
						onChange={(next) =>
							onFiltersChange({ ...filters, copilotChatToPaid: next })
						}
						bucketLabel={(b) =>
							chatToPaidBucketLabel[
								b as (typeof RESELLER_COPILOT_CHAT_TO_PAID_BUCKETS)[number]
							] ?? b
						}
					/>,
				]
			: []),
		...copilotDropdownItems,
	];

	const mwPaidSeatRangeOptions = availableOptions.mwPaidSeatRange ?? [];
	const availableSeatsSet = new Set(availableOptions.seats ?? []);
	const seatsOptions = RESELLER_SEATS_BUCKETS.filter((b) =>
		availableSeatsSet.has(b),
	);
	const availableRenewalSet = new Set(availableOptions.renewalDate ?? []);
	const renewalOptions = RESELLER_RENEWAL_BUCKETS.filter((b) =>
		availableRenewalSet.has(b),
	);
	const bySubscriptionItems: ReactNode[] = [
		...(hasAnyCurrentSku
			? [
					<SmartFilterCheckboxGroup
						key="currentSku"
						label={t('forms.currentSku')}
						Icon={Briefcase20Regular}
						options={RESELLER_SKU_OPTIONS}
						selected={filters.currentSku}
						onChange={(next) =>
							onFiltersChange({ ...filters, currentSku: next })
						}
					/>,
				]
			: []),
		...(seatsOptions.length > 0
			? [
					<SmartFilterCheckboxGroup
						key="seats"
						label={t('dashboard.numberOfSeatsFilter')}
						Icon={People20Regular}
						options={seatsOptions}
						selected={filters.seats}
						onChange={(next) => onFiltersChange({ ...filters, seats: next })}
					/>,
				]
			: []),
		...(renewalOptions.length > 0
			? [
					<SmartFilterCheckboxGroup
						key="renewalDate"
						label={t('renewals.upcomingRenewals')}
						Icon={CalendarLtr20Regular}
						options={renewalOptions}
						selected={filters.renewalDate}
						onChange={(next) =>
							onFiltersChange({ ...filters, renewalDate: next })
						}
						bucketLabel={(b) =>
							renewalBucketLabel[
								b as (typeof RESELLER_RENEWAL_BUCKETS)[number]
							] ?? b
						}
					/>,
				]
			: []),
		...(mwPaidSeatRangeOptions.length > 0
			? [
					<SmartFilterCheckboxGroup
						key="mwPaidSeatRange"
						label={t('filters.mwPaidSeatRange')}
						Icon={People20Regular}
						options={mwPaidSeatRangeOptions}
						selected={filters.mwPaidSeatRange}
						onChange={(next) =>
							onFiltersChange({ ...filters, mwPaidSeatRange: next })
						}
						monospaceLabels
					/>,
				]
			: []),
	];

	return (
		<div className="flex flex-col gap-4 py-8 pr-6 max-2xl:pr-4 h-full border-r border-(--colorNeutralBackground3)">
			<div className="flex items-center justify-between">
				<Label weight="semibold" size="large">
					{t('common.filters')}
				</Label>
				{hasActiveFilters && (
					<Button appearance="subtle" size="small" onClick={onClearAll}>
						{t('filters.clearAll')}
					</Button>
				)}
			</div>

			{byCustomerItems.length > 0 && (
				<>
					<FilterSectionHeading title={t('filters.byCustomer')} />
					{byCustomerItems}
				</>
			)}

			{byCopilotItems.length > 0 && (
				<>
					<FilterSectionHeading title={t('filters.byCopilotPropensity')} />
					{byCopilotItems}
				</>
			)}

			{bySubscriptionItems.length > 0 && (
				<>
					<FilterSectionHeading title={t('filters.bySubscription')} />
					{bySubscriptionItems}
				</>
			)}
		</div>
	);
}
