'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
	Button,
	Dialog,
	DialogBody,
	DialogContent,
	DialogSurface,
	DialogTitle,
	MessageBar,
	MessageBarBody,
	Spinner,
	Tab,
	TabList,
} from '@fluentui/react-components';
import {
	ArrowDownloadRegular,
	ArrowUploadRegular,
	CheckmarkRegular,
	Dismiss20Regular,
} from '@fluentui/react-icons';
import {
	ResellerCustomerForm,
	type ResellerCustomerFormData,
} from '@/components/shared/ResellerCustomerForm';
import { getThemeConfig } from '@/lib/theme-config';
import {
	uploadFile,
	type UploadProgress,
	createProgressStream,
} from '@/lib/upload-api';
import { demoUploadFile, createDemoProgressStream } from '@/lib/demo-upload-api';
import {
	uploadResellerEnrichmentFile,
	createResellerEnrichmentProgressStream,
	type ResellerSubscriptionEnrichmentProgress,
} from '@/lib/use-reseller-subscription-enrichment';
import {
	uploadDemoResellerEnrichmentFile,
	createDemoResellerEnrichmentProgressStream,
} from '@/lib/use-demo-reseller-subscription-enrichment';

// --- Types ---

type DialogView =
	| 'form'
	| 'csv-upload'
	| 'microsoft-upload'
	| 'partner-upload'
	| 'aspx-enrichment';

// --- Shared progress bar component ---

function ProgressBarSmooth({
	progress,
	label,
}: {
	progress: number;
	label: string;
}) {
	const pct = Math.round(Math.min(100, Math.max(0, progress * 100)));
	return (
		<div className="py-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					{progress < 1 && <Spinner size="tiny" />}
					{progress >= 1 && <CheckmarkRegular className="text-green-500" />}
					<span className="text-sm font-medium text-[#323130]">{label}</span>
				</div>
				<span className="text-[13px] font-semibold text-[#605E5C]">{pct}%</span>
			</div>
			<div
				className="h-1.5 w-full overflow-hidden rounded-full"
				style={{ backgroundColor: 'var(--colorNeutralBackground6, #e1dfdd)' }}
			>
				<div
					className="h-full rounded-full"
					style={{
						width: `${pct}%`,
						backgroundColor: 'var(--colorCompoundBrandBackground, #0078d4)',
						transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
					}}
				/>
			</div>
		</div>
	);
}

// --- Props ---

interface AddResellerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	forceOpen?: boolean;
	onAdd: (data: {
		customerName: string;
		customerTpid?: string;
		countryName: string;
		renewalDate?: string;
		renewalMonth?: string;
		subscriptionName?: string;
		licenseCount?: number;
	}) => Promise<unknown>;
	onRefresh?: () => Promise<void>;
	isDemo?: boolean;
}

// --- Per-tab upload state hook ---

function useServerUpload(isDemo: boolean) {
	const uploadFn = isDemo ? demoUploadFile : uploadFile;
	const streamFn = isDemo ? createDemoProgressStream : createProgressStream;
	const [phase, setPhase] = useState<
		'idle' | 'uploading' | 'processing' | 'complete' | 'failed'
	>('idle');
	const [progress, setProgress] = useState<UploadProgress | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [displayProgress, setDisplayProgress] = useState(0);
	const displayRef = useRef(0);
	const animRef = useRef<number | null>(null);
	const targetRef = useRef(0);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const cleanupRef = useRef<(() => void) | null>(null);

	const startAnimation = useCallback(() => {
		if (animRef.current !== null) cancelAnimationFrame(animRef.current);

		const tick = () => {
			const current = displayRef.current;
			const target = targetRef.current;
			const diff = target - current;

			if (Math.abs(diff) < 0.001) {
				displayRef.current = target;
				setDisplayProgress(target);
				if (target < 1) {
					animRef.current = requestAnimationFrame(tick);
				}
				return;
			}

			const step = diff * 0.08;
			const next = current + Math.max(Math.min(step, 0.02), -0.02);
			const clamped = Math.max(0, Math.min(1, next));
			displayRef.current = clamped;
			setDisplayProgress(clamped);
			animRef.current = requestAnimationFrame(tick);
		};

		animRef.current = requestAnimationFrame(tick);
	}, []);

	useEffect(() => {
		if (phase === 'uploading') {
			targetRef.current = 0.05;
			startAnimation();
		} else if (phase === 'processing' && progress) {
			const realPct =
				progress.total > 0 ? progress.processed / progress.total : 0;
			targetRef.current = 0.05 + realPct * 0.9;
			startAnimation();
		} else if (phase === 'complete') {
			targetRef.current = 1;
			startAnimation();
		}
	}, [phase, progress, startAnimation]);

	const handleUpload = useCallback(
		async (
			event: React.ChangeEvent<HTMLInputElement>,
			needsRefreshRef: React.MutableRefObject<boolean>,
		) => {
			const file = event.target.files?.[0];
			if (!file) return;

			setError(null);
			setDisplayProgress(0);
			displayRef.current = 0;
			targetRef.current = 0;
			setPhase('uploading');

			try {
				const result = await uploadFn(file);
				setPhase('processing');
				needsRefreshRef.current = true;

				const cleanup = streamFn(
					result.jobId,
					(data) => {
						setProgress(data);
						if (data.status === 'completed') {
							setPhase('complete');
						} else if (data.status === 'failed') {
							setPhase('failed');
							setError('Processing failed');
						}
					},
					(errMsg) => {
						setError(errMsg);
						setPhase('failed');
					},
					() => {},
				);
				cleanupRef.current = cleanup;
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Upload failed');
				setPhase('failed');
			}
		},
		[],
	);

	const reset = useCallback(() => {
		setPhase('idle');
		setProgress(null);
		setError(null);
		setDisplayProgress(0);
		displayRef.current = 0;
		targetRef.current = 0;
		if (animRef.current !== null) {
			cancelAnimationFrame(animRef.current);
			animRef.current = null;
		}
		if (cleanupRef.current) {
			cleanupRef.current();
			cleanupRef.current = null;
		}
		if (fileInputRef.current) fileInputRef.current.value = '';
	}, []);

	return {
		phase,
		progress,
		error,
		displayProgress,
		fileInputRef,
		handleUpload,
		reset,
	};
}

// --- Tab info block (description + how-to-get-data steps) ---

function TabInfo({
	description,
	steps,
}: {
	description: string;
	steps: string[];
}) {
	const t = useTranslations();
	return (
		<div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
			<p className="m-0 mb-3 text-sm text-[#323130]">{description}</p>
			<p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#605E5C]">
				{t('addCustomer.steps.howToAccess')}
			</p>
			<ol className="m-0 list-decimal pl-5 text-sm text-[#605E5C]">
				{steps.map((step, idx) => (
					<li key={idx} className="py-0.5">
						{step}
					</li>
				))}
			</ol>
		</div>
	);
}

// --- ASPX enrichment upload hook ---

function useEnrichmentUpload(isDemo: boolean) {
	const uploadFn = isDemo
		? uploadDemoResellerEnrichmentFile
		: uploadResellerEnrichmentFile;
	const streamFn = isDemo
		? createDemoResellerEnrichmentProgressStream
		: createResellerEnrichmentProgressStream;
	const [phase, setPhase] = useState<
		'idle' | 'uploading' | 'processing' | 'complete' | 'failed'
	>('idle');
	const [progress, setProgress] =
		useState<ResellerSubscriptionEnrichmentProgress | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [displayProgress, setDisplayProgress] = useState(0);
	const displayRef = useRef(0);
	const targetRef = useRef(0);
	const animRef = useRef<number | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const cleanupRef = useRef<(() => void) | null>(null);

	const startAnimation = useCallback(() => {
		if (animRef.current !== null) cancelAnimationFrame(animRef.current);

		const tick = () => {
			const current = displayRef.current;
			const target = targetRef.current;
			const diff = target - current;

			if (Math.abs(diff) < 0.001) {
				displayRef.current = target;
				setDisplayProgress(target);
				if (target < 1) {
					animRef.current = requestAnimationFrame(tick);
				}
				return;
			}

			const step = diff * 0.08;
			const next = current + Math.max(Math.min(step, 0.02), -0.02);
			const clamped = Math.max(0, Math.min(1, next));
			displayRef.current = clamped;
			setDisplayProgress(clamped);
			animRef.current = requestAnimationFrame(tick);
		};

		animRef.current = requestAnimationFrame(tick);
	}, []);

	useEffect(() => {
		if (phase === 'uploading') {
			targetRef.current = 0.05;
			startAnimation();
		} else if (phase === 'processing' && progress) {
			const realPct =
				progress.total > 0 ? progress.processed / progress.total : 0;
			targetRef.current = 0.05 + realPct * 0.9;
			startAnimation();
		} else if (phase === 'complete') {
			targetRef.current = 1;
			startAnimation();
		}
	}, [phase, progress, startAnimation]);

	const handleUpload = useCallback(
		async (
			event: React.ChangeEvent<HTMLInputElement>,
			needsRefreshRef: React.MutableRefObject<boolean>,
		) => {
			const file = event.target.files?.[0];
			if (!file) return;

			setError(null);
			setDisplayProgress(0);
			displayRef.current = 0;
			targetRef.current = 0;
			setPhase('uploading');

			try {
				const { jobId } = await uploadFn(file);
				setPhase('processing');
				needsRefreshRef.current = true;

				const cleanup = streamFn(
					jobId,
					(data) => {
						setProgress(data);
						if (data.status === 'completed') {
							setPhase('complete');
						} else if (data.status === 'failed') {
							setPhase('failed');
							setError(data.errorMessage ?? 'Processing failed');
						}
					},
					(msg) => {
						setError(msg);
						setPhase('failed');
					},
					() => {},
				);
				cleanupRef.current = cleanup;
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Upload failed');
				setPhase('failed');
			}
		},
		[uploadFn, streamFn],
	);

	const reset = useCallback(() => {
		setPhase('idle');
		setProgress(null);
		setError(null);
		setDisplayProgress(0);
		displayRef.current = 0;
		targetRef.current = 0;
		if (animRef.current !== null) {
			cancelAnimationFrame(animRef.current);
			animRef.current = null;
		}
		if (cleanupRef.current) {
			cleanupRef.current();
			cleanupRef.current = null;
		}
		if (fileInputRef.current) fileInputRef.current.value = '';
	}, []);

	useEffect(() => {
		return () => {
			if (cleanupRef.current) cleanupRef.current();
			if (animRef.current !== null) cancelAnimationFrame(animRef.current);
		};
	}, []);

	return {
		phase,
		progress,
		error,
		displayProgress,
		fileInputRef,
		handleUpload,
		reset,
	};
}

// --- Main Component ---

export function AddResellerDialog({
	open,
	onOpenChange,
	forceOpen = false,
	onAdd,
	onRefresh,
	isDemo = false,
}: AddResellerDialogProps) {
	const t = useTranslations();
	const [view, setView] = useState<DialogView>('microsoft-upload');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const needsRefreshRef = useRef(false);

	// Independent upload state per tab
	const csvUpload = useServerUpload(isDemo);
	const microsoftUpload = useServerUpload(isDemo);
	const partnerUpload = useServerUpload(isDemo);
	const enrichmentUpload = useEnrichmentUpload(isDemo);

	const isUploading =
		csvUpload.phase === 'uploading' ||
		csvUpload.phase === 'processing' ||
		microsoftUpload.phase === 'uploading' ||
		microsoftUpload.phase === 'processing' ||
		partnerUpload.phase === 'uploading' ||
		partnerUpload.phase === 'processing' ||
		enrichmentUpload.phase === 'uploading' ||
		enrichmentUpload.phase === 'processing';

	const resetState = useCallback(() => {
		setView('microsoft-upload');
		setError(null);
		setSuccessMessage(null);
		csvUpload.reset();
		microsoftUpload.reset();
		partnerUpload.reset();
		enrichmentUpload.reset();
	}, [csvUpload, microsoftUpload, partnerUpload, enrichmentUpload]);

	const handleClose = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) {
				const shouldRefresh = needsRefreshRef.current;
				resetState();
				needsRefreshRef.current = false;
				onOpenChange(false);
				if (shouldRefresh) {
					onRefresh?.();
				}
				return;
			}
			onOpenChange(nextOpen);
		},
		[onOpenChange, onRefresh, resetState],
	);

	const hasRejections = (u: ReturnType<typeof useServerUpload>) =>
		u.phase === 'complete' && (u.progress?.rejected ?? 0) > 0;

	// Auto-close modal when an upload completes cleanly (no rejected rows).
	// If there are rejections, leave the dialog open so the user can read them.
	useEffect(() => {
		const completedClean =
			(csvUpload.phase === 'complete' && !hasRejections(csvUpload)) ||
			(microsoftUpload.phase === 'complete' && !hasRejections(microsoftUpload)) ||
			(partnerUpload.phase === 'complete' && !hasRejections(partnerUpload)) ||
			enrichmentUpload.phase === 'complete';
		if (completedClean) {
			const timer = setTimeout(() => handleClose(false), 1200);
			return () => clearTimeout(timer);
		}
	}, [
		csvUpload.phase,
		csvUpload.progress,
		microsoftUpload.phase,
		microsoftUpload.progress,
		partnerUpload.phase,
		partnerUpload.progress,
		enrichmentUpload.phase,
		handleClose,
	]);

	const showSuccessAndClose = useCallback(
		(msg: string) => {
			setSuccessMessage(msg);
			setTimeout(() => handleClose(false), 1500);
		},
		[handleClose],
	);

	// --- Form handler ---
	const handleSingleSubmit = async (formData: ResellerCustomerFormData) => {
		setSubmitting(true);
		setError(null);
		try {
			await onAdd({
				customerName: formData.customerName,
				customerTpid: formData.customerTpid || undefined,
				countryName: formData.countryName,
				renewalDate: formData.renewalDate || undefined,
				subscriptionName: formData.subscriptionName || undefined,
				licenseCount: formData.licenseCount || undefined,
			});
			needsRefreshRef.current = true;
			showSuccessAndClose('Customer added successfully!');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add customer');
		} finally {
			setSubmitting(false);
		}
	};

	// --- Server upload view (shared by all upload tabs) ---
	const renderServerUploadView = (
		upload: ReturnType<typeof useServerUpload>,
	) => {
		const isActive =
			upload.phase === 'uploading' || upload.phase === 'processing';
		const isComplete = upload.phase === 'complete';
		const isFailed = upload.phase === 'failed';

		const progressLabel =
			upload.phase === 'uploading'
				? 'Uploading file...'
				: upload.progress?.status === 'pending'
					? "We're processing your file in the background. You can close this dialog — we'll email you when it's done."
					: upload.progress && upload.progress.total > 0
						? `Processing ${upload.progress.total.toLocaleString()} rows`
						: 'Processing...';

		return (
			<div>
				<input
					ref={upload.fileInputRef}
					type="file"
					accept=".csv,.xlsx,.xls"
					className="hidden"
					onChange={(e) => upload.handleUpload(e, needsRefreshRef)}
				/>

				{upload.phase === 'idle' && (
					<div
						className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors"
						style={{
							borderColor: 'var(--colorNeutralStroke1, #d1d1d1)',
						}}
						onMouseEnter={(e) => {
							const ramp = getThemeConfig().brandRamp;
							e.currentTarget.style.borderColor = ramp[110];
							e.currentTarget.style.backgroundColor = ramp[160];
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.borderColor =
								'var(--colorNeutralStroke1, #d1d1d1)';
							e.currentTarget.style.backgroundColor = 'transparent';
						}}
						onClick={() => upload.fileInputRef.current?.click()}
					>
						<ArrowUploadRegular
							className="text-[28px]"
							style={{ color: getThemeConfig().brandRamp[80] }}
						/>
						<span className="text-sm font-medium text-gray-700">
							{t('fileUpload.dragDrop')}
						</span>
						<span className="text-xs text-gray-500">
							{t('fileUpload.supportedFormats')}
						</span>
					</div>
				)}

				{isActive && (
					<ProgressBarSmooth
						progress={upload.displayProgress}
						label={progressLabel}
					/>
				)}

				{isComplete && (
					<div className="py-4">
						<ProgressBarSmooth progress={1} label={t('addCustomer.processingComplete')} />
						{(upload.progress?.rejected ?? 0) > 0 && (
							<div className="mt-4">
								<MessageBar intent="error" className="rounded-sm! py-2">
									<MessageBarBody>
										<div className="font-semibold ">
											{upload.progress?.rejected.toLocaleString()} of{' '}
											{(upload.progress?.total ?? 0).toLocaleString()} rows
											were rejected
											{(upload.progress?.accepted ?? 0) > 0
												? ` (${upload.progress?.accepted.toLocaleString()} accepted)`
												: ''}
											.
										</div>
										{upload.progress?.rejections &&
										upload.progress.rejections.length > 0 ? (
											<ul className="mt-2 list-disc pl-5 text-sm">
												{upload.progress.rejections.map((r) => (
													<li key={r.reason}>
														<span className="font-medium">
															{r.count.toLocaleString()}
														</span>{' '}
														&times; {r.reason}
													</li>
												))}
											</ul>
										) : (
											<div className="mt-1 text-sm">
												No row-level reason was reported by the platform.
											</div>
										)}
									</MessageBarBody>
								</MessageBar>
								<div className="mt-3 flex justify-end gap-2">
									<Button
										appearance="outline"
										icon={<ArrowUploadRegular />}
										onClick={upload.reset}
									>
										{t('addCustomer.uploadAnotherFile')}
									</Button>
									<Button
										appearance="primary"
										onClick={() => handleClose(false)}
									>
										{t('common.close')}
									</Button>
								</div>
							</div>
						)}
					</div>
				)}

				{isFailed && (
					<div className="py-4">
						<MessageBar intent="error" className="mb-4! rounded-lg!">
							<MessageBarBody>
								{upload.error || 'Processing failed. Please try again.'}
							</MessageBarBody>
						</MessageBar>
						<div className="flex justify-end">
							<Button
								appearance="outline"
								icon={<ArrowUploadRegular />}
								onClick={upload.reset}
							>
								{t('addCustomer.tryAgain')}
							</Button>
						</div>
					</div>
				)}
			</div>
		);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(_, data) => {
				if ((forceOpen || isUploading) && !data.open) return;
				handleClose(data.open);
			}}
		>
			<DialogSurface style={{ width: 720, maxWidth: '90vw', padding: 0, borderRadius: 12 }}>
				<DialogBody style={{ gap: 0, padding: 0 }}>
					<DialogTitle
						style={{ padding: '24px 32px 0 32px' }}
						action={
							!forceOpen && !isUploading ? (
								<Button
									appearance="subtle"
									icon={<Dismiss20Regular />}
									onClick={() => handleClose(false)}
									aria-label="Close dialog"
									style={{ marginTop: 16, marginRight: 16 }}
								/>
							) : undefined
						}
					>
						<span className="font-ds-display text-lg font-semibold">
							{t('addCustomer.addCustomers')}
						</span>
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

						<div className="mb-8 border-b border-gray-100">
							<TabList
								style={{ marginLeft: '-12px' }}
								selectedValue={view}
								onTabSelect={(_, data) => {
									if (!isUploading) setView(data.value as DialogView);
								}}
							>
								<Tab value="microsoft-upload">{t('addCustomer.tabs.cloudAscent')}</Tab>
								<Tab value="partner-upload">{t('addCustomer.tabs.partnerCenterRenewals')}</Tab>
								<Tab value="aspx-enrichment">{t('addCustomer.tabs.aspx')}</Tab>
							</TabList>
						</div>

						{view === 'form' && (
							<ResellerCustomerForm
								submitLabel={submitting ? t('addCustomer.adding') : t('common.addCustomer')}
								onSubmit={handleSingleSubmit}
								loading={submitting}
							/>
						)}

						{view === 'csv-upload' && (
							<div>
								{csvUpload.phase === 'idle' && (
									<>
										<p className="mb-3 text-sm text-[#605E5C]">
											{t('addCustomer.uploadCsvHint')}
										</p>
										<div className="mb-4 overflow-hidden rounded-lg border border-gray-200">
											<table className="w-full text-xs">
												<thead>
													<tr className="border-b border-gray-200 bg-gray-50">
														<th className="px-3 py-2 text-left font-semibold text-gray-600">
															Column
														</th>
														<th className="px-3 py-2 text-left font-semibold text-gray-600">
															Type
														</th>
														<th className="px-3 py-2 text-left font-semibold text-gray-600">
															Details
														</th>
													</tr>
												</thead>
												<tbody className="text-gray-700">
													<tr className="border-b border-gray-100">
														<td className="px-3 py-1.5 font-medium">
															Customer Name
														</td>
														<td className="px-3 py-1.5 text-gray-500">Text</td>
														<td className="px-3 py-1.5 text-gray-500">
															Required · Must not be empty
														</td>
													</tr>
													<tr className="border-b border-gray-100">
														<td className="px-3 py-1.5 font-medium">
															Country Name
														</td>
														<td className="px-3 py-1.5 text-gray-500">Text</td>
														<td className="px-3 py-1.5 text-gray-500">
															Required
														</td>
													</tr>
													<tr className="border-b border-gray-100">
														<td className="px-3 py-1.5 font-medium">
															Customer TPID
														</td>
														<td className="px-3 py-1.5 text-gray-500">Text</td>
														<td className="px-3 py-1.5 text-gray-500">
															Optional
														</td>
													</tr>
													<tr className="border-b border-gray-100">
														<td className="px-3 py-1.5 font-medium">
															Microsoft 365 Subscription
														</td>
														<td className="px-3 py-1.5 text-gray-500">Text</td>
														<td className="px-3 py-1.5 text-gray-500">
															Optional · e.g. Business Basic, Business Standard,
															Business Premium
														</td>
													</tr>
													<tr className="border-b border-gray-100">
														<td className="px-3 py-1.5 font-medium">
															License Count
														</td>
														<td className="px-3 py-1.5 text-gray-500">
															Number
														</td>
														<td className="px-3 py-1.5 text-gray-500">
															Optional
														</td>
													</tr>
													<tr>
														<td className="px-3 py-1.5 font-medium">
															Renewal Month
														</td>
														<td className="px-3 py-1.5 text-gray-500">Text</td>
														<td className="px-3 py-1.5 text-gray-500">
															Optional · e.g. January, February
														</td>
													</tr>
												</tbody>
											</table>
										</div>
										<div className="mb-4 flex justify-end">
											<Button
												appearance="outline"
												icon={<ArrowDownloadRegular />}
												size="medium"
												onClick={() => {
													const csv =
														'Customer Name,Country Name,Customer TPID,Microsoft 365 Subscription,License Count,Renewal Month\nAcme Corp,United States,,Business Standard,50,September\n';
													const blob = new Blob([csv], { type: 'text/csv' });
													const url = URL.createObjectURL(blob);
													const a = document.createElement('a');
													a.href = url;
													a.download = 'customer-upload-template.csv';
													a.click();
													URL.revokeObjectURL(url);
												}}
											>
												Download Template
											</Button>
										</div>
									</>
								)}
								{renderServerUploadView(csvUpload)}
							</div>
						)}

						{view === 'microsoft-upload' && (
							<div>
								{microsoftUpload.phase === 'idle' && (
									<TabInfo
										description={t('addCustomer.tabDescriptions.cloudAscent')}
										steps={[
											t('addCustomer.steps.signInPartnerCenter'),
											t('addCustomer.steps.selectDownloadsHub'),
											t('addCustomer.steps.downloadAiBusinessSolutions'),
										]}
									/>
								)}
								{renderServerUploadView(microsoftUpload)}
							</div>
						)}

						{view === 'partner-upload' && (
							<div>
								{partnerUpload.phase === 'idle' && (
									<TabInfo
										description={t('addCustomer.tabDescriptions.partnerCenter')}
										steps={[
											t('addCustomer.steps.signInPartnerCenter'),
											t('addCustomer.steps.selectDownloadsHub'),
											t('addCustomer.steps.downloadUpcomingRenewals'),
										]}
									/>
								)}
								{renderServerUploadView(partnerUpload)}
							</div>
						)}

						{view === 'aspx-enrichment' && (
							<div>
								<input
									ref={enrichmentUpload.fileInputRef}
									type="file"
									accept=".csv,.xlsx,.xls"
									className="hidden"
									onChange={(e) =>
										enrichmentUpload.handleUpload(e, needsRefreshRef)
									}
								/>

								{enrichmentUpload.phase === 'idle' && (
									<TabInfo
										description={t('addCustomer.tabDescriptions.aspx')}
										steps={[
											t('addCustomer.steps.signInPartnerCenter'),
											t('addCustomer.steps.selectGrowthOpportunities'),
											t('addCustomer.steps.downloadReport'),
										]}
									/>
								)}

								{enrichmentUpload.phase === 'idle' && (
									<div
										className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors"
										style={{
											borderColor: 'var(--colorNeutralStroke1, #d1d1d1)',
										}}
										onMouseEnter={(e) => {
											const ramp = getThemeConfig().brandRamp;
											e.currentTarget.style.borderColor = ramp[110];
											e.currentTarget.style.backgroundColor = ramp[160];
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.borderColor =
												'var(--colorNeutralStroke1, #d1d1d1)';
											e.currentTarget.style.backgroundColor = 'transparent';
										}}
										onClick={() =>
											enrichmentUpload.fileInputRef.current?.click()
										}
									>
										<ArrowUploadRegular
											className="text-[28px]"
											style={{ color: getThemeConfig().brandRamp[80] }}
										/>
										<span className="text-sm font-medium text-gray-700">
											{t('fileUpload.dragDrop')}
										</span>
										<span className="text-xs text-gray-500">
											{t('fileUpload.supportedFormats')}
										</span>
									</div>
								)}

								{(enrichmentUpload.phase === 'uploading' ||
									enrichmentUpload.phase === 'processing') && (
									<ProgressBarSmooth
										progress={enrichmentUpload.displayProgress}
										label={
											enrichmentUpload.phase === 'uploading'
												? 'Uploading file...'
												: enrichmentUpload.progress &&
														enrichmentUpload.progress.total > 0
													? `Processing ${enrichmentUpload.progress.processed.toLocaleString()} of ${enrichmentUpload.progress.total.toLocaleString()} rows`
													: 'Processing...'
										}
									/>
								)}

								{enrichmentUpload.phase === 'complete' &&
									enrichmentUpload.progress && (
										<>
											<ProgressBarSmooth
												progress={1}
												label="Enrichment complete"
											/>
											<div className="mt-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
												<CheckmarkRegular className="text-green-600" />
												<p className="m-0 text-sm font-medium text-green-800">
													Matched{' '}
													{enrichmentUpload.progress.matched.toLocaleString()} of{' '}
													{enrichmentUpload.progress.total.toLocaleString()}{' '}
													sheet rows ·{' '}
													{enrichmentUpload.progress.updated.toLocaleString()}{' '}
													subscription
													{enrichmentUpload.progress.updated === 1 ? '' : 's'}{' '}
													updated ·{' '}
													{enrichmentUpload.progress.unmatched.toLocaleString()}{' '}
													unmatched
												</p>
											</div>
										</>
									)}

								{enrichmentUpload.phase === 'failed' && (
									<div className="py-4">
										<MessageBar intent="error" className="mb-4! rounded-lg!">
											<MessageBarBody>
												{enrichmentUpload.error ??
													'Enrichment failed. Please check the file and try again.'}
											</MessageBarBody>
										</MessageBar>
										<div className="flex justify-end">
											<Button
												appearance="outline"
												icon={<ArrowUploadRegular />}
												onClick={enrichmentUpload.reset}
											>
												{t('addCustomer.tryAgain')}
											</Button>
										</div>
									</div>
								)}
							</div>
						)}
					</DialogContent>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
}
