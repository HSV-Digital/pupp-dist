import { getThemeConfig } from '@/lib/theme-config';

const theme = getThemeConfig();

export function BrandedHeader() {
	return (
		<header className="bg-black text-white">
			<div className="mx-auto flex py-2 max-w-[1440px] items-center gap-3 px-6">
				{theme.assets.headerLogoSvg ? (
					<div
						className="h-8 w-auto [&>svg]:h-full [&>svg]:w-auto"
						dangerouslySetInnerHTML={{ __html: theme.assets.headerLogoSvg }}
					/>
				) : theme.assets.logo ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={theme.assets.logo}
						alt={theme.content.appName}
						className="h-6"
					/>
				) : (
					<span className="text-sm font-semibold">
						{theme.content.appName}
					</span>
				)}
			</div>
		</header>
	);
}
