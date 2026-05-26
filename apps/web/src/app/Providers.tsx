'use client';

import { useRef, useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { PostHogProvider } from './PostHogProvider';
import {
	FluentProvider,
	createDOMRenderer,
	createLightTheme,
	renderToStyleElements,
	RendererProvider,
	SSRProvider,
} from '@fluentui/react-components';
import { getThemeConfig } from '@/lib/theme-config';
import { CurrencyProvider } from '@/lib/currency-context';
import type { Currency } from '@/i18n/currency-config';

const themeConfig = getThemeConfig();
const lightTheme = createLightTheme(themeConfig.brandRamp);
lightTheme.fontFamilyBase = themeConfig.fonts.fluentFontFamily;

lightTheme.borderRadiusSmall = '4px';
lightTheme.borderRadiusMedium = '8px';
lightTheme.borderRadiusLarge = '12px';
lightTheme.borderRadiusXLarge = '16px';
lightTheme.borderRadius2XLarge = '8px';

// Apply any per-theme Fluent UI token overrides
for (const [token, value] of Object.entries(themeConfig.fluentTokenOverrides)) {
	(lightTheme as unknown as Record<string, string>)[token] = value;
}

export function Providers({
	children,
	initialCurrency,
}: {
	children: React.ReactNode;
	initialCurrency: Currency | null;
}) {
	const [renderer] = useState(() => createDOMRenderer());
	const didRenderRef = useRef(false);

	useServerInsertedHTML(() => {
		if (didRenderRef.current) {
			return;
		}
		didRenderRef.current = true;
		return <>{renderToStyleElements(renderer)}</>;
	});

	return (
		<PostHogProvider>
			<RendererProvider renderer={renderer}>
				<SSRProvider>
					<FluentProvider theme={lightTheme}>
						<CurrencyProvider initialCurrency={initialCurrency}>
							<NuqsAdapter>{children}</NuqsAdapter>
						</CurrencyProvider>
					</FluentProvider>
				</SSRProvider>
			</RendererProvider>
		</PostHogProvider>
	);
}
