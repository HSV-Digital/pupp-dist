'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Spinner } from '@fluentui/react-components';
import {
	CheckmarkCircle24Filled,
	DismissCircle24Filled,
} from '@fluentui/react-icons';

interface PartnerProfile {
	partnerName: string;
	partnerId: string;
	country?: string;
	city?: string;
}

export function PartnerVerificationCard() {
	const t = useTranslations();
	const [loading, setLoading] = useState(true);
	const [profile, setProfile] = useState<PartnerProfile | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleVerify = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const res = await fetch('/api/reseller/verify-partner');
			const data = await res.json();

			if (data.verified) {
				setProfile(data.profile);
			} else {
				setError(data.error || 'Verification failed');
			}
		} catch {
			setError(t('auth.partnerVerifyError'));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		handleVerify();
	}, [handleVerify]);

	if (loading) {
		return (
			<div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4">
				<Spinner size="small" />
				<p className="m-0 text-sm text-gray-600">
					Verifying partner status...
				</p>
			</div>
		);
	}

	if (profile) {
		return (
			<div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-5 py-4">
				<CheckmarkCircle24Filled className="mt-0.5 shrink-0 text-green-600" />
				<div>
					<p className="m-0 text-sm font-semibold text-green-800">
						Verified Microsoft Partner
					</p>
					<p className="m-0 mt-1 text-sm text-gray-700">
						{profile.partnerName}
					</p>
					<p className="m-0 mt-0.5 text-xs text-gray-500">
						Partner ID: {profile.partnerId}
						{profile.city && profile.country
							? ` · ${profile.city}, ${profile.country}`
							: profile.country
								? ` · ${profile.country}`
								: ''}
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-5 py-4">
				<div className="flex items-start gap-3">
					<DismissCircle24Filled className="mt-0.5 shrink-0 text-red-500" />
					<div>
						<p className="m-0 text-sm font-semibold text-red-800">
							Partner verification failed
						</p>
						<p className="m-0 mt-1 text-sm text-gray-600">{error}</p>
					</div>
				</div>
				<Button
					appearance="secondary"
					size="small"
					onClick={handleVerify}
					disabled={loading}
					className="self-start"
				>
					Try Again
				</Button>
			</div>
		);
	}

	return null;
}
