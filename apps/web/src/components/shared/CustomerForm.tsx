'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
	Button,
	Checkbox,
	Combobox,
	Field,
	Input,
	Option,
	Spinner,
} from '@fluentui/react-components';
import { ArrowRightRegular } from '@fluentui/react-icons';
import { CustomerRegion } from '@repo/types';
import {
	buildRegionalPricingContext,
	getRegionalStartingSkuMonthlyPrice,
	STARTING_SKUS,
} from '@/lib/rules-engine';

export interface CustomerFormData {
	partnerName: string;
	customerName: string;
	currentSku: string;
	numberOfSeats: number;
	costPerUser: number;
	region: CustomerRegion;
	renewalDate?: string;
}

interface CustomerFormProps {
	onSubmit: (data: CustomerFormData) => void;
	submitLabel?: string;
	loading?: boolean;
	hideDisclaimer?: boolean;
	hidePartnerName?: boolean;
	allowCostEdit?: boolean;
	showRenewalDate?: boolean;
}

const skuOptions = STARTING_SKUS.map((sku) => ({
	label: sku.name,
	value: sku.name,
}));

const HIDDEN_REGIONS: ReadonlySet<CustomerRegion> = new Set([
	CustomerRegion.CentralAndCaribbean,
	CustomerRegion.SpanishSouthAmerica,
]);
const regionOptions = Object.values(CustomerRegion).filter(
	(r) => !HIDDEN_REGIONS.has(r),
);

export function CustomerForm({
	onSubmit,
	submitLabel,
	loading = false,
	hideDisclaimer = false,
	hidePartnerName = false,
	allowCostEdit = false,
	showRenewalDate = false,
}: CustomerFormProps) {
	const t = useTranslations();
	const [partnerName, setPartnerName] = useState('');
	const [customerName, setCustomerName] = useState('');
	const [currentSku, setCurrentSku] = useState('');
	const [numberOfSeats, setNumberOfSeats] = useState('');
	const [costPerUser, setCostPerUser] = useState('');
	const [region, setRegion] = useState('');
	const [renewalDate, setRenewalDate] = useState('');
	const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

	const seatsNum = Number(numberOfSeats);
	const costNum = Number(costPerUser);
	const regionalPricingContext = buildRegionalPricingContext({
		region,
	});

	const selectedSku = STARTING_SKUS.find((s) => s.name === currentSku);
	const isKnownSku = selectedSku != null && selectedSku.id !== 'other';

	const isFormValid =
		(hidePartnerName || partnerName.trim() !== '') &&
		customerName.trim() !== '' &&
		currentSku !== '' &&
		numberOfSeats.trim() !== '' &&
		seatsNum > 0 &&
		seatsNum <= 300 &&
		costPerUser.trim() !== '' &&
		costNum > 0 &&
		region !== '' &&
		(hideDisclaimer || disclaimerAccepted);


	const handleSubmit = () => {
		if (!isFormValid) return;
		onSubmit({
			partnerName: partnerName.trim(),
			customerName: customerName.trim(),
			currentSku,
			numberOfSeats: seatsNum,
			costPerUser: costNum,
			region: region as CustomerRegion,
			...(showRenewalDate && renewalDate ? { renewalDate } : {}),
		});
	};

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
			{!hidePartnerName && (
				<Field label={t('forms.partnerName')} required>
					<Input
						appearance="outline"
						placeholder={t('forms.partnerNamePlaceholder')}
						value={partnerName}
						onChange={(_, data) => setPartnerName(data.value)}
					/>
				</Field>
			)}

			<Field label={t('table.customerName')} required>
				<Input
					appearance="outline"
					placeholder={t('forms.customerNameExample')}
					value={customerName}
					onChange={(_, data) => setCustomerName(data.value)}
				/>
			</Field>

			<Field label={t('forms.currentSku')} className={hidePartnerName ? '' : 'sm:col-span-2'} required>
				<Combobox
					appearance="outline"
					placeholder={t('forms.selectSku')}
					value={currentSku}
					onOptionSelect={(_, data) => {
						const name = data.optionText ?? '';
						setCurrentSku(name);
						const sku = STARTING_SKUS.find((s) => s.name === name);
						if (sku && sku.id !== 'other') {
							const regionalPrice = getRegionalStartingSkuMonthlyPrice({
								startingSkuId: sku.id,
								region,
							});
							setCostPerUser(String(regionalPrice ?? sku.monthlyPrice));
						} else {
							setCostPerUser('');
						}
					}}
				>
					{skuOptions.map((opt) => (
						<Option key={opt.value}>{opt.label}</Option>
					))}
				</Combobox>
			</Field>

			<Field label={t('forms.region')} className={hidePartnerName ? '' : 'sm:col-span-2'} required>
				<Combobox
					appearance="outline"
					placeholder={t('forms.selectRegion')}
					value={region}
					onOptionSelect={(_, data) => {
						const nextRegion = data.optionText ?? '';
						setRegion(nextRegion);

						const sku = STARTING_SKUS.find((s) => s.name === currentSku);
						if (sku && sku.id !== 'other') {
							const regionalPrice = getRegionalStartingSkuMonthlyPrice({
								startingSkuId: sku.id,
								region: nextRegion,
							});
							setCostPerUser(String(regionalPrice ?? sku.monthlyPrice));
						}
					}}
				>
					{regionOptions.map((r) => (
						<Option key={r}>{r}</Option>
					))}
				</Combobox>
			</Field>

			<Field label={t('forms.numberOfSeats')} required>
				<Input
					appearance="outline"
					type="number"
					placeholder={t('forms.seatsExample')}
					min={1}
					max={300}
					value={numberOfSeats}
					onChange={(_, data) => {
						const num = Number(data.value);
						if (data.value !== '' && num > 300) {
							setNumberOfSeats('300');
						} else {
							setNumberOfSeats(data.value);
						}
					}}
				/>
			</Field>

			{showRenewalDate && (
				<Field label={t('forms.renewalDate')}>
					<Input
						appearance="outline"
						type="date"
						value={renewalDate}
						onChange={(_, data) => setRenewalDate(data.value)}
					/>
				</Field>
			)}

			<Field label={t('forms.costPerUserPerMonth')} required>
				<Input
					appearance="outline"
					type="number"
					placeholder={isKnownSku && !allowCostEdit ? 'Auto-filled from SKU' : 'e.g. 12.50'}
					contentBefore={
						<span>{regionalPricingContext.currencySymbol ?? '$'}</span>
					}
					disabled={isKnownSku && !allowCostEdit}
					value={costPerUser}
					onChange={(_, data) => setCostPerUser(data.value)}
				/>
			</Field>
			<div className="pt-2 col-span-2 flex justify-end">
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
					className="w-fit flex items-center justify-center gap-2 sm:col-span-2"
					style={{
						padding: '10px 16px',
					}}
				>
					{submitLabel ?? t('forms.exploreAiSecurity')}
				</Button>
			</div>
		</div>
	);
}
