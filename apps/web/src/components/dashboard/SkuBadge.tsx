import { Tag } from '@fluentui/react-components';
import type { SkuCategory } from '@repo/types';

const SKU_DISPLAY_LABELS: Partial<Record<SkuCategory, string>> = {
	Premium: 'Business Premium',
	Standard: 'Business Standard',
	Basic: 'Business Basic',
};

export function SkuBadge({ category }: { category: SkuCategory }) {
	return (
		<Tag size="small" shape="rounded" appearance="brand" className="uppercase">
			{SKU_DISPLAY_LABELS[category] ?? category}
		</Tag>
	);
}
