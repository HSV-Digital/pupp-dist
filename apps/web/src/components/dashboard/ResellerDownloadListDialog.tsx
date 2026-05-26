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
	Dismiss20Regular,
	DismissCircleFilled,
	DismissRegular,
	CheckmarkCircleFilled,
	LinkRegular,
	CopyRegular,
} from '@fluentui/react-icons';
import type { PdfJobStatus } from '@/lib/pdf-download-link';
import type { PdfDownloadJob } from '@/components/dashboard/PdfDownloadTracker';
import type { ResellerCustomerSummary } from '@/lib/use-reseller-customers';
import {
	createResellerAsyncPdfListLink,
	getResellerPdfJobStatus,
	cancelResellerPdfJob,
	revealResellerPdfJobPassword,
	type ResellerPdfListRequest,
} from '@/lib/reseller-pdf-download-link';
import { formatCurrencyAbbreviated, formatNumber } from '@/lib/format-utils';
import { useCurrency } from '@/lib/currency-context';
import { getCurrencySymbol, getCurrencyLocale } from '@repo/shared';
import {
	CalendarLtr24Regular,
	DocumentBulletList24Regular,
	Money24Regular,
	People24Regular,
} from '@fluentui/react-icons';

const PROGRESS_ANIMATION_DURATION_MS = 900;

interface ResellerDownloadListDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	summary: ResellerCustomerSummary | null;
	totalRows: number;
	filters: Record<string, string[]>;
	sortBy: string;
	sortDir: 'ascending' | 'descending';
	onAddDownloadJob: (job: PdfDownloadJob) => void;
	activeTrackerJobs: PdfDownloadJob[];
	onRemoveTrackerJob: (jobId: string) => void;
}

export function ResellerDownloadListDialog({
	open,
	onOpenChange,
	summary,
	totalRows,
	filters,
	sortBy,
	sortDir,
	onAddDownloadJob,
	activeTrackerJobs,
	onRemoveTrackerJob,
}: ResellerDownloadListDialogProps) {
	const t = useTranslations('dashboard');
	const tRoot = useTranslations();
	const { currency } = useCurrency();
	const currencyOptions = {
		currency,
		currencySymbol: getCurrencySymbol(currency),
		locale: getCurrencyLocale(currency),
	};
	const [downloadListError, setDownloadListError] = useState<string | null>(
		null,
	);
	const [isInitiatingDownload, setIsInitiatingDownload] = useState(false);
	const [isCancelling, setIsCancelling] = useState(false);
	const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
	const [isRevealingPassword, setIsRevealingPassword] = useState(false);
	const [passwordHint, setPasswordHint] = useState<string | null>(null);
	const [passwordError, setPasswordError] = useState<string | null>(null);

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

	useEffect(() => {
		if (open) {
			setDownloadListError(null);
			setPasswordError(null);
			setPasswordHint(null);
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

	// Restore job from tracker when modal opens
	useEffect(() => {
		if (open && !activeJob && activeTrackerJobs.length > 0) {
			const trackerJob = activeTrackerJobs[0];
			setActiveJob({
				jobId: trackerJob.jobId,
				pdfUrl: trackerJob.pdfUrl,
				estimatedRows: trackerJob.estimatedRows,
			});
			onRemoveTrackerJob(trackerJob.jobId);
		}
	}, [open, activeJob, activeTrackerJobs, onRemoveTrackerJob]);

	// Move job to tracker when modal closes (only for in-progress jobs)
	useEffect(() => {
		if (!open && activeJob && jobStatus && !isClosingRef.current) {
			isClosingRef.current = true;

			if (jobStatus.status !== 'completed' && jobStatus.status !== 'failed') {
				onAddDownloadJob({
					jobId: activeJob.jobId,
					pdfUrl: activeJob.pdfUrl,
					totalChunks: jobStatus.totalChunks ?? 1,
					estimatedRows: activeJob.estimatedRows,
					title: 'Customer List PDF',
				});
			}

			setTimeout(() => {
				setActiveJob(null);
				setJobStatus(null);
				setRevealedPassword(null);
				setIsRevealingPassword(false);
				setPasswordHint(null);
				setPasswordError(null);
				setDisplayProgress(0);
				displayProgressRef.current = 0;
				isClosingRef.current = false;
			}, 0);

			clearPolling();
			clearProgressAnimation();
		}
	}, [
		open,
		activeJob,
		jobStatus,
		onAddDownloadJob,
		clearPolling,
		clearProgressAnimation,
	]);

	// Poll for job status
	useEffect(() => {
		if (!open || !activeJob) return;

		const poll = async () => {
			try {
				const status = await getResellerPdfJobStatus(activeJob.jobId);
				setJobStatus(status);
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

		void poll();
		pollIntervalRef.current = setInterval(() => void poll(), 2000);

		return () => clearPolling();
	}, [open, activeJob, clearPolling]);

	// Animate progress bar
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

		if (endProgress <= currentProgress) return;

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

	const handleDownloadList = useCallback(async () => {
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

		if (activeJob) {
			setActiveJob(null);
			setJobStatus(null);
		}
		setRevealedPassword(null);
		setPasswordHint(null);
		setPasswordError(null);
		clearProgressAnimation();
		setDisplayProgress(0);
		displayProgressRef.current = 0;
		setDownloadListError(null);
		setIsInitiatingDownload(true);

		try {
			const request: ResellerPdfListRequest = {
				filters,
				sort: {
					sortBy,
					sortDir,
				},
			};

			const job = await createResellerAsyncPdfListLink(request);

			setActiveJob({
				jobId: job.jobId,
				pdfUrl: job.url,
				estimatedRows: job.estimatedRows,
			});
			setJobStatus({
				id: job.jobId,
				status: 'queued',
				progress: 0,
				totalChunks: job.totalChunks,
				completedChunks: 0,
				partSize: 25_000,
				totalParts: job.totalParts,
				completedParts: 0,
				totalRows: job.estimatedRows,
				azureBlobUrl: null,
				parts: [],
				errorMessage: null,
				createdAt: new Date().toISOString(),
				startedAt: null,
				completedAt: null,
				expiresAt: null,
				passwordAvailable: false,
			});
		} catch (error) {
			setDownloadListError(
				error instanceof Error && error.message.trim().length > 0
					? error.message
					: 'Unable to generate the PDF. Please try again.',
			);
		} finally {
			setIsInitiatingDownload(false);
		}
	}, [
		filters,
		sortBy,
		sortDir,
		activeJob,
		jobStatus,
		activeTrackerJobs,
		clearProgressAnimation,
	]);

	const handleCancelJob = useCallback(async () => {
		if (!activeJob) return;

		setIsCancelling(true);
		try {
			await cancelResellerPdfJob(activeJob.jobId);
			setActiveJob(null);
			setJobStatus(null);
			setRevealedPassword(null);
			setPasswordHint(null);
			setPasswordError(null);
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

	const handleRevealPassword = useCallback(async () => {
		if (!activeJob || isRevealingPassword || revealedPassword) return;

		setPasswordError(null);
		setPasswordHint(null);
		setIsRevealingPassword(true);
		try {
			const response = await revealResellerPdfJobPassword(activeJob.jobId);
			setRevealedPassword(response.password);
		} catch (error) {
			setPasswordError(
				error instanceof Error && error.message.trim().length > 0
					? error.message
					: 'Unable to reveal the password. Please try again.',
			);
		} finally {
			setIsRevealingPassword(false);
		}
	}, [activeJob, isRevealingPassword, revealedPassword]);

	const handleCopyPassword = useCallback(async () => {
		if (!revealedPassword) return;

		setPasswordError(null);
		setPasswordHint(null);
		try {
			if (
				typeof navigator !== 'undefined' &&
				navigator.clipboard &&
				typeof navigator.clipboard.writeText === 'function'
			) {
				await navigator.clipboard.writeText(revealedPassword);
			} else {
				throw new Error(tRoot('common.clipboardUnavailable'));
			}
			setPasswordHint('Password copied');
		} catch {
			setPasswordError('Unable to copy password. Please copy it manually.');
		}
	}, [revealedPassword]);

	const isCompleted = jobStatus?.status === 'completed';
	const isFailed = jobStatus?.status === 'failed';
	const isPasswordUnavailableAfterReveal =
		isCompleted &&
		!revealedPassword &&
		!jobStatus?.passwordAvailable &&
		!isFailed;
	const canRevealPassword =
		isCompleted && !!jobStatus?.passwordAvailable && !revealedPassword;
	const completedParts = (jobStatus?.parts ?? [])
		.filter(
			(part) =>
				part.status === 'completed' &&
				typeof part.blobUrl === 'string' &&
				part.blobUrl.length > 0,
		)
		.sort((left, right) => left.partNumber - right.partNumber);
	const shouldUseZipDownload = completedParts.length > 1;
	const pdfCount = shouldUseZipDownload
		? completedParts.length
		: Math.max(1, completedParts.length);
	const progressPercent = Math.round(
		Math.min(100, Math.max(0, displayProgress)),
	);
	const completedLinkButtonClass =
		'max-w-[240px] justify-center bg-neutral-100! px-3! py-1.5! hover:text-(--ds-color-violet-500)!';

	return (
		<Dialog open={open} onOpenChange={(_e, data) => onOpenChange(data.open)}>
			<DialogSurface className="max-w-[800px]!">
				<DialogBody>
					<DialogTitle
						action={
							<Button
								appearance="subtle"
								icon={<Dismiss20Regular />}
								onClick={() => onOpenChange(false)}
								aria-label="Close dialog"
							/>
						}
					>
						Downloading the customer list
					</DialogTitle>
					<DialogContent className="border-b border-neutral-200!">
						<div className="bg-(--ds-color-lilac-50) rounded-lg p-4 mb-8">
							<div className="grid grid-cols-2 gap-4">
								{[
									{
										label: t('totalCustomers'),
										icon: <CalendarLtr24Regular />,
										value: formatNumber(summary?.totalCustomers ?? 0),
									},
									{
										label: t('totalSubscriptions'),
										icon: <DocumentBulletList24Regular />,
										value: formatNumber(summary?.totalSubscriptions ?? 0),
									},
									{
										label: tRoot('table.totalSeats'),
										icon: <People24Regular />,
										value: formatNumber(summary?.totalSeats ?? 0),
									},
									{
										label: 'Total ARR',
										icon: <Money24Regular />,
										value: formatCurrencyAbbreviated(
											summary?.totalArr ?? 0,
											currencyOptions,
										),
									},
								].map((card) => (
									<div
										key={card.label}
										className="flex items-center gap-3 rounded-lg bg-white px-5 py-4"
									>
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-(--ds-color-violet-50) text-(--ds-color-violet-500)">
											{card.icon}
										</div>
										<div>
											<p className="m-0 font-ds-text text-[0.8125rem] leading-4.5 text-gray-500">
												{card.label}
											</p>
											<p className="mb-0 mt-0.5 font-ds-display text-lg font-mono font-semibold leading-7">
												{card.value}
											</p>
										</div>
									</div>
								))}
							</div>
						</div>

						{downloadListError ? (
							<MessageBar intent="error" className="mt-3">
								<MessageBarBody>{downloadListError}</MessageBarBody>
							</MessageBar>
						) : null}

						{/* Inline Progress Bar */}
						{activeJob && (
							<div className="my-6 p-2">
								<div className="mb-3 flex items-center justify-between">
									<div className="flex items-center gap-2">
										{isCompleted ? (
											<>
												<CheckmarkCircleFilled className="text-[18px] text-[#107C10]" />
												<span className="text-sm font-semibold text-[#323130]">
													PDF(s) ready for download
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
													setRevealedPassword(null);
													setPasswordHint(null);
													setPasswordError(null);
												}}
												size="small"
												aria-label="Dismiss failed job"
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
								{isCompleted ? (
									<>
										<div className="mb-4 flex items-center justify-between rounded-lg bg-amber-50 p-3">
											<div className="flex flex-col">
												<span className="text-sm font-medium text-amber-900">
													{pdfCount === 1
														? 'This PDF is password protected'
														: 'These PDFs are password protected'}
												</span>
												{isPasswordUnavailableAfterReveal ? (
													<div className="mt-2 text-xs text-red-600">
														Password already revealed and no longer available.
													</div>
												) : null}
												{!revealedPassword &&
												!isPasswordUnavailableAfterReveal ? (
													<span className="mt-1 block text-xs text-neutral-600">
														Save this password now. It will not be available
														afterwards.
													</span>
												) : null}
											</div>
											<div className="flex flex-col items-end">
												{revealedPassword ? (
													<span className="mt-2 flex items-stretch">
														<code className="flex items-center font-mono rounded-l-lg bg-white px-3 py-1.5 text-sm font-semibold text-neutral-600 border border-r-0 border-neutral-300">
															{revealedPassword}
														</code>
														<Tooltip
															appearance="inverted"
															content="Copy password"
															relationship="label"
														>
															<Button
																size="small"
																appearance="secondary"
																icon={<CopyRegular className="size-4" />}
																onClick={handleCopyPassword}
																className="rounded-l-none! min-w-0! px-4!"
															/>
														</Tooltip>
													</span>
												) : null}
												{canRevealPassword && (
													<Button
														size="medium"
														appearance="secondary"
														onClick={handleRevealPassword}
														disabled={isRevealingPassword}
														style={{
															backgroundColor: '#000',
															color: '#fff',
															borderColor: '#000',
														}}
													>
														{isRevealingPassword
															? 'Revealing...'
															: 'Reveal password'}
													</Button>
												)}
												{passwordHint ? (
													<div className="mt-2 text-xs font-mono font-semibold text-emerald-600">
														{passwordHint}
													</div>
												) : null}
												{passwordError ? (
													<div className="mt-2 text-xs text-[#a4262c]">
														{passwordError}
													</div>
												) : null}
											</div>
										</div>
										<div className="flex max-w-full flex-wrap gap-3">
											{shouldUseZipDownload && activeJob?.pdfUrl ? (
												<Button
													as="a"
													href={activeJob.pdfUrl}
													target="_blank"
													rel="noopener noreferrer"
													icon={<LinkRegular className="size-4" />}
													iconPosition="before"
													appearance="outline"
													className={completedLinkButtonClass}
												>
													<span className="inline-block max-w-[180px] truncate align-bottom">
														Download all PDFs (.zip)
													</span>
												</Button>
											) : null}
											{shouldUseZipDownload
												? null
												: completedParts.map((part) => (
														<Button
															key={`${part.partNumber}-${part.fileName}`}
															as="a"
															href={part.blobUrl ?? ''}
															target="_blank"
															rel="noopener noreferrer"
															icon={<LinkRegular className="size-4" />}
															iconPosition="before"
															appearance="outline"
															className={completedLinkButtonClass}
															title={part.fileName}
														>
															<span className="inline-block max-w-[180px] truncate align-bottom">
																{part.fileName}
															</span>
														</Button>
													))}
											{!shouldUseZipDownload && completedParts.length === 0 ? (
												<span className="text-xs text-[#605E5C]">
													No downloadable PDF parts available.
												</span>
											) : null}
										</div>
									</>
								) : null}
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
					</DialogContent>
					<DialogActions className="flex! gap-4! whitespace-nowrap! pt-4!">
						<Button
							size="medium"
							appearance="primary"
							onClick={handleDownloadList}
							icon={
								isInitiatingDownload ? <Spinner size="tiny" /> : undefined
							}
							disabled={
								isInitiatingDownload ||
								(activeJob &&
									jobStatus?.status !== 'completed' &&
									jobStatus?.status !== 'failed') ||
								totalRows === 0
							}
							className="px-3! py-2!"
						>
							{isInitiatingDownload ? 'Generating...' : 'Download List'}
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
}
