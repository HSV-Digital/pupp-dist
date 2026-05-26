'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
	Body1,
	Button,
	ProgressBar,
	Subtitle1,
	Tag,
	Tooltip,
} from '@fluentui/react-components';
import {
	ArrowDownloadFilled,
	ArrowSortDownFilled,
	ArrowSortUpFilled,
	CalendarLtr24Regular,
	DocumentBulletList24Regular,
	Info16Regular,
	People24Regular,
	PersonAddRegular,
} from '@fluentui/react-icons';
import type { SkuCategory } from '@repo/types';
import {
	mapSortColumn,
	type ResellerDashboardCustomer,
	type ResellerCustomersFilters,
} from '@/lib/use-reseller-customers';
import { useDemoResellerCustomers } from '@/lib/use-demo-reseller-customers';
import {
	ResellersFilterPanel,
	type ResellersFilters,
} from '@/components/dashboard/ResellersFilterPanel';
import { AddResellerDialog } from '@/components/dashboard/AddResellerDialog';
import { ManageSubscriptionsDialog } from '@/components/dashboard/ManageSubscriptionsDialog';
import { Pagination } from '@/components/dashboard/Pagination';
import { SkuBadge } from '@/components/dashboard/SkuBadge';
import { formatNumber } from '@/lib/format-utils';
import {
	captureDashboardFilterApplied,
	captureDashboardFiltersCleared,
	captureProposalStarted,
} from '@/lib/posthog-product-events';
import { resolveResellerSkuCategory } from '@/lib/synthesize-subscription';
import { encodeResellerCustomerRouteKey } from '@/lib/reseller-customer-route';
import { getThemeConfig } from '@/lib/theme-config';

function SortableHeader({
	column,
	label,
	sortBy,
	sortDir,
	onSort,
	align,
	info,
}: {
	column: string;
	label: string;
	sortBy: string;
	sortDir: 'ascending' | 'descending';
	onSort: (col: string) => void;
	align?: 'right';
	info?: string;
}) {
	const active = sortBy === column;
	return (
		<th
			className={`cursor-pointer select-none px-6 py-3 font-normal text-gray-700 align-top${align === 'right' ? ' text-right' : ''}`}
			style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}
			onClick={() => onSort(column)}
		>
			<span className="inline-flex items-start gap-1 leading-tight">
				<span style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}>
					{label}
				</span>
				{info ? (
					<Tooltip content={info} relationship="description" withArrow>
						<span
							className="inline-flex shrink-0 cursor-pointer items-center text-gray-500"
							onClick={(e) => e.stopPropagation()}
							aria-label={info}
						>
							<Info16Regular />
						</span>
					</Tooltip>
				) : null}
				{active ? (
					sortDir === 'ascending' ? (
						<ArrowSortUpFilled className="shrink-0 text-xs" />
					) : (
						<ArrowSortDownFilled className="shrink-0 text-xs" />
					)
				) : null}
			</span>
		</th>
	);
}

const EMPTY_FILTERS: ResellersFilters = {
	customerName: [],
	currentSku: [],
	region: [],
	seats: [],
	renewalDate: [],
	copilotFit: [],
	copilotIntent: [],
	copilotCluster: [],
	hasCompete: [],
	hasTransactedProduct: [],
	distributorName: [],
	customerTpid: [],
	copilotChatToPaid: [],
	mwPaidSeatRange: [],
};

function countActiveFilters(filters: ResellersFilters): number {
	return Object.values(filters).reduce(
		(total, values) => total + values.length,
		0,
	);
}

export default function DemoResellerDashboardPage() {
	// nuqs (used inside useDemoResellerCustomers) calls useSearchParams under
	// the hood, which Next.js requires to be wrapped in Suspense during static
	// prerender. The protected dashboard avoids this implicitly via async auth
	// in its layout; the demo page has no async server boundary, so wrap here.
	return (
		<Suspense fallback={null}>
			<DemoResellerDashboardPageBody />
		</Suspense>
	);
}

function DemoResellerDashboardPageBody() {
	const t = useTranslations();
	const router = useRouter();

	const [filters, setFilters] = useState<ResellersFilters>(EMPTY_FILTERS);
	const [addDialogOpen, setAddDialogOpen] = useState(false);
	const [hasDismissedAutoOpenDialog, setHasDismissedAutoOpenDialog] =
		useState(false);
	const [manageCustomerName, setManageCustomerName] = useState<string | null>(
		null,
	);

	const apiFilters = useMemo((): ResellerCustomersFilters => {
		const f: ResellerCustomersFilters = {};
		for (const [key, value] of Object.entries(filters)) {
			if (value.length > 0) {
				(f as Record<string, string[]>)[key] = value;
			}
		}
		return f;
	}, [filters]);

	const {
		customers,
		total,
		summary,
		loading,
		availableOptions: apiOptions,
		page,
		pageSize,
		setPage,
		sortBy,
		sortDir,
		setSort: hookSetSort,
		addCustomer,
		refresh,
	} = useDemoResellerCustomers(apiFilters);

	const hasActiveFilters = countActiveFilters(filters) > 0;
	const hasResolvedCustomerData =
		summary !== null || total > 0 || customers.length > 0;
	const isInitialLoad = loading && !hasResolvedCustomerData;
	const isRefetching = loading && hasResolvedCustomerData;
	const shouldAutoOpenAddDialog =
		!hasDismissedAutoOpenDialog &&
		!loading &&
		!hasActiveFilters &&
		customers.length === 0 &&
		total === 0;
	const isAddDialogOpen = addDialogOpen || shouldAutoOpenAddDialog;

	const setSort = useCallback(
		(column: string) => {
			const nextDir =
				sortBy === column
					? sortDir === 'ascending'
						? 'descending'
						: 'ascending'
					: 'descending';
			hookSetSort(column, nextDir);
		},
		[sortBy, sortDir, hookSetSort],
	);

	const availableOptions = useMemo(
		() => ({
			customerName: apiOptions.customerName ?? [],
			currentSku: apiOptions.currentSku ?? [],
			region: apiOptions.region ?? [],
			seats: apiOptions.seats ?? [],
			renewalDate: apiOptions.renewalDate ?? [],
			copilotFit: apiOptions.copilotFit ?? [],
			copilotIntent: apiOptions.copilotIntent ?? [],
			copilotCluster: apiOptions.copilotCluster ?? [],
			hasCompete: apiOptions.hasCompete ?? [],
			hasTransactedProduct: apiOptions.hasTransactedProduct ?? [],
			distributorName: apiOptions.distributorName ?? [],
			customerTpid: apiOptions.customerTpid ?? [],
			copilotChatToPaid: apiOptions.copilotChatToPaid ?? [],
		}),
		[apiOptions],
	);

	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const clearFilters = useCallback(() => {
		if (countActiveFilters(filters) > 0) {
			captureDashboardFiltersCleared({
				surface: 'resellers-dashboard',
				isDemo: true,
			});
		}
		setFilters(EMPTY_FILTERS);
	}, [filters]);

	const handleFiltersChange = useCallback(
		(next: ResellersFilters) => {
			const nextTotal = countActiveFilters(next);
			if (nextTotal === 0 && countActiveFilters(filters) > 0) {
				captureDashboardFiltersCleared({
					surface: 'resellers-dashboard',
					isDemo: true,
				});
			} else {
				for (const key of Object.keys(next) as Array<keyof ResellersFilters>) {
					const previousValues = filters[key];
					const nextValues = next[key];
					if (
						previousValues.length === nextValues.length &&
						previousValues.every((value, index) => value === nextValues[index])
					) {
						continue;
					}

					if (nextValues.length > 0) {
						captureDashboardFilterApplied({
							surface: 'resellers-dashboard',
							filterKey: key,
							selectedCount: nextValues.length,
							totalActiveFilters: nextTotal,
							isDemo: true,
						});
					}
				}
			}
			setFilters(next);
		},
		[filters],
	);

	const handleViewProposal = useCallback(
		(entry: ResellerDashboardCustomer) => {
			captureProposalStarted({
				entrySurface: 'resellers-dashboard',
				customerId: entry.customerId,
				selectedScenarioCount: 0,
				isDemo: true,
			});
			router.push(
				`/csp-partners/demo/proposal/${encodeResellerCustomerRouteKey(entry.customerId)}?from=resellers-dashboard`,
			);
		},
		[router],
	);

	const handleAddCustomer = useCallback(
		async (data: {
			customerName: string;
			customerTpid?: string;
			countryName: string;
			renewalDate?: string;
			renewalMonth?: string;
			subscriptionName?: string;
			licenseCount?: number;
		}) => {
			return addCustomer(data);
		},
		[addCustomer],
	);

	const renderContent = () => {
		const hasActiveFilters = countActiveFilters(filters) > 0;
		const showEmptyState =
			!loading && customers.length === 0 && !hasActiveFilters;
		const summaryCards = [
			{
				label: t('dashboard.totalCustomers'),
				icon: <CalendarLtr24Regular />,
				value: formatNumber(summary?.totalCustomers ?? customers.length),
			},
			{
				label: t('dashboard.totalSubscriptions'),
				icon: <DocumentBulletList24Regular />,
				value: (summary?.totalSubscriptions ?? 0).toLocaleString('en-US'),
			},
			{
				label: t('table.totalSeats'),
				icon: <People24Regular />,
				value: formatNumber(summary?.totalSeats ?? 0),
			},
		];

		if (showEmptyState) {
			return (
				<div className="rounded-xl bg-white">
					<div className="flex min-h-[600px] flex-col items-center justify-center gap-2 p-12 text-center">
						<PersonAddRegular className="text-[48px] text-gray-400" />
						<Subtitle1>{t('dashboard.noCustomersAddedYet')}</Subtitle1>
						<Body1 className="text-neutral-500">
							{t('dashboard.addNetNewCustomerHint')}
						</Body1>
					</div>
				</div>
			);
		}

		return (
			<>
				<div className="grid grid-cols-1 gap-4 pb-6 sm:grid-cols-2 lg:grid-cols-3">
					{summaryCards.map((card) => (
						<div
							key={card.label}
							className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 max-2xl:px-3 max-2xl:py-3"
						>
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-(--ds-color-violet-50) text-(--ds-color-violet-500)">
								{card.icon}
							</div>
							<div>
								<p className="m-0 font-ds-text text-[0.8125rem] leading-4.5 text-gray-500">
									{card.label}
								</p>
								{isInitialLoad ? (
									<div className="mt-1 h-5 w-16 animate-pulse rounded bg-gray-200" />
								) : (
									<p className="mb-0 mt-0.5 font-ds-display text-lg max-2xl:text-base font-mono font-semibold leading-7">
										{card.value}
									</p>
								)}
							</div>
						</div>
					))}
				</div>
				<div className="rounded-xl bg-white px-6">
					<div className="grid grid-cols-[300px_1fr] max-2xl:grid-cols-[240px_1fr]">
						<aside>
							<ResellersFilterPanel
								filters={filters}
								onFiltersChange={handleFiltersChange}
								onClearAll={clearFilters}
								availableOptions={availableOptions}
							/>
						</aside>

						<main className="flex min-h-[600px] flex-col gap-6 p-6 pr-0">
							<div className="flex items-center justify-end gap-3">
								<Button
									size="medium"
									appearance="primary"
									icon={<PersonAddRegular className="size-4" />}
									style={{ padding: '6px 12px' }}
									onClick={() => {
										setHasDismissedAutoOpenDialog(true);
										setAddDialogOpen(true);
									}}
								>
									{t('common.addCustomer')}
								</Button>
							</div>
							{isInitialLoad ? (
								<div
									data-testid="resellers-dashboard-table-loading"
									className="rounded-md border border-(--colorNeutralBackground3) p-4"
								>
									<div className="space-y-3">
										{Array.from({ length: 8 }).map((_, index) => (
											<div
												key={`reseller-table-skeleton-${index}`}
												className="h-8 animate-pulse rounded bg-(--colorNeutralBackground3)"
											/>
										))}
									</div>
								</div>
							) : (
								<div>
									<div className="mb-3 h-1.5">
										{isRefetching ? (
											<div aria-live="polite">
												<ProgressBar aria-label={t('dashboard.updatingTable')} />
											</div>
										) : (
											<div className="h-full" aria-hidden="true" />
										)}
									</div>
									<div className="overflow-x-auto">
										<table className="w-full text-sm">
											<thead>
												<tr className="border-b border-(--colorNeutralStroke2) text-left">
													<SortableHeader
														column="customerName"
														label={t('table.customerName')}
														sortBy={sortBy}
														sortDir={sortDir}
														onSort={setSort}
													/>
													<SortableHeader
														column="subscriptions"
														label={t('table.subscriptionsParen')}
														sortBy={sortBy}
														sortDir={sortDir}
														onSort={setSort}
													/>
													<SortableHeader
														column="seats"
														label={t('table.seats')}
														sortBy={sortBy}
														sortDir={sortDir}
														onSort={setSort}
														align="right"
													/>
													<SortableHeader
														column="renewalDate"
														label={t('table.closestRenewal')}
														sortBy={sortBy}
														sortDir={sortDir}
														onSort={setSort}
													/>
													<th className="px-6 py-3 font-normal text-gray-700">
														{t('common.actions')}
													</th>
												</tr>
											</thead>
											<tbody>
												{customers.length > 0 ? (
													customers.map((entry) => (
														<tr
															key={entry.customerId}
															className="border-b border-(--colorNeutralStroke2) last:border-b-0 hover:bg-gray-50"
														>
															<td className="px-6 py-3">
																{entry.customerName}
															</td>
															<td className="px-6 py-3">
																{(() => {
																	const uniqueCategories = [
																		...new Set(
																			entry.subscriptionSkuNames.map(
																				(s) =>
																					resolveResellerSkuCategory(
																						s,
																					) as SkuCategory,
																			),
																		),
																	];
																	return (
																		<div className="flex flex-wrap gap-1">
																			{uniqueCategories
																				.slice(0, 2)
																				.map((cat) => (
																					<SkuBadge
																						key={`${entry.customerId}-${cat}`}
																						category={cat}
																					/>
																				))}
																			{uniqueCategories.length > 2 ? (
																				<Tag
																					size="small"
																					shape="rounded"
																					appearance="outline"
																				>
																					+{uniqueCategories.length - 2}
																				</Tag>
																			) : null}
																		</div>
																	);
																})()}
															</td>
															<td className="px-6 py-3 text-right">
																{entry.totalSeatsRange === '0'
																	? 'N/A'
																	: entry.totalSeatsRange}
															</td>
															<td className="px-6 py-3">
																{entry.closestRenewalLabel}
															</td>
															<td className="px-6 py-3">
																<div className="flex items-center gap-2">
																	<Button
																		appearance="outline"
																		size="medium"
																		shape="rounded"
																		onClick={() => handleViewProposal(entry)}
																	>
																		<span className="block whitespace-nowrap text-(--ds-color-violet-600)">
																			{t('common.viewProposal')}
																		</span>
																	</Button>
																</div>
															</td>
														</tr>
													))
												) : (
													<tr>
														<td
															colSpan={5}
															className="px-6 py-12 text-center text-neutral-500"
														>
															{t('dashboard.noCustomersMatchFilters')}
														</td>
													</tr>
												)}
											</tbody>
										</table>
										<Pagination
											currentPage={page}
											totalPages={totalPages}
											onPageChange={setPage}
										/>
									</div>
								</div>
							)}
						</main>
					</div>
				</div>
			</>
		);
	};

	return (
		<div className="app-shell-content-wrap px-0!">
			<div
				className="flex h-80 w-full flex-col items-center justify-center rounded-b-xl bg-cover bg-position-[center_right]"
				style={{
					backgroundImage: `url('${getThemeConfig().assets.dashboardHeroBanner}')`,
				}}
			>
				<h1
					className={`py-4 text-[42px] leading-[48px] font-bold ${getThemeConfig().styles.heroTextClass}`}
				>
					{t('resellerDashboard.heading')}
				</h1>
				<h4
					className={`text-lg ${getThemeConfig().styles.heroTextClass}`}
				>
					{t('resellerDashboard.subheading')}
				</h4>
				<p className="mt-3 max-w-4xl px-4 text-center  italic text-base text-gray-900">
					This is a demo environment. Any data added here will be publicly
					available - please don&apos;t add any confidential data.
				</p>
			</div>

			<div
				className="my-6 rounded-xl bg-cover bg-center p-6"
				style={{
					backgroundImage: `url('${getThemeConfig().assets.dashboardBackground}')`,
				}}
			>
				{renderContent()}
			</div>

			<AddResellerDialog
				open={isAddDialogOpen}
				onOpenChange={(open) => {
					if (!open) {
						setHasDismissedAutoOpenDialog(true);
					}
					setAddDialogOpen(open);
				}}
				forceOpen={shouldAutoOpenAddDialog}
				onAdd={handleAddCustomer}
				onRefresh={refresh}
				isDemo
			/>
			<ManageSubscriptionsDialog
				open={manageCustomerName !== null}
				onOpenChange={(open) => {
					if (!open) setManageCustomerName(null);
				}}
				customerName={manageCustomerName ?? ''}
				onChanged={refresh}
				isDemo
			/>
		</div>
	);
}
