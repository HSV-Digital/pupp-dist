'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, MenuTrigger, MenuPopover, MenuList, MenuItem, Button } from '@fluentui/react-components';
import { Globe20Regular, ChevronDown16Regular } from '@fluentui/react-icons';
import { LOCALE_COOKIE, locales, localeLabels, type Locale } from '@/i18n/config';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function LanguageSwitcher({
	className = '',
	variant = 'dark',
}: {
	className?: string;
	variant?: 'dark' | 'light';
}) {
	const t = useTranslations();
	const current = useLocale() as Locale;
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	const select = (next: Locale) => {
		document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
		startTransition(() => router.refresh());
	};

	const iconColor = variant === 'dark' ? 'white' : '#091f2c';
	const textColor = variant === 'dark' ? 'white' : '#091f2c';

	return (
		<Menu>
			<MenuTrigger disableButtonEnhancement>
				<Button
					appearance="subtle"
					size="medium"
					icon={<Globe20Regular style={{ color: iconColor }} />}
					iconPosition="before"
					disabled={pending}
					className={className}
					aria-label={t('common.selectLanguage')}
					style={{ color: textColor, fontSize: '14px', padding: '6px 12px' }}
				>
					<span className="flex items-center gap-1.5">
						{localeLabels[current] ?? current.toUpperCase()}
						<ChevronDown16Regular style={{ color: iconColor }} />
					</span>
				</Button>
			</MenuTrigger>
			<MenuPopover>
				<MenuList>
					{locales.map((l) => (
						<MenuItem key={l} onClick={() => select(l)} disabled={l === current}>
							{localeLabels[l]}
						</MenuItem>
					))}
				</MenuList>
			</MenuPopover>
		</Menu>
	);
}
