'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
	Menu,
	MenuTrigger,
	MenuPopover,
	MenuList,
	MenuItem,
	Button,
} from '@fluentui/react-components';
import { Money20Regular, ChevronDown16Regular } from '@fluentui/react-icons';
import { getCurrencySymbol } from '@repo/shared';
import {
	currencies,
	currencyLabels,
	type Currency,
} from '@/i18n/currency-config';
import { useCurrency } from '@/lib/currency-context';

export function CurrencySwitcher({
	className = '',
	variant = 'dark',
}: {
	className?: string;
	variant?: 'dark' | 'light';
}) {
	const t = useTranslations();
	const { currency, setCurrency, isLocked, lockReason } = useCurrency();
	const [pending, startTransition] = useTransition();
	const [isHovered, setIsHovered] = useState(false);

	const select = (next: Currency) => {
		startTransition(() => setCurrency(next));
	};

	const iconColor = variant === 'dark' ? 'white' : '#091f2c';
	const textColor = variant === 'dark' ? 'white' : '#091f2c';
	const restBg = variant === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#f5f5f5';
	const hoverBg = variant === 'dark' ? 'rgba(255, 255, 255, 0.2)' : '#e0e0e0';
	const persistentBg = isHovered ? hoverBg : restBg;

	const ariaLabel = (() => {
		try {
			return t('common.selectCurrency');
		} catch {
			return 'Select currency';
		}
	})();

	if (isLocked) {
		return (
			<Button
				appearance="subtle"
				size="medium"
				icon={<Money20Regular style={{ color: iconColor }} />}
				iconPosition="before"
				disabled
				className={className}
				aria-label={ariaLabel}
				title={lockReason ?? ariaLabel}
				style={{
					color: textColor,
					fontSize: '14px',
					padding: '6px 12px',
					opacity: 0.6,
					backgroundColor: persistentBg,
				}}
			>
				<span className="flex items-center gap-1.5">
					{`${getCurrencySymbol(currency)} ${currency}`}
				</span>
			</Button>
		);
	}

	return (
		<Menu>
			<MenuTrigger disableButtonEnhancement>
				<Button
					appearance="subtle"
					size="medium"
					icon={<Money20Regular style={{ color: iconColor }} />}
					iconPosition="before"
					disabled={pending}
					className={className}
					aria-label={ariaLabel}
					onMouseEnter={() => setIsHovered(true)}
					onMouseLeave={() => setIsHovered(false)}
					style={{
						color: textColor,
						fontSize: '14px',
						padding: '6px 12px',
						backgroundColor: persistentBg,
						transition: 'background-color 120ms ease',
					}}
				>
					<span className="flex items-center gap-1.5">
						{`${getCurrencySymbol(currency)} ${currency}`}
						<ChevronDown16Regular style={{ color: iconColor }} />
					</span>
				</Button>
			</MenuTrigger>
			<MenuPopover>
				<MenuList>
					{currencies.map((c) => (
						<MenuItem
							key={c}
							onClick={() => select(c)}
							disabled={c === currency}
						>
							{currencyLabels[c]}
						</MenuItem>
					))}
				</MenuList>
			</MenuPopover>
		</Menu>
	);
}
