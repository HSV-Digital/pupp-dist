import { describe, expect, it } from 'vitest';
import { generatePpt } from '@/lib/ppt/generate-ppt';
import type { PptRenderItem } from '@/lib/ppt-types';
import { readZipEntries } from '@/lib/ppt/zip-utils';

const SLIDE_XML_PATH = 'ppt/slides/slide1.xml';

describe('generatePpt', () => {
	it('hydrates seat count and pricing placeholders using US formatting', async () => {
		const slideXml = await renderSlideXml([
			{
				plan: 'good',
				seats: 1234,
			},
		]);

		expect(slideXml).toContain('1,234');
		expect(slideXml).toContain('$41,339.00');
		expect(slideXml).toContain('$27,148.00');
		expect(slideXml).toContain('$14,191.00');
		expect(slideXml).not.toContain('{{');
		expect(slideXml).not.toContain('}}');
	});
});

async function renderSlideXml(items: PptRenderItem[]): Promise<string> {
	const pptBuffer = await generatePpt(items);
	const entries = await readZipEntries(pptBuffer);
	const slideXml = entries.get(SLIDE_XML_PATH);

	if (!slideXml) {
		throw new Error(`Missing generated slide xml: ${SLIDE_XML_PATH}`);
	}

	return slideXml.toString('utf8');
}
