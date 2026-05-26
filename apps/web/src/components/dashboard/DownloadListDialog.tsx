'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
	Button,
	Dialog,
	DialogActions,
	DialogBody,
	DialogContent,
	DialogSurface,
	DialogTitle,
	MessageBar,
	MessageBarBody,
	Spinner,
	ProgressBar,
	Tooltip,
} from '@fluentui/react-components';
import {
	CheckmarkSquareFilled,
	Dismiss20Regular,
	DismissCircleFilled,
	DismissRegular,
	Square12Regular,
	CheckmarkCircleFilled,
} from '@fluentui/react-icons';
import { toSeatRange } from '@repo/shared';
import type {
	DashboardSortDirection,
	DashboardSummary,
	DashboardViewMode,
	FilterState,
} from '@repo/types';
import { ENDING_SKUS } from '@/lib/upgrade-matrix';
import {
	createOpportunityListEmailLinkPublic,
	createOpportunityListEmailLinkWithPdf,
} from '@/lib/opportunity-list-email-link';
import {
	createAsyncPdfListLink,
	getPdfJobStatus,
	cancelPdfJob,
	createDemoPdfListLink,
	type CreatePdfListLinkRequest,
	type PdfJobStatus,
} from '@/lib/pdf-download-link';
import {
	captureActivationMilestoneOnce,
	captureDownloadIntentClicked,
} from '@/lib/posthog-product-events';
import { POSTHOG_ACTIVATION_MILESTONES } from '@repo/types';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import type { PdfDownloadJob } from '@/components/dashboard/PdfDownloadTracker';
import { useCurrency } from '@/lib/currency-context';

const PROGRESS_ANIMATION_DURATION_MS = 900;

interface DownloadListDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	summary: DashboardSummary;
	customerCount: number;
	resellerCount: number;
	viewMode: DashboardViewMode;
	filters: FilterState;
	searchTerm: string;
	sortBy: string;
	sortDir: DashboardSortDirection;
	totalRows: number;
	onAddDownloadJob: (job: PdfDownloadJob) => void;
	activeTrackerJobs: PdfDownloadJob[];
	onRemoveTrackerJob: (jobId: string) => void;
	usePublicApi?: boolean;
}

function SkuOptionCard({
	name,
	selected,
	onToggle,
}: {
	id: string;
	name: string;
	selected: boolean;
	onToggle: () => void;
}) {
	return (
		<div
			role="checkbox"
			aria-checked={selected}
			tabIndex={0}
			onClick={onToggle}
			onKeyDown={(e) => {
				if (e.key === ' ' || e.key === 'Enter') {
					e.preventDefault();
					onToggle();
				}
			}}
			className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-all duration-200 ${
				selected
					? 'border-(--ds-color-violet-500) bg-white shadow-sm'
					: 'border-neutral-200 bg-neutral-50 hover:border-neutral-300'
			}`}
		>
			{selected ? (
				<CheckmarkSquareFilled
					primaryFill="var(--ds-color-violet-500)"
					className="size-5 shrink-0"
				/>
			) : (
				<Square12Regular
					primaryFill="currentColor"
					className="size-5 shrink-0 text-gray-300"
				/>
			)}
			<span className="text-sm font-medium text-gray-800">{name}</span>
		</div>
	);
}

export function DownloadListDialog({
	open,
	onOpenChange,
	summary,
	customerCount,
	resellerCount,
	viewMode,
	filters,
	searchTerm,
	sortBy,
	sortDir,
	totalRows,
	onAddDownloadJob,
	activeTrackerJobs,
	onRemoveTrackerJob,
	usePublicApi = false,
}: DownloadListDialogProps) {
	const t = useTranslations();
	const { currency } = useCurrency();
	const [selectedSkus, setSelectedSkus] = useState<Set<string>>(
		() => new Set(),
	);
	const [emailLoading, setEmailLoading] = useState(false);
	const [downloadListError, setDownloadListError] = useState<string | null>(
		null,
	);
	const [isCancelling, setIsCancelling] = useState(false);

	// Inline progress state (in modal)
	const [activeJob, setActiveJob] = useState<{
		jobId: string;
		pdfUrl: string;
		estimatedRows: number;
	} | null>(null);
	const [jobStatus, setJobStatus] = useState<PdfJobStatus | null>(null);
	const [displayProgress, setDisplayProgress] = useState(0);
	const displayProgressRef = useRef(0);
	const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const progressAnimationRef = useRef<number | null>(null);
	const isClosingRef = useRef(false);
	const totalSeatsRange = toSeatRange(summary.totalSeats);

	// Separate effect to handle modal open/close transitions
	useEffect(() => {
		if (open) {
			setDownloadListError(null);
			isClosingRef.current = false;
		}
	}, [open]);

	const clearPolling = useCallback(() => {
		if (pollIntervalRef.current) {
			clearInterval(pollIntervalRef.current);
			pollIntervalRef.current = null;
		}
	}, []);

	const clearProgressAnimation = useCallback(() => {
		if (progressAnimationRef.current !== null) {
			cancelAnimationFrame(progressAnimationRef.current);
			progressAnimationRef.current = null;
		}
	}, []);

	useEffect(() => {
		displayProgressRef.current = displayProgress;
	}, [displayProgress]);

	useEffect(() => () => clearPolling(), [clearPolling]);
	useEffect(() => () => clearProgressAnimation(), [clearProgressAnimation]);

	// Handle restoring job from tracker when modal opens
	useEffect(() => {
		if (open && !activeJob && activeTrackerJobs.length > 0) {
			const trackerJob = activeTrackerJobs[0]; // Only 1 job at a time
			// Restore job from tracker to modal
			setActiveJob({
				jobId: trackerJob.jobId,
				pdfUrl: trackerJob.pdfUrl,
				estimatedRows: trackerJob.estimatedRows,
			});
			// If email was already triggered by the tracker, mark it so modal doesn't re-trigger
			if (trackerJob.emailRequestData) {
				hasTriggeredEmailRef.current = true;
			}
			// Remove from tracker immediately (it's now in modal)
			onRemoveTrackerJob(trackerJob.jobId);
		}
	}, [open, activeJob, activeTrackerJobs, onRemoveTrackerJob]);

	// Handle moving job to tracker when modal closes (only for in-progress jobs)
	useEffect(() => {
		if (!open && activeJob && jobStatus && !isClosingRef.current) {
			isClosingRef.current = true;

			// Only move to tracker if still in progress (not completed/failed) and has a real jobId
			if (
				activeJob.jobId &&
				jobStatus.status !== 'completed' &&
				jobStatus.status !== 'failed'
			) {
				onAddDownloadJob({
					jobId: activeJob.jobId,
					pdfUrl: activeJob.pdfUrl,
					totalChunks: jobStatus.totalChunks ?? 1,
					estimatedRows: activeJob.estimatedRows,
					title:
						viewMode === 'reseller' ? 'Reseller List PDF' : 'Customer List PDF',
					emailRequestData: usePublicApi
						? undefined
						: {
								viewMode,
								resellerCount,
								customerCount,
								totalRenewals: summary.totalRenewals,
								totalSeatsRange,
								selectedSkuIds: [...selectedSkus],
								currency,
							},
				});
			}

			// Only clear state if email is done or not applicable (non-completed jobs, public API)
			if (
				jobStatus.status !== 'completed' ||
				usePublicApi ||
				emailCompleteRef.current
			) {
				setTimeout(() => {
					setActiveJob(null);
					setJobStatus(null);
					setDisplayProgress(0);
					displayProgressRef.current = 0;
					isClosingRef.current = false;
				}, 0);
			}
			// else: defer cleanup to email effect's .finally()

			// Clear polling when modal closes
			clearPolling();
			clearProgressAnimation();
		}
	}, [
		open,
		activeJob,
		jobStatus,
		onAddDownloadJob,
		viewMode,
		clearPolling,
		clearProgressAnimation,
		usePublicApi,
		resellerCount,
		customerCount,
		summary.totalRenewals,
		totalSeatsRange,
		selectedSkus,
	]);

	// Poll for job status when activeJob exists and modal is open
	useEffect(() => {
		if (!open || !activeJob || !activeJob.jobId) return;

		const poll = async () => {
			try {
				const status = await getPdfJobStatus(activeJob.jobId);
				setJobStatus(status);

				// Stop polling if completed or failed
				if (status.status === 'completed' || status.status === 'failed') {
					clearPolling();
				}
			} catch (err) {
				setDownloadListError(
					err instanceof Error ? err.message : 'Failed to check job status',
				);
				clearPolling();
			}
		};

		// Initial poll
		void poll();

		// Set up interval
		pollIntervalRef.current = setInterval(() => {
			void poll();
		}, 2000);

		return () => {
			clearPolling();
		};
	}, [open, activeJob, clearPolling]);

	useEffect(() => {
		if (!activeJob || !jobStatus) {
			clearProgressAnimation();
			setDisplayProgress(0);
			displayProgressRef.current = 0;
			return;
		}

		const targetProgress = Math.min(100, Math.max(0, jobStatus.progress));
		const currentProgress = displayProgressRef.current;
		const endProgress = Math.max(currentProgress, targetProgress);

		if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
			clearProgressAnimation();
			setDisplayProgress(endProgress);
			displayProgressRef.current = endProgress;
			return;
		}

		if (endProgress <= currentProgress) {
			return;
		}

		clearProgressAnimation();
		const start = performance.now();

		const animate = (timestamp: number) => {
			const elapsed = timestamp - start;
			const progressRatio = Math.min(
				1,
				elapsed / PROGRESS_ANIMATION_DURATION_MS,
			);
			const easedProgress = 1 - (1 - progressRatio) ** 3;
			const nextProgress =
				currentProgress + (endProgress - currentProgress) * easedProgress;

			setDisplayProgress(nextProgress);
			displayProgressRef.current = nextProgress;

			if (progressRatio < 1) {
				progressAnimationRef.current = requestAnimationFrame(animate);
			} else {
				progressAnimationRef.current = null;
				setDisplayProgress(endProgress);
				displayProgressRef.current = endProgress;
			}
		};

		progressAnimationRef.current = requestAnimationFrame(animate);
	}, [activeJob, jobStatus, clearProgressAnimation]);

	const toggleSku = useCallback((skuId: string) => {
		setSelectedSkus((prev) => {
			const next = new Set(prev);
			if (next.has(skuId)) {
				next.delete(skuId);
			} else {
				next.add(skuId);
			}
			return next;
		});
	}, []);

	const handleCancelJob = useCallback(async () => {
		if (!activeJob) return;

		setIsCancelling(true);
		try {
			if (activeJob.jobId) {
				await cancelPdfJob(activeJob.jobId);
			}
			// Clear state but keep modal open
			setActiveJob(null);
			setJobStatus(null);
			clearProgressAnimation();
			setDisplayProgress(0);
			displayProgressRef.current = 0;
			clearPolling();
			setIsCancelling(false);
		} catch (error) {
			setDownloadListError(
				error instanceof Error && error.message.trim().length > 0
					? error.message
					: 'Unable to cancel the PDF generation. Please try again.',
			);
			setIsCancelling(false);
		}
	}, [activeJob, clearPolling, clearProgressAnimation]);

	// Combined flow: generate PDF then generate email with PDF link
	const handleDownloadEmail = useCallback(async () => {
		if (selectedSkus.size === 0) return;

		captureDownloadIntentClicked({
			intentType: 'opportunity-email',
			assetType: 'email-link',
			viewMode,
			selectedSkuCount: selectedSkus.size,
			isDemo: usePublicApi,
			isPublic: usePublicApi,
		});
		captureActivationMilestoneOnce(
			POSTHOG_ACTIVATION_MILESTONES.requestedExport,
			{
				isDemo: usePublicApi,
			},
		);

		// Demo mode: single .docx with embedded PDF link
		if (usePublicApi) {
			setDownloadListError(null);
			setEmailLoading(true);

			try {
				// Step 1: Create a PDF download link (token-based URL)
				const pdfLink = await createDemoPdfListLink(
					viewMode as 'customer' | 'reseller',
					[...selectedSkus],
					{ ...filters, search: searchTerm },
					searchTerm,
				);

				// Step 2: Create email template with embedded PDF link
				const response = await createOpportunityListEmailLinkPublic({
					viewMode,
					resellerCount,
					customerCount,
					totalRenewals: summary.totalRenewals,
					totalSeatsRange,
					selectedSkuIds: [...selectedSkus],
					pdfDownloadUrl: pdfLink.url,
					currency,
				});

				// Step 3: Download the .docx (contains clickable PDF link)
				const link = document.createElement('a');
				link.href = response.url;
				link.download = '';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
			} catch (error) {
				setDownloadListError(
					error instanceof Error && error.message.trim().length > 0
						? error.message
						: 'Unable to generate the partner email. Please try again.',
				);
			} finally {
				setEmailLoading(false);
			}
			return;
		}

		// Authenticated mode: combined PDF + Email flow
		// Only allow 1 download at a time
		const isCurrentJobInProgress =
			activeJob &&
			jobStatus?.status !== 'completed' &&
			jobStatus?.status !== 'failed';
		if (isCurrentJobInProgress || activeTrackerJobs.length > 0) {
			setDownloadListError(
				'A download is already in progress. Please wait for it to complete.',
			);
			return;
		}

		// Clear completed/failed job before starting new one
		if (activeJob) {
			setActiveJob(null);
			setJobStatus(null);
		}
		clearProgressAnimation();
		setDisplayProgress(0);
		displayProgressRef.current = 0;

		setDownloadListError(null);

		// Show progress bar immediately with placeholder state
		setActiveJob({ jobId: '', pdfUrl: '', estimatedRows: totalRows });
		setJobStatus({
			id: '',
			status: 'queued',
			progress: 0,
			totalChunks: 1,
			completedChunks: 0,
			partSize: 25_000,
			totalParts: 1,
			completedParts: 0,
			totalRows,
			azureBlobUrl: null,
			parts: [],
			errorMessage: null,
			createdAt: new Date().toISOString(),
			startedAt: null,
			completedAt: null,
			expiresAt: null,
			passwordAvailable: false,
		});

		try {
			// Step 1: Start async PDF generation
			const pdfRequest: CreatePdfListLinkRequest = {
				viewMode,
				filters: {
					...filters,
					search: searchTerm.trim(),
				},
				sort: {
					sortBy,
					sortDir,
				},
				selectedSkuIds: [...selectedSkus],
				currency,
			};

			const pdfJob = await createAsyncPdfListLink(pdfRequest);

			// Update with real job data (triggers polling)
			setActiveJob({
				jobId: pdfJob.jobId,
				pdfUrl: pdfJob.url,
				estimatedRows: pdfJob.estimatedRows,
			});
			setJobStatus({
				id: pdfJob.jobId,
				status: 'queued',
				progress: 0,
				totalChunks: pdfJob.totalChunks,
				completedChunks: 0,
				partSize: 25_000,
				totalParts: pdfJob.totalParts,
				completedParts: 0,
				totalRows: pdfJob.estimatedRows,
				azureBlobUrl: null,
				parts: [],
				errorMessage: null,
				createdAt: new Date().toISOString(),
				startedAt: null,
				completedAt: null,
				expiresAt: null,
				passwordAvailable: false,
			});

			// Step 2: Poll for PDF completion (handled by the existing polling useEffect)
			// Step 3: When completed, the onPdfCompleted effect will handle the rest
		} catch (error) {
			setDownloadListError(
				error instanceof Error && error.message.trim().length > 0
					? error.message
					: 'Unable to generate the PDF. Please try again.',
			);
			setActiveJob(null);
			setJobStatus(null);
		}
	}, [
		filters,
		searchTerm,
		selectedSkus,
		sortBy,
		sortDir,
		viewMode,
		activeJob,
		jobStatus,
		activeTrackerJobs,
		clearProgressAnimation,
		usePublicApi,
		resellerCount,
		customerCount,
		summary.totalRenewals,
		totalSeatsRange,
	]);

	// When PDF completes, automatically generate email with PDF link
	const hasTriggeredEmailRef = useRef(false);
	const emailCompleteRef = useRef(false);
	useEffect(() => {
		if (
			!activeJob ||
			!jobStatus ||
			jobStatus.status !== 'completed' ||
			usePublicApi ||
			hasTriggeredEmailRef.current
		) {
			if (jobStatus?.status !== 'completed') {
				hasTriggeredEmailRef.current = false;
				emailCompleteRef.current = false;
			}
			return;
		}

		hasTriggeredEmailRef.current = true;

		const completedParts = (jobStatus.parts ?? [])
			.filter(
				(part) =>
					part.status === 'completed' &&
					typeof part.blobUrl === 'string' &&
					part.blobUrl.length > 0,
			)
			.sort((left, right) => left.partNumber - right.partNumber);

		// Determine PDF download URL: use first part URL or zip URL
		const pdfDownloadUrl =
			completedParts.length > 1
				? activeJob.pdfUrl
				: (completedParts[0]?.blobUrl ?? activeJob.pdfUrl);

		setEmailLoading(true);
		createOpportunityListEmailLinkWithPdf({
			viewMode,
			resellerCount,
			customerCount,
			totalRenewals: summary.totalRenewals,
			totalSeatsRange,
			selectedSkuIds: [...selectedSkus],
			pdfJobId: activeJob.jobId,
			pdfDownloadUrl,
			currency,
		})
			.then((response) => {
				const link = document.createElement('a');
				link.href = response.url;
				link.download = '';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
			})
			.catch((error) => {
				setDownloadListError(
					error instanceof Error && error.message.trim().length > 0
						? error.message
						: 'Unable to generate the partner email. Please try again.',
				);
			})
			.finally(() => {
				setEmailLoading(false);
				emailCompleteRef.current = true;
				// Clean up job state — whether modal is open or was closed during email flight
				setActiveJob(null);
				setJobStatus(null);
				setDisplayProgress(0);
				displayProgressRef.current = 0;
				isClosingRef.current = false;
			});
	}, [
		activeJob,
		jobStatus,
		selectedSkus,
		viewMode,
		resellerCount,
		customerCount,
		summary.totalRenewals,
		totalSeatsRange,
		usePublicApi,
		open,
	]);

	const isCompleted = jobStatus?.status === 'completed';
	const isFailed = jobStatus?.status === 'failed';
	const progressPercent = Math.round(
		Math.min(100, Math.max(0, displayProgress)),
	);

	// Prevent closing while PDF creation API call is in-flight (no jobId yet)
	const isAwaitingJobCreation = !!activeJob && !activeJob.jobId;

	return (
		<Dialog
			open={open}
			onOpenChange={(_e, data) => {
				if (!data.open && isAwaitingJobCreation) return;
				onOpenChange(data.open);
			}}
		>
			<DialogSurface className="max-w-[800px]!">
				<DialogBody>
					<DialogTitle
						action={
							<Button
								appearance="subtle"
								icon={<Dismiss20Regular />}
								onClick={() => {
									if (isAwaitingJobCreation) return;
									onOpenChange(false);
								}}
								aria-label={t('addCustomer.closeDialog')}
								disabled={isAwaitingJobCreation}
							/>
						}
					>
						{viewMode === 'reseller'
							? 'Downloading the reseller list'
							: 'Downloading the customer list'}
					</DialogTitle>
					<DialogContent className="">
						<div className="bg-(--ds-color-lilac-50) rounded-lg p-4 mb-8">
							<SummaryCards
								summary={summary}
								customerCount={customerCount}
								className="grid-cols-2! lg:grid-cols-2! py-0!"
							/>
						</div>

						<section className="mb-8">
							<h3 className="m-0 mb-3 text-base font-semibold text-gray-800">
								Select the proposal options you want to send
							</h3>
							<div className="grid grid-cols-2 gap-3">
								{ENDING_SKUS.map((sku) => (
									<SkuOptionCard
										key={sku.id}
										id={sku.id}
										name={sku.name}
										selected={selectedSkus.has(sku.id)}
										onToggle={() => toggleSku(sku.id)}
									/>
								))}
							</div>
						</section>
						{downloadListError ? (
							<MessageBar intent="error" className="mt-3">
								<MessageBarBody>{downloadListError}</MessageBarBody>
							</MessageBar>
						) : null}

						{/* Inline Progress Bar (when job is active) */}
						{activeJob && (
							<div className="my-6 p-2">
								<div className="mb-3 flex items-center justify-between">
									<div className="flex items-center gap-2">
										{isCompleted ? (
											<>
												<CheckmarkCircleFilled className="text-[18px] text-[#107C10]" />
												<span className="text-sm font-semibold text-[#323130]">
													{emailLoading
														? 'Generating email template...'
														: `Email template downloaded. PDF password for the ${viewMode === 'reseller' ? 'reseller' : 'customer'} list sent to your email.`}
												</span>
											</>
										) : isFailed ? (
											<>
												<DismissCircleFilled className="text-[18px] text-[#A80000]" />
												<span className="text-sm font-semibold text-[#A80000]">
													PDF generation failed
												</span>
											</>
										) : (
											<>
												<Spinner size="tiny" />
												<span className="text-sm font-medium text-[#323130]">
													Processing {activeJob.estimatedRows.toLocaleString()}{' '}
													rows
												</span>
											</>
										)}
									</div>
									<div className="flex items-center gap-3">
										{!isCompleted ? (
											<span className="text-[13px] font-semibold text-[#605E5C]">
												{progressPercent}%
											</span>
										) : null}
										{isCompleted ? null : isFailed ? (
											<Button
												appearance="subtle"
												icon={<DismissRegular />}
												onClick={() => {
													clearProgressAnimation();
													setDisplayProgress(0);
													displayProgressRef.current = 0;
													setActiveJob(null);
													setJobStatus(null);
												}}
												size="small"
												aria-label={t('dashboard.dismissFailedJob')}
											>
												Dismiss
											</Button>
										) : (
											<Tooltip
												appearance="inverted"
												content="Cancel Download"
												relationship="label"
											>
												<Button
													appearance="subtle"
													onClick={handleCancelJob}
													size="small"
													disabled={isCancelling}
													icon={
														isCancelling ? (
															<Spinner size="tiny" />
														) : (
															<DismissRegular className="size-4" />
														)
													}
												/>
											</Tooltip>
										)}
									</div>
								</div>
								{isFailed && jobStatus?.errorMessage ? (
									<MessageBar intent="error" className="mb-3">
										<MessageBarBody>{jobStatus.errorMessage}</MessageBarBody>
									</MessageBar>
								) : null}
								{isCompleted ? null : isFailed ? null : (
									<ProgressBar value={progressPercent / 100} />
								)}
							</div>
						)}
						<p className="mt-6 p-2 font-ds-text text-xs italic bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg">
							<span className="font-semibold">{t('dashboard.pleaseNote')} </span>
							The final list would be linked in the e-mail draft. That list
							would be password protected, and the password would be sent on
							your e-mail. Please send the password in the separate e-mail to
							your partner to ensure compliance.
						</p>
					</DialogContent>
					<DialogActions className="flex! gap-4! whitespace-nowrap! pt-4!">
						<Button
							size="medium"
							appearance="primary"
							icon={emailLoading ? <Spinner size="tiny" /> : undefined}
							disabled={
								selectedSkus.size === 0 ||
								emailLoading ||
								(activeJob &&
									jobStatus?.status !== 'completed' &&
									jobStatus?.status !== 'failed') ||
								totalRows === 0
							}
							onClick={handleDownloadEmail}
							className="px-3! py-2!"
						>
							{emailLoading
								? 'Generating...'
								: 'Download e-mail to send the list to partner'}
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
}
