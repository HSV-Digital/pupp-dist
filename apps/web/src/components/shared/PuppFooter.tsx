'use client';

import { useTranslations } from 'next-intl';
import { getThemeConfig } from '@/lib/theme-config';

export function PuppFooter() {
	const t = useTranslations();
	const theme = getThemeConfig();
	return (
		<div className="bg-white border-t border-b border-gray-200">
			<div className="mx-auto max-w-[1440px] px-6 py-3 flex items-center justify-between text-xs text-gray-700">
				<span className="font-medium text-lg">{theme.content.appName}</span>
				<a
					href="/terms-of-use"
					target="_blank"
					rel="noopener noreferrer"
					className="hover:underline text-sm text-[#0567b9]" 
				>
					{t('branding.termsOfUse')}
				</a>
			</div>
		</div>
	);
}
