'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Spinner } from '@fluentui/react-components';
import {
	DismissCircle24Filled,
	People24Regular,
} from '@fluentui/react-icons';

export function PartnerCustomersCard() {
	const t = useTranslations();
	const [loading, setLoading] = useState(true);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const [data, setData] = useState<any>(null);
	const [error, setError] = useState<string | null>(null);

	const handleFetch = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const res = await fetch('/api/reseller/partner-customers');
			const json = await res.json();

			if (res.ok) {
				setData(json.data);
			} else {
				setError(json.error || `Failed (${res.status})`);
			}
		} catch {
			setError(t('auth.partnerCenterError'));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		handleFetch();
	}, [handleFetch]);

	if (loading) {
		return (
			<div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4">
				<Spinner size="small" />
				<p className="m-0 text-sm text-gray-600">
					Loading Partner Center customers...
				</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-5 py-4">
				<div className="flex items-start gap-3">
					<DismissCircle24Filled className="mt-0.5 shrink-0 text-red-500" />
					<div>
						<p className="m-0 text-sm font-semibold text-red-800">
							Failed to load Partner Center customers
						</p>
						<p className="m-0 mt-1 text-sm text-gray-600">{error}</p>
					</div>
				</div>
				<Button
					appearance="secondary"
					size="small"
					onClick={handleFetch}
					disabled={loading}
					className="self-start"
				>
					Try Again
				</Button>
			</div>
		);
	}

	if (!data) return null;

	const customers = data?.items ?? data?.Items ?? [];
	const totalCount = data?.totalCount ?? data?.TotalCount ?? customers.length;

	return (
		<div className="rounded-lg bg-white px-5 py-4">
			<div className="flex items-center gap-2 mb-3">
				<People24Regular className="text-(--ds-color-violet-500)" />
				<p className="m-0 text-sm font-semibold text-gray-800">
					Partner Center Customers ({totalCount})
				</p>
			</div>
			{customers.length === 0 ? (
				<p className="m-0 text-sm text-gray-500">{t('auth.noCustomersFound')}</p>
			) : (
				<div className="max-h-64 overflow-y-auto">
					<pre className="m-0 text-xs text-gray-700 whitespace-pre-wrap">
						{JSON.stringify(data, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}
