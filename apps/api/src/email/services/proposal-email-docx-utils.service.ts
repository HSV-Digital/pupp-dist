import { InternalServerErrorException } from '@nestjs/common';
import PizZip from 'pizzip';

const SCENARIO_IMAGE_ANCHOR = '__SCENARIO_IMAGE_ANCHOR__';
const DEFAULT_IMAGE_WIDTH_PX = 1200;
const DEFAULT_IMAGE_HEIGHT_PX = 680;
const MAX_INLINE_IMAGE_WIDTH_EMU = 5_760_000; // 6.3 inches
const MAX_INLINE_IMAGE_HEIGHT_EMU = 2_880_000; // 3.15 inches

interface ImageDimensions {
	widthPx: number;
	heightPx: number;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXmlText(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function escapeXmlAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function detectPngDimensions(buffer: Buffer): ImageDimensions | null {
	if (buffer.length < 24) return null;
	if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
		return null;
	}
	const widthPx = buffer.readUInt32BE(16);
	const heightPx = buffer.readUInt32BE(20);
	if (widthPx <= 0 || heightPx <= 0) return null;
	return { widthPx, heightPx };
}

function detectJpegDimensions(buffer: Buffer): ImageDimensions | null {
	if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
		return null;
	}
	let offset = 2;
	while (offset + 1 < buffer.length) {
		if (buffer[offset] !== 0xff) {
			offset += 1;
			continue;
		}

		const marker = buffer[offset + 1];
		if (marker === 0xd9 || marker === 0xda) {
			break;
		}

		if (offset + 4 > buffer.length) break;
		const segmentLength = buffer.readUInt16BE(offset + 2);
		if (segmentLength < 2) return null;

		const isSofMarker =
			(marker >= 0xc0 && marker <= 0xc3) ||
			(marker >= 0xc5 && marker <= 0xc7) ||
			(marker >= 0xc9 && marker <= 0xcb) ||
			(marker >= 0xcd && marker <= 0xcf);

		if (isSofMarker) {
			if (offset + 9 > buffer.length) return null;
			const heightPx = buffer.readUInt16BE(offset + 5);
			const widthPx = buffer.readUInt16BE(offset + 7);
			if (widthPx <= 0 || heightPx <= 0) return null;
			return { widthPx, heightPx };
		}

		offset += 2 + segmentLength;
	}
	return null;
}

function readUInt24LE(buffer: Buffer, offset: number): number {
	return (
		buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
	);
}

function detectWebpDimensions(buffer: Buffer): ImageDimensions | null {
	if (buffer.length < 30) return null;
	if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') return null;
	if (buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null;

	const chunkType = buffer.subarray(12, 16).toString('ascii');
	if (chunkType === 'VP8X' && buffer.length >= 30) {
		const widthPx = readUInt24LE(buffer, 24) + 1;
		const heightPx = readUInt24LE(buffer, 27) + 1;
		if (widthPx <= 0 || heightPx <= 0) return null;
		return { widthPx, heightPx };
	}

	if (chunkType === 'VP8 ' && buffer.length >= 30) {
		const signature = buffer.readUInt32LE(23);
		if (signature !== 0x9d012a) return null;
		const widthPx = buffer.readUInt16LE(27) & 0x3fff;
		const heightPx = buffer.readUInt16LE(29) & 0x3fff;
		if (widthPx <= 0 || heightPx <= 0) return null;
		return { widthPx, heightPx };
	}

	if (chunkType === 'VP8L' && buffer.length >= 25) {
		const signature = buffer[20];
		if (signature !== 0x2f) return null;
		const b0 = buffer[21];
		const b1 = buffer[22];
		const b2 = buffer[23];
		const b3 = buffer[24];
		const widthPx = 1 + (((b1 & 0x3f) << 8) | b0);
		const heightPx = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
		if (widthPx <= 0 || heightPx <= 0) return null;
		return { widthPx, heightPx };
	}

	return null;
}

function resolveImageDimensions(params: {
	imageBuffer: Buffer;
	mimeType: string;
}): ImageDimensions {
	const mimeType = params.mimeType.toLowerCase();
	const detectors: Array<() => ImageDimensions | null> = [];

	if (mimeType === 'image/png') {
		detectors.push(() => detectPngDimensions(params.imageBuffer));
	} else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
		detectors.push(() => detectJpegDimensions(params.imageBuffer));
	} else if (mimeType === 'image/webp') {
		detectors.push(() => detectWebpDimensions(params.imageBuffer));
	}

	detectors.push(
		() => detectPngDimensions(params.imageBuffer),
		() => detectJpegDimensions(params.imageBuffer),
		() => detectWebpDimensions(params.imageBuffer),
	);

	for (const detect of detectors) {
		const dimensions = detect();
		if (dimensions) {
			return dimensions;
		}
	}

	return {
		widthPx: DEFAULT_IMAGE_WIDTH_PX,
		heightPx: DEFAULT_IMAGE_HEIGHT_PX,
	};
}

function toEmu(px: number): number {
	return Math.round((px / 96) * 914400);
}

function computeImageExtentEmu(dimensions: ImageDimensions): {
	cx: number;
	cy: number;
} {
	const widthPx = Math.max(1, dimensions.widthPx);
	const heightPx = Math.max(1, dimensions.heightPx);

	const widthScale = MAX_INLINE_IMAGE_WIDTH_EMU / toEmu(widthPx);
	const heightScale = MAX_INLINE_IMAGE_HEIGHT_EMU / toEmu(heightPx);
	const scale = Math.min(1, widthScale, heightScale);

	return {
		cx: Math.max(1, Math.round(toEmu(widthPx) * scale)),
		cy: Math.max(1, Math.round(toEmu(heightPx) * scale)),
	};
}

function extensionFromMimeType(mimeType: string): string {
	switch (mimeType.toLowerCase()) {
		case 'image/png':
			return 'png';
		case 'image/webp':
			return 'webp';
		default:
			return 'jpeg';
	}
}

function findNextNumericId(xml: string, regex: RegExp): number {
	let maxId = 0;
	let match = regex.exec(xml);
	while (match) {
		const id = Number.parseInt(match[1] ?? '0', 10);
		if (!Number.isNaN(id) && id > maxId) {
			maxId = id;
		}
		match = regex.exec(xml);
	}
	regex.lastIndex = 0;
	return maxId + 1;
}

function buildInlineDrawingRunXml(params: {
	relationshipId: string;
	docPrId: number;
	name: string;
	cx: number;
	cy: number;
}): string {
	return [
		'<w:r>',
		'<w:drawing>',
		'<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">',
		`<wp:extent cx="${params.cx}" cy="${params.cy}"/>`,
		'<wp:effectExtent l="0" t="0" r="0" b="0"/>',
		`<wp:docPr id="${params.docPrId}" name="${escapeXmlAttr(params.name)}"/>`,
		'<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/></wp:cNvGraphicFramePr>',
		'<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
		'<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
		'<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">',
		'<pic:nvPicPr>',
		`<pic:cNvPr id="0" name="${escapeXmlAttr(params.name)}"/>`,
		'<pic:cNvPicPr/>',
		'</pic:nvPicPr>',
		'<pic:blipFill>',
		`<a:blip r:embed="${params.relationshipId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>`,
		'<a:stretch><a:fillRect/></a:stretch>',
		'</pic:blipFill>',
		'<pic:spPr>',
		'<a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
			.replace('{cx}', String(params.cx))
			.replace('{cy}', String(params.cy)),
		'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>',
		'</pic:spPr>',
		'</pic:pic>',
		'</a:graphicData>',
		'</a:graphic>',
		'</wp:inline>',
		'</w:drawing>',
		'</w:r>',
	].join('');
}

function ensureContentTypeForExtension(
	contentTypesXml: string,
	extension: string,
	mimeType: string,
): string {
	const defaultRegex = new RegExp(
		`Extension="${escapeRegExp(extension)}"`,
		'i',
	);
	if (defaultRegex.test(contentTypesXml)) {
		return contentTypesXml;
	}

	const node = `<Default Extension="${extension}" ContentType="${mimeType}"/>`;
	return contentTypesXml.replace('</Types>', `${node}</Types>`);
}

function buildDocxHyperlinkXml(params: {
	relationshipId: string;
	displayText: string;
}): string {
	return [
		`<w:hyperlink r:id="${params.relationshipId}" w:history="1">`,
		'<w:r>',
		'<w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>',
		`<w:t>${escapeXmlText(params.displayText)}</w:t>`,
		'</w:r>',
		'</w:hyperlink>',
	].join('');
}

export class ProposalEmailDocxUtilsService {
	injectDocxHyperlinks(
		zip: PizZip,
		targets: Array<{ token: string; url: string; displayText: string }>,
	): void {
		if (targets.length === 0) return;

		const documentPath = 'word/document.xml';
		const relsPath = 'word/_rels/document.xml.rels';
		const documentFile = zip.file(documentPath);
		const relsFile = zip.file(relsPath);
		if (!documentFile || !relsFile) {
			throw new InternalServerErrorException(
				'Template is missing DOCX XML entries required for hyperlink injection',
			);
		}

		let documentXml = documentFile.asText();
		let relsXml = relsFile.asText();
		let relationshipSequence = findNextNumericId(relsXml, /Id="rId(\d+)"/g);

		for (const target of targets) {
			const tokenPattern = escapeRegExp(escapeXmlText(target.token));
			const tokenRegex = new RegExp(`<w:t[^>]*>${tokenPattern}<\\/w:t>`);
			const tokenMatch = tokenRegex.exec(documentXml);

			let relationshipId = `rId${relationshipSequence}`;
			while (relsXml.includes(`Id="${relationshipId}"`)) {
				relationshipSequence += 1;
				relationshipId = `rId${relationshipSequence}`;
			}
			relationshipSequence += 1;

			const hyperlinkXml = buildDocxHyperlinkXml({
				relationshipId,
				displayText: target.displayText,
			});

			if (tokenMatch && tokenMatch.index >= 0) {
				const runOpenRegex = /<w:r(?:\s[^>]*)?>/g;
				let runStart = -1;
				let runOpenMatch: RegExpExecArray | null;
				while ((runOpenMatch = runOpenRegex.exec(documentXml)) !== null) {
					if (runOpenMatch.index >= tokenMatch.index) {
						break;
					}
					runStart = runOpenMatch.index;
				}
				const runEnd = documentXml.indexOf('</w:r>', tokenMatch.index);
				if (runStart < 0 || runEnd < 0) {
					throw new InternalServerErrorException(
						`Template hyperlink token "${target.token}" is not inside a valid run`,
					);
				}

				documentXml =
					documentXml.slice(0, runStart) +
					hyperlinkXml +
					documentXml.slice(runEnd + '</w:r>'.length);
			} else {
				const encodedToken = escapeXmlText(target.token);
				const textNodeRegex = /<w:t([^>]*)>([\s\S]*?)<\/w:t>/g;
				let inlineTokenMatch: RegExpExecArray | null = null;
				let textNodeMatch = textNodeRegex.exec(documentXml);
				while (textNodeMatch) {
					if (textNodeMatch[2]?.includes(encodedToken)) {
						inlineTokenMatch = textNodeMatch;
						break;
					}
					textNodeMatch = textNodeRegex.exec(documentXml);
				}

				if (!inlineTokenMatch || inlineTokenMatch.index < 0) {
					throw new InternalServerErrorException(
						`Template hyperlink token "${target.token}" is missing`,
					);
				}

				const textNodeStart = inlineTokenMatch.index;
				const runOpenRegex = /<w:r(?:\s[^>]*)?>/g;
				let runStart = -1;
				let runOpenMatch: RegExpExecArray | null;
				while ((runOpenMatch = runOpenRegex.exec(documentXml)) !== null) {
					if (runOpenMatch.index >= textNodeStart) {
						break;
					}
					runStart = runOpenMatch.index;
				}
				const runEnd = documentXml.indexOf('</w:r>', textNodeStart);
				if (runStart < 0 || runEnd < 0 || runEnd < runStart) {
					throw new InternalServerErrorException(
						`Template hyperlink token "${target.token}" is not inside a valid run`,
					);
				}

				const runXml = documentXml.slice(runStart, runEnd + '</w:r>'.length);
				const runPropertiesXml =
					runXml.match(/<w:rPr(?:\s[^>]*)?>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
				const textAttributes = inlineTokenMatch[1] ?? '';
				const textValue = inlineTokenMatch[2] ?? '';
				const tokenStart = textValue.indexOf(encodedToken);

				if (tokenStart < 0) {
					throw new InternalServerErrorException(
						`Template hyperlink token "${target.token}" is missing`,
					);
				}

				const prefixText = textValue.slice(0, tokenStart);
				const suffixText = textValue.slice(tokenStart + encodedToken.length);
				const prefixRunXml =
					prefixText.length > 0
						? `<w:r>${runPropertiesXml}<w:t${textAttributes}>${prefixText}</w:t></w:r>`
						: '';
				const suffixRunXml =
					suffixText.length > 0
						? `<w:r>${runPropertiesXml}<w:t${textAttributes}>${suffixText}</w:t></w:r>`
						: '';

				documentXml =
					documentXml.slice(0, runStart) +
					prefixRunXml +
					hyperlinkXml +
					suffixRunXml +
					documentXml.slice(runEnd + '</w:r>'.length);
			}

			relsXml = relsXml.replace(
				'</Relationships>',
				`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXmlAttr(target.url)}" TargetMode="External"/></Relationships>`,
			);
		}

		zip.file(documentPath, documentXml);
		zip.file(relsPath, relsXml);
	}

	injectDocumentsZipLink(zip: PizZip, zipUrl: string): void {
		const documentPath = 'word/document.xml';
		const relsPath = 'word/_rels/document.xml.rels';
		const documentFile = zip.file(documentPath);
		const relsFile = zip.file(relsPath);
		if (!documentFile || !relsFile) return;

		let documentXml = documentFile.asText();
		let relsXml = relsFile.asText();

		let sequence = findNextNumericId(relsXml, /Id="rId(\d+)"/g);
		let relationshipId = `rId${sequence}`;
		while (relsXml.includes(`Id="${relationshipId}"`)) {
			sequence += 1;
			relationshipId = `rId${sequence}`;
		}

		relsXml = relsXml.replace(
			'</Relationships>',
			`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXmlAttr(zipUrl)}" TargetMode="External"/></Relationships>`,
		);

		const hyperlinkParagraph = [
			'<w:p>',
			'<w:pPr><w:spacing w:before="240"/></w:pPr>',
			`<w:hyperlink r:id="${relationshipId}" w:history="1">`,
			'<w:r>',
			'<w:rPr><w:rStyle w:val="Hyperlink"/><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr>',
			'<w:t>Download Proposal Documents</w:t>',
			'</w:r>',
			'</w:hyperlink>',
			'</w:p>',
		].join('');

		if (documentXml.includes('<w:sectPr')) {
			documentXml = documentXml.replace(
				/<w:sectPr/,
				`${hyperlinkParagraph}<w:sectPr`,
			);
		} else {
			documentXml = documentXml.replace(
				'</w:body>',
				`${hyperlinkParagraph}</w:body>`,
			);
		}

		zip.file(documentPath, documentXml);
		zip.file(relsPath, relsXml);
	}

	removeImageAnchorText(zip: PizZip): void {
		const documentPath = 'word/document.xml';
		const documentFile = zip.file(documentPath);
		if (!documentFile) return;

		const escapedAnchor = escapeRegExp(SCENARIO_IMAGE_ANCHOR);
		const updated = documentFile
			.asText()
			.replace(new RegExp(escapedAnchor, 'g'), '');
		zip.file(documentPath, updated);
	}

	embedInlineScreenshot(params: {
		zip: PizZip;
		imageBuffer: Buffer;
		mimeType: string;
	}): void {
		const documentPath = 'word/document.xml';
		const relsPath = 'word/_rels/document.xml.rels';
		const contentTypesPath = '[Content_Types].xml';

		const documentFile = params.zip.file(documentPath);
		const relsFile = params.zip.file(relsPath);
		const contentTypesFile = params.zip.file(contentTypesPath);

		if (!documentFile || !relsFile || !contentTypesFile) {
			throw new InternalServerErrorException(
				'Template is missing required DOCX XML entries for image embedding',
			);
		}

		const documentXml = documentFile.asText();
		const relsXml = relsFile.asText();
		const contentTypesXml = contentTypesFile.asText();

		const relationshipIdBase = findNextNumericId(relsXml, /Id="rId(\d+)"/g);
		let relationshipId = `rId${relationshipIdBase}`;
		let sequence = relationshipIdBase;
		while (relsXml.includes(`Id="${relationshipId}"`)) {
			sequence += 1;
			relationshipId = `rId${sequence}`;
		}

		const extension = extensionFromMimeType(params.mimeType);
		const mediaFileName = `scenario-${Date.now()}.${extension}`;
		const mediaPath = `word/media/${mediaFileName}`;

		const dimensions = resolveImageDimensions({
			imageBuffer: params.imageBuffer,
			mimeType: params.mimeType,
		});
		const extent = computeImageExtentEmu(dimensions);
		const docPrId = findNextNumericId(documentXml, /<wp:docPr id="(\d+)"/g);
		const drawingRunXml = buildInlineDrawingRunXml({
			relationshipId,
			docPrId,
			name: 'scenario-cards-image',
			cx: extent.cx,
			cy: extent.cy,
		});

		const escapedAnchor = escapeRegExp(SCENARIO_IMAGE_ANCHOR);
		const anchorTextRegex = new RegExp(`<w:t[^>]*>${escapedAnchor}<\\/w:t>`);
		const anchorMatch = anchorTextRegex.exec(documentXml);
		if (!anchorMatch || anchorMatch.index < 0) {
			throw new InternalServerErrorException(
				'Scenario image anchor is missing in the selected template',
			);
		}

		const runOpenRegex = /<w:r(?:\s[^>]*)?>/g;
		let runStart = -1;
		let runOpenMatch: RegExpExecArray | null;
		while ((runOpenMatch = runOpenRegex.exec(documentXml)) !== null) {
			if (runOpenMatch.index >= anchorMatch.index) {
				break;
			}
			runStart = runOpenMatch.index;
		}
		const runEnd = documentXml.indexOf('</w:r>', anchorMatch.index);
		if (runStart < 0 || runEnd < 0 || runEnd < runStart) {
			throw new InternalServerErrorException(
				'Scenario image anchor run could not be resolved in template XML',
			);
		}

		const updatedDocumentXml =
			documentXml.slice(0, runStart) +
			drawingRunXml +
			documentXml.slice(runEnd + '</w:r>'.length);
		if (
			updatedDocumentXml.includes(SCENARIO_IMAGE_ANCHOR) ||
			!updatedDocumentXml.includes('</w:document>')
		) {
			throw new InternalServerErrorException(
				'Scenario image embedding produced invalid template XML',
			);
		}
		const updatedRelsXml = relsXml.replace(
			'</Relationships>',
			`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaFileName}"/></Relationships>`,
		);
		const updatedContentTypesXml = ensureContentTypeForExtension(
			contentTypesXml,
			extension,
			params.mimeType,
		);

		params.zip.file(documentPath, updatedDocumentXml);
		params.zip.file(relsPath, updatedRelsXml);
		params.zip.file(contentTypesPath, updatedContentTypesXml);
		params.zip.file(mediaPath, params.imageBuffer);
	}
}
