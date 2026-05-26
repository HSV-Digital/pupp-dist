'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getThemeConfig } from '@/lib/theme-config';

export interface Feature {
	title: string;
	description: string;
	image: string;
}

const LANDING_IMAGE_KEYS = [
	'landingFeatureOne',
	'landingFeatureTwo',
	'landingFeatureThree',
	'landingFeatureFour',
] as const;

const RESELLER_IMAGE_KEYS = [
	'landingFeatureTwo',
	'landingFeatureThree',
	'landingFeatureThree',
] as const;

const LANDING_FEATURE_KEYS = [
	'prioritizeRenewals',
	'exploreAiSecurity',
	'readyToSendProposal',
	'activateDistributors',
] as const;

const RESELLER_FEATURE_KEYS = [
	'exploreAiSecurity',
	'readyToSendProposal',
	'exploreGtmResources',
] as const;

function getLandingFeatures(): Feature[] {
	const theme = getThemeConfig();
	return theme.content.landingFeatures.map((f, i) => ({
		title: f.title,
		description: f.description,
		image: theme.assets[LANDING_IMAGE_KEYS[i] ?? 'landingFeatureOne'],
	}));
}

function getResellerFeatures(): Feature[] {
	const theme = getThemeConfig();
	return theme.content.resellerFeatures.map((f, i) => ({
		title: f.title,
		description: f.description,
		image: theme.assets[RESELLER_IMAGE_KEYS[i] ?? 'landingFeatureTwo'],
	}));
}

export function useLandingFeatures(): Feature[] {
	const t = useTranslations('landing.features');
	const theme = getThemeConfig();
	return LANDING_FEATURE_KEYS.map((key, i) => ({
		title: t(`${key}Title`),
		description: t(`${key}Description`),
		image: theme.assets[LANDING_IMAGE_KEYS[i] ?? 'landingFeatureOne'],
	}));
}

export function useResellerFeatures(): Feature[] {
	const t = useTranslations('landing.features');
	const theme = getThemeConfig();
	return RESELLER_FEATURE_KEYS.map((key, i) => ({
		title: t(`${key}Title`),
		description: t(`${key}Description`),
		image: theme.assets[RESELLER_IMAGE_KEYS[i] ?? 'landingFeatureTwo'],
	}));
}

// Keep static exports for backward compatibility
export const LANDING_FEATURES: Feature[] = getLandingFeatures();
export const RESELLER_FEATURES: Feature[] = getResellerFeatures();

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
	const isReversed = index % 2 === 1;
	const theme = getThemeConfig();

	return (
		<article className="rounded-4xl bg-white/55 p-1.5 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)] backdrop-blur-[80px]">
			<div className="grid overflow-hidden rounded-3xl bg-white md:grid-cols-5">
				<div
					data-slot="text"
					className={`flex items-center justify-center px-6 py-10 text-center md:col-span-2 md:row-start-1 md:px-12 md:py-14 lg:px-16 ${isReversed ? 'md:col-start-4' : 'md:col-start-1'}`}
				>
					<div className="mx-auto max-w-xl">
						<h3 className="text-balance text-3xl font-semibold text-gray-950 md:text-4xl lg:text-[2.75rem]">
							{feature.title}
						</h3>
						<p className="mt-5 text-pretty text-base leading-7 text-gray-600 md:text-lg">
							{feature.description}
						</p>
					</div>
				</div>
				<div
					data-slot="image"
					className={`flex min-h-[320px] items-center justify-center bg-cover bg-center p-4 sm:p-6 md:col-span-3 md:row-start-1 md:min-h-[420px] md:p-8 lg:min-h-[540px] lg:p-10 ${isReversed ? 'md:col-start-1' : 'md:col-start-3'}`}
					style={{
						backgroundImage: `url('${theme.assets.featureCardBackground}')`,
					}}
				>
					<div className="flex w-full max-w-2xl items-center justify-center rounded-3xl bg-white/55 p-1 shadow-[0_20px_60px_-32px_rgba(15,23,42,0.45)] backdrop-blur-[80px] md:p-1.5">
						<Image
							src={feature.image}
							alt={feature.title}
							width={800}
							height={500}
							className="h-auto w-full rounded-2xl object-cover"
						/>
					</div>
				</div>
			</div>
		</article>
	);
}

export function FeatureCardsSection({ features }: { features: Feature[] }) {
	const theme = getThemeConfig();

	return (
		<section
			className="bg-cover bg-center py-16 md:py-24 lg:py-28"
			style={{
				backgroundImage: `url('${theme.assets.featureSectionBackground}')`,
			}}
		>
			<div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 lg:gap-10">
				{features.map((feature, index) => (
					<FeatureCard key={feature.title} feature={feature} index={index} />
				))}
			</div>
		</section>
	);
}
