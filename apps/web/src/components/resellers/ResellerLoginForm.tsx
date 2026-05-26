'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Input, Label } from '@fluentui/react-components';
import { cspPartnerPublicApiFetch } from '@/lib/api-client';

type Step = 'email' | 'otp';

export function ResellerLoginForm({ hideDisclaimer = false, externalAgreed, onStepChange }: { hideDisclaimer?: boolean; externalAgreed?: boolean; onStepChange?: (step: 'email' | 'otp') => void } = {}) {
	const router = useRouter();
	const [step, setStep] = useState<Step>('email');
	const [email, setEmail] = useState('');
	const [otpCode, setOtpCode] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [resendCooldown, setResendCooldown] = useState(0);
	const [internalAgreed, setAgreed] = useState(false);
	const agreed = externalAgreed ?? internalAgreed;

	useEffect(() => {
		if (resendCooldown <= 0) return;
		const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
		return () => clearTimeout(timer);
	}, [resendCooldown]);

	const handleRequestOtp = useCallback(async () => {
		if (!email.trim()) {
			setError('Please enter your email address.');
			return;
		}

		setLoading(true);
		setError('');

		try {
			const response = await cspPartnerPublicApiFetch('/api/reseller/auth/otp/request', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: email.trim() }),
			});

			if (!response.ok) {
				const body = await response.json().catch(() => null);
				const message =
					body?.message || 'Failed to send verification code.';
				setError(message);
				return;
			}

			setStep('otp');
			onStepChange?.('otp');
			setResendCooldown(60);
		} catch {
			setError('Unable to send verification code. Please try again.');
		} finally {
			setLoading(false);
		}
	}, [email]);

	const handleVerifyOtp = useCallback(async () => {
		if (!otpCode.trim()) {
			setError('Please enter the verification code.');
			return;
		}

		setLoading(true);
		setError('');

		try {
			const csrfRes = await fetch('/api/reseller/auth/csrf');
			const { csrfToken } = await csrfRes.json();

			const res = await fetch('/api/reseller/auth/callback/reseller-otp', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					email: email.trim(),
					code: otpCode.trim(),
					csrfToken,
					callbackUrl: '/csp-partners/dashboard',
				}),
				redirect: 'manual',
			});

			if (res.type === 'opaqueredirect' || res.status === 302 || res.status === 200) {
				router.push('/csp-partners/dashboard');
				return;
			}

			setError('Incorrect verification code. Please try again.');
		} catch {
			setError('Verification failed. Please try again.');
		} finally {
			setLoading(false);
		}
	}, [email, otpCode, router]);

	const handleResendOtp = useCallback(async () => {
		if (resendCooldown > 0) return;
		setLoading(true);
		setError('');

		try {
			const response = await cspPartnerPublicApiFetch('/api/reseller/auth/otp/request', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: email.trim() }),
			});

			if (!response.ok) {
				const body = await response.json().catch(() => null);
				setError(body?.message || 'Failed to resend code.');
				return;
			}

			setResendCooldown(60);
			setOtpCode('');
		} catch {
			setError('Failed to resend code.');
		} finally {
			setLoading(false);
		}
	}, [email, resendCooldown]);

	if (step === 'otp') {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-sm text-gray-600">
					We sent a verification code to{' '}
					<span className="font-semibold">{email}</span>
				</p>
				<div className="flex flex-col my-3 gap-1">
					<Label
						htmlFor="otp-input"
						className="text-xs font-medium text-gray-700"
					>
						Verification Code
					</Label>
					<Input
						id="otp-input"
						type="number"
						
						inputMode="numeric"
						maxLength={6}
						placeholder="Enter 6-digit code"
						value={otpCode}
						onChange={(_e, data) => setOtpCode(data.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') void handleVerifyOtp();
						}}
						
					/>
				</div>
				<Button
					appearance="primary"
					type='button'
					onClick={() => void handleVerifyOtp()}
					disabled={loading || !otpCode.trim()}
					className="bg-(--ds-color-violet-500)! text-white! w-fit disabled:opacity-50!"
				>
					{loading ? 'Verifying...' : 'Login'}
				</Button>
				<div className="flex items-center justify-between">
					<button
						type="button"
						onClick={() => void handleResendOtp()}
						disabled={resendCooldown > 0 || loading}
						className="text-xs font-medium text-(--ds-color-violet-500) hover:underline disabled:text-gray-400 disabled:no-underline cursor-pointer bg-transparent border-none p-0"
					>
						{resendCooldown > 0
							? `Resend code in ${resendCooldown}s`
							: 'Resend Code'}
					</button>
					<button
						type="button"
						onClick={() => {
							setStep('email');
							setOtpCode('');
							setError('');
						}}
						className="text-xs font-medium text-gray-500 hover:underline cursor-pointer bg-transparent border-none p-0"
					>
						Change Email
					</button>
				</div>
				{error ? (
					<p className="text-xs text-red-600 font-medium">{error}</p>
				) : null}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<Label
					htmlFor="email-input"
					className="text-xs font-medium text-gray-700"
				>
					Email <span className='text-red-600'>*</span>
				</Label>
				<Input
					id="email-input"
					type="email"
					placeholder="you@company.com"
					value={email}
					onChange={(_e, data) => setEmail(data.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && agreed) void handleRequestOtp();
					}}
				/>
			</div>
			{!hideDisclaimer && (
				<p className="text-xs text-gray-700 leading-relaxed">
					This application collects your name, email address, and
					usage information (such as features accessed and login
					timestamps) to support the operation and improvement of
					the application. This data is used internally by Microsoft
					stakeholders only and is not shared externally. By signing
					in, you acknowledge this data collection. For questions,
					contact your program administrator. This application is
					subject to Microsoft&apos;s{' '}
					<a
						href="https://www.microsoft.com/en-us/privacy/privacystatement"
						target="_blank"
						rel="noopener noreferrer"
						className="text-[#0567b9] underline"
					>
						Privacy Policy
					</a>,{' '}
					<a
						href="http://go.microsoft.com/fwlink/?LinkId=518021"
						target="_blank"
						rel="noopener noreferrer"
						className="text-[#0567b9] underline"
					>
						Data Privacy Notice
					</a>{' '}
					and{' '}
					<a
						href="https://www.microsoft.com/en-us/legal/terms-of-use"
						target="_blank"
						rel="noopener noreferrer"
						className="text-[#0567b9] underline"
					>
						Terms of Use
					</a>
					.
				</p>
			)}
			{!hideDisclaimer && (
				<p className="text-xs text-gray-700 leading-relaxed">
					The purpose of this tool is to provide a non-binding
				recommendation, estimated pricing view, and proposed bill
				of materials for Microsoft solutions. You understand that
				outputs are for evaluation and planning purposes only, may
				be based on assumptions and available program data, and do
				not constitute a binding offer, quote, commitment to
				transact, or guarantee of pricing, eligibility, incentives,
				margins, or availability.
			</p>
			)}
			{!hideDisclaimer && (
				<label className="flex items-center gap-2 cursor-pointer self-start">
					<Checkbox
						checked={agreed}
						onChange={(e, data) => setAgreed(data.checked === true)}
						style={{ margin: 0 }}
						indicator={{ style: { margin: 0 } }}
					/>
					<span className="text-xs font-medium text-gray-800 select-none">
						I acknowledge and agree to the above terms
					</span>
				</label>
			)}
			<Button
				appearance="primary"
				type='button'
				onClick={() => void handleRequestOtp()}
				disabled={!agreed || loading || !email.trim()}
				className={`mt-4 w-fit font-medium! text-white! ${!agreed || loading || !email.trim() ? 'bg-gray-500! cursor-not-allowed!' : 'bg-(--ds-color-violet-500)!'}`}
			>
				{loading ? 'Sending...' : 'Send Verification Code'}
			</Button>
			{error ? (
				<p className="text-xs text-red-600 font-medium">{error}</p>
			) : null}
		</div>
	);
}
