import type { BrandVariants } from '@fluentui/react-components';
import { themes } from './themes';

export type ThemeId = 'internal';

export interface ThemeConfig {
	id: ThemeId;

	/** Fluent UI brand ramp — 16 shades (10-160) */
	brandRamp: BrandVariants;

	/** CSS variable overrides (only the ones that differ between themes) */
	cssTokens: Record<string, string>;

	/** Fluent UI token overrides — applied on top of the generated light theme */
	fluentTokenOverrides: Record<string, string>;

	/** Font config */
	fonts: {
		/** Which font to load: 'segoe-ui' (local), 'inter' (Google), 'poppins' (Google), or 'montserrat' (Google) */
		source: 'segoe-ui' | 'inter' | 'poppins' | 'montserrat';
		primaryVariable: string;
		fluentFontFamily: string;
	};

	/** All image paths/URLs per slot */
	assets: {
		logo: string;
		/** Inline SVG markup for the header logo (used instead of logo URL when set) */
		headerLogoSvg: string;
		/** Favicon path or URL (empty = default /favicon.ico) */
		favicon: string;
		openGraph: string;
		heroPreview: string;
		heroBackground: string;
		heroImage: string;
		featureCardBackground: string;
		featureSectionBackground: string;
		dashboardHero: string;
		dashboardBackground: string;
		featureBackground: string;
		proposalBackground: string;
		proposalSurface: string;
		landingFeatureOne: string;
		landingFeatureTwo: string;
		landingFeatureThree: string;
		landingFeatureFour: string;
		dashboardHeroBanner: string;
		proposalPageBackground: string;
		proposalSummaryBanner: string;
		proposalScenariosBackground: string;
		proposalNextStepBanner: string;
		proposalCardBackground: string;
	};

	/** Per-theme CSS class overrides for specific UI elements */
	styles: {
		/** Text color class for hero headings (e.g. '' for default black, 'text-white' for white) */
		heroTextClass: string;
		/** Extra class for CTA buttons on hero (e.g. '' for default, 'bg-(--ds-color-violet-500)! text-white!' for branded) */
		heroButtonClass: string;
		selectedproposaltextClass: string;
		
	};

	/** Per-theme typography overrides (Tailwind class strings) */
	typography: {
		/** Scenario card — big price display (e.g. "$43.40") */
		cardPrice: string;
		/** Scenario card — title (e.g. "Business Premium + Copilot Business") */
		cardTitle: string;
		/** Scenario card — strikethrough original price */
		cardPriceOriginal: string;
		/** Scenario card — description text below price */
		cardDescription: string;
		/** Scenario card — section headers like "Plan highlights" */
		cardSectionHeader: string;
		/** Proposal card — main heading */
		proposalTitle: string;
		/** Proposal card — badge label */
		proposalBadge: string;
	};

	/** All static copy that varies per brand */
	content: {
		appName: string;
		tagline: string;
		heroDescription: string;
		searchPlaceholder: string;

		metadata: {
			title: string;
			description: string;
			ogTitle: string;
			ogDescription: string;
		};

		landingFeatures: Array<{
			title: string;
			description: string;
		}>;

		resellerFeatures: Array<{
			title: string;
			description: string;
		}>;

		resellerHeroDescription: string;

		/** Dashboard page (/dashboard) */
		dashboard: {
			heading: string;
			subheading: string;
			discoverTabLabel: string;
			addedCustomersTabLabel: string;
			addCustomerButton: string;
			viewProposalLink: string;
			noMatchMessage: string;
			emptyStateHeading: string;
			emptyStateDescription: string;
		};

		/** Demo dashboard page (/demo/dashboard) */
		demoDashboard: {
			heading: string;
			subheading: string;
			disclaimer: string;
			discoverTabLabel: string;
			addedCustomersTabLabel: string;
			addCustomerButton: string;
			viewProposalLink: string;
			noMatchMessage: string;
			emptyStateHeading: string;
			emptyStateDescription: string;
		};

		/** Reseller dashboard page (/csp-partners/dashboard) */
		resellerDashboard: {
			heading: string;
			subheading: string;
			addCustomerButton: string;
			viewProposalLink: string;
			noMatchMessage: string;
			emptyStateHeading: string;
			emptyStateDescription: string;
		};
	};
}

export function resolveThemeId(): ThemeId {
	return 'internal';
}

let _cached: ThemeConfig | null = null;

export function getThemeConfig(): ThemeConfig {
	if (!_cached) {
		_cached = themes[resolveThemeId()];
	}
	return _cached;
}

