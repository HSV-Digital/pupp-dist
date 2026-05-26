'use client';

import { Spinner } from '@fluentui/react-components';
import { useTranslations } from 'next-intl';

interface PptPreviewFrameProps {
	title: string;
	renderUrl: string | null;
	downloadUrl: string | null;
	loading: boolean;
	error: string | null;
}

export function PptPreviewFrame({
	title,
	renderUrl,
	downloadUrl,
	loading,
	error,
}: PptPreviewFrameProps) {
	const t = useTranslations();
	const embedUrl = renderUrl
		? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(renderUrl)}`
		: null;

	return (
		<div className="rounded-xl border-2 border-white bg-white p-4 backdrop-blur-[80px]">
			<div className="flex items-center justify-between gap-3">
				<h3 className="m-0 font-ds-display text-lg font-semibold">{title}</h3>
				{renderUrl && (
					<div className="flex items-center gap-3 text-xs font-medium text-[#2f365d]">
						<a
							href={renderUrl}
							target="_blank"
							rel="noreferrer"
							className="hover:underline"
						>
							{t('common.open')}
						</a>
						{downloadUrl && (
							<a
								href={downloadUrl}
								target="_blank"
								rel="noreferrer"
								className="hover:underline"
							>
								{t('common.download')}
							</a>
						)}
					</div>
				)}
			</div>

			{loading && (
				<div className="mt-4 flex min-h-[480px] items-center justify-center rounded-lg border border-[#e7e9f5] bg-[#f7f8fd]">
					<Spinner size="large" label={t('proposal.preparingPreview')} />
				</div>
			)}

			{!loading && error && (
				<div className="mt-4 rounded-lg border border-[#f8d8d8] bg-[#fff3f3] p-4 text-sm text-[#7c1f1f]">
					{error}
				</div>
			)}

			{!loading && !error && embedUrl && (
				<div className="mt-4 overflow-hidden rounded-lg border border-[#e7e9f5] bg-white">
					<iframe
						src={embedUrl}
						title={title}
						className="h-[640px] w-full border-0"
						loading="lazy"
					/>
				</div>
			)}

			{!loading && !error && !embedUrl && (
				<div className="mt-4 rounded-lg border border-[#f8e0bf] bg-[#fff9f1] p-4 text-sm text-[#77522f]">
					Preview URL is unavailable. Use Export PPT to download the file.
				</div>
			)}

			<p className="m-0 mt-3 text-xs text-gray-500">
				{t('proposal.embeddedPreviewBlocked')}
			</p>
			<p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-2 font-ds-text text-xs italic text-yellow-700">
				{t('proposal.disclaimer')}
			</p>
		</div>
	);
}
