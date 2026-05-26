'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
	Button,
	Combobox,
	Field,
	Input,
	Option,
	Spinner,
} from '@fluentui/react-components';
import { ArrowRightRegular } from '@fluentui/react-icons';
import { CustomerRegion } from '@repo/types';
import { STARTING_SKUS } from '@/lib/rules-engine';

export interface ResellerCustomerFormData {
	customerTpid: string;
	customerName: string;
	countryName: string;
	renewalDate: string;
	subscriptionName: string;
	licenseCount: number;
}

interface ResellerCustomerFormProps {
	onSubmit: (data: ResellerCustomerFormData) => void;
	submitLabel?: string;
	loading?: boolean;
}

const skuOptions = STARTING_SKUS.map((sku) => sku.name);
const HIDDEN_REGIONS: ReadonlySet<CustomerRegion> = new Set([
	CustomerRegion.CentralAndCaribbean,
	CustomerRegion.SpanishSouthAmerica,
]);
const regionOptions = Object.values(CustomerRegion).filter(
	(r) => !HIDDEN_REGIONS.has(r),
);

export function ResellerCustomerForm({
	onSubmit,
	submitLabel,
	loading = false,
}: ResellerCustomerFormProps) {
	const t = useTranslations();
	const resolvedSubmitLabel = submitLabel ?? t('common.addCustomer');
	const [customerTpid, setCustomerTpid] = useState('');
	const [customerName, setCustomerName] = useState('');
	const [countryName, setCountryName] = useState('');
	const [renewalDate, setRenewalDate] = useState('');
	const [subscriptionName, setSubscriptionName] = useState('');
	const [licenseCount, setLicenseCount] = useState('');

	const isFormValid =
		customerName.trim() !== '' &&
		countryName !== '';

	const handleSubmit = () => {
		if (!isFormValid) return;
		onSubmit({
			customerTpid: customerTpid.trim(),
			customerName: customerName.trim(),
			countryName,
			renewalDate,
			subscriptionName,
			licenseCount: licenseCount ? Number(licenseCount) : 0,
		});
	};

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
			<Field label={t('table.customerName')} required>
				<Input
					appearance="outline"
					placeholder={t('forms.customerNameExample')}
					value={customerName}
					onChange={(_, data) => setCustomerName(data.value)}
				/>
			</Field>

			<Field label={t('forms.customerTpid')}>
				<Input
					appearance="outline"
					type="number"
					placeholder={t('forms.tpidExample')}
					value={customerTpid}
					onChange={(_, data) => setCustomerTpid(data.value)}
				/>
			</Field>

			<Field label={t('forms.countryName')} required>
				<Combobox
					appearance="outline"
					placeholder={t('forms.selectCountry')}
					value={countryName}
					onOptionSelect={(_, data) => setCountryName(data.optionText ?? '')}
				>
					{regionOptions.map((r) => (
						<Option key={r}>{r}</Option>
					))}
				</Combobox>
			</Field>

			<Field label={t('forms.renewalDate')}>
				<Input
					appearance="outline"
					type="date"
					value={renewalDate}
					onChange={(_, data) => setRenewalDate(data.value)}
				/>
			</Field>

			<Field label={t('forms.subscription')}>
				<Combobox
					appearance="outline"
					placeholder={t('forms.selectSubscription')}
					value={subscriptionName}
					onOptionSelect={(_, data) => setSubscriptionName(data.optionText ?? '')}
				>
					{skuOptions.map((opt) => (
						<Option key={opt}>{opt}</Option>
					))}
				</Combobox>
			</Field>

			<Field label={t('forms.licenseCount')}>
				<Input
					appearance="outline"
					type="number"
					placeholder={t('forms.licenseCountExample')}
					min={0}
					max={300}
					value={licenseCount}
					onChange={(_, data) => {
						const raw = data.value;
						if (raw === '') {
							setLicenseCount('');
							return;
						}
						const n = Number(raw);
						if (!Number.isFinite(n)) return;
						const clamped = Math.max(0, Math.min(300, Math.floor(n)));
						setLicenseCount(String(clamped));
					}}
				/>
			</Field>

			<div className="pt-2 sm:col-span-2 flex justify-end">
				<Button
					appearance="primary"
					size="medium"
					icon={
						loading ? (
							<Spinner size="tiny" />
						) : (
							<ArrowRightRegular className="size-4" />
						)
					}
					iconPosition="after"
					disabled={loading || !isFormValid}
					onClick={handleSubmit}
					className="w-fit"
					style={{ padding: '8px 16px' }}
				>
					{resolvedSubmitLabel}
				</Button>
			</div>
		</div>
	);
}
