import { notFound } from 'next/navigation';
import { isDemoModeEnabled } from '@/env';

const SUPADEMO_EMBED_URL =
	'https://app.supademo.com/embed/cmoomzrw01tomw9doopqgwg1g?embed_v=2&utm_source=embed';

export default function CspPartnersClickthroughDemoPage() {
	if (!isDemoModeEnabled()) {
		notFound();
	}

	return (
		<div className="flex flex-1 flex-col bg-[#f3f4f6]">
			<div className="mx-auto flex w-full max-w-[1440px] flex-col  px-6 py-8">
				<div className="flex flex-col gap-1">
					<h1 className="font-ds-display text-2xl font-semibold text-[#091f2c]">
						CSP Partners Clickthrough Demo
					</h1>
					<p className="text-sm text-gray-600">
						Walk through the CSP Partners experience step by step.
					</p>
				</div>
				<div
					className="relative w-full overflow-hidden h-auto "
					style={{ paddingTop: '60.5%' }}
				>
					<iframe
						src={SUPADEMO_EMBED_URL}
						title="CSP Partners Clickthrough Demo"
						loading="lazy"
						allow="clipboard-write; encrypted-media; fullscreen; web-share"
						allowFullScreen
						className="absolute inset-0 h-full w-full border-0"
					/>
				</div>
			</div>
		</div>
	);
}
