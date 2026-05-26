import { notFound } from 'next/navigation';
import { isDemoModeEnabled } from '@/env';
import DemoResellerShell from './DemoResellerShell';

export default function DemoResellerLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	if (!isDemoModeEnabled()) {
		notFound();
	}

	return <DemoResellerShell>{children}</DemoResellerShell>;
}
