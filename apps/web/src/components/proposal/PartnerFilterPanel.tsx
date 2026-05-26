'use client';

import { useTranslations } from 'next-intl';
import {
	Label,
	RadioGroup,
	Radio,
	Button,
	Accordion,
	AccordionItem,
	AccordionHeader,
	AccordionPanel,
} from '@fluentui/react-components';
import { LinkRegular } from '@fluentui/react-icons';

export interface PartnerFilters {
	partnerType: string;
	hasSolutionPartnerDesignation: boolean;
	hasOver25Points: boolean;
	isCopilotJumpstart: boolean;
	fundedEngagement: string;
	isNewCustomerIncentive: boolean;
}

export const DEFAULT_PARTNER_FILTERS: PartnerFilters = {
	partnerType: 'CSP Direct',
	hasSolutionPartnerDesignation: true,
	hasOver25Points: true,
	isCopilotJumpstart: true,
	fundedEngagement: 'ECIF',
	isNewCustomerIncentive: false,
};

interface PartnerFilterPanelProps {
	value: PartnerFilters;
	onChange: (filters: PartnerFilters) => void;
}

export function PartnerFilterPanel({
	value,
	onChange,
}: PartnerFilterPanelProps) {
	const t = useTranslations('proposal.partnerFilter');
	const update = (patch: Partial<PartnerFilters>) =>
		onChange({ ...value, ...patch });

	return (
		<Accordion defaultOpenItems={['partner-profile']} collapsible>
			<AccordionItem value="partner-profile">
				<AccordionHeader expandIconPosition="end">
					<div>
						<h3 className="m-0 font-ds-display text-base font-medium">
							{t('heading')}
						</h3>
						<p className="mt-0 font-ds-text text-xs font-normal text-gray-500">
							{t('subheading')}
						</p>
					</div>
				</AccordionHeader>
				<AccordionPanel>
					<div className="grid grid-cols-2 gap-x-8 gap-y-4 mt-4">
						{/* Column 1: Type of Partner */}
						<div className="flex flex-col gap-1">
							<Label required className="font-ds-text text-xs font-normal">
								{t('typeOfPartner')}
							</Label>
							<RadioGroup
								layout="horizontal"
								value={value.partnerType}
								onChange={(_e, data) =>
									update({
										partnerType:
											data.value === 'CSP Direct'
												? 'CSP Direct'
												: 'CSP Indirect',
									})
								}
							>
								<Radio value="CSP Direct" label="CSP Direct" />
								<Radio value="CSP Indirect" label="CSP Indirect" />
							</RadioGroup>
						</div>

						{/* Column 2: Conditional designation radio */}
						<div className="flex flex-col gap-1 border-l border-gray-200 pl-4">
							{value.partnerType === 'CSP Direct' && (
								<>
									<Label required className="font-ds-text text-xs font-normal">
										{t('solutionPartnerDesignation')}
									</Label>
									<RadioGroup
										layout="horizontal"
										value={value.hasSolutionPartnerDesignation ? 'yes' : 'no'}
										onChange={(_e, data) =>
											update({
												hasSolutionPartnerDesignation: data.value === 'yes',
											})
										}
									>
										<Radio value="yes" label="Yes" />
										<Radio value="no" label="No" />
									</RadioGroup>
								</>
							)}
							{value.partnerType === 'CSP Indirect' && (
								<>
									<Label required className="font-ds-text text-xs font-normal">
										Does the Partner have greater than 25 points in any Solution
										Partner Designation?
									</Label>
									<RadioGroup
										layout="horizontal"
										value={value.hasOver25Points ? 'yes' : 'no'}
										onChange={(_e, data) =>
											update({ hasOver25Points: data.value === 'yes' })
										}
									>
										<Radio value="yes" label="Yes" />
										<Radio value="no" label="No" />
									</RadioGroup>
								</>
							)}
						</div>

						{/* Full-width row: Reference Material */}
						<div className="col-span-2 flex flex-wrap items-center gap-4 border-t border-gray-200 pt-4">
							<span className="text-sm font-medium">
								{t('referenceMaterial')}
							</span>
							<Button
								as="a"
								href="https://microsoftpartners.microsoft.com/Downloads/?filename=abs/protected/Copilot-Business-Partner-Economics-Update.pptx"
								target="_blank"
								rel="noopener noreferrer"
								icon={<LinkRegular className="size-4" />}
								iconPosition="before"
								appearance="outline"
								className="w-fit! justify-start! hover:text-(--ds-color-violet-500)!"
							>
								Copilot Business Partner Economics
							</Button>
							<Button
								as="a"
								href="https://gtmresources.blob.core.windows.net/msft/Partner-Economics_Security-SMB-Suite.pdf"
								target="_blank"
								rel="noopener noreferrer"
								icon={<LinkRegular className="size-4" />}
								iconPosition="before"
								appearance="outline"
								className="w-fit! justify-start! hover:text-(--ds-color-violet-500)!"
							>
								Security Partner Economics
							</Button>
						</div>
					</div>
				</AccordionPanel>
			</AccordionItem>
		</Accordion>
	);
}
