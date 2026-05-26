'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { motion, type Variants } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
	Button,
	Checkbox,
	Dialog,
	DialogBody,
	DialogContent,
	DialogSurface,
	DialogTitle,
	DialogTrigger,
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import {
	FeatureCardsSection,
	useResellerFeatures,
} from '@/components/resellers/FeatureCards';
import { getThemeConfig } from '@/lib/theme-config';
import {
	CustomerForm,
	type CustomerFormData,
} from '@/components/shared/CustomerForm';
import { writeGuestCustomer } from '@/lib/guest-customer-session';
import { captureProposalStarted } from '@/lib/posthog-product-events';
import { FooterMessage } from '@/components/shared/FooterMessage';

const containerVariants: Variants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.15,
			delayChildren: 0.2,
		},
	},
};

const itemVariants: Variants = {
	hidden: { opacity: 0, y: 20, filter: 'blur(10px)' },
	visible: {
		opacity: 1,
		y: 0,
		filter: 'blur(0px)',
		transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
	},
};

const imageVariants: Variants = {
	hidden: { opacity: 0, scale: 0.95, y: 40, filter: 'blur(10px)' },
	visible: {
		opacity: 1,
		scale: 1,
		y: 0,
		filter: 'blur(0px)',
		transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
	},
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
	no_mpn_access:
		'Please contact your administrator to get access to Partner Center. Currently you cannot access this application.',
	generic_email:
		'Sign-in with generic email domains is not allowed. Please use your organization email.',
};

export default function ResellersHero() {
	const t = useTranslations();
	const router = useRouter();
	const searchParams = useSearchParams();
	const authError = searchParams.get('error');
	const features = useResellerFeatures();
	const [showDemoModal, setShowDemoModal] = useState(false);
	const [agreed, setAgreed] = useState(false);
	const [signingIn, setSigningIn] = useState(false);
	const [otpActive, setOtpActive] = useState(false);
	const isSigningIn = signingIn && !authError;

	const handleDemoSubmit = useCallback(
		(formData: CustomerFormData) => {
			const customerId = crypto.randomUUID();
			const resellerData = { customerId, ...formData };
			writeGuestCustomer(resellerData);
			captureProposalStarted({
				entrySurface: 'reseller-hero',
				customerId,
				selectedScenarioCount: 0,
				isDemo: false,
			});
			setShowDemoModal(false);
			router.push(`/csp-partners/guest/proposal/${customerId}`);
		},
		[router],
	);

	return (
		<main className="overflow-x-clip">
			<section
				className="bg-cover bg-center min-h-screen"
				style={{
					backgroundImage: `url("${getThemeConfig().assets.heroBackground}")`,
				}}
			>
				<div className="py-12 md:py-20 lg:py-24">
					<motion.div
						className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-6 lg:grid-cols-2 lg:gap-12"
						variants={containerVariants}
						initial={false}
						animate="visible"
					>
						<motion.div
							className="mx-auto max-w-2xl flex flex-col h-full justify-center gap-4 lg:mx-0 lg:text-left"
							variants={containerVariants}
						>
							<div className="flex flex-col gap-4">
								<motion.h1
									className={`mt-0 max-w-3xl font-ds-display text-balance text-4xl font-medium md:text-5xl xl:text-6xl ${getThemeConfig().styles.heroTextClass}`}
									variants={itemVariants}
								>
									{getThemeConfig().content.tagline}
								</motion.h1>
								<motion.p
									className={`mt-8 max-w-2xl text-pretty text-base ${getThemeConfig().styles.heroTextClass}`}
									variants={itemVariants}
								>
									{t('landing.resellerHeroDescription')}
								</motion.p>
							</div>

							<motion.div
								className="mt-12 rounded-2xl p-2 bg-white/50 backdrop-blur-[80px]"
								variants={itemVariants}
							>
								<div className="bg-white rounded-xl p-6">
									<h2 className="text-2xl font-semibold text-gray-800 mb-4">
										{t('auth.signInNow')}
									</h2>
									{authError && AUTH_ERROR_MESSAGES[authError] && (
										<div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
											{AUTH_ERROR_MESSAGES[authError]}
										</div>
									)}
									<div className="flex flex-col gap-4">
										{!otpActive && (
											<p className="text-xs text-gray-700 leading-relaxed">
												{t('auth.consentNotice')}{' '}
												{t.rich('auth.consentReferences', {
													privacy: () => (
														<a
															href="https://www.microsoft.com/en-us/privacy/privacystatement"
															target="_blank"
															rel="noopener noreferrer"
															className="text-[#0567b9] underline"
														>
															Privacy Policy
														</a>
													),
													terms: () => (
														<a
															href="/terms-of-use"
															target="_blank"
															rel="noopener noreferrer"
															className="text-[#0567b9] underline"
														>
															Terms of Use
														</a>
													),
												})}
											</p>
										)}
										{!otpActive && (
											<p className="text-xs text-gray-700 leading-relaxed">
												{t('auth.toolPurpose')}
											</p>
										)}
										{!otpActive && (
											<label className="flex items-center gap-2 cursor-pointer self-start">
												<Checkbox
													checked={agreed}
													onChange={(_e, data) =>
														setAgreed(data.checked === true)
													}
													style={{ margin: 0 }}
													indicator={{ style: { margin: 0 } }}
												/>
												<span className="text-xs font-medium text-gray-800 select-none">
													{t('auth.acknowledgeTerms')}
												</span>
											</label>
										)}
										{!otpActive && (
											<>
												<button
													type="button"
													disabled={!agreed || isSigningIn}
													onClick={() => {
														if (!agreed || isSigningIn) return;
														setSigningIn(true);
														window.location.href = '/api/reseller/auth/start';
													}}
													className={`inline-flex items-center justify-center gap-2 rounded-md border-0 px-4 py-2 text-sm font-medium text-white no-underline transition-colors w-fit ${agreed && !isSigningIn ? 'bg-[#2F2F2F] hover:bg-[#1a1a1a] cursor-pointer' : 'bg-gray-500 cursor-not-allowed'}`}
													aria-disabled={!agreed || isSigningIn}
												>
													{isSigningIn ? (
														<>
															<svg
																className="animate-spin"
																xmlns="http://www.w3.org/2000/svg"
																width="16"
																height="16"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																strokeWidth="2"
															>
																<path d="M21 12a9 9 0 1 1-6.219-8.56" />
															</svg>
															Signing in...
														</>
													) : (
														<>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																width="16"
																height="16"
																viewBox="0 0 23 23"
																fill="none"
															>
																<path fill="#f35325" d="M1 1h10v10H1z" />
																<path fill="#81bc06" d="M12 1h10v10H12z" />
																<path fill="#05a6f0" d="M1 12h10v10H1z" />
																<path fill="#ffba08" d="M12 12h10v10H12z" />
															</svg>
															{t('auth.signInUsingWorkEmail')}
														</>
													)}
												</button>
												<p className="text-red-500 text-xs">
													{t('auth.adminConsentNote')}
												</p>
											</>
										)}
									</div>
								</div>
							</motion.div>
						</motion.div>
						<motion.div
							className="w-[1220px] rounded-2xl p-2 bg-white/50 backdrop-blur-[80px] hidden lg:block"
							variants={imageVariants}
						>
							<Image
								src={getThemeConfig().assets.heroImage}
								alt={t('branding.proposalDashboardAlt')}
								width={1920}
								height={1080}
								className="rounded-xl"
								priority
							/>
						</motion.div>
					</motion.div>
				</div>
			</section>
			<FeatureCardsSection features={features} />
			<FooterMessage />

			<Dialog
				open={showDemoModal}
				onOpenChange={(_e, data) => setShowDemoModal(data.open)}
			>
				<DialogSurface className="max-w-lg!">
					<DialogBody>
						<DialogTitle
							className="mb-3!"
							action={
								<DialogTrigger action="close">
									<Button
										appearance="subtle"
										aria-label={t('common.close')}
										icon={<Dismiss24Regular />}
									/>
								</DialogTrigger>
							}
						>
							Generate Proposals for single customer
						</DialogTitle>
						<DialogContent>
							<CustomerForm onSubmit={handleDemoSubmit} hideDisclaimer />
						</DialogContent>
					</DialogBody>
				</DialogSurface>
			</Dialog>
		</main>
	);
}
