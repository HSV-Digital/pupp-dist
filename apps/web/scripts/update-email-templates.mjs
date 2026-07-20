#!/usr/bin/env node
/**
 * Converts partner email templates to runtime tags and normalizes highlight rules.
 *
 * Included scopes:
 * - partner/opportunity_list/** (existing conversion workflow)
 * - partner/proposal_options/** (new)
 * - partner/proposal/** (new)
 *
 * Usage:
 *   node apps/web/scripts/update-email-templates.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PizZip from 'pizzip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARTNER_TEMPLATES_ROOT = path.resolve(
	__dirname,
	'../../api/assets/email_templates/partner',
);

const OPPORTUNITY_LIST_ROOT = path.join(
	PARTNER_TEMPLATES_ROOT,
	'opportunity_list',
);

const OPPORTUNITY_LIST_TEMPLATES = [
	{
		file: 'reseller_list/ai.docx',
		metricsOrder: ['resellers', 'customers', 'opportunities', 'seats'],
		solutionRows: 3,
	},
	{
		file: 'reseller_list/security.docx',
		metricsOrder: ['resellers', 'customers', 'opportunities', 'seats'],
		solutionRows: 3,
	},
	{
		file: 'reseller_list/ai_and_security.docx',
		metricsOrder: ['resellers', 'customers', 'opportunities', 'seats'],
		solutionRows: 6,
	},
	{
		file: 'customer_and_opportunity_list/ai.docx',
		metricsOrder: ['customers', 'opportunities', 'seats'],
		solutionRows: 3,
	},
	{
		file: 'customer_and_opportunity_list/security.docx',
		metricsOrder: ['customers', 'opportunities', 'seats'],
		solutionRows: 3,
	},
	{
		file: 'customer_and_opportunity_list/ai_and_security.docx',
		metricsOrder: ['customers', 'opportunities', 'seats'],
		solutionRows: 6,
	},
];

const PROPOSAL_OPTIONS_TEMPLATES = [
	{ file: 'proposal_options/new_customer/new_customer.docx', solutionRows: 6 },
	{ file: 'proposal_options/renewal/ai.docx', solutionRows: 3 },
	{ file: 'proposal_options/renewal/security.docx', solutionRows: 3 },
	{ file: 'proposal_options/renewal/ai_and_security.docx', solutionRows: 6 },
];

const PROPOSAL_TEMPLATES = [
	'proposal/new_customer/bb_bs_bp.docx',
	'proposal/new_customer/others.docx',
	'proposal/renewal/single.docx',
	'proposal/renewal/multiple.docx',
];

const PRESERVED_MANUAL_PLACEHOLDERS = new Set([
	'partner name',
	'name',
	'signature',
]);

function readTemplateXml(filePath) {
	const inputBuffer = fs.readFileSync(filePath);
	const zip = new PizZip(inputBuffer);
	const docFile = zip.file('word/document.xml');
	if (!docFile) {
		throw new Error(`word/document.xml is missing in ${filePath}`);
	}
	return { zip, xml: docFile.asText() };
}

function writeTemplate(zip, xml, filePath) {
	zip.file('word/document.xml', xml);
	fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer' }));
}

function removeYellowHighlights(xml) {
	return xml.replace(/<w:highlight w:val="yellow"\/>/g, '');
}

// Strips tags repeatedly until none remain, so removing one tag can never
// splice the surrounding text into a new, unstripped tag.
function stripXmlTags(value) {
	let previous;
	do {
		previous = value;
		value = value.replace(/<[^>]+>/g, '');
	} while (value !== previous);
	return value;
}

function reapplyManualPlaceholderHighlights(xml) {
	return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paragraphXml) => {
		const paragraphText = stripXmlTags(paragraphXml);
		if (!/[\[\]]/.test(paragraphText)) {
			return paragraphXml;
		}

		let insideBracket = false;
		return paragraphXml.replace(
			/<w:r([ >][\s\S]*?)<\/w:r>/g,
			(fullRun, inner) => {
				const textContent = stripXmlTags(inner);
				const hasOpen = textContent.includes('[');
				const hasClose = textContent.includes(']');

				if (hasOpen) insideBracket = true;
				if (!insideBracket) return fullRun;

				let highlightedRun;
				if (inner.includes('</w:rPr>')) {
					highlightedRun =
						'<w:r' +
						inner.replace('</w:rPr>', '<w:highlight w:val="yellow"/></w:rPr>') +
						'</w:r>';
				} else {
					highlightedRun =
						'<w:r' +
						inner.replace(
							/^([ >])/,
							'$1<w:rPr><w:highlight w:val="yellow"/></w:rPr>',
						) +
						'</w:r>';
				}

				if (hasClose) insideBracket = false;
				return highlightedRun;
			},
		);
	});
}

function normalizeTagName(rawPlaceholderText) {
	const trimmed = rawPlaceholderText
		.replace(/\u200b/g, '')
		.trim()
		.toLowerCase();
	const aliasByRaw = {
		'#': 'seats',
		$: 'expiring_arr',
		date: 'renewal_date',
		number: 'solution_count',
		'customer name': 'customer_name',
		sku: 'start_sku',
		'current sku': 'starting_sku',
		seats: 'seats',
		'solution capabilities': 'solution_overview',
		'solution overview': 'solution_overview',
		'expiring arr': 'expiring_arr',
		'target sku': 'target_sku',
		'proposed seat': 'proposed_seat',
		'after-promo price': 'per_user_after_promo_price',
		difference: 'incremental_cost_per_user',
		'difference per user': 'incremental_cost_per_user',
		'incremental cost': 'overall_incremental_cost',
		'incremental investment': 'overall_incremental_cost',
		'incremental price': 'overall_incremental_cost',
		'incremental price per user': 'incremental_cost_per_user',
		'current incentive': 'current_incentive',
		'new incentive': 'new_incentive',
		link: 'link',
		url: 'url',
		'collapsed image': 'scenario_image_anchor',
	};

	const alias = aliasByRaw[trimmed];
	if (alias) {
		return alias;
	}

	const normalized = trimmed
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');

	return normalized.length > 0 ? normalized : 'value';
}

function convertAddPlaceholdersToTags(xml) {
	return xml.replace(/\[ADD ([^\]]+)\]/g, (_full, rawValue) => {
		const tagName = normalizeTagName(rawValue);
		return `{${tagName}}`;
	});
}

function convertCommonCustomerPlaceholders(xml) {
	return xml.replaceAll('[CUSTOMER NAME]', '{customer_name}');
}

function replaceInlineBracketTokenLiterals(xml) {
	const replacements = [
		['[#]', '{seats}'],
		['[SEATS]', '{seats}'],
		['[SKU]', '{start_sku}'],
		['[CURRENT SKU]', '{starting_sku}'],
		['[TARGET SKU]', '{target_sku}'],
		['[SOLUTION CAPABILITIES]', '{solution_overview}'],
	];

	let next = xml;
	for (const [from, to] of replacements) {
		next = next.replaceAll(from, to);
	}

	return next;
}

function repairSerializedPlaceholderArtifacts(xml) {
	let next = xml;

	// Fix prior malformed conversions of split [Partner Name] placeholders.
	next = next.replace(/\{w_t_[^}]*partner[^}]*_name\}/gi, '[Partner Name]');

	// Fix prior malformed conversions of split [#] placeholders.
	next = next.replace(/\{w_t_[^}]*prooferr[^}]*\}/gi, '{seats}');

	return next;
}

function convertDirectBracketPlaceholdersToTags(xml) {
	return xml.replace(
		/<w:t([^>]*)>\[([^[\]]+)\]<\/w:t>/g,
		(full, attrs, raw) => {
			const normalizedRaw = raw
				.replace(/\u200b/g, '')
				.trim()
				.toLowerCase();
			if (PRESERVED_MANUAL_PLACEHOLDERS.has(normalizedRaw)) {
				return full;
			}

			const tagName = normalizeTagName(raw);
			return `<w:t${attrs}>{${tagName}}</w:t>`;
		},
	);
}

function convertSplitHashPlaceholders(xml) {
	let next = xml.replace(/<w:t([^>]*)>\[#<\/w:t>/g, '<w:t$1>{seats}</w:t>');

	next = next.replace(/<w:t([^>]*)>\](\s*seats?)<\/w:t>/gi, '<w:t$1>$2</w:t>');

	next = next.replace(/<w:t([^>]*)>\]<\/w:t>/g, '<w:t$1></w:t>');

	return next;
}

function findSolutionRows(xml) {
	const rowRegex = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
	const rows = [];

	let match;
	while ((match = rowRegex.exec(xml)) !== null) {
		const textContent = stripXmlTags(match[0]);
		if (/Solution\s*\d/.test(textContent)) {
			rows.push({
				start: match.index,
				end: match.index + match[0].length,
				xml: match[0],
			});
		}
	}

	return rows;
}

function convertProposalOptionsSolutionRows(xml, expectedRows, file) {
	const rows = findSolutionRows(xml);
	if (rows.length !== expectedRows) {
		console.warn(
			`  WARNING: ${file} — expected ${expectedRows} solution rows, found ${rows.length}`,
		);
	}

	if (rows.length === 0) {
		return xml;
	}

	const firstRow = rows[0];
	let firstRowXml = firstRow.xml;

	firstRowXml = firstRowXml.replace(
		/<w:t[^>]*>Solution\s*1<\/w:t>/,
		'<w:t>{#solutions}{solution_name}</w:t>',
	);

	firstRowXml = firstRowXml.replace(
		/(<w:t[^>]*>)Solution\s*(<\/w:t>[\s\S]*?<w:t[^>]*>)1(<\/w:t>)/,
		'$1{#solutions}{solution_name}$3',
	);

	firstRowXml = firstRowXml.replace(
		/<w:t[^>]*>Download Proactive Proposal Documents<\/w:t>/,
		'<w:t>{flyer_url}{/solutions}</w:t>',
	);

	const beforeRows = xml.slice(0, firstRow.start);
	const lastRow = rows[rows.length - 1];
	const afterRows = xml.slice(lastRow.end);

	return beforeRows + firstRowXml + afterRows;
}

function processOpportunityListTemplate({ file, metricsOrder, solutionRows }) {
	const filePath = path.join(OPPORTUNITY_LIST_ROOT, file);
	const { zip, xml: rawXml } = readTemplateXml(filePath);
	let xml = rawXml;

	for (const tag of metricsOrder) {
		xml = xml.replace('[ADD #]', `{${tag}}`);
	}

	xml = xml.replace('$[ADD $]', '{expiring_arr}');
	xml = xml.replace('[ADD URL]', '{url}');

	xml = xml.replace(
		/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>\{url\}<\/w:t><\/w:r>/,
		(urlRun) => {
			let styled = urlRun;
			if (styled.includes('<w:rPr>')) {
				styled = styled.replace(
					'<w:rPr>',
					'<w:rPr><w:rStyle w:val="Hyperlink"/>',
				);
			} else {
				styled = styled.replace(
					/(<w:r\b[^>]*>)/,
					'$1<w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>',
				);
			}
			styled = styled.replace(/<w:color w:val="000000"\/>/g, '');
			return `<w:hyperlink r:id="rIdUrl" w:history="1">${styled}</w:hyperlink>`;
		},
	);

	xml = removeYellowHighlights(xml);
	xml = reapplyManualPlaceholderHighlights(xml);

	const rows = findSolutionRows(xml);
	if (rows.length !== solutionRows) {
		console.warn(
			`  WARNING: ${file} — expected ${solutionRows} solution rows, found ${rows.length}`,
		);
	}

	if (rows.length > 0) {
		const firstRow = rows[0];
		let firstRowXml = firstRow.xml;

		firstRowXml = firstRowXml.replace(
			/<w:t[^>]*>Solution\s*1<\/w:t>/,
			'<w:t>{#solutions}{name}</w:t>',
		);
		firstRowXml = firstRowXml.replace(
			/(<w:t[^>]*>)Solution\s*(<\/w:t>[\s\S]*?<w:t[^>]*>)1(<\/w:t>)/,
			'$1{#solutions}{name}$3',
		);
		firstRowXml = firstRowXml.replace(
			/<w:t[^>]*>\[ADD <\/w:t><\/w:r><w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t[^>]*>BEST FOR<\/w:t><\/w:r><w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:t[^>]*>\]<\/w:t>/,
			'<w:t>{bestFor}{/solutions}</w:t>',
		);

		const beforeRows = xml.slice(0, firstRow.start);
		const lastRow = rows[rows.length - 1];
		const afterRows = xml.slice(lastRow.end);
		xml = beforeRows + firstRowXml + afterRows;
	}

	const relsPath = 'word/_rels/document.xml.rels';
	const relsFile = zip.file(relsPath);
	if (!relsFile) {
		throw new Error(`${file}: ${relsPath} is missing`);
	}
	let relsXml = relsFile.asText();
	if (!relsXml.includes('Id="rIdUrl"')) {
		relsXml = relsXml.replace(
			'</Relationships>',
			'<Relationship Id="rIdUrl" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="__URL_PLACEHOLDER__" TargetMode="External"/></Relationships>',
		);
		zip.file(relsPath, relsXml);
	}

	writeTemplate(zip, xml, filePath);
	console.log(`  ✓ opportunity_list/${file}`);
}

function processProposalOptionsTemplate({ file, solutionRows }) {
	const filePath = path.join(PARTNER_TEMPLATES_ROOT, file);
	const { zip, xml: rawXml } = readTemplateXml(filePath);
	let xml = rawXml;

	xml = repairSerializedPlaceholderArtifacts(xml);
	xml = convertCommonCustomerPlaceholders(xml);
	xml = convertAddPlaceholdersToTags(xml);
	xml = replaceInlineBracketTokenLiterals(xml);
	xml = convertDirectBracketPlaceholdersToTags(xml);
	xml = convertSplitHashPlaceholders(xml);
	xml = convertProposalOptionsSolutionRows(xml, solutionRows, file);
	xml = removeYellowHighlights(xml);
	xml = reapplyManualPlaceholderHighlights(xml);

	writeTemplate(zip, xml, filePath);
	console.log(`  ✓ ${file}`);
}

function processProposalTemplate(file) {
	const filePath = path.join(PARTNER_TEMPLATES_ROOT, file);
	const { zip, xml: rawXml } = readTemplateXml(filePath);
	let xml = rawXml;

	xml = repairSerializedPlaceholderArtifacts(xml);
	xml = convertCommonCustomerPlaceholders(xml);
	xml = convertAddPlaceholdersToTags(xml);
	xml = replaceInlineBracketTokenLiterals(xml);
	xml = convertDirectBracketPlaceholdersToTags(xml);
	xml = convertSplitHashPlaceholders(xml);
	xml = removeYellowHighlights(xml);
	xml = reapplyManualPlaceholderHighlights(xml);

	writeTemplate(zip, xml, filePath);
	console.log(`  ✓ ${file}`);
}

console.log('Updating partner email templates...\n');
console.log('opportunity_list');
for (const template of OPPORTUNITY_LIST_TEMPLATES) {
	processOpportunityListTemplate(template);
}

console.log('\nproposal_options');
for (const template of PROPOSAL_OPTIONS_TEMPLATES) {
	processProposalOptionsTemplate(template);
}

console.log('\nproposal');
for (const file of PROPOSAL_TEMPLATES) {
	processProposalTemplate(file);
}

console.log('\nDone. Verify updated .docx files in Word.');
