import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Inter, Montserrat, Poppins } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { env } from '@/env';
import { APP_ASSETS } from '@/lib/site-assets';
import { getThemeConfig } from '@/lib/theme-config';
import { fetchMicrosoftUhf } from '@/lib/microsoft-uhf';
import { BrandedHeader } from '@/components/shared/BrandedHeader';
import { BrandedFooter } from '@/components/shared/BrandedFooter';
import { PuppFooter } from '@/components/shared/PuppFooter';
import { StickyLanguageSwitcher } from '@/components/StickyLanguageSwitcher';
import { getCurrencyFromCookie } from '@/lib/currency-server';
import { Providers } from './Providers';
import './globals.css';

const themeConfig = getThemeConfig();
const isInternal = themeConfig.id === 'internal';
const showBrandedShell = themeConfig.assets.headerLogoSvg || themeConfig.assets.logo;

const segoeUI = localFont({
	src: [
		{
			path: '../../public/segoeui/SegoeUI-VF.woff2',
			weight: '300 700',
			style: 'normal',
		},
	],
	variable: '--font-segoe-ui',
	display: 'swap',
});

const inter = Inter({
	subsets: ['latin'],
	variable: '--font-inter',
	display: 'swap',
});

const poppins = Poppins({
	subsets: ['latin'],
	weight: ['300', '400', '500', '600', '700'],
	variable: '--font-poppins',
	display: 'swap',
});

const montserrat = Montserrat({
	subsets: ['latin'],
	variable: '--font-montserrat',
	display: 'swap',
});

const fontVariable =
	themeConfig.fonts.source === 'inter'
		? inter.variable
		: themeConfig.fonts.source === 'poppins'
			? poppins.variable
			: themeConfig.fonts.source === 'montserrat'
				? montserrat.variable
				: segoeUI.variable;

export const metadata: Metadata = {
	title: themeConfig.content.metadata.title,
	description: themeConfig.content.metadata.description,
	metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
	openGraph: {
		title: themeConfig.content.metadata.ogTitle,
		description: themeConfig.content.metadata.ogDescription,
		type: 'website',
		url: env.NEXT_PUBLIC_APP_URL,
		images: [
			{
				url: APP_ASSETS.openGraph(),
			},
		],
	},
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const uhf = isInternal ? await fetchMicrosoftUhf() : null;
	const locale = await getLocale();
	const messages = await getMessages();
	const initialCurrency = await getCurrencyFromCookie();

	return (
		<html lang={locale}>
			<head>
				{themeConfig.assets.favicon && (
					<link rel="icon" href={themeConfig.assets.favicon} type="image/x-icon" />
				)}
				<link
					rel="preconnect"
					href="https://cdn-dynmedia-1.microsoft.com"
					crossOrigin="anonymous"
				/>
				<link
					rel="preconnect"
					href="https://agentb-c5dggfbkhbb6gndk.z01.azurefd.net"
					crossOrigin="anonymous"
				/>
				<link
					rel="preload"
					as="image"
					href={themeConfig.assets.heroBackground}
				/>
				{(Object.keys(themeConfig.cssTokens).length > 0 || themeConfig.fonts.primaryVariable) && (
					<style
						dangerouslySetInnerHTML={{
							__html: `:root { --theme-font:var(${themeConfig.fonts.primaryVariable});${Object.entries(themeConfig.cssTokens)
								.map(([k, v]) => `--${k}:${v}`)
								.join(';')} }`,
						}}
					/>
				)}
			</head>
			<body
				className={`${fontVariable} flex min-h-screen flex-col antialiased${themeConfig.fonts.source === 'poppins' ? ' font-poppins-active' : ''}`}
			>
				{uhf && <style dangerouslySetInnerHTML={{ __html: uhf.css }} />}
				{uhf && <div dangerouslySetInnerHTML={{ __html: uhf.js }} />}
				{uhf ? (
					<div dangerouslySetInnerHTML={{ __html: uhf.header }} />
				) : showBrandedShell ? (
					<BrandedHeader />
				) : null}
				<NextIntlClientProvider locale={locale} messages={messages}>
					<Providers initialCurrency={initialCurrency}>
						<div className="flex flex-1 flex-col">{children}</div>
						<StickyLanguageSwitcher />
					</Providers>
					<PuppFooter />
				</NextIntlClientProvider>
				{uhf ? (
					<div dangerouslySetInnerHTML={{ __html: uhf.footer }} />
				) : showBrandedShell ? (
					<BrandedFooter />
				) : null}
			</body>
		</html>
	);
}
