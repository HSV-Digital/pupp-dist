'use client';

import { AutocorrectRegular } from '@fluentui/react-icons';
import Link from 'next/link';
import { getThemeConfig } from '@/lib/theme-config';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const theme = getThemeConfig();

export default function DemoResellerShell({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex-1 flex flex-col w-full">
			<header className="sticky top-0 z-50 border-t border-b border-[#d7dde2] bg-white/90 backdrop-blur-sm">
				<div className="mx-auto flex min-h-14 max-w-[1440px] items-center justify-between gap-4 py-2 px-6">
					<Link
						href="/csp-partners/demo"
						className="flex items-center justify-center gap-2 no-underline"
					>
						<AutocorrectRegular
							className="text-(--ds-color-violet-500)"
							fontSize={24}
						/>
						<span className="font-ds-display text-base font-semibold text-[#091f2c]">
							{theme.content.appName}
						</span>
						<div className="flex items-center gap-4 text-neutral-300">|</div>
						<span className="font-ds-display text-base font-semibold text-[#091f2c]">
							CSP Partners (Demo)
						</span>
					</Link>
					<div className="flex items-center gap-3">
						<LanguageSwitcher variant="light" />
						<div className="rounded-full bg-(--ds-color-violet-50) px-3 py-1 text-xs font-semibold text-(--ds-color-violet-600)">
							Demo Mode
						</div>
					</div>
				</div>
			</header>
			{children}
		</div>
	);
}
