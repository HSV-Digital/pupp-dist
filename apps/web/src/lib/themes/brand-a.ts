import type { ThemeConfig } from '../theme-config';

export const brandA: ThemeConfig = {
	id: 'internal',

	brandRamp: {
		10: '#070407',
		20: '#170D17',
		30: '#260D27',
		40: '#3E143F',
		50: '#501A52',
		60: '#662269',
		70: '#6B246E',
		80: '#702573',
		90: '#8D518F',
		100: '#9F6DA1',
		110: '#AE84B0',
		120: '#BD9BBF',
		130: '#C8ABCA',
		140: '#D3BBD4',
		150: '#E2D2E3',
		160: '#F1E9F1',
	},

	cssTokens: {
		'ds-color-violet-50': '#f1e9f1',
		'ds-color-violet-100': '#e2d2e3',
		'ds-color-violet-200': '#d3bbd4',
		'ds-color-violet-300': '#c8abca',
		'ds-color-violet-400': '#ae84b0',
		'ds-color-violet-500': '#702573',
		'ds-color-violet-600': '#662269',
		'ds-color-violet-700': '#501a52',
		'ds-color-violet-800': '#3e143f',
		'ds-color-violet-900': '#260d27',
	},

	fluentTokenOverrides: {},

	fonts: {
		source: 'segoe-ui',
		primaryVariable: '--font-segoe-ui',
		fluentFontFamily: 'var(--font-segoe-ui), sans-serif',
	},

	styles: {
		heroTextClass: '',
		heroButtonClass: '',
		selectedproposaltextClass: 'text-white',
	},

	typography: {
		cardPrice: 'text-[2.75rem] font-extrabold',
		cardTitle: 'text-[1.25rem] font-bold',
		cardPriceOriginal: 'text-lg font-medium',
		cardDescription: 'text-xs font-semibold',
		cardSectionHeader: 'text-[10px] font-bold',
		proposalTitle: 'text-4xl font-semibold',
		proposalBadge: 'text-[0.6875rem] font-semibold',
	},

	assets: {
		logo: '',
		headerLogoSvg: '',
		favicon:
			'https://agentb-c5dggfbkhbb6gndk.z01.azurefd.net/agent-b-webapp-images/favicon.ico',
		openGraph: '/partner-ready-email.png',
		heroPreview: '/partner-ready-email.png',
		heroBackground:
			'https://cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/hero-background-for-enterprise-370238?resMode=sharp2&op_usm=1.5,0.65,15,0&wid=1600&hei=680&qlt=85&fit=constrain',
		heroImage:
			'https://agentb-c5dggfbkhbb6gndk.z01.azurefd.net/agent-b-webapp-images/project-b-hero-image.png',
		featureCardBackground:
			'https://agentb-c5dggfbkhbb6gndk.z01.azurefd.net/agent-b-webapp-images/bg_4.png',
		featureSectionBackground:
			'https://cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/654350-AI-Usecases-Background-1600x1216?resMode=sharp2&op_usm=1.5,0.65,15,0&wid=1600&hei=920&qlt=85&fit=constrain',
		dashboardHero:
			'https://agentb-c5dggfbkhbb6gndk.z01.azurefd.net/agent-b-webapp-images/dashboard-hero.png',
		dashboardBackground:
			'https://agentb-c5dggfbkhbb6gndk.z01.azurefd.net/agent-b-webapp-images/dashboard-bg.png',
		featureBackground: '/dashboard-bg.png',
		proposalBackground: '/dashboard-bg.png',
		proposalSurface: '/partner-ready-email.png',
		landingFeatureOne:
			'https://agentb-c5dggfbkhbb6gndk.z01.azurefd.net/agent-b-webapp-images/Prioritize-your-renewal-opportunities.png',
		landingFeatureTwo:
			'https://agentb-c5dggfbkhbb6gndk.z01.azurefd.net/agent-b-webapp-images/Explore-all-AI-and-Security-options.png',
		landingFeatureThree:
			'https://agentb-c5dggfbkhbb6gndk.z01.azurefd.net/agent-b-webapp-images/03_Get a ready to send proposal.jpg',
		landingFeatureFour:
			'https://agentb-c5dggfbkhbb6gndk.z01.azurefd.net/agent-b-webapp-images/04_Activate distributors and resellers.jpg',
		dashboardHeroBanner:
			'https://cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/responsibleai-background-1600x640-767702?resMode=sharp2&op_usm=1.5,0.65,15,0&wid=2000&hei=800&qlt=100&fmt=png-alpha&fit=constrain',
		proposalPageBackground:
			'https://cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/ai-solutions-background?resMode=sharp2&op_usm=1.5,0.65,15,0&wid=3200&hei=1752&qlt=100&fit=constrain',
		proposalSummaryBanner:
			'https://cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/366640-Hero-Background%20image?resMode=sharp2&op_usm=1.5,0.65,15,0&wid=1600&hei=570&qlt=100&fmt=png-alpha&fit=constrain',
		proposalScenariosBackground:
			'https://cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/311650-bg-agents-at-microsoft?resMode=sharp2&op_usm=1.5,0.65,15,0&wid=2000&hei=1495&qlt=100&fit=constrain',
		proposalNextStepBanner:
			'https://cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/366640-next-step-media?resMode=sharp2&op_usm=1.5,0.65,15,0&wid=2656&hei=660&qlt=100&fmt=png-alpha&fit=constrain',
		proposalCardBackground:
			'https://cdn-dynmedia-1.microsoft.com/is/image/microsoftcorp/222900-Try%20copilot%20studio%20for%20free-1600x577?resMode=sharp2&op_usm=1.5,0.65,15,0&wid=2000&hei=817&qlt=100&fit=constrain',
	},

	content: {
		appName: 'Partner Uplift Planner and Proposal',
		tagline: 'Partner Uplift and Proposal Planning platform',
		heroDescription:
			'Discover upcoming renewals, explore AI and security options, understand partner profitability, and get a customized proactive proposal and customer bill of material',
		searchPlaceholder: 'Search customers, resellers, products...',

		metadata: {
			title: 'Partner Uplift Planner and Proposal',
			description: 'Partner Uplift and Proposal Planning platform',
			ogTitle: 'Partner Uplift Planner and Proposal',
			ogDescription: 'Partner Uplift and Proposal Planning platform',
		},

		landingFeatures: [
			{
				title: 'Prioritize your renewal opportunities',
				description:
					'Filter by customer, existing SKU, deal size, renewal date to find the opportunities that matter the most to you',
			},
			{
				title: 'Explore all AI and Security options',
				description:
					'Understand the customer value proposition of Copilot Business Bundles and Security SKUs, review incremental cost and calculate partner profitability based on your unique profile for each option',
			},
			{
				title: 'Get a ready-to-send, customized proposal',
				description:
					'Generate a proposal for your need with a customized flyer and an e-mail',
			},
			{
				title: 'Activate your distributors and resellers',
				description:
					'Download the list of renewals and send a password protected file to your distis and resellers, along with customized proposals for each option',
			},
		],

		resellerFeatures: [
			{
				title: 'Explore all AI and Security options',
				description:
					'Understand the customer value proposition of Copilot Business Bundles and Security SKUs, review incremental cost and calculate partner profitability based on your unique profile for each option',
			},
			{
				title: 'Get a ready-to-send, customized proposal',
				description:
					'Generate a proposal for your need with a customized flyer and an e-mail',
			},
			{
				title: 'Explore additional GTM resources',
				description:
					'Leverage these resources to develop skills, build pipeline, and drive deeper engagement with customers - deck, infographics, e-mail campaign, etc.',
			},
		],

		resellerHeroDescription:
			'Explore AI and security options for <300 seats from Microsoft, understand partner profitability, and get a customized proactive proposal and customer bill of material',

		dashboard: {
			heading: 'Discover your upcoming renewals',
			subheading:
				'Apply filters to surface the renewals that matter most to your business',
			discoverTabLabel: 'Discover Renewals',
			addedCustomersTabLabel: 'Added Customers',
			addCustomerButton: 'Add Customer',
			viewProposalLink: 'View Proposal',
			noMatchMessage: 'No customers match the selected filters.',
			emptyStateHeading: 'No New Customers Added Yet',
			emptyStateDescription:
				'Add net new customer to generate a personalized proactive proposal.',
		},

		demoDashboard: {
			heading: 'Discover your upcoming renewals',
			subheading:
				'Apply filters to surface the renewals that matter most to your business',
			disclaimer:
				'Disclaimer: All data on this page is synthetic and for demo purposes only.',
			discoverTabLabel: 'Discover Renewals',
			addedCustomersTabLabel: 'Added Customers',
			addCustomerButton: 'Add Customer',
			viewProposalLink: 'View Proposal',
			noMatchMessage: 'No customers match the current filters.',
			emptyStateHeading: 'No New Customers Added Yet',
			emptyStateDescription:
				'Add a net new customer to generate a personalized proactive proposal.',
		},

		resellerDashboard: {
			heading: 'Discover your Customer Opportunities',
			subheading:
				'Add new customers or apply filters to review the opportunities added by you or someone else from your organization',
			addCustomerButton: 'Add Customer',
			viewProposalLink: 'View Proposal',
			noMatchMessage: 'No customers match the selected filters.',
			emptyStateHeading: 'No Customers Added Yet',
			emptyStateDescription:
				'Add a customer to generate a personalized proactive proposal.',
		},
	},
};
