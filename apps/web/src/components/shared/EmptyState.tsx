'use client';

import { Body1, Subtitle1 } from '@fluentui/react-components';
import { DocumentTableRegular } from '@fluentui/react-icons';
import { useTranslations } from 'next-intl';

const CONTAINER_CLASS =
	'flex flex-col items-center justify-center gap-4 p-12 text-center';
const ICON_CLASS = 'text-[48px] text-gray-500';

export function EmptyState() {
	const t = useTranslations();
	return (
		<div className={CONTAINER_CLASS}>
			<DocumentTableRegular className={ICON_CLASS} />
			<Subtitle1>{t('common.noRenewalData')}</Subtitle1>
			<Body1>
				No renewal data is available yet. Upload a valid renewals CSV to
				populate the dashboard.
			</Body1>
		</div>
	);
}
