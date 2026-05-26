'use client';

import { Button } from '@fluentui/react-components';
import { useTranslations } from 'next-intl';

interface PaginationProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
}

function getVisiblePages(current: number, total: number): (number | '...')[] {
	if (total <= 5) {
		return Array.from({ length: total }, (_, i) => i + 1);
	}

	const pages: (number | '...')[] = [1];

	if (current > 3) pages.push('...');

	const start = Math.max(2, current - 1);
	const end = Math.min(total - 1, current + 1);

	for (let i = start; i <= end; i++) {
		pages.push(i);
	}

	if (current < total - 2) pages.push('...');

	pages.push(total);
	return pages;
}

export function Pagination({
	currentPage,
	totalPages,
	onPageChange,
}: PaginationProps) {
	const t = useTranslations('common');
	if (totalPages <= 1) return null;

	const visible = getVisiblePages(currentPage, totalPages);

	return (
		<div className="flex items-center justify-center gap-1 pt-4">
			<Button
				appearance="subtle"
				size="small"
				disabled={currentPage === 1}
				onClick={() => onPageChange(currentPage - 1)}
			>
				{t('previous')}
			</Button>

			{visible.map((page, idx) =>
				page === '...' ? (
					<span key={`ellipsis-${idx}`} className="px-2 text-sm text-gray-500">
						...
					</span>
				) : (
					<Button
						key={page}
						appearance={page === currentPage ? 'primary' : 'subtle'}
						size="small"
						onClick={() => onPageChange(page)}
					>
						{page}
					</Button>
				),
			)}

			<Button
				appearance="subtle"
				size="small"
				disabled={currentPage === totalPages}
				onClick={() => onPageChange(currentPage + 1)}
			>
				{t('next')}
			</Button>
		</div>
	);
}
