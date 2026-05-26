import fs from 'node:fs/promises';
import type { PptRenderItem } from '@/lib/ppt-types';
import { hydrateSlideXml } from '@/lib/ppt/hydrate-slide';
import { mergePptDecks } from '@/lib/ppt/merge-decks';
import { calculatePricing } from '@/lib/ppt/pricing';
import { getTemplatePath } from '@/lib/ppt/template-map';
import { readZipEntries, writeZipEntries } from '@/lib/ppt/zip-utils';

const SLIDE_XML_PATH = 'ppt/slides/slide1.xml';
const USD_FORMATTER = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});
const SEAT_COUNT_FORMATTER = new Intl.NumberFormat('en-US', {
	maximumFractionDigits: 0,
});

export async function generatePpt(items: PptRenderItem[]): Promise<Buffer> {
	if (items.length === 0) {
		throw new Error('Cannot generate PPT without render items');
	}

	const decks = await Promise.all(
		items.map((item) => hydrateTemplateDeck(item)),
	);

	if (decks.length === 1) {
		return decks[0];
	}

	return mergePptDecks(decks);
}

async function hydrateTemplateDeck(item: PptRenderItem): Promise<Buffer> {
	const templatePath = getTemplatePath(item.plan);
	const templateBuffer = await fs.readFile(templatePath);
	const entries = await readZipEntries(templateBuffer);
	const slideXmlBuffer = entries.get(SLIDE_XML_PATH);

	if (!slideXmlBuffer) {
		throw new Error(`Missing slide xml in template: ${item.plan}`);
	}

	const pricing = calculatePricing(item.seats, item.plan);
	const hydratedSlide = hydrateSlideXml(slideXmlBuffer.toString('utf8'), {
		numberOfSeats: formatSeatCount(pricing.numberOfSeats),
		actualCost: formatUsd(pricing.actualCost),
		promoPricing: formatUsd(pricing.promoPricing),
		promoCostSaving: formatUsd(pricing.promoCostSaving),
	});

	entries.set(SLIDE_XML_PATH, Buffer.from(hydratedSlide, 'utf8'));

	return writeZipEntries(entries);
}

function formatUsd(value: number): string {
	const normalized = Number.isFinite(value) ? value : 0;
	return USD_FORMATTER.format(normalized);
}

function formatSeatCount(value: number): string {
	const normalized = Number.isFinite(value)
		? Math.max(0, Math.floor(value))
		: 0;
	return SEAT_COUNT_FORMATTER.format(normalized);
}
