'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
	Button,
	Combobox,
	Dialog,
	DialogBody,
	DialogContent,
	DialogSurface,
	DialogTitle,
	Field,
	Input,
	MessageBar,
	MessageBarBody,
	Option,
	Popover,
	PopoverSurface,
	PopoverTrigger,
	Spinner,
} from '@fluentui/react-components';
import {
	AddRegular,
	CheckmarkRegular,
	DeleteRegular,
	Dismiss20Regular,
	EditRegular,
} from '@fluentui/react-icons';
import { CustomerRegion } from '@repo/types';
import { STARTING_SKUS } from '@repo/shared';
import type { ResellerSubscription } from '@/lib/use-reseller-customers';
import { resellerApiFetch } from '@/lib/reseller-api-client';
import { demoResellerApiFetch } from '@/lib/demo-reseller-api-client';
import { getThemeConfig } from '@/lib/theme-config';

const regionOptions = Object.values(CustomerRegion);
const skuOptions = STARTING_SKUS.map((sku) => sku.name);

const SEAT_RANGE_OPTIONS = ['1-25', '26-100', '101-300', '301-1000', '1000+'];

interface ManageSubscriptionsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	customerName: string;
	onChanged?: () => void | Promise<void>;
	isDemo?: boolean;
}

interface SubscriptionForm {
	customerName: string;
	subscriptionName: string;
	licenseCount: string;
	renewalDate: string;
	customerTpid: string;
	countryName: string;
	copilotFit: string;
	copilotIntent: string;
	copilotCluster: string;
	copilotEligibleM365Seats: string;
	freeCopilotChatMAU: string;
	copilotSeatsWhitespace: string;
	allAgentMAU: string;
	mciEligibility: string;
	mciEngagementName: string;
	adoptionStatus: string;
	mwPaidSeatRange: string;
	hasTransactedProduct: string;
	hasCompete: string;
	tenantIds: string;
}

function numToStr(n: number | null | undefined): string {
	return n === null || n === undefined ? '' : String(n);
}

function toForm(s: ResellerSubscription): SubscriptionForm {
	return {
		customerName: s.customerName ?? '',
		subscriptionName: s.currentSku ?? '',
		licenseCount: s.seats ? String(s.seats) : '',
		renewalDate: s.renewalDate ?? '',
		customerTpid: s.customerTpid ?? '',
		countryName: s.region ?? '',
		copilotFit: s.copilotFit ?? '',
		copilotIntent: s.copilotIntent ?? '',
		copilotCluster: s.copilotCluster ?? '',
		copilotEligibleM365Seats: numToStr(s.copilotEligibleM365Seats),
		freeCopilotChatMAU: numToStr(s.freeCopilotChatMAU),
		copilotSeatsWhitespace: numToStr(s.copilotSeatsWhitespace),
		allAgentMAU: numToStr(s.allAgentMAU),
		mciEligibility: numToStr(s.mciEligibility),
		mciEngagementName: s.mciEngagementName ?? '',
		adoptionStatus: s.adoptionStatus ?? '',
		mwPaidSeatRange: s.mwPaidSeatRange ?? '',
		hasTransactedProduct: s.hasTransactedProduct ?? '',
		hasCompete: s.hasCompete ?? '',
		tenantIds: s.tenantIds ?? '',
	};
}

function emptyAddForm(
	defaultRegion: string,
	defaultCustomerName = '',
): SubscriptionForm {
	return {
		customerName: defaultCustomerName,
		subscriptionName: '',
		licenseCount: '',
		renewalDate: '',
		customerTpid: '',
		countryName: defaultRegion,
		copilotFit: '',
		copilotIntent: '',
		copilotCluster: '',
		copilotEligibleM365Seats: '',
		freeCopilotChatMAU: '',
		copilotSeatsWhitespace: '',
		allAgentMAU: '',
		mciEligibility: '',
		mciEngagementName: '',
		adoptionStatus: '',
		mwPaidSeatRange: '',
		hasTransactedProduct: '',
		hasCompete: '',
		tenantIds: '',
	};
}

export function ManageSubscriptionsDialog({
	open,
	onOpenChange,
	customerName,
	onChanged,
	isDemo = false,
}: ManageSubscriptionsDialogProps) {
	const t = useTranslations();
	const apiFetch = isDemo ? demoResellerApiFetch : resellerApiFetch;
	const customersPath = isDemo
		? '/customers'
		: '/api/reseller/customers';
	const [subscriptions, setSubscriptions] = useState<ResellerSubscription[]>(
		[],
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState<SubscriptionForm | null>(null);
	const [savingId, setSavingId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

	const [showAddForm, setShowAddForm] = useState(false);
	const [addForm, setAddForm] = useState<SubscriptionForm>(
		emptyAddForm(CustomerRegion.UnitedStates),
	);
	const [adding, setAdding] = useState(false);

	const defaultRegion = useMemo(
		() => subscriptions[0]?.region || CustomerRegion.UnitedStates,
		[subscriptions],
	);

	const loadSubscriptions = useCallback(
		async (options: { resetList?: boolean } = {}) => {
			if (!customerName) return;
			if (options.resetList) {
				setSubscriptions([]);
			}
			setLoading(true);
			setError(null);
			try {
				const response = await apiFetch(
					`${customersPath}/group/${encodeURIComponent(customerName)}/subscriptions`,
				);
				if (!response.ok) {
					throw new Error(`Failed to load subscriptions: ${response.status}`);
				}
				const data: ResellerSubscription[] = await response.json();
				setSubscriptions(data);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : 'Failed to load subscriptions',
				);
			} finally {
				setLoading(false);
			}
		},
		[customerName],
	);

	useEffect(() => {
		if (open) {
			setEditingId(null);
			setEditForm(null);
			setShowAddForm(false);
			setAddForm(emptyAddForm(CustomerRegion.UnitedStates));
			setError(null);
			setSuccessMessage(null);
			setConfirmDeleteId(null);
			void loadSubscriptions({ resetList: true });
		} else {
			// Clear stale rows once the dialog closes so the next open shows a
			// fresh loading state instead of the previous customer's data.
			setSubscriptions([]);
		}
	}, [open, loadSubscriptions]);

	const flashSuccess = useCallback((message: string) => {
		setSuccessMessage(message);
		window.setTimeout(() => setSuccessMessage(null), 2500);
	}, []);

	const startEdit = (s: ResellerSubscription) => {
		setEditingId(s.id);
		setEditForm(toForm(s));
		setError(null);
	};

	const cancelEdit = () => {
		setEditingId(null);
		setEditForm(null);
	};

	const saveEdit = async (id: string) => {
		if (!editForm) return;
		setSavingId(id);
		setError(null);
		try {
			const payload: Record<string, unknown> = {};
			if (editForm.customerName.trim() !== '')
				payload.customerName = editForm.customerName.trim();
			if (editForm.subscriptionName !== '')
				payload.subscriptionName = editForm.subscriptionName;
			if (editForm.licenseCount !== '')
				payload.licenseCount = Number(editForm.licenseCount);
			payload.renewalDate = editForm.renewalDate;
			if (editForm.countryName) payload.countryName = editForm.countryName;
			payload.customerTpid = editForm.customerTpid;
			payload.copilotFit = editForm.copilotFit;
			payload.copilotIntent = editForm.copilotIntent;
			payload.copilotCluster = editForm.copilotCluster;
			if (editForm.copilotEligibleM365Seats !== '')
				payload.copilotEligibleM365Seats = Number(
					editForm.copilotEligibleM365Seats,
				);
			if (editForm.freeCopilotChatMAU !== '')
				payload.freeCopilotChatMAU = Number(editForm.freeCopilotChatMAU);
			if (editForm.copilotSeatsWhitespace !== '')
				payload.copilotSeatsWhitespace = Number(
					editForm.copilotSeatsWhitespace,
				);
			if (editForm.allAgentMAU !== '')
				payload.allAgentMAU = Number(editForm.allAgentMAU);
			if (editForm.mciEligibility !== '')
				payload.mciEligibility = Number(editForm.mciEligibility);
			payload.mciEngagementName = editForm.mciEngagementName;
			payload.adoptionStatus = editForm.adoptionStatus;
			payload.mwPaidSeatRange = editForm.mwPaidSeatRange;
			payload.hasTransactedProduct = editForm.hasTransactedProduct;
			payload.hasCompete = editForm.hasCompete;
			payload.tenantIds = editForm.tenantIds;

			const response = await apiFetch(
				`${customersPath}/${id}`,
				{ method: 'PATCH', body: JSON.stringify(payload) },
			);
			if (!response.ok) {
				const text = await response.text().catch(() => '');
				throw new Error(text || `Update failed: ${response.status}`);
			}
			await loadSubscriptions();
			setEditingId(null);
			setEditForm(null);
			flashSuccess('Subscription updated');
			await onChanged?.();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update');
		} finally {
			setSavingId(null);
		}
	};

	const handleDelete = async (id: string) => {
		setDeletingId(id);
		setError(null);
		try {
			const response = await apiFetch(`${customersPath}/${id}`, {
				method: 'DELETE',
			});
			if (!response.ok) {
				throw new Error(`Delete failed: ${response.status}`);
			}
			await loadSubscriptions();
			setConfirmDeleteId(null);
			flashSuccess('Subscription removed');
			await onChanged?.();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete');
		} finally {
			setDeletingId(null);
		}
	};

	const handleAdd = async () => {
		if (!addForm.countryName) {
			setError('Country is required');
			return;
		}
		setAdding(true);
		setError(null);
		try {
			const payload: Record<string, unknown> = {
				customerName: addForm.customerName.trim() || customerName,
				countryName: addForm.countryName,
			};
			if (addForm.subscriptionName)
				payload.subscriptionName = addForm.subscriptionName;
			if (addForm.licenseCount)
				payload.licenseCount = Number(addForm.licenseCount);
			if (addForm.renewalDate) payload.renewalDate = addForm.renewalDate;
			if (addForm.customerTpid) payload.customerTpid = addForm.customerTpid;
			if (addForm.copilotFit) payload.copilotFit = addForm.copilotFit;
			if (addForm.copilotIntent) payload.copilotIntent = addForm.copilotIntent;
			if (addForm.copilotCluster)
				payload.copilotCluster = addForm.copilotCluster;
			if (addForm.copilotEligibleM365Seats)
				payload.copilotEligibleM365Seats = Number(
					addForm.copilotEligibleM365Seats,
				);
			if (addForm.freeCopilotChatMAU)
				payload.freeCopilotChatMAU = Number(addForm.freeCopilotChatMAU);
			if (addForm.copilotSeatsWhitespace)
				payload.copilotSeatsWhitespace = Number(
					addForm.copilotSeatsWhitespace,
				);
			if (addForm.allAgentMAU)
				payload.allAgentMAU = Number(addForm.allAgentMAU);
			if (addForm.mciEligibility)
				payload.mciEligibility = Number(addForm.mciEligibility);
			if (addForm.mciEngagementName)
				payload.mciEngagementName = addForm.mciEngagementName;
			if (addForm.adoptionStatus)
				payload.adoptionStatus = addForm.adoptionStatus;
			if (addForm.mwPaidSeatRange)
				payload.mwPaidSeatRange = addForm.mwPaidSeatRange;
			if (addForm.hasTransactedProduct)
				payload.hasTransactedProduct = addForm.hasTransactedProduct;
			if (addForm.hasCompete) payload.hasCompete = addForm.hasCompete;
			if (addForm.tenantIds) payload.tenantIds = addForm.tenantIds;

			const response = await apiFetch(customersPath, {
				method: 'POST',
				body: JSON.stringify(payload),
			});
			if (!response.ok) {
				const text = await response.text().catch(() => '');
				throw new Error(text || `Create failed: ${response.status}`);
			}
			await loadSubscriptions();
			setShowAddForm(false);
			setAddForm(emptyAddForm(defaultRegion, customerName));
			flashSuccess('Subscription added');
			await onChanged?.();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add');
		} finally {
			setAdding(false);
		}
	};

	const renderEditFields = (
		form: SubscriptionForm,
		setForm: (next: SubscriptionForm) => void,
	) => (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<p className="sm:col-span-2 m-0 text-xs text-gray-500">
				Fields marked <span className="text-red-500">*</span> are required;
				all others are optional.
			</p>
			<Field label="Customer Name" required className="sm:col-span-2">
				<Input
					appearance="outline"
					value={form.customerName}
					onChange={(_, data) =>
						setForm({ ...form, customerName: data.value })
					}
				/>
			</Field>
			<Field label="Subscription">
				<Combobox
					appearance="outline"
					value={form.subscriptionName}
					placeholder="Select subscription"
					onOptionSelect={(_, data) =>
						setForm({ ...form, subscriptionName: data.optionText ?? '' })
					}
					freeform
					onChange={(e) =>
						setForm({
							...form,
							subscriptionName: (e.target as HTMLInputElement).value,
						})
					}
				>
					{skuOptions.map((opt) => (
						<Option key={opt}>{opt}</Option>
					))}
				</Combobox>
			</Field>
			<Field label="Seats / Licenses">
				<Input
					appearance="outline"
					type="number"
					min={0}
					value={form.licenseCount}
					onChange={(_, data) =>
						setForm({ ...form, licenseCount: data.value })
					}
				/>
			</Field>
			<Field label="Renewal Date">
				<Input
					appearance="outline"
					type="date"
					value={form.renewalDate}
					onChange={(_, data) =>
						setForm({ ...form, renewalDate: data.value })
					}
				/>
			</Field>
			<Field label="Country" required>
				<Combobox
					appearance="outline"
					value={form.countryName}
					positioning={{
						position: 'below',
						align: 'start',
						autoSize: 'width',
					}}
					listbox={{ style: { maxHeight: '240px', overflowY: 'auto' } }}
					onOptionSelect={(_, data) =>
						setForm({ ...form, countryName: data.optionText ?? '' })
					}
				>
					{regionOptions.map((r) => (
						<Option key={r}>{r}</Option>
					))}
				</Combobox>
			</Field>
			<Field label="Customer TPID">
				<Input
					appearance="outline"
					placeholder="Optional"
					value={form.customerTpid}
					onChange={(_, data) =>
						setForm({ ...form, customerTpid: data.value })
					}
				/>
			</Field>

			<div className="sm:col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
				Copilot
			</div>
			<Field label="Copilot Fit">
				<Input
					appearance="outline"
					value={form.copilotFit}
					onChange={(_, data) =>
						setForm({ ...form, copilotFit: data.value })
					}
				/>
			</Field>
			<Field label="Copilot Intent">
				<Input
					appearance="outline"
					value={form.copilotIntent}
					onChange={(_, data) =>
						setForm({ ...form, copilotIntent: data.value })
					}
				/>
			</Field>
			<Field label="Copilot Cluster">
				<Input
					appearance="outline"
					value={form.copilotCluster}
					onChange={(_, data) =>
						setForm({ ...form, copilotCluster: data.value })
					}
				/>
			</Field>
			<Field label="Copilot-Eligible M365 Seats">
				<Input
					appearance="outline"
					type="number"
					min={0}
					value={form.copilotEligibleM365Seats}
					onChange={(_, data) =>
						setForm({ ...form, copilotEligibleM365Seats: data.value })
					}
				/>
			</Field>
			<Field label="Free Copilot Chat MAU">
				<Input
					appearance="outline"
					type="number"
					min={0}
					value={form.freeCopilotChatMAU}
					onChange={(_, data) =>
						setForm({ ...form, freeCopilotChatMAU: data.value })
					}
				/>
			</Field>
			<Field label="Copilot Seats Whitespace">
				<Input
					appearance="outline"
					type="number"
					min={0}
					value={form.copilotSeatsWhitespace}
					onChange={(_, data) =>
						setForm({ ...form, copilotSeatsWhitespace: data.value })
					}
				/>
			</Field>
			<Field label="All Agent MAU">
				<Input
					appearance="outline"
					type="number"
					min={0}
					value={form.allAgentMAU}
					onChange={(_, data) =>
						setForm({ ...form, allAgentMAU: data.value })
					}
				/>
			</Field>

			<div className="sm:col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
				MCI / Adoption
			</div>
			<Field label="MCI Eligibility">
				<Input
					appearance="outline"
					type="number"
					min={0}
					value={form.mciEligibility}
					onChange={(_, data) =>
						setForm({ ...form, mciEligibility: data.value })
					}
				/>
			</Field>
			<Field label="MCI Engagement Name">
				<Input
					appearance="outline"
					value={form.mciEngagementName}
					onChange={(_, data) =>
						setForm({ ...form, mciEngagementName: data.value })
					}
				/>
			</Field>
			<Field label="Adoption Status" className="sm:col-span-2">
				<Input
					appearance="outline"
					value={form.adoptionStatus}
					onChange={(_, data) =>
						setForm({ ...form, adoptionStatus: data.value })
					}
				/>
			</Field>

			<div className="sm:col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
				Other
			</div>
			<Field label="MW Paid Seat Range">
				<Combobox
					appearance="outline"
					value={form.mwPaidSeatRange}
					placeholder="Select range"
					freeform
					onOptionSelect={(_, data) =>
						setForm({ ...form, mwPaidSeatRange: data.optionText ?? '' })
					}
					onChange={(e) =>
						setForm({
							...form,
							mwPaidSeatRange: (e.target as HTMLInputElement).value,
						})
					}
				>
					{SEAT_RANGE_OPTIONS.map((opt) => (
						<Option key={opt}>{opt}</Option>
					))}
				</Combobox>
			</Field>
			<Field label="Has Transacted Product">
				<Input
					appearance="outline"
					value={form.hasTransactedProduct}
					onChange={(_, data) =>
						setForm({ ...form, hasTransactedProduct: data.value })
					}
				/>
			</Field>
			<Field label="Has Compete">
				<Input
					appearance="outline"
					value={form.hasCompete}
					onChange={(_, data) =>
						setForm({ ...form, hasCompete: data.value })
					}
				/>
			</Field>
			<Field label="Tenant IDs">
				<Input
					appearance="outline"
					placeholder="Comma-separated"
					value={form.tenantIds}
					onChange={(_, data) =>
						setForm({ ...form, tenantIds: data.value })
					}
				/>
			</Field>
		</div>
	);

	const formatDate = (date: string | null) => {
		if (!date) return '—';
		const d = new Date(date.includes('T') ? date : `${date}T00:00:00`);
		if (Number.isNaN(d.getTime())) return '—';
		return d.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(_, data) => onOpenChange(data.open)}
		>
			<DialogSurface
				style={{ maxWidth: 820, padding: 0, borderRadius: 12 }}
			>
				<DialogBody style={{ gap: 0, padding: 0 }}>
					<DialogTitle
						style={{ padding: '24px 32px 0 32px' }}
						action={
							<Button
								appearance="subtle"
								icon={<Dismiss20Regular />}
								onClick={() => onOpenChange(false)}
								aria-label="Close dialog"
								style={{ marginTop: 16, marginRight: 16 }}
							/>
						}
					>
						<div className="flex flex-col gap-1">
							<span className="font-ds-display text-lg font-semibold">
								Manage Subscriptions
							</span>
							<span className="text-sm font-normal text-gray-500">
								{customerName}
							</span>
						</div>
					</DialogTitle>
					<DialogContent style={{ padding: '16px 32px 32px 32px' }}>
						{error && (
							<MessageBar intent="error" className="mb-4! rounded-lg!">
								<MessageBarBody>{error}</MessageBarBody>
							</MessageBar>
						)}
						{successMessage && (
							<div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
								<CheckmarkRegular className="text-green-600" />
								<p className="m-0 text-sm font-medium text-green-800">
									{successMessage}
								</p>
							</div>
						)}

						<div className="mb-4 flex items-center justify-between">
							<div className="text-sm text-gray-600">
								{loading
									? 'Loading…'
									: `${subscriptions.length} subscription${subscriptions.length === 1 ? '' : 's'}`}
							</div>
							{!showAddForm && (
								<Button
									appearance="primary"
									size="medium"
									icon={<AddRegular />}
									onClick={() => setShowAddForm(true)}
								>
									Add subscription
								</Button>
							)}
						</div>

						{showAddForm && (
							<div
								className="mb-4 rounded-lg border bg-white p-4"
								style={{
									borderColor: getThemeConfig().brandRamp[120],
								}}
							>
								<div className="mb-3 flex items-center justify-between">
									<span className="text-sm font-semibold text-gray-800">
										New subscription for {customerName}
									</span>
								</div>
								{renderEditFields(addForm, setAddForm)}
								<div className="mt-4 flex justify-end gap-2">
									<Button
										appearance="secondary"
										size="small"
										disabled={adding}
										onClick={() => {
											setShowAddForm(false);
											setAddForm(emptyAddForm(defaultRegion, customerName));
											setError(null);
										}}
									>
										Cancel
									</Button>
									<Button
										appearance="primary"
										size="small"
										disabled={adding || !addForm.countryName}
										icon={adding ? <Spinner size="tiny" /> : <AddRegular />}
										onClick={handleAdd}
									>
										{adding ? 'Adding…' : 'Add'}
									</Button>
								</div>
							</div>
						)}

						{loading && subscriptions.length === 0 ? (
							<div className="flex items-center justify-center py-12">
								<Spinner size="medium" />
							</div>
						) : subscriptions.length === 0 ? (
							<div className="rounded-lg border border-dashed border-gray-200 px-6 py-10 text-center">
								<p className="m-0 text-sm text-gray-500">
									No subscriptions yet. Add the first one above.
								</p>
							</div>
						) : (
							<div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1">
								{subscriptions.map((s) => {
									const isEditing = editingId === s.id;
									const isPendingDelete = confirmDeleteId === s.id;
									return (
										<div
											key={s.id}
											className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
										>
											{!isEditing ? (
												<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
													<div className="flex flex-1 flex-col gap-2">
														<div className="flex flex-wrap items-center gap-2">
															<span className="font-ds-text text-sm font-semibold text-gray-900">
																{s.currentSku || 'Unnamed subscription'}
															</span>
														</div>
														<div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-3">
															<div>
																<span className="text-gray-400">Seats</span>
																<div className="font-mono text-sm text-gray-800">
																	{s.seats?.toLocaleString('en-US') ?? '—'}
																</div>
															</div>
															<div>
																<span className="text-gray-400">Renewal</span>
																<div className="text-sm text-gray-800">
																	{formatDate(s.renewalDate)}
																</div>
															</div>
															<div>
																<span className="text-gray-400">Country</span>
																<div className="text-sm text-gray-800">
																	{s.region || '—'}
																</div>
															</div>
														</div>
													</div>
													<div className="flex shrink-0 items-center gap-2">
														<Button
															appearance="subtle"
															size="small"
															icon={<EditRegular />}
															onClick={() => startEdit(s)}
															aria-label="Edit subscription"
														>
															Edit
														</Button>
														<Popover
															open={isPendingDelete}
															onOpenChange={(_, data) => {
																if (data.open) {
																	setConfirmDeleteId(s.id);
																} else if (deletingId !== s.id) {
																	setConfirmDeleteId(null);
																}
															}}
															positioning="below-end"
															withArrow
														>
															<PopoverTrigger disableButtonEnhancement>
																<Button
																	appearance="subtle"
																	size="small"
																	icon={<DeleteRegular />}
																	aria-label="Delete subscription"
																	style={{ color: '#c4314b' }}
																/>
															</PopoverTrigger>
															<PopoverSurface
																style={{ padding: 12, minWidth: 220 }}
															>
																<div className="flex flex-col gap-2">
																	<span className="text-sm font-medium text-gray-800">
																		Delete this subscription?
																	</span>
																	<div className="flex justify-end gap-2">
																		<Button
																			appearance="secondary"
																			size="small"
																			disabled={deletingId === s.id}
																			onClick={() => setConfirmDeleteId(null)}
																		>
																			Cancel
																		</Button>
																		<Button
																			appearance="primary"
																			size="small"
																			disabled={deletingId === s.id}
																			icon={
																				deletingId === s.id ? (
																					<Spinner size="extra-tiny" />
																				) : (
																					<DeleteRegular className="size-4" />
																				)
																			}
																			style={{ backgroundColor: '#c4314b' }}
																			onClick={() => handleDelete(s.id)}
																		>
																			Delete
																		</Button>
																	</div>
																</div>
															</PopoverSurface>
														</Popover>
													</div>
												</div>
											) : (
												<div className="flex flex-col gap-3">
													{editForm && renderEditFields(editForm, setEditForm)}
													<div className="flex justify-end gap-2">
														<Button
															appearance="secondary"
															size="medium"
															disabled={savingId === s.id}
															onClick={cancelEdit}
														>
															Cancel
														</Button>
														<Button
															appearance="primary"
															size="medium"
															disabled={savingId === s.id}
															icon={
																savingId === s.id ? (
																	<Spinner size="extra-tiny" />
																) : (
																	<CheckmarkRegular className='size-4' />
																)
															}
															onClick={() => saveEdit(s.id)}
														>
															{savingId === s.id ? 'Saving…' : 'Save'}
														</Button>
													</div>
												</div>
											)}
										</div>
									);
								})}
							</div>
						)}
					</DialogContent>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
}
