'use client';

import { useTranslations } from 'next-intl';

export function FooterMessage() {
	const t = useTranslations();
	return (
		<div className="max-w-[1640px] mx-auto text-xs text-center text-muted-foreground py-4 px-6 space-y-1">
			<p>
				{t.rich('branding.footerDeveloped', {
					link: (chunks) => (
						<a
							href="https://hsv.digital"
							target="_blank"
							rel="noopener noreferrer"
							className="underline text-blue-500 hover:text-blue-600"
						>
							{chunks}
						</a>
					),
				})}
			</p>
			<p>
				{t.rich('branding.footerMicrosoftResources', {
					link: (chunks) => (
						<a
							href="https://www.microsoft.com"
							target="_blank"
							rel="noopener noreferrer"
							className="underline text-blue-500 hover:text-blue-600"
						>
							{chunks}
						</a>
					),
				})}
			</p>
		</div>
	);
}
