'use client';

import { useMemo } from 'react';
import { Button, Spinner } from '@fluentui/react-components';
import { ArrowDownloadRegular } from '@fluentui/react-icons';

interface ExportPPTButtonProps {
	downloadUrl: string | null;
	loading?: boolean;
}

export function ExportPPTButton({
	downloadUrl,
	loading = false,
}: ExportPPTButtonProps) {
	const disabled = loading || !downloadUrl;

	const buttonLabel = useMemo(() => {
		if (loading) return 'Preparing...';
		return 'Export PPT';
	}, [loading]);

	return (
		<Button
			size="medium"
			appearance="primary"
			icon={
				loading ? (
					<Spinner size="tiny" />
				) : (
					<ArrowDownloadRegular className="size-4" />
				)
			}
			disabled={disabled}
			onClick={() => {
				if (!downloadUrl) return;
				window.open(downloadUrl, '_blank', 'noopener,noreferrer');
			}}
		>
			{buttonLabel}
		</Button>
	);
}
