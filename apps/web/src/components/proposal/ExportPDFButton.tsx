'use client';

import { useMemo, useState } from 'react';
import { Button, Spinner } from '@fluentui/react-components';
import { ArrowDownloadRegular } from '@fluentui/react-icons';
import type { ScenarioProposal } from '@/lib/proposal-types';

interface ExportPDFButtonProps {
	customerName: string;
	proposals: ScenarioProposal[];
	mode: 'single' | 'consolidated';
}

function sanitizeFilenameSegment(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function ExportPDFButton({
	customerName,
	proposals,
	mode,
}: ExportPDFButtonProps) {
	const [loading, setLoading] = useState(false);

	const fileName = useMemo(() => {
		const customer = sanitizeFilenameSegment(customerName) || 'customer';
		if (mode === 'single' && proposals[0]) {
			const id = sanitizeFilenameSegment(
				proposals[0].subscription.subscriptionId,
			);
			return `${customer}-${id}-proposal.pdf`;
		}
		return `${customer}-consolidated-proposals.pdf`;
	}, [customerName, proposals, mode]);

	const handleExport = async () => {
		if (proposals.length === 0) return;

		setLoading(true);
		try {
			const baseUrl = window.location.origin;
			const { pdf } = await import('@react-pdf/renderer');
			const { ProposalPDFDocument } = await import('@/lib/pdf-generator');

			const blob = await pdf(
				<ProposalPDFDocument
					proposals={proposals}
					customerName={customerName}
					baseUrl={baseUrl}
					mode={mode}
				/>,
			).toBlob();

			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = fileName;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			URL.revokeObjectURL(url);
		} finally {
			setLoading(false);
		}
	};

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
			disabled={loading || proposals.length === 0}
			onClick={handleExport}
		>
			{loading ? 'Generating...' : 'Export PDF'}
		</Button>
	);
}
