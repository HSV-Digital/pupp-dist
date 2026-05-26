'use client';

import {
	Menu,
	MenuPopover,
	MenuTrigger,
	MenuItem,
	MenuList,
	Avatar,
} from '@fluentui/react-components';
import { AutocorrectRegular, SignOutRegular } from '@fluentui/react-icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getThemeConfig } from '@/lib/theme-config';
import { isHsvEmail } from '@/lib/hsv-email';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const theme = getThemeConfig();

interface ResellerNavbarProps {
	name?: string | null;
	email?: string | null;
	handleLogout: () => void;
}

export default function ResellerNavbar({
	name,
	email,
	handleLogout,
}: ResellerNavbarProps) {
	const t = useTranslations();
	return (
		<header className="sticky top-0 z-50 border-t border-b border-[#d7dde2] bg-white/90 backdrop-blur-sm">
			<div className="mx-auto flex min-h-14 max-w-[1440px] items-center justify-between gap-4 py-2 px-6">
				<Link
					href="/csp-partners/dashboard"
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
						CSP Partners
					</span>
				</Link>
				<div className="flex items-center gap-3">
					{isHsvEmail(email) ? (
						<Link
							href="/csp-partners/analytics"
							className="text-sm font-medium text-[#091f2c] no-underline hover:text-(--ds-color-violet-500)"
							data-testid="csp-partner-analytics-nav-link"
						>
							Analytics
						</Link>
					) : null}
					<LanguageSwitcher variant="light" />
					<div className="hidden sm:block text-right">
						<p className="text-sm font-semibold text-[#091f2c] m-0 leading-tight">
							{name}
						</p>
						{email && (
							<p className="text-xs text-neutral-500 m-0 leading-tight">
								{email}
							</p>
						)}
					</div>
					<Menu>
						<MenuTrigger disableButtonEnhancement>
							<button
								type="button"
								className="cursor-pointer rounded-full border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--ds-color-violet-500)"
								aria-label={t('auth.userMenu')}
							>
								<Avatar
									name={name || email || 'User'}
									color="brand"
									size={32}
									aria-hidden
								/>
							</button>
						</MenuTrigger>
						<MenuPopover>
							<MenuList>
								<MenuItem icon={<SignOutRegular />} onClick={handleLogout}>
									Sign out
								</MenuItem>
							</MenuList>
						</MenuPopover>
					</Menu>
				</div>
			</div>
		</header>
	);
}
