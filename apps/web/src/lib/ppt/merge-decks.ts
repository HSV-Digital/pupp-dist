import path from 'node:path';
import { readZipEntries, writeZipEntries } from '@/lib/ppt/zip-utils';

const PRESENTATION_XML_PATH = 'ppt/presentation.xml';
const PRESENTATION_RELS_XML_PATH = 'ppt/_rels/presentation.xml.rels';
const CONTENT_TYPES_XML_PATH = '[Content_Types].xml';
const SLIDE_XML_PATH = 'ppt/slides/slide1.xml';
const SLIDE_RELS_XML_PATH = 'ppt/slides/_rels/slide1.xml.rels';
const SLIDE_CONTENT_TYPE =
	'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';

export async function mergePptDecks(decks: Buffer[]): Promise<Buffer> {
	if (decks.length === 0) {
		throw new Error('Cannot merge zero decks');
	}

	if (decks.length === 1) {
		return decks[0];
	}

	const baseEntries = await readZipEntries(decks[0]);

	let presentationXml = getRequiredTextEntry(
		baseEntries,
		PRESENTATION_XML_PATH,
	);
	let presentationRelsXml = getRequiredTextEntry(
		baseEntries,
		PRESENTATION_RELS_XML_PATH,
	);
	let contentTypesXml = getRequiredTextEntry(
		baseEntries,
		CONTENT_TYPES_XML_PATH,
	);

	let nextSlideIndex = getNextSlideFileIndex(baseEntries);
	let nextSlideId = getNextSlideId(presentationXml);
	let nextPresentationRelId = getNextPresentationRelId(presentationRelsXml);

	const mediaNames = new Set(
		Array.from(baseEntries.keys())
			.filter((entry) => entry.startsWith('ppt/media/'))
			.map((entry) => entry.replace('ppt/media/', '')),
	);

	for (let index = 1; index < decks.length; index++) {
		const sourceEntries = await readZipEntries(decks[index]);
		const sourceSlideXml = getRequiredBinaryEntry(
			sourceEntries,
			SLIDE_XML_PATH,
		);
		const sourceSlideRelsXml = getRequiredTextEntry(
			sourceEntries,
			SLIDE_RELS_XML_PATH,
		);

		let updatedSlideRelsXml = sourceSlideRelsXml;
		const mediaTargets = extractImageTargets(sourceSlideRelsXml);
		for (const target of mediaTargets) {
			const sourceMediaPath = toMediaPath(target);
			const sourceMedia = getRequiredBinaryEntry(
				sourceEntries,
				sourceMediaPath,
			);
			const mediaFileName = path.basename(sourceMediaPath);
			const destinationName = getUniqueMediaName(
				mediaFileName,
				mediaNames,
				nextSlideIndex,
			);
			mediaNames.add(destinationName);

			baseEntries.set(`ppt/media/${destinationName}`, sourceMedia);
			updatedSlideRelsXml = updatedSlideRelsXml.replaceAll(
				`Target="${target}"`,
				`Target="../media/${destinationName}"`,
			);
		}

		const slidePath = `ppt/slides/slide${nextSlideIndex}.xml`;
		const slideRelsPath = `ppt/slides/_rels/slide${nextSlideIndex}.xml.rels`;
		const relationshipId = `rId${nextPresentationRelId}`;

		baseEntries.set(slidePath, sourceSlideXml);
		baseEntries.set(slideRelsPath, Buffer.from(updatedSlideRelsXml, 'utf8'));

		presentationRelsXml = appendPresentationRelationship(
			presentationRelsXml,
			relationshipId,
			`slides/slide${nextSlideIndex}.xml`,
		);
		presentationXml = appendSlideReference(
			presentationXml,
			nextSlideId,
			relationshipId,
		);
		contentTypesXml = ensureSlideOverride(
			contentTypesXml,
			`/ppt/slides/slide${nextSlideIndex}.xml`,
		);

		nextSlideIndex += 1;
		nextSlideId += 1;
		nextPresentationRelId += 1;
	}

	baseEntries.set(PRESENTATION_XML_PATH, Buffer.from(presentationXml, 'utf8'));
	baseEntries.set(
		PRESENTATION_RELS_XML_PATH,
		Buffer.from(presentationRelsXml, 'utf8'),
	);
	baseEntries.set(CONTENT_TYPES_XML_PATH, Buffer.from(contentTypesXml, 'utf8'));

	return writeZipEntries(baseEntries);
}

function getRequiredTextEntry(
	entries: Map<string, Buffer>,
	pathName: string,
): string {
	const buffer = getRequiredBinaryEntry(entries, pathName);
	return buffer.toString('utf8');
}

function getRequiredBinaryEntry(
	entries: Map<string, Buffer>,
	pathName: string,
): Buffer {
	const value = entries.get(pathName);
	if (!value) {
		throw new Error(`Missing PPT entry: ${pathName}`);
	}
	return value;
}

function getNextSlideFileIndex(entries: Map<string, Buffer>): number {
	let max = 0;
	const pattern = /^ppt\/slides\/slide(\d+)\.xml$/;

	for (const key of entries.keys()) {
		const match = key.match(pattern);
		if (!match) continue;
		const value = Number.parseInt(match[1], 10);
		if (value > max) max = value;
	}

	return max + 1;
}

function getNextSlideId(presentationXml: string): number {
	let max = 0;
	const pattern = /<p:sldId\b[^>]*\bid="(\d+)"/g;
	let match = pattern.exec(presentationXml);

	while (match) {
		const value = Number.parseInt(match[1], 10);
		if (value > max) max = value;
		match = pattern.exec(presentationXml);
	}

	return max + 1;
}

function getNextPresentationRelId(presentationRelsXml: string): number {
	let max = 0;
	const pattern = /\bId="rId(\d+)"/g;
	let match = pattern.exec(presentationRelsXml);

	while (match) {
		const value = Number.parseInt(match[1], 10);
		if (value > max) max = value;
		match = pattern.exec(presentationRelsXml);
	}

	return max + 1;
}

function appendPresentationRelationship(
	xml: string,
	relationshipId: string,
	target: string,
): string {
	const relationship =
		`<Relationship Id="${relationshipId}" ` +
		`Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" ` +
		`Target="${target}"/>`;

	if (!xml.includes('</Relationships>')) {
		throw new Error('Invalid presentation relationships xml');
	}

	return xml.replace('</Relationships>', `${relationship}</Relationships>`);
}

function appendSlideReference(
	xml: string,
	slideId: number,
	relationshipId: string,
): string {
	const slideRef = `<p:sldId id="${slideId}" r:id="${relationshipId}"/>`;

	if (!xml.includes('</p:sldIdLst>')) {
		throw new Error('Invalid presentation xml');
	}

	return xml.replace('</p:sldIdLst>', `${slideRef}</p:sldIdLst>`);
}

function ensureSlideOverride(xml: string, slidePartName: string): string {
	if (xml.includes(`PartName="${slidePartName}"`)) {
		return xml;
	}

	const override =
		`<Override PartName="${slidePartName}" ` +
		`ContentType="${SLIDE_CONTENT_TYPE}"/>`;

	if (!xml.includes('</Types>')) {
		throw new Error('Invalid content types xml');
	}

	return xml.replace('</Types>', `${override}</Types>`);
}

function extractImageTargets(relsXml: string): string[] {
	const targets: string[] = [];
	const relationshipTagPattern = /<Relationship\b[^>]*\/>/g;
	let match = relationshipTagPattern.exec(relsXml);

	while (match) {
		const tag = match[0];
		if (!tag.includes('/relationships/image')) {
			match = relationshipTagPattern.exec(relsXml);
			continue;
		}

		const targetMatch = tag.match(/\bTarget="([^"]+)"/);
		if (targetMatch?.[1]) {
			targets.push(targetMatch[1]);
		}

		match = relationshipTagPattern.exec(relsXml);
	}

	return targets;
}

function toMediaPath(target: string): string {
	if (!target.startsWith('../media/')) {
		throw new Error(`Unsupported slide media target: ${target}`);
	}

	return `ppt/media/${target.slice('../media/'.length)}`;
}

function getUniqueMediaName(
	fileName: string,
	existingNames: Set<string>,
	slideIndex: number,
): string {
	if (!existingNames.has(fileName)) {
		return fileName;
	}

	const parsed = path.parse(fileName);
	let candidate = `${parsed.name}__s${slideIndex}${parsed.ext}`;
	let suffix = 1;

	while (existingNames.has(candidate)) {
		candidate = `${parsed.name}__s${slideIndex}_${suffix}${parsed.ext}`;
		suffix += 1;
	}

	return candidate;
}
