'use client';

import { useTranslations } from 'next-intl';
import { getThemeConfig } from '@/lib/theme-config';

interface Step {
	id: string;
	title: string;
	description: string;
}

interface ProposalStepsProps {
	isNewCustomer?: boolean;
}

export function ProposalSteps({ isNewCustomer = false }: ProposalStepsProps) {
	const t = useTranslations('proposal.steps');

	const STEPS: Step[] = [
		{
			id: 'editPartnerProfile',
			title: t('editPartnerProfile'),
			description: t('editPartnerProfileDescription'),
		},
		{
			id: 'selectSubscription',
			title: t('selectSubscription'),
			description: t('selectSubscriptionDescription'),
		},
		{
			id: 'selectProposal',
			title: t('selectProposal'),
			description: t('selectProposalDescription'),
		},
		{
			id: 'editSeats',
			title: t('editSeats'),
			description: t('editSeatsDescription'),
		},
		{
			id: 'generateProposal',
			title: 'Generate proposal',
			description: t('consolidatedDescription'),
		},
	];

	const visibleSteps = isNewCustomer
		? STEPS.filter((step) => step.id !== 'selectSubscription')
		: STEPS;

	return (
		<nav
			aria-label="Proposal workflow steps"
			className="p-6 rounded-b-xl bg-cover bg-bottom bg-no-repeat"
			style={{ backgroundImage: `url('${getThemeConfig().assets.dashboardHeroBanner}')` }}
		>
			<div className="bg-white/50 backdrop-blur-md rounded-xl px-2 py-8">
				<div
					className={`grid ${isNewCustomer ? 'grid-cols-4' : 'grid-cols-5'}`}
				>
					{visibleSteps.map((step, index) => (
						<div key={step.id} className="col-span-1 px-6 z-10 relative">
							{/* Step column: circle + text */}
							<div className="flex flex-col items-center text-center">
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--ds-color-violet-500) font-ds-display text-sm font-semibold text-white">
									{index + 1}
								</div>
								<p className="m-0 mt-1.5 font-ds-display text-base font-semibold text-(--ds-color-violet-900)">
									{step.title}
								</p>
								<p className="m-0 mt-0.5 font-ds-text text-xs leading-snug text-gray-800">
									{step.description}
								</p>
							</div>
							{index < visibleSteps.length - 1 && (
								<div
									className={`absolute top-4 z-0 border-t-2 border-dashed border-(--ds-color-violet-300) ${isNewCustomer ? 'left-47 -right-36' : 'left-39 -right-[110px]'}`}
								/>
							)}
						</div>
					))}
				</div>
			</div>
		</nav>
	);
}
