import type { ImgHTMLAttributes } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
	FeatureCardsSection,
	LANDING_FEATURES,
	RESELLER_FEATURES,
} from './FeatureCards';

vi.mock('next/image', () => ({
	default: (props: ImgHTMLAttributes<HTMLImageElement> & { src: string }) => (
		// eslint-disable-next-line @next/next/no-img-element
		<img {...props} alt={props.alt} src={props.src} />
	),
}));

const { mockTheme } = vi.hoisted(() => ({
	mockTheme: {
		assets: {
			featureCardBackground: '/feature-card-bg.png',
			featureSectionBackground: '/feature-section-bg.png',
			landingFeatureOne: '/landing-1.png',
			landingFeatureTwo: '/landing-2.png',
			landingFeatureThree: '/landing-3.png',
			landingFeatureFour: '/landing-4.png',
		},
		content: {
			landingFeatures: [
				{
					title: 'Prioritize your renewal opportunities',
					description:
						'Filter by customer, existing SKU, deal size, renewal date to find the opportunities that matter the most to you',
				},
				{
					title: 'Explore all AI and Security options',
					description:
						'Understand the customer value proposition of Copilot Business Bundles and Security SKUs',
				},
				{
					title: 'Get a ready-to-send, customized proposal',
					description:
						'Generate a proposal for your need with a customized flyer and an e-mail',
				},
				{
					title: 'Activate your distributors and resellers',
					description:
						'Download the list of renewals and send a password protected file to your distis and resellers',
				},
			],
			resellerFeatures: [
				{
					title: 'Explore all AI and Security options',
					description:
						'Understand the customer value proposition of Copilot Business Bundles and Security SKUs',
				},
				{
					title: 'Get a ready-to-send, customized proposal',
					description:
						'Generate a proposal for your need with a customized flyer and an e-mail',
				},
				{
					title: 'Explore additional GTM resources',
					description:
						'Leverage these resources to develop skills, build pipeline, and drive deeper engagement with customers',
				},
			],
		},
	},
}));

vi.mock('@/lib/theme-config', () => ({
	getThemeConfig: () => mockTheme,
}));

describe('FeatureCardsSection', () => {
	it('renders landing features as centered alternating cards without icons', () => {
		const { container } = render(
			<FeatureCardsSection features={LANDING_FEATURES} />,
		);
		const cards = Array.from(container.querySelectorAll('article'));

		expect(cards).toHaveLength(4);
		expect(
			screen.getByRole('heading', {
				name: 'Prioritize your renewal opportunities',
			}),
		).toBeInTheDocument();
		expect(
			screen.getByText(/Filter by customer, existing SKU, deal size, renewal date/i),
		).toBeInTheDocument();
		expect(container.querySelector('svg')).not.toBeInTheDocument();

		const firstTextSlot = cards[0]?.querySelector('[data-slot="text"]');
		const firstImageSlot = cards[0]?.querySelector('[data-slot="image"]');
		const secondTextSlot = cards[1]?.querySelector('[data-slot="text"]');
		const secondImageSlot = cards[1]?.querySelector('[data-slot="image"]');

		expect(firstTextSlot?.className).toContain('text-center');
		expect(firstTextSlot?.className).toContain('md:col-span-2');
		expect(firstTextSlot?.className).toContain('md:col-start-1');
		expect(firstTextSlot?.className).toContain('md:row-start-1');
		expect(firstImageSlot?.className).toContain('md:col-span-3');
		expect(firstImageSlot?.className).toContain('md:col-start-3');
		expect(firstImageSlot?.className).toContain('md:row-start-1');
		expect(secondTextSlot?.className).toContain('text-center');
		expect(secondTextSlot?.className).toContain('md:col-span-2');
		expect(secondTextSlot?.className).toContain('md:col-start-4');
		expect(secondTextSlot?.className).toContain('md:row-start-1');
		expect(secondImageSlot?.className).toContain('md:col-span-3');
		expect(secondImageSlot?.className).toContain('md:col-start-1');
		expect(secondImageSlot?.className).toContain('md:row-start-1');
	});

	it('renders reseller features as three cards using the shared layout', () => {
		const { container } = render(
			<FeatureCardsSection features={RESELLER_FEATURES} />,
		);

		expect(container.querySelectorAll('article')).toHaveLength(3);
		expect(
			screen.getByRole('heading', {
				name: 'Explore additional GTM resources',
			}),
		).toBeInTheDocument();
		expect(
			screen.getAllByRole('img').map((image) => image.getAttribute('alt')),
		).toEqual([
			'Explore all AI and Security options',
			'Get a ready-to-send, customized proposal',
			'Explore additional GTM resources',
		]);
	});
});
