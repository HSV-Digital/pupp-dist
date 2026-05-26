'use client';

import type { AnalyticsRange } from '@repo/types';
import {
	ToggleGroup,
	ToggleGroupItem,
} from '@/components/ui/toggle-group';
import { ANALYTICS_RANGE_OPTIONS } from './admin-analytics-metrics';

export function AdminAnalyticsRangeToggle({
	value,
	onChange,
	disabled = false,
}: {
	value: AnalyticsRange;
	onChange: (value: AnalyticsRange) => void;
	disabled?: boolean;
}) {
	return (
		<ToggleGroup
			type="single"
			variant="outline"
			size="sm"
			value={value}
			onValueChange={(nextValue) => {
				if (disabled || !nextValue) {
					return;
				}

				onChange(nextValue as AnalyticsRange);
			}}
			aria-label="Analytics date range"
		>
			{ANALYTICS_RANGE_OPTIONS.map((option) => (
				<ToggleGroupItem
					key={option.value}
					value={option.value}
					aria-label={`Show ${option.label} analytics`}
					disabled={disabled}
				>
					{option.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
