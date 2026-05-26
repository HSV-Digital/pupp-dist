'use client';

import { useTranslations } from 'next-intl';

export function BrandedFooter() {
	const t = useTranslations();
	return (
		<footer
			className="text-white text-sm py-6 mt-8"
			style={{
				background:
					'linear-gradient(to bottom, #1a1a8a 0%, #0a0a3a 45%, #000000 100%)',
			}}
		>
			<div className="mx-auto max-w-[1440px] px-6 flex items-center justify-between">
				<span>{t('branding.platformManaged')}</span>
				<a
					href="https://www.hsv.digital/privacy-policy"
					target="_blank"
					rel="noopener noreferrer"
					className="text-white underline hover:text-white/90"
				>
					Privacy Policy
				</a>
			</div>
		</footer>
	);
}
