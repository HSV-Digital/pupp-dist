'use client';

import { Button, Card, ProgressBar, Spinner } from '@fluentui/react-components';
import {
	CheckmarkCircleFilled,
	DismissCircleFilled,
	Dismiss20Regular,
} from '@fluentui/react-icons';
import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { PdfJobStatus } from '@/lib/pdf-download-link';
import { getPdfJobStatus, cancelPdfJob } from '@/lib/pdf-download-link';
import { createOpportunityListEmailLinkWithPdf } from '@/lib/opportunity-list-email-link';
import type { RegionalCurrencyCode } from '@repo/shared';
import type { DashboardViewMode, SeatRangeValue } from '@repo/types';

export interface PdfDownloadJob {
	jobId: string;
	pdfUrl: string;
	totalChunks: number;
	estimatedRows: number;
	title: string;
	// Email generation context (only for customer list downloads, not reseller)
	emailRequestData?: {
		viewMode: DashboardViewMode;
		resellerCount: number;
		customerCount: number;
		totalRenewals: number;
		totalSeatsRange: SeatRangeValue;
		selectedSkuIds: string[];
		currency?: RegionalCurrencyCode;
	};
}

interface PdfDownloadTrackerProps {
	jobs: PdfDownloadJob[];
	onRemoveJob: (jobId: string) => void;
}

const POLL_INTERVAL_MS = 2000;

function DownloadJobCard({
	job,
	onRemove,
}: {
	job: PdfDownloadJob;
	onRemove: () => void;
}) {
	const t = useTranslations();
	const [status, setStatus] = useState<PdfJobStatus | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isVisible, setIsVisible] = useState(false);
	const [isCancelling, setIsCancelling] = useState(false);
	const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const hasTriggeredEmailRef = useRef(false);

	// Entrance animation
	useEffect(() => {
		const timer = setTimeout(() => setIsVisible(true), 10);
		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		const pollStatus = async () => {
			try {
				const jobStatus = await getPdfJobStatus(job.jobId);
				setStatus(jobStatus);

				// Stop polling if completed or failed
				if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
					if (pollIntervalRef.current) {
						clearInterval(pollIntervalRef.current);
						pollIntervalRef.current = null;
					}

					if (jobStatus.status === 'failed') {
						setError(
							jobStatus.errorMessage ||
								'PDF generation failed. Please try again.',
						);
					}
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : 'Failed to check job status',
				);
				if (pollIntervalRef.current) {
					clearInterval(pollIntervalRef.current);
					pollIntervalRef.current = null;
				}
			}
		};

		// Initial poll
		void pollStatus();

		// Set up interval
		pollIntervalRef.current = setInterval(() => {
			void pollStatus();
		}, POLL_INTERVAL_MS);

		return () => {
			if (pollIntervalRef.current) {
				clearInterval(pollIntervalRef.current);
				pollIntervalRef.current = null;
			}
		};
	}, [job.jobId]);

	// Trigger email generation when job completes in the tracker
	useEffect(() => {
		if (
			!status ||
			status.status !== 'completed' ||
			!job.emailRequestData ||
			hasTriggeredEmailRef.current
		) {
			return;
		}
		hasTriggeredEmailRef.current = true;

		const completedParts = (status.parts ?? [])
			.filter(
				(p) =>
					p.status === 'completed' &&
					typeof p.blobUrl === 'string' &&
					p.blobUrl.length > 0,
			)
			.sort((a, b) => a.partNumber - b.partNumber);

		const pdfDownloadUrl =
			completedParts.length > 1
				? job.pdfUrl
				: completedParts[0]?.blobUrl ?? job.pdfUrl;

		const {
			viewMode,
			resellerCount,
			customerCount,
			totalRenewals,
			totalSeatsRange,
			selectedSkuIds,
			currency,
		} = job.emailRequestData;

		createOpportunityListEmailLinkWithPdf({
			viewMode,
			resellerCount,
			customerCount,
			totalRenewals,
			totalSeatsRange,
			selectedSkuIds,
			pdfJobId: job.jobId,
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
			.catch(() => {
				// Silently fail — tracker has no error UI for email specifically.
			});
	}, [status, job]);

	const progress = status?.progress ?? 0;
	const isCompleted = status?.status === 'completed';
	const isFailed = status?.status === 'failed';
	const isProcessing =
		!status || status.status === 'processing' || status.status === 'queued';

	const handleCancel = async () => {
		setIsCancelling(true);
		try {
			await cancelPdfJob(job.jobId);
			// Remove from tracker immediately
			onRemove();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to cancel job');
			setIsCancelling(false);
		}
	};

	return (
		<Card
			className="relative overflow-hidden"
			style={{
				width: '360px',
				padding: '16px',
				backgroundColor: 'white',
				boxShadow:
					'0 8px 16px rgba(0, 0, 0, 0.14), 0 0 2px rgba(0, 0, 0, 0.12)',
				transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
				opacity: isVisible ? 1 : 0,
				border: '1px solid #e0e0e0',
				transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
			}}
		>
			{/* Close button (only when completed or failed) */}
			{!isProcessing && (
				<Button
					appearance="subtle"
					icon={<Dismiss20Regular />}
					onClick={onRemove}
					size="small"
					style={{
						position: 'absolute',
						top: '8px',
						right: '8px',
						minWidth: 'auto',
						padding: '4px',
					}}
					aria-label={t('common.dismiss')}
				/>
			)}

			{/* Content */}
			<div>
				{/* Title */}
				<div
					style={{
						fontSize: '14px',
						fontWeight: 600,
						marginBottom: '12px',
						color: '#323130',
					}}
				>
					{job.title}
				</div>

				{/* Processing state */}
				{isProcessing && (
					<>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								marginBottom: '8px',
							}}
						>
							<div
								style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
							>
								<Spinner size="tiny" />
								<span style={{ fontSize: '13px', color: '#605E5C' }}>
									Processing {job.estimatedRows.toLocaleString()} rows...
								</span>
							</div>
							<Button
								appearance="subtle"
								onClick={handleCancel}
								size="small"
								disabled={isCancelling}
								icon={isCancelling ? <Spinner size="tiny" /> : undefined}
								style={{ minWidth: 'auto' }}
							>
								{isCancelling ? (
									<Spinner size="tiny" />
								) : (
									<Dismiss20Regular className="size-4" />
								)}
							</Button>
						</div>
						<ProgressBar
							value={progress / 100}
							style={{ marginBottom: '6px' }}
						/>
						<div
							style={{
								fontSize: '12px',
								color: '#605E5C',
								textAlign: 'right',
							}}
						>
							{progress}%
						</div>
					</>
				)}

				{/* Completed state */}
				{isCompleted && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '8px',
							marginBottom: '4px',
						}}
					>
						<CheckmarkCircleFilled
							style={{ fontSize: '20px', color: '#107C10' }}
						/>
						<span style={{ fontSize: '13px', color: '#323130' }}>
							Complete — check email for password
						</span>
					</div>
				)}

				{/* Failed state */}
				{isFailed && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '8px',
						}}
					>
						<DismissCircleFilled
							style={{ fontSize: '20px', color: '#D13438' }}
						/>
						<span style={{ fontSize: '13px', color: '#A4262C' }}>
							{error || 'Generation failed'}
						</span>
					</div>
				)}
			</div>
		</Card>
	);
}

export function PdfDownloadTracker({
	jobs,
	onRemoveJob,
}: PdfDownloadTrackerProps) {
	if (jobs.length === 0) return null;

	return (
		<div
			style={{
				position: 'fixed',
				top: '72px', // Below navbar (navbar min-h-14 = 56px + py-2 = ~64-72px, adding 8px gap)
				right: '24px',
				zIndex: 999, // Below navbar (z-50 = 1250) but above content
				display: 'flex',
				flexDirection: 'column',
				gap: '12px',
				maxHeight: 'calc(100vh - 96px)', // 72px top + 24px bottom padding
				overflowY: 'auto',
				// Smooth scrolling with webkit support
				scrollbarWidth: 'thin',
			}}
			className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
		>
			{jobs.map((job) => (
				<DownloadJobCard
					key={job.jobId}
					job={job}
					onRemove={() => onRemoveJob(job.jobId)}
				/>
			))}
		</div>
	);
}
