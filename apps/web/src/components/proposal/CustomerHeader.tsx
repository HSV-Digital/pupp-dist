'use client';

import { Button } from '@fluentui/react-components';
import { ArrowLeftRegular } from '@fluentui/react-icons';
import { useRouter } from 'next/navigation';

interface CustomerHeaderProps {
	customerName: string;
	tpid?: string;
	backHref?: string;
	loading?: boolean;
}

export function CustomerHeader({
	customerName,
	tpid,
	backHref = '/dashboard',
	loading = false,
}: CustomerHeaderProps) {
	const router = useRouter();

	return (
		<div className="py-4">
			<div className="flex flex-col items-start justify-between gap-2">
				<div className="flex items-center justify-center gap-2">
					<Button
						appearance="subtle"
						size="medium"
						icon={<ArrowLeftRegular className="size-6" />}
						onClick={() => router.push(backHref)}
					></Button>
					{loading ? (
						<div className="h-5 w-48 animate-pulse rounded bg-gray-200" />
					) : (
						<div className="flex items-center gap-3 m-0">
							<span className="text-base truncate font-semibold font-ds-display">
								{customerName}
							</span>

							{tpid && (
								<>
									<span className="text-gray-500">&#x2022;</span>
									<span className="font-mono text-sm font-medium leading-[24px]">
										TPID {tpid}
									</span>
								</>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
