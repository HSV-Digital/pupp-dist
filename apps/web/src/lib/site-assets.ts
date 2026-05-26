import { resolvePublicAssetUrl } from '@/env';
import { getThemeConfig } from '@/lib/theme-config';

const theme = getThemeConfig();

/** Resolve a theme asset URL — returns full URLs as-is, resolves relative paths via CDN. */
function resolveAsset(path: string): string {
	if (/^https?:\/\//i.test(path)) return path;
	if (path.startsWith('data:')) return path;
	return resolvePublicAssetUrl(path);
}

export const APP_ASSETS = {
	openGraph: () => resolveAsset(theme.assets.openGraph),
	heroPreview: () => resolveAsset(theme.assets.heroPreview),
	heroBackground: () => resolveAsset(theme.assets.dashboardHero),
	dashboardHero: () => resolveAsset(theme.assets.dashboardHero),
	dashboardBackground: () => resolveAsset(theme.assets.dashboardBackground),
	featureBackground: () => resolveAsset(theme.assets.featureBackground),
	proposalBackground: () => resolveAsset(theme.assets.proposalBackground),
	proposalSurface: () => resolveAsset(theme.assets.proposalSurface),
	landingFeatureOne: () => resolveAsset(theme.assets.landingFeatureOne),
	landingFeatureTwo: () => resolveAsset(theme.assets.landingFeatureTwo),
	landingFeatureThree: () => resolveAsset(theme.assets.landingFeatureThree),
	landingFeatureFour: () => resolveAsset(theme.assets.landingFeatureFour),
} as const;

export function toBackgroundImage(url: string): { backgroundImage: string } {
	return { backgroundImage: `url("${url}")` };
}
