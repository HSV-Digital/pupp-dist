'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
import type { FilterState } from '@repo/types';
import { SMART_FILTER_CONFIG } from '@/lib/filter-utils';
import {
	DASHBOARD_REMOTE_SEARCH_DEBOUNCE_MS,
	DASHBOARD_REMOTE_SEARCH_MIN_CHARS,
	fetchDashboardFilterOptions,
	isSearchableFilterDimension,
	type SearchableFilterDimension,
} from '@/lib/dashboard-filter-options-search';
import {
	Person12Regular,
	Briefcase20Regular,
	ArrowReplyAll20Regular,
	PeopleError20Regular,
	CalendarClock20Regular,
	Globe20Regular,
	BarcodeScanner16Regular,
} from '@fluentui/react-icons';

const RENDER_LIMIT = 50;

interface FilterPanelProps {
	filters: FilterState;
	onFiltersChange: (filters: FilterState) => void;
	onClearAll: () => void;
	availableOptions: Record<keyof FilterState, string[]>;
	/** When provided, used instead of the authenticated API for combobox search */
	onSearch?: (dimension: string, query: string) => string[];
	/** Section ids to hide (e.g. ['byRole', 'byPartner']) */
	hideSections?: Array<'byRole' | 'byPartner' | 'byCustomer' | 'bySubscription'>;
}

interface FilterComboboxProps {
	filterKey: keyof FilterState;
	label: string;
	options: string[];
	selectedOptions: string[];
	onOptionSelect: ComboboxProps['onOptionSelect'];
	onDeselect: (value: string) => void;
	onSearchOptions: (
		filterKey: SearchableFilterDimension,
		query: string,
		signal: AbortSignal,
	) => Promise<string[]>;
}

const FILTER_ICON_MAP = {
	customer: Person12Regular,
	reseller: ArrowReplyAll20Regular,
	distributor: Briefcase20Regular,
	pssAIWorkforce: Person12Regular,
	pssAISecurity: Person12Regular,
	psa: Person12Regular,
	pdm: Person12Regular,
	pmm: Person12Regular,
	region: Globe20Regular,
	type: Briefcase20Regular,
	skuCategory: BarcodeScanner16Regular,
	expSeats: PeopleError20Regular,
	renewalDate: CalendarClock20Regular,
	pastRenewalDate: CalendarClock20Regular,
};

const FILTER_SECTIONS: {
	id: 'byRole' | 'byPartner' | 'byCustomer' | 'bySubscription';
	labelKey: `filters.${'byRole' | 'byPartner' | 'byCustomer' | 'bySubscription'}`;
	filters: { key: keyof FilterState; label: string }[];
}[] = [
	{
		id: 'byRole',
		labelKey: 'filters.byRole',
		filters: [
			{ key: 'pssAIWorkforce', label: 'PSSs (AI Workforce)' },
			{ key: 'pssAISecurity', label: 'PSSs (AI Security)' },
			{ key: 'psa', label: 'PSA' },
			{ key: 'pdm', label: 'PDM' },
			{ key: 'pmm', label: 'PMM' },
		],
	},
	{
		id: 'byPartner',
		labelKey: 'filters.byPartner',
		filters: [
			{ key: 'distributor', label: 'Distributor' },
			{ key: 'reseller', label: 'Reseller' },
		],
	},
	{
		id: 'byCustomer',
		labelKey: 'filters.byCustomer',
		filters: [
			{ key: 'customer', label: 'Customer' },
			{ key: 'region', label: 'Region' },
		],
	},
	{
		id: 'bySubscription',
		labelKey: 'filters.bySubscription',
		filters: [{ key: 'type', label: 'Type' }],
	},
];

const PSS_LABELS = ['PSSs (AI Workforce)', 'PSSs (AI Security)'];

function FilterCombobox({
	filterKey,
	label,
	options,
	selectedOptions,
	onOptionSelect,
	onDeselect,
	onSearchOptions,
}: FilterComboboxProps) {
	const [searchText, setSearchText] = useState('');
	const [remoteMatches, setRemoteMatches] = useState<string[] | null>(null);
	const searchRequestIdRef = useRef(0);

	const searchTextTrimmed = searchText.trim();
	const shouldSearchRemotely =
		searchTextTrimmed.length >= DASHBOARD_REMOTE_SEARCH_MIN_CHARS &&
		isSearchableFilterDimension(filterKey);

	const handleChange = useCallback(
		(ev: React.ChangeEvent<HTMLInputElement>) => {
			const nextValue = ev.target.value;
			if (nextValue.trim().length < DASHBOARD_REMOTE_SEARCH_MIN_CHARS) {
				searchRequestIdRef.current += 1;
				setRemoteMatches(null);
			}
			setSearchText(nextValue);
		},
		[],
	);

	const handleOptionSelect: ComboboxProps['onOptionSelect'] = useCallback(
		(...args: Parameters<NonNullable<ComboboxProps['onOptionSelect']>>) => {
			searchRequestIdRef.current += 1;
			setRemoteMatches(null);
			setSearchText('');
			onOptionSelect?.(...args);
		},
		[onOptionSelect],
	);

	const handleOpenChange: ComboboxProps['onOpenChange'] = useCallback(
		(...[, data]: Parameters<NonNullable<ComboboxProps['onOpenChange']>>) => {
			if (!data.open) {
				searchRequestIdRef.current += 1;
				setRemoteMatches(null);
				setSearchText('');
			}
		},
		[],
	);

	useEffect(() => {
		if (!shouldSearchRemotely) {
			return;
		}

		const controller = new AbortController();
		const requestId = ++searchRequestIdRef.current;

		const timer = window.setTimeout(() => {
			void onSearchOptions(
				filterKey,
				searchTextTrimmed,
				controller.signal,
			).then(
				(matches) => {
					if (requestId !== searchRequestIdRef.current) {
						return;
					}
					setRemoteMatches(matches);
				},
				(error: unknown) => {
					if (
						requestId !== searchRequestIdRef.current ||
						controller.signal.aborted ||
						(error instanceof Error && error.name === 'AbortError')
					) {
						return;
					}
					setRemoteMatches([]);
				},
			);
		}, DASHBOARD_REMOTE_SEARCH_DEBOUNCE_MS);

		return () => {
			controller.abort();
			window.clearTimeout(timer);
		};
	}, [filterKey, onSearchOptions, searchTextTrimmed, shouldSearchRemotely]);

	const searchableOptions = useMemo(() => {
		if (shouldSearchRemotely) {
			return remoteMatches ?? [];
		}
		return options;
	}, [options, remoteMatches, shouldSearchRemotely]);

	const mergedOptions = useMemo(() => {
		const unique = new Set(selectedOptions);
		const values = [...selectedOptions];
		for (const option of searchableOptions) {
			if (!unique.has(option)) {
				values.push(option);
				unique.add(option);
			}
		}
		return values;
	}, [searchableOptions, selectedOptions]);

	const { rendered, hiddenCount } = useMemo(() => {
		const selectedSet = new Set(selectedOptions);
		const needle = searchText.toLowerCase();

		const selected: string[] = [];
		const unselectedMatches: string[] = [];

		for (const opt of mergedOptions) {
			if (selectedSet.has(opt)) {
				selected.push(opt);
			} else if (opt.toLowerCase().includes(needle)) {
				unselectedMatches.push(opt);
			}
		}

		const maxVisibleUnselected = shouldSearchRemotely
			? unselectedMatches.length
			: RENDER_LIMIT;
		const truncated = unselectedMatches.slice(0, maxVisibleUnselected);
		const hidden = unselectedMatches.length - truncated.length;

		return { rendered: [...selected, ...truncated], hiddenCount: hidden };
	}, [mergedOptions, searchText, selectedOptions, shouldSearchRemotely]);

	const displayValue =
		searchText !== ''
			? searchText
			: selectedOptions.length > 0
				? `${selectedOptions.length} selected`
				: '';

	const Icon = FILTER_ICON_MAP[filterKey as keyof typeof FILTER_ICON_MAP];

	const diplayLabel = PSS_LABELS.includes(label)
		? `All ${label}`
		: `All ${label}s`;

	return (
		<div className="flex flex-col gap-1">
			{/* <Label htmlFor={`filter-${filterKey}`}>{label}</Label> */}
			<div className="relative">
				<div className="flex items-center justify-center size-4 z-10 absolute left-2 top-2 bottom-0">
					<Icon className="size-3.5" fill="#242424" primaryFill="#242424" />
				</div>
				<Combobox
					id={`filter-${filterKey}`}
					multiselect
					clearable={true}
					appearance="filled-darker"
					placeholder={diplayLabel}
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
					{shouldSearchRemotely && remoteMatches === null && (
						<Option key="__searching__" value="" text="" disabled>
							Searching...
						</Option>
					)}
				</Combobox>
			</div>
			{selectedOptions.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{selectedOptions.map((val) => (
						<InteractionTag
							key={val}
							size="small"
							shape="rounded"
							appearance="outline"
						>
							<InteractionTagPrimary
								style={{
									borderTopRightRadius: 0,
									borderBottomRightRadius: 0,
									borderRight: 0,
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

function SmartFilterCheckboxGroup({
	filterKey,
	label,
	allBucketLabels,
	availableBucketLabels,
	selectedOptions,
	onChange,
	optionLabel,
}: {
	filterKey: keyof FilterState;
	label: string;
	allBucketLabels: string[];
	availableBucketLabels: string[];
	selectedOptions: string[];
	onChange: (selected: string[]) => void;
	optionLabel?: (bucket: string) => string;
}) {
	const availableSet = useMemo(
		() => new Set(availableBucketLabels),
		[availableBucketLabels],
	);
	const selectedSet = useMemo(
		() => new Set(selectedOptions),
		[selectedOptions],
	);

	const Icon = FILTER_ICON_MAP[filterKey as keyof typeof FILTER_ICON_MAP];

	return (
		<div className="flex flex-col gap-1">
			<Label
				htmlFor={`filter-${filterKey}`}
				className="flex items-center bg-(--colorNeutralBackground3) rounded-lg px-2.5 py-1.5"
			>
				<Icon className="size-3.5" fill="#242424" primaryFill="#242424" />
				<span className={`pl-2`}>{label}</span>
			</Label>
			<div className="flex flex-col">
				{allBucketLabels.map((bucket) => (
					<Checkbox
						key={bucket}
						label={
							<span
								className={`${filterKey === 'expSeats' ? 'text-[13px] font-mono' : ''}`}
							>
								{optionLabel ? optionLabel(bucket) : bucket}
							</span>
						}
						disabled={!availableSet.has(bucket)}
						checked={selectedSet.has(bucket)}
						onChange={(_ev, data) => {
							if (data.checked) {
								onChange([...selectedOptions, bucket]);
							} else {
								onChange(selectedOptions.filter((v) => v !== bucket));
							}
						}}
					/>
				))}
			</div>
		</div>
	);
}

export function FilterPanel({
	filters,
	onFiltersChange,
	onClearAll,
	availableOptions,
	onSearch,
	hideSections,
}: FilterPanelProps) {
	const t = useTranslations();
	const optionsSearchCacheRef = useRef<Map<string, string[]>>(new Map());
	const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
	const hasActiveFilters = Object.values(filters).some((v) => v.length > 0);

	const handleSearchOptions = useCallback(
		async (
			filterKey: SearchableFilterDimension,
			query: string,
			signal: AbortSignal,
		): Promise<string[]> => {
			const normalizedQuery = query.trim().toLowerCase();
			const cacheKey = `${filterKey}|${filtersKey}|${normalizedQuery}`;
			const cached = optionsSearchCacheRef.current.get(cacheKey);
			if (cached) {
				return cached;
			}

			if (onSearch) {
				const matches = onSearch(filterKey, query);
				optionsSearchCacheRef.current.set(cacheKey, matches);
				return matches;
			}

			const matches = await fetchDashboardFilterOptions({
				dimension: filterKey,
				query,
				filters,
				signal,
			});

			if (optionsSearchCacheRef.current.size >= 200) {
				optionsSearchCacheRef.current.clear();
			}
			optionsSearchCacheRef.current.set(cacheKey, matches);
			return matches;
		},
		[filters, filtersKey, onSearch],
	);

	return (
		<div className="flex flex-col gap-4 py-6 pr-6 max-2xl:pr-4 h-full border-r border-(--colorNeutralBackground3)">
			<div className="flex items-center justify-between">
				<Label weight="semibold" size="large">
					{t('common.filters')}
				</Label>
				{hasActiveFilters && (
					<Button appearance="subtle" size="small" onClick={onClearAll}>
						Clear All
					</Button>
				)}
			</div>

			{FILTER_SECTIONS.filter((s) => !hideSections?.includes(s.id)).map((section) => (
				<div key={section.id} className="flex flex-col py-1 gap-2">
					<Label weight="semibold">{t(section.labelKey)}</Label>
					{section.filters.map(({ key, label }) => (
						<FilterCombobox
							key={key}
							filterKey={key}
							label={label}
							options={availableOptions[key]}
							selectedOptions={filters[key]}
							onSearchOptions={handleSearchOptions}
							onOptionSelect={(_ev, data) => {
								onFiltersChange({
									...filters,
									[key]: data.selectedOptions,
								});
							}}
							onDeselect={(value) => {
								onFiltersChange({
									...filters,
									[key]: filters[key].filter((v) => v !== value),
								});
							}}
						/>
					))}
					{section.id === 'bySubscription' &&
						SMART_FILTER_CONFIG.map((dim) => {
							const bucketLabelMap = new Map(
								dim.buckets
									.filter((b) => b.labelKey)
									.map((b) => [b.label, b.labelKey as string]),
							);
							return (
								<SmartFilterCheckboxGroup
									key={dim.key}
									filterKey={dim.key}
									label={dim.labelKey ? t(dim.labelKey) : dim.label}
									allBucketLabels={dim.buckets.map((b) => b.label)}
									availableBucketLabels={availableOptions[dim.key]}
									selectedOptions={filters[dim.key]}
									onChange={(selected) => {
										onFiltersChange({
											...filters,
											[dim.key]: selected,
										});
									}}
									optionLabel={(bucket) => {
										const k = bucketLabelMap.get(bucket);
										return k ? t(k) : bucket;
									}}
								/>
							);
						})}
				</div>
			))}
		</div>
	);
}
