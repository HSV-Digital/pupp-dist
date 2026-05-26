'use client';

import { usePathname } from 'next/navigation';
import { LanguageSwitcher } from './LanguageSwitcher';

const LANDING_PATHS = new Set(['/', '/csp-partners']);

export function StickyLanguageSwitcher() {
	const pathname = usePathname();
	if (!LANDING_PATHS.has(pathname)) return null;

	return (
		<div className="fixed bottom-4 right-4 z-50 rounded-md bg-black shadow-md transition-colors hover:bg-gray-800">
			<LanguageSwitcher className="!text-white hover:!bg-transparent" />
		</div>
	);
}
