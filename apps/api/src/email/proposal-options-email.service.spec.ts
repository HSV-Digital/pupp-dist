import { vi } from 'vitest';
import {
	UnauthorizedException,
	UnprocessableEntityException,
} from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import PizZip from 'pizzip';
import { DOMParser } from '@xmldom/xmldom';
import {
	ENDING_SKU_BY_ID,
	STARTING_SKU_BY_ID,
	buildRegionalPricingContext,
	calculateScenario,
	computeIncrementalCostPerUserAnnual,
	getValidUpgradePaths,
	roundCurrency,
} from '@repo/shared';
import { ProposalOptionsEmailService } from './proposal-options-email.service';

function createTemplateBuffer(): Buffer {
	const documentXml = `
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:t>{customer_name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{renewal_date}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{seats}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{solution_count}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{starting_sku}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{expiring_arr}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{url}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:noProof/></w:rPr><w:t>{scenario_image_anchor}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{#solutions}{solution_name}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{flyer_url}{/solutions}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

	const relationshipsXml = `
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

	const contentTypesXml = `
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

	const zip = new PizZip();
	zip.file('word/document.xml', documentXml.trim());
	zip.file('word/_rels/document.xml.rels', relationshipsXml.trim());
	zip.file('[Content_Types].xml', contentTypesXml.trim());

	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	});
}

function createTemplateBufferWithRunProperties(): Buffer {
	const documentXml = `
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{url}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{#solutions}{solution_name}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{flyer_url}{/solutions}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:t>{scenario_image_anchor}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

	const relationshipsXml =
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
	const contentTypesXml =
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

	const zip = new PizZip();
	zip.file('word/document.xml', documentXml.trim());
	zip.file('word/_rels/document.xml.rels', relationshipsXml);
	zip.file('[Content_Types].xml', contentTypesXml);

	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	});
}

function createCustomerEmailTemplateBuffer(): Buffer {
	const documentXml = `
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>{customer_name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{solution_count}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{start_sku}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{target_sku}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{solution_details}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{solution_capabilities}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{tagline}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{one_liner}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{selected_seats}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{original_seats}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{expiring_arr}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{actual_price_per_user}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{per_user_after_promo_price}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{promo_savings_per_user}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{overall_incremental_cost}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{incremental_cost_per_user}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{start_sku_1}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{target_sku_1}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{start_sku_2}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{target_sku_2}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

	const relationshipsXml =
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
	const contentTypesXml =
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

	const zip = new PizZip();
	zip.file('word/document.xml', documentXml.trim());
	zip.file('word/_rels/document.xml.rels', relationshipsXml);
	zip.file('[Content_Types].xml', contentTypesXml);

	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	});
}

function createPartnerEmailTemplateBuffer(): Buffer {
	const documentXml = `
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:t>{customer_name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{starting_sku}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{target_sku}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{solution_overview}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{seats}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{proposed_seat}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{expiring_arr}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{after_promo_price}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{incremental_cost}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{difference}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{incrementalCostPerUserAnnual}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{incrementalIncentive}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{current_incentive}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{new_incentive}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{link}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{url}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

	const relationshipsXml =
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
	const contentTypesXml =
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

	const zip = new PizZip();
	zip.file('word/document.xml', documentXml.trim());
	zip.file('word/_rels/document.xml.rels', relationshipsXml);
	zip.file('[Content_Types].xml', contentTypesXml);

	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	});
}

function createPartnerEmailTemplateBufferWithInlineTokens(): Buffer {
	const documentXml = `
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:t>{customer_name}</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">BOM link: {link}.</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Upload details here: {url}.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

	const relationshipsXml =
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
	const contentTypesXml =
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

	const zip = new PizZip();
	zip.file('word/document.xml', documentXml.trim());
	zip.file('word/_rels/document.xml.rels', relationshipsXml);
	zip.file('[Content_Types].xml', contentTypesXml);

	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	});
}

function createPartnerMultiRenewalChunkTablesTemplateBuffer(): Buffer {
	const documentXml = `
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:t>{customer_name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{#chunks}</w:t></w:r></w:p>
    <w:p><w:r><w:t>CHUNK_BLOCK_START</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>SKU for renewal</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{starting_sku_1}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{starting_sku_2}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{starting_sku_3}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Upgrade solution</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{target_sku_1}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{target_sku_2}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{target_sku_3}</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>What they get?</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{solution_overview_1}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{solution_overview_2}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{solution_overview_3}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>SKU for renewal</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{starting_sku_1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{starting_sku_2}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{starting_sku_3}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t># Seats due for renewal</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{seats_1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{seats_2}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{seats_3}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Current investment</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{expiring_arr_1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{expiring_arr_2}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{expiring_arr_3}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Upgrade solution</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{target_sku_1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{target_sku_2}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{target_sku_3}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t># Proposed seats for upgrade</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{proposed_seat_1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{proposed_seat_2}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{proposed_seat_3}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Cost of the solution per user</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{after_promo_price_1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{after_promo_price_2}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{after_promo_price_3}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Incremental cost per user</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{incrementalCostPerUserAnnual_1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{incrementalCostPerUserAnnual_2}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{incrementalCostPerUserAnnual_3}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Total incremental annual investment for proposed # seats</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{incremental_cost_1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{incremental_cost_2}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{incremental_cost_3}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Incentive from the current SKU for proposed # Seats</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{current_incentive_1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{current_incentive_2}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{current_incentive_3}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Potential incentive for upgraded seats</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{new_incentive_1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{new_incentive_2}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{new_incentive_3}</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Incremental incentive for proposed # seats</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{incrementalIncentive_1}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{incrementalIncentive_2}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{incrementalIncentive_3}</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>{/chunks}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{link}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{url}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

	const relationshipsXml =
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
	const contentTypesXml =
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

	const zip = new PizZip();
	zip.file('word/document.xml', documentXml.trim());
	zip.file('word/_rels/document.xml.rels', relationshipsXml);
	zip.file('[Content_Types].xml', contentTypesXml);

	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	});
}

function createPartnerMultiRenewalConditionalTemplateBuffer(): Buffer {
	const documentXml = `
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>{customer_name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{#chunks}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{#is_3col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>P3:{starting_sku_1}|{starting_sku_2}|{starting_sku_3}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{/is_3col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{#is_2col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>P2:{starting_sku_1}|{starting_sku_2}|{target_sku_2}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{/is_2col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{#is_1col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>P1:{starting_sku_1}|{target_sku_1}|{incrementalIncentive_1}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{/is_1col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{/chunks}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

	const relationshipsXml =
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
	const contentTypesXml =
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

	const zip = new PizZip();
	zip.file('word/document.xml', documentXml.trim());
	zip.file('word/_rels/document.xml.rels', relationshipsXml);
	zip.file('[Content_Types].xml', contentTypesXml);

	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	});
}

function createCustomerMultiRenewalConditionalTemplateBuffer(): Buffer {
	const documentXml = `
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>{customer_name}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{#chunks}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{#is_3col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>C3:{start_sku_1}|{start_sku_2}|{start_sku_3}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{/is_3col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{#is_2col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>C2:{start_sku_1}|{start_sku_2}|{target_sku_2}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{/is_2col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{#is_1col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>C1:{start_sku_1}|{target_sku_1}|{promo_savings_per_user_1}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{/is_1col}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{/chunks}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

	const relationshipsXml =
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
	const contentTypesXml =
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

	const zip = new PizZip();
	zip.file('word/document.xml', documentXml.trim());
	zip.file('word/_rels/document.xml.rels', relationshipsXml);
	zip.file('[Content_Types].xml', contentTypesXml);

	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	});
}

function getZipEntryText(zip: PizZip, path: string): string {
	const file = zip.file(path);
	if (!file) {
		throw new Error(`${path} is missing`);
	}
	return file.asText();
}

function listMissingInternalRelationshipTargets(zip: PizZip): string[] {
	const names = new Set(Object.keys(zip.files));
	const missing: string[] = [];

	for (const relsPath of names) {
		if (!relsPath.endsWith('.rels') || !relsPath.startsWith('ppt/')) {
			continue;
		}
		const relsFile = zip.file(relsPath);
		if (!relsFile) {
			continue;
		}

		const relsXml = relsFile.asText();
		const relationships = relsXml.match(/<Relationship\b[^>]*\/>/g) ?? [];
		for (const relationship of relationships) {
			const target = relationship.match(/\bTarget="([^"]+)"/)?.[1];
			if (!target) {
				continue;
			}
			const targetMode = relationship
				.match(/\bTargetMode="([^"]+)"/)?.[1]
				?.toLowerCase();
			if (targetMode === 'external') {
				continue;
			}

			const relsDirectory = path.posix.dirname(relsPath);
			const baseDirectory =
				path.posix.basename(relsDirectory) === '_rels'
					? path.posix.dirname(relsDirectory)
					: relsDirectory;
			const resolved = target.startsWith('/')
				? target.slice(1)
				: path.posix.normalize(path.posix.join(baseDirectory, target));

			if (!names.has(resolved)) {
				missing.push(`${relsPath} -> ${target} (${resolved})`);
			}
		}
	}

	return missing;
}

function resolveInternalRelationshipTargetPath(params: {
	relsPath: string;
	target: string;
}): string {
	const relsDirectory = path.posix.dirname(params.relsPath);
	const baseDirectory =
		path.posix.basename(relsDirectory) === '_rels'
			? path.posix.dirname(relsDirectory)
			: relsDirectory;

	return params.target.startsWith('/')
		? params.target.slice(1)
		: path.posix.normalize(path.posix.join(baseDirectory, params.target));
}

function listInternalRelationshipTargetsByType(params: {
	zip: PizZip;
	relsPath: string;
	relationshipType: string;
}): string[] {
	const relsFile = params.zip.file(params.relsPath);
	if (!relsFile) {
		return [];
	}

	const relsXml = relsFile.asText();
	const relationships = relsXml.match(/<Relationship\b[^>]*\/>/g) ?? [];
	const targets: string[] = [];

	for (const relationship of relationships) {
		const type = relationship.match(/\bType="([^"]+)"/)?.[1];
		if (type !== params.relationshipType) {
			continue;
		}
		const target = relationship.match(/\bTarget="([^"]+)"/)?.[1];
		if (!target) {
			continue;
		}
		const targetMode = relationship
			.match(/\bTargetMode="([^"]+)"/)?.[1]
			?.toLowerCase();
		if (targetMode === 'external') {
			continue;
		}

		targets.push(
			resolveInternalRelationshipTargetPath({
				relsPath: params.relsPath,
				target,
			}),
		);
	}

	return targets;
}

function listUnregisteredPresentationMasterReferences(zip: PizZip): string[] {
	const presentationSlideMasters = new Set(
		listInternalRelationshipTargetsByType({
			zip,
			relsPath: 'ppt/_rels/presentation.xml.rels',
			relationshipType:
				'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
		}),
	);
	const presentationNotesMasters = new Set(
		listInternalRelationshipTargetsByType({
			zip,
			relsPath: 'ppt/_rels/presentation.xml.rels',
			relationshipType:
				'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
		}),
	);

	const missing: string[] = [];
	const zipEntries = Object.keys(zip.files);

	for (const relsPath of zipEntries) {
		if (!relsPath.startsWith('ppt/slideLayouts/_rels/')) {
			continue;
		}

		const slideMasterTargets = listInternalRelationshipTargetsByType({
			zip,
			relsPath,
			relationshipType:
				'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
		});
		for (const target of slideMasterTargets) {
			if (!presentationSlideMasters.has(target)) {
				missing.push(`${relsPath} -> ${target} (unregistered slide master)`);
			}
		}
	}

	for (const relsPath of zipEntries) {
		if (!relsPath.startsWith('ppt/notesSlides/_rels/')) {
			continue;
		}

		const notesMasterTargets = listInternalRelationshipTargetsByType({
			zip,
			relsPath,
			relationshipType:
				'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
		});
		for (const target of notesMasterTargets) {
			if (!presentationNotesMasters.has(target)) {
				missing.push(`${relsPath} -> ${target} (unregistered notes master)`);
			}
		}
	}

	return missing;
}

function listLegacyMergedPartPaths(zip: PizZip): string[] {
	return Object.keys(zip.files)
		.filter((entryPath) => entryPath.startsWith('ppt/'))
		.filter((entryPath) => entryPath.includes('__m'))
		.sort();
}

function listPptPartsMissingContentTypeOverrides(zip: PizZip): string[] {
	const contentTypesXml = zip.file('[Content_Types].xml')?.asText();
	if (!contentTypesXml) {
		return ['[Content_Types].xml is missing'];
	}

	const overridePartNames = new Set<string>();
	const overridePattern = /<Override\b[^>]*\bPartName="([^"]+)"/g;
	let overrideMatch = overridePattern.exec(contentTypesXml);
	while (overrideMatch) {
		const partName = overrideMatch[1];
		if (partName) {
			overridePartNames.add(partName);
		}
		overrideMatch = overridePattern.exec(contentTypesXml);
	}

	const requiredPartPatterns = [
		/^ppt\/slides\/slide\d+\.xml$/,
		/^ppt\/slideLayouts\/slideLayout\d+\.xml$/,
		/^ppt\/slideMasters\/slideMaster\d+\.xml$/,
		/^ppt\/notesSlides\/notesSlide\d+\.xml$/,
		/^ppt\/notesMasters\/notesMaster\d+\.xml$/,
	];

	return Object.keys(zip.files)
		.filter((entryPath) =>
			requiredPartPatterns.some((pattern) => pattern.test(entryPath)),
		)
		.filter((entryPath) => !overridePartNames.has(`/${entryPath}`))
		.sort();
}

function listDuplicateSlideMasterLayoutIds(zip: PizZip): string[] {
	const layoutIdToMasters = new Map<string, string[]>();

	const slideMasterPaths = Object.keys(zip.files)
		.filter((entryPath) =>
			/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(entryPath),
		)
		.sort((left, right) => {
			const leftNumber = Number.parseInt(
				left.match(/slideMaster(\d+)\.xml$/)?.[1] ?? '0',
				10,
			);
			const rightNumber = Number.parseInt(
				right.match(/slideMaster(\d+)\.xml$/)?.[1] ?? '0',
				10,
			);
			return leftNumber - rightNumber;
		});

	for (const slideMasterPath of slideMasterPaths) {
		const slideMasterXml = zip.file(slideMasterPath)?.asText();
		if (!slideMasterXml) {
			continue;
		}
		const pattern = /<p:sldLayoutId\b[^>]*\bid="(\d+)"/g;
		let match = pattern.exec(slideMasterXml);
		while (match) {
			const layoutId = match[1];
			if (layoutId) {
				const masters = layoutIdToMasters.get(layoutId) ?? [];
				masters.push(slideMasterPath);
				layoutIdToMasters.set(layoutId, masters);
			}
			match = pattern.exec(slideMasterXml);
		}
	}

	return [...layoutIdToMasters.entries()]
		.filter(([, masterPaths]) => masterPaths.length > 1)
		.map(([layoutId, masterPaths]) => `${layoutId}: ${masterPaths.join(',')}`)
		.sort();
}

function listCrossPoolPresentationIdCollisions(zip: PizZip): string[] {
	const refsById = new Map<number, string[]>();
	const appendRef = (id: number, ref: string): void => {
		const refs = refsById.get(id) ?? [];
		refs.push(ref);
		refsById.set(id, refs);
	};

	const presentationXml = zip.file('ppt/presentation.xml')?.asText() ?? '';
	const slideIdPattern = /<p:sldId\b[^>]*\bid="(\d+)"/g;
	const slideMasterIdPattern = /<p:sldMasterId\b[^>]*\bid="(\d+)"/g;
	let slideOrdinal = 0;
	let slideMatch = slideIdPattern.exec(presentationXml);
	while (slideMatch) {
		const parsed = Number.parseInt(slideMatch[1] ?? '', 10);
		if (Number.isFinite(parsed)) {
			appendRef(parsed, `presentation.xml:p:sldId#${slideOrdinal}`);
			slideOrdinal += 1;
		}
		slideMatch = slideIdPattern.exec(presentationXml);
	}

	let slideMasterOrdinal = 0;
	let slideMasterMatch = slideMasterIdPattern.exec(presentationXml);
	while (slideMasterMatch) {
		const parsed = Number.parseInt(slideMasterMatch[1] ?? '', 10);
		if (Number.isFinite(parsed)) {
			appendRef(parsed, `presentation.xml:p:sldMasterId#${slideMasterOrdinal}`);
			slideMasterOrdinal += 1;
		}
		slideMasterMatch = slideMasterIdPattern.exec(presentationXml);
	}

	const slideMasterPaths = Object.keys(zip.files)
		.filter((entryPath) =>
			/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(entryPath),
		)
		.sort((left, right) => {
			const leftNumber = Number.parseInt(
				left.match(/slideMaster(\d+)\.xml$/)?.[1] ?? '0',
				10,
			);
			const rightNumber = Number.parseInt(
				right.match(/slideMaster(\d+)\.xml$/)?.[1] ?? '0',
				10,
			);
			return leftNumber - rightNumber;
		});
	for (const slideMasterPath of slideMasterPaths) {
		const slideMasterXml = zip.file(slideMasterPath)?.asText();
		if (!slideMasterXml) {
			continue;
		}
		const layoutPattern = /<p:sldLayoutId\b[^>]*\bid="(\d+)"/g;
		let layoutOrdinal = 0;
		let layoutMatch = layoutPattern.exec(slideMasterXml);
		while (layoutMatch) {
			const parsed = Number.parseInt(layoutMatch[1] ?? '', 10);
			if (Number.isFinite(parsed)) {
				appendRef(parsed, `${slideMasterPath}:p:sldLayoutId#${layoutOrdinal}`);
				layoutOrdinal += 1;
			}
			layoutMatch = layoutPattern.exec(slideMasterXml);
		}
	}

	return [...refsById.entries()]
		.filter(([, refs]) => refs.length > 1)
		.map(([id, refs]) => `${id}: ${refs.join(', ')}`)
		.sort((left, right) => {
			const leftId = Number.parseInt(left.split(':', 1)[0] ?? '0', 10);
			const rightId = Number.parseInt(right.split(':', 1)[0] ?? '0', 10);
			return leftId - rightId;
		});
}

function listUnreferencedThemeParts(zip: PizZip): string[] {
	const themeFiles = Object.keys(zip.files)
		.filter((entryPath) => /^ppt\/theme\/theme\d+\.xml$/.test(entryPath))
		.sort();
	const referencedThemes = new Set<string>();
	const relsPaths = Object.keys(zip.files).filter((entryPath) =>
		/^ppt\/(?:slideMasters|notesMasters)\/_rels\/[^/]+\.rels$/.test(entryPath),
	);

	for (const relsPath of relsPaths) {
		const targets = listInternalRelationshipTargetsByType({
			zip,
			relsPath,
			relationshipType:
				'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
		});
		for (const target of targets) {
			referencedThemes.add(target);
		}
	}

	return themeFiles.filter((themePath) => !referencedThemes.has(themePath));
}

function listChangesInfoArtifacts(zip: PizZip): string[] {
	const artifacts = Object.keys(zip.files)
		.filter((entryPath) => entryPath.startsWith('ppt/changesInfos/'))
		.sort();

	const presentationRelsXml = zip
		.file('ppt/_rels/presentation.xml.rels')
		?.asText();
	if (
		presentationRelsXml?.includes(
			'http://schemas.microsoft.com/office/2016/11/relationships/changesInfo',
		)
	) {
		artifacts.push(
			'ppt/_rels/presentation.xml.rels (changesInfo relationship)',
		);
	}

	const contentTypesXml = zip.file('[Content_Types].xml')?.asText();
	if (contentTypesXml?.includes('PartName="/ppt/changesInfos/')) {
		artifacts.push('[Content_Types].xml (changesInfo override)');
	}

	return artifacts;
}

function listDuplicateMediaHashes(zip: PizZip): string[] {
	const hashCounts = new Map<string, number>();
	for (const mediaPath of Object.keys(zip.files).filter((entryPath) =>
		entryPath.startsWith('ppt/media/'),
	)) {
		const buffer = zip.file(mediaPath)?.asNodeBuffer();
		if (!buffer) {
			continue;
		}
		const hash = crypto.createHash('sha256').update(buffer).digest('hex');
		hashCounts.set(hash, (hashCounts.get(hash) ?? 0) + 1);
	}

	return [...hashCounts.entries()]
		.filter(([, count]) => count > 1)
		.map(([hash, count]) => `${hash}:${count}`)
		.sort();
}

function readFirstTagText(
	doc: { getElementsByTagName: (tag: string) => any[] },
	tagName: string,
): string {
	return doc.getElementsByTagName(tagName)[0]?.textContent?.trim() ?? '';
}

function parseAppXmlSummary(zip: PizZip): {
	slides: number;
	notes: number;
	hiddenSlides: number;
	words: number;
	paragraphs: number;
	fontCount: number;
	themeCount: number;
	slideTitleCount: number;
	titlesVectorSize: number;
	titlesEntriesCount: number;
} {
	const appXml = getZipEntryText(zip, 'docProps/app.xml');
	const doc = new DOMParser().parseFromString(appXml, 'application/xml');
	const headingPairs =
		appXml.match(/<HeadingPairs>([\s\S]*?)<\/HeadingPairs>/)?.[1] ?? '';
	const headingPairsPattern =
		/<vt:variant>\s*<vt:lpstr>([\s\S]*?)<\/vt:lpstr>\s*<\/vt:variant>\s*<vt:variant>\s*<vt:i4>(\d+)<\/vt:i4>\s*<\/vt:variant>/g;
	const headingCounts = new Map<string, number>();
	let headingMatch = headingPairsPattern.exec(headingPairs);
	while (headingMatch) {
		headingCounts.set(
			headingMatch[1] ?? '',
			Number.parseInt(headingMatch[2] ?? '0', 10),
		);
		headingMatch = headingPairsPattern.exec(headingPairs);
	}

	const titlesOfParts =
		appXml.match(/<TitlesOfParts>([\s\S]*?)<\/TitlesOfParts>/)?.[1] ?? '';
	const titlesVectorMatch =
		/<vt:vector\b[^>]*\bsize="(\d+)"[^>]*>([\s\S]*?)<\/vt:vector>/.exec(
			titlesOfParts,
		);
	const titlesEntriesCount =
		titlesVectorMatch?.[2]?.match(/<vt:lpstr>/g)?.length ?? 0;
	return {
		slides: Number.parseInt(readFirstTagText(doc, 'Slides'), 10),
		notes: Number.parseInt(readFirstTagText(doc, 'Notes'), 10),
		hiddenSlides: Number.parseInt(readFirstTagText(doc, 'HiddenSlides'), 10),
		words: Number.parseInt(readFirstTagText(doc, 'Words'), 10),
		paragraphs: Number.parseInt(readFirstTagText(doc, 'Paragraphs'), 10),
		fontCount: headingCounts.get('Fonts Used') ?? 0,
		themeCount: headingCounts.get('Theme') ?? 0,
		slideTitleCount: headingCounts.get('Slide Titles') ?? 0,
		titlesVectorSize: Number.parseInt(titlesVectorMatch?.[1] ?? '0', 10),
		titlesEntriesCount,
	};
}

function listZipEntryCompressionMethods(
	zipBuffer: Buffer,
): Map<string, number> {
	const methods = new Map<string, number>();
	let offset = 0;

	while (offset + 4 <= zipBuffer.length) {
		const signature = zipBuffer.readUInt32LE(offset);
		if (signature === 0x04034b50) {
			if (offset + 30 > zipBuffer.length) {
				break;
			}
			const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
			const compressedSize = zipBuffer.readUInt32LE(offset + 18);
			const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
			const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);
			const dataOffset = offset + 30;
			const fileNameEnd = dataOffset + fileNameLength;
			const compressedEnd = fileNameEnd + extraFieldLength + compressedSize;
			if (compressedEnd > zipBuffer.length) {
				break;
			}
			const fileName = zipBuffer
				.subarray(dataOffset, fileNameEnd)
				.toString('utf8');
			methods.set(fileName, compressionMethod);
			offset = compressedEnd;
			continue;
		}
		if (signature === 0x02014b50 || signature === 0x06054b50) {
			break;
		}
		break;
	}

	return methods;
}

function getTinyPngBuffer(): Buffer {
	// 1x1 transparent PNG
	return Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
		'base64',
	);
}

function formatCurrency(value: number): string {
	return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatCurrencyForRegion(value: number, region: string): string {
	const pricingContext = buildRegionalPricingContext({ region });
	return `${pricingContext.currencySymbol}${Math.round(value).toLocaleString(pricingContext.locale)}`;
}

function createUsdPricingContextPayload() {
	return {
		region: 'United States',
		country: 'US',
		currency: 'USD',
		currencySymbol: '$',
		locale: 'en-US',
		fallbackApplied: false,
		fallbackReason: 'none',
	};
}

function assertXmlWellFormed(xml: string, context: string): void {
	const parser = new DOMParser({
		onError: (level, message) => {
			if (level === 'error' || level === 'fatalError') {
				throw new Error(`${context}: ${message}`);
			}
		},
	});
	parser.parseFromString(xml, 'application/xml');
}

function assertZipXmlEntriesWellFormed(zip: PizZip): void {
	for (const entryPath of Object.keys(zip.files)) {
		if (!entryPath.endsWith('.xml') && !entryPath.endsWith('.rels')) {
			continue;
		}

		const entry = zip.file(entryPath);
		if (!entry) continue;
		assertXmlWellFormed(entry.asText(), entryPath);
	}
}

function createFlyerTemplateBuffer(): Buffer {
	const zip = new PizZip();
	zip.file(
		'ppt/slides/slide1.xml',
		[
			'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
			'<p:cSld><p:spTree><p:sp><p:txBody>',
			'<a:p><a:r><a:t>{start_sku}</a:t></a:r></a:p>',
			'<a:p><a:r><a:t>{target_sku}</a:t></a:r></a:p>',
			'<a:p><a:r><a:t>{add_proposed_seat}</a:t></a:r></a:p>',
			'<a:p><a:r><a:t>{overall_incremental_cost}</a:t></a:r></a:p>',
			'<a:p><a:r><a:t>{incremental_cost_per_user}</a:t></a:r></a:p>',
			'<a:p><a:r><a:t>{actual_price_per_user}</a:t></a:r></a:p>',
			'<a:p><a:r><a:t>{per_user_after_promo_price}</a:t></a:r></a:p>',
			'<a:p><a:r><a:t>{promo_savings_per_user}</a:t></a:r></a:p>',
			'<a:p><a:r><a:t>[PARTNER NAME]</a:t></a:r></a:p>',
			'</p:txBody></p:sp></p:spTree></p:cSld>',
			'</p:sld>',
		].join(''),
	);
	zip.file(
		'ppt/notesSlides/notesSlide1.xml',
		[
			'<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
			'<p:cSld><p:spTree><p:sp><p:txBody>',
			'<a:p><a:r><a:t>[INSTRUCTION FOR THE PARTNER]</a:t></a:r></a:p>',
			'</p:txBody></p:sp></p:spTree></p:cSld>',
			'</p:notes>',
		].join(''),
	);
	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	});
}

function createFlyerTemplateBufferWithUnknownPlaceholder(): Buffer {
	const zip = new PizZip();
	zip.file(
		'ppt/slides/slide1.xml',
		[
			'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
			'<p:cSld><p:spTree><p:sp><p:txBody>',
			'<a:p><a:r><a:t>{start_sku}</a:t></a:r></a:p>',
			'<a:p><a:r><a:t>{unknown_metric}</a:t></a:r></a:p>',
			'</p:txBody></p:sp></p:spTree></p:cSld>',
			'</p:sld>',
		].join(''),
	);
	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	});
}

function createFirstPageFlyerTemplateBufferWithoutDynamicRows(): Buffer {
	const zip = new PizZip();
	zip.file(
		'ppt/slides/slide1.xml',
		[
			'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
			'<p:cSld><p:spTree><p:graphicFrame><a:graphic>',
			'<a:graphicData><a:tbl>',
			'<a:tr><a:tc><a:txBody><a:p><a:r><a:t>Start SKU</a:t></a:r></a:p></a:txBody></a:tc></a:tr>',
			'</a:tbl></a:graphicData>',
			'</a:graphic></p:graphicFrame></p:spTree></p:cSld>',
			'</p:sld>',
		].join(''),
	);
	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	});
}

function createFirstPageFlyerTemplateBufferWithSplitDynamicRow(): Buffer {
	const zip = new PizZip();
	zip.file(
		'ppt/slides/slide1.xml',
		[
			'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
			'<p:cSld><p:spTree><p:graphicFrame><a:graphic>',
			'<a:graphicData><a:tbl>',
			'<a:tr><a:tc><a:txBody><a:p><a:r><a:t>From</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>To</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t># Seats</a:t></a:r></a:p></a:txBody></a:tc></a:tr>',
			'<a:tr>',
			'<a:tc><a:txBody><a:p><a:r><a:t>{</a:t></a:r><a:r><a:t>start_sku</a:t></a:r><a:r><a:t>}</a:t></a:r></a:p></a:txBody></a:tc>',
			'<a:tc><a:txBody><a:p><a:r><a:t>{</a:t></a:r><a:r><a:t>target_sku</a:t></a:r><a:r><a:t>}</a:t></a:r></a:p></a:txBody></a:tc>',
			'<a:tc><a:txBody><a:p><a:r><a:t>{seats}</a:t></a:r></a:p></a:txBody></a:tc>',
			'</a:tr>',
			'</a:tbl></a:graphicData>',
			'</a:graphic></p:graphicFrame></p:spTree></p:cSld>',
			'</p:sld>',
		].join(''),
	);
	return zip.generate({
		type: 'nodebuffer',
		mimeType:
			'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	});
}

describe('ProposalOptionsEmailService', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('creates proposal-options link with signed token payload', async () => {
		const dlTokenService = {
			createToken: vi.fn(() => 'signed-token'),
			verifyTokenForScope: vi.fn(),
		};
		const blobStorageService = {
			upload: vi
				.fn()
				.mockResolvedValueOnce('https://blob.example/flyer-1.pptx')
				.mockResolvedValueOnce('https://blob.example/flyer-2.pptx')
				.mockResolvedValueOnce('https://blob.example/screenshot.png')
				.mockResolvedValueOnce('https://blob.example/zip-bs_cb.zip')
				.mockResolvedValueOnce('https://blob.example/zip-bp_cb.zip'),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
		const readFileSpy = vi
			.spyOn(fs, 'readFile')
			.mockResolvedValue(createFlyerTemplateBuffer());
		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createCustomerEmailTemplateBuffer(),
		);

		const result = await service.createProposalOptionsEmailLink({
			payload: {
				journey: 'renewal',
				filter: 'ai',
				customerId: 'cust-1',
				customerName: 'Contoso',
				opportunityId: 'opp-1',
				startingSkuId: 'bs',
				startingSkuName: 'Business Standard',
				seats: 40,
				expiringArr: 6000,
				renewalDate: '2026-12-01',
				selectedEndingSkuIds: ['bs_cb', 'bp_cb'],
			},
			screenshotFile: {
				originalname: 'cards.png',
				mimetype: 'image/png',
				size: 128,
				buffer: Buffer.from('png'),
			},
		});

		expect(readFileSpy).toHaveBeenCalledTimes(2);
		expect(blobStorageService.upload).toHaveBeenCalledTimes(5);
		const uploadedFlyerBuffer = blobStorageService.upload.mock
			.calls[0][2] as Buffer;
		const uploadedFlyerZip = new PizZip(uploadedFlyerBuffer);
		const uploadedSlideXml = getZipEntryText(
			uploadedFlyerZip,
			'ppt/slides/slide1.xml',
		);
		const uploadedNotesXml = getZipEntryText(
			uploadedFlyerZip,
			'ppt/notesSlides/notesSlide1.xml',
		);
		const startingSku = STARTING_SKU_BY_ID.get('bs');
		const endingSku = getValidUpgradePaths('bs', { country: 'US' }).find(
			(candidate) => candidate.id === 'bs_cb',
		);
		if (!startingSku || !endingSku) {
			throw new Error('Expected fixture SKU IDs to be available');
		}
		const scenario = calculateScenario(startingSku, endingSku, 40);
		const incrementalPerUserAnnual = computeIncrementalCostPerUserAnnual({
			offerAnnualValue: scenario.offerAnnualValue,
			currentAnnualValue: scenario.currentAnnualValue,
			seats: 40,
		});
		const afterPromoPerUserAnnual = roundCurrency(endingSku.promoPrice * 12);
		const promoSavingsPerUserAnnual = roundCurrency(
			(endingSku.listPrice - endingSku.promoPrice) * 12,
		);
		const actualPricePerUserAnnual = scenario.listAnnualValue / 40;

		expect(uploadedSlideXml).toContain('Business Standard');
		expect(uploadedSlideXml).toContain('Business Standard + Copilot Business');
		expect(uploadedSlideXml).toContain('40');
		expect(uploadedSlideXml).toContain(
			formatCurrency(scenario.incrementalCost),
		);
		expect(uploadedSlideXml).toContain(
			formatCurrency(incrementalPerUserAnnual),
		);
		expect(uploadedSlideXml).toContain(
			formatCurrency(actualPricePerUserAnnual),
		);
		expect(uploadedSlideXml).toContain(formatCurrency(afterPromoPerUserAnnual));
		expect(uploadedSlideXml).toContain(
			formatCurrency(promoSavingsPerUserAnnual),
		);
		expect(uploadedSlideXml).not.toContain('{per_user_after_promo_price}');
		expect(uploadedSlideXml).not.toContain('{promo_savings_per_user}');
		expect(uploadedSlideXml).not.toContain('{promo_savings}');
		expect(uploadedSlideXml).not.toContain('{overall_incremental_cost}');
		expect(uploadedSlideXml).not.toContain('{incremental_cost_per_user}');
		expect(uploadedSlideXml).not.toContain('{actual_price_per_user}');
		expect(uploadedSlideXml).not.toContain('{target_sku}');
		expect(uploadedSlideXml).toContain('[PARTNER NAME]');
		expect(uploadedNotesXml).toContain('[INSTRUCTION FOR THE PARTNER]');
		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'proposal-options-email',
				selectedSkuIds: ['bs_cb', 'bp_cb'],
				proposalOptionsEmail: expect.objectContaining({
					journey: 'renewal',
					filter: 'ai',
					customerId: 'cust-1',
					screenshotUrl: 'https://blob.example/screenshot.png',
					screenshotBlobName:
						'proposal-options/screenshots/cust-1/opp-1/1700000000000-ai.png',
					screenshotMimeType: 'image/png',
					documentsZipUrl: null,
					documentsZipBlobName: null,
					options: expect.arrayContaining([
						expect.objectContaining({
							endingSkuId: 'bs_cb',
							documentsZipUrl: 'https://blob.example/zip-bs_cb.zip',
						}),
						expect.objectContaining({
							endingSkuId: 'bp_cb',
							documentsZipUrl: 'https://blob.example/zip-bp_cb.zip',
						}),
					]),
				}),
			}),
		);
		expect(
			dlTokenService.createToken.mock.calls[0]?.[0]?.singleUse,
		).toBeUndefined();
		// Verify per-solution ZIPs were uploaded with correct content type
		const zip1UploadCall = blobStorageService.upload.mock.calls[3];
		expect(zip1UploadCall[3]).toBe('application/zip');
		const zip1Buffer = zip1UploadCall[2] as Buffer;
		const zip1 = new PizZip(zip1Buffer);
		const zip1Entries = Object.keys(zip1.files).filter(
			(name) => !name.endsWith('/'),
		);
		expect(zip1Entries).toContain('Business Standard + Copilot Business.pptx');
		expect(zip1Entries).toContain('Business Standard + Copilot Business.docx');
		expect(zip1Entries).toHaveLength(2);

		const zip2UploadCall = blobStorageService.upload.mock.calls[4];
		expect(zip2UploadCall[3]).toBe('application/zip');
		const zip2Buffer = zip2UploadCall[2] as Buffer;
		const zip2 = new PizZip(zip2Buffer);
		const zip2Entries = Object.keys(zip2.files).filter(
			(name) => !name.endsWith('/'),
		);
		expect(zip2Entries).toContain('Business Premium + Copilot Business.pptx');
		expect(zip2Entries).toContain('Business Premium + Copilot Business.docx');
		expect(zip2Entries).toHaveLength(2);
		expect(result.url).toContain(
			'/api/email/proposal-options/download?dlToken=signed-token',
		);
		expect(result.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		nowSpy.mockRestore();
	});

	it('uses provided selectedScenarios for per-solution seat and ARR values', async () => {
		const dlTokenService = {
			createToken: vi.fn(() => 'signed-token'),
			verifyTokenForScope: vi.fn(),
		};
		const blobStorageService = {
			upload: vi
				.fn()
				.mockResolvedValueOnce('https://blob.example/flyer-1.pptx')
				.mockResolvedValueOnce('https://blob.example/flyer-2.pptx')
				.mockResolvedValueOnce('https://blob.example/zip-bs_cb.zip')
				.mockResolvedValueOnce('https://blob.example/zip-bp_cb.zip'),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(fs, 'readFile').mockResolvedValue(createFlyerTemplateBuffer());
		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createCustomerEmailTemplateBuffer(),
		);

		await service.createProposalOptionsEmailLink({
			payload: {
				journey: 'renewal',
				filter: 'ai',
				customerId: 'cust-1',
				customerName: 'Contoso',
				opportunityId: 'opp-1',
				startingSkuId: 'bs',
				startingSkuName: 'Business Standard',
				seats: 40,
				expiringArr: 6000,
				selectedEndingSkuIds: ['bs_cb', 'bp_cb'],
				selectedScenarios: [
					{
						opportunityId: 'opp-1',
						endingSkuId: 'bs_cb',
						selectedSeats: 30,
						originalSeats: 30,
						expiringArr: 4500,
					},
					{
						opportunityId: 'opp-1',
						endingSkuId: 'bp_cb',
						selectedSeats: 10,
						originalSeats: 10,
						expiringArr: 1500,
					},
				],
			},
		});

		const uploadedFlyerBuffer = blobStorageService.upload.mock
			.calls[0][2] as Buffer;
		const uploadedFlyerZip = new PizZip(uploadedFlyerBuffer);
		const uploadedSlideXml = getZipEntryText(
			uploadedFlyerZip,
			'ppt/slides/slide1.xml',
		);
		expect(uploadedSlideXml).toContain('30');

		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				selectedSkuIds: ['bs_cb', 'bp_cb'],
				proposalOptionsEmail: expect.objectContaining({
					seats: 40,
					expiringArr: 6000,
					options: expect.arrayContaining([
						expect.objectContaining({
							endingSkuId: 'bs_cb',
							selectedSeats: 30,
							originalSeats: 30,
							expiringArr: 4500,
						}),
						expect.objectContaining({
							endingSkuId: 'bp_cb',
							selectedSeats: 10,
							originalSeats: 10,
							expiringArr: 1500,
						}),
					]),
				}),
			}),
		);
	});

	it('renders template data and embeds screenshot inline in DOCX', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalOptionsEmail: {
					templatePath:
						'/email_templates/partner/proposal_options/renewal/ai.docx',
					journey: 'renewal',
					filter: 'ai',
					customerId: 'cust-1',
					customerName: 'Contoso',
					opportunityId: 'opp-1',
					renewalDate: '2026-12-01',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					seats: 40,
					expiringArr: 6123,
					url: 'https://pupp.cloud-programs.com/csp-partners',
					options: [
						{
							endingSkuId: 'bs_cb',
							solutionName: 'Business Standard + Copilot Business',
							flyerUrl: 'https://blob.example/flyer-1.pptx',
						},
					],
					screenshotUrl: 'https://blob.example/screenshot.png',
					screenshotBlobName:
						'proposal-options/screenshots/cust-1/opp-1/screen.png',
					screenshotMimeType: 'image/png',
					documentsZipUrl: 'https://blob.example/documents.zip',
					documentsZipBlobName:
						'proposal-options/documents/cust-1/opp-1/123.zip',
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn().mockResolvedValue(getTinyPngBuffer()),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createTemplateBuffer(),
		);

		const rendered = await service.renderProposalOptionsEmailFromToken('token');
		const zip = new PizZip(rendered);
		assertZipXmlEntriesWellFormed(zip);

		const documentXml = getZipEntryText(zip, 'word/document.xml');
		const relsXml = getZipEntryText(zip, 'word/_rels/document.xml.rels');
		const contentTypesXml = getZipEntryText(zip, '[Content_Types].xml');

		expect(documentXml).toContain('Contoso');
		expect(documentXml).toContain('December 1, 2026');
		expect(documentXml).toContain('$6,123');
		expect(documentXml).toContain('Business Standard + Copilot Business');
		expect(documentXml).toContain(
			'https://pupp.cloud-programs.com/csp-partners',
		);
		expect(documentXml).not.toContain('View Proposal Flyer');
		expect(documentXml).toContain('<w:drawing>');
		expect(documentXml).not.toContain('__SCENARIO_IMAGE_ANCHOR__');
		expect(documentXml).toContain('Download Proposal Documents');
		expect(documentXml).toContain('<w:hyperlink');

		expect(relsXml).toContain('/relationships/image');
		expect(relsXml).toContain(
			'Target="https://pupp.cloud-programs.com/csp-partners"',
		);
		expect(relsXml).not.toContain('Target="https://blob.example/flyer-1.pptx"');
		expect(relsXml).toContain('Target="https://blob.example/documents.zip"');
		expect(relsXml).toContain('Target="media/scenario-');
		expect(contentTypesXml).toContain('Extension="png"');

		const mediaEntries = Object.keys(zip.files).filter((entry) =>
			entry.startsWith('word/media/scenario-'),
		);
		expect(mediaEntries.length).toBeGreaterThan(0);
	});

	it('embeds screenshot inline without corrupting runs that include run properties', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalOptionsEmail: {
					templatePath:
						'/email_templates/partner/proposal_options/renewal/ai.docx',
					journey: 'renewal',
					filter: 'ai',
					customerId: 'cust-1',
					customerName: 'Contoso',
					opportunityId: 'opp-1',
					renewalDate: '2026-12-01',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					seats: 40,
					expiringArr: 6123,
					url: 'https://pupp.cloud-programs.com/csp-partners',
					options: [
						{
							endingSkuId: 'bs_cb',
							solutionName: 'Business Standard + Copilot Business',
							flyerUrl: 'https://blob.example/flyer-1.pptx',
						},
					],
					screenshotUrl: 'https://blob.example/screenshot.png',
					screenshotBlobName:
						'proposal-options/screenshots/cust-1/opp-1/screen.png',
					screenshotMimeType: 'image/png',
					documentsZipUrl: null,
					documentsZipBlobName: null,
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn().mockResolvedValue(getTinyPngBuffer()),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createTemplateBufferWithRunProperties(),
		);

		const rendered = await service.renderProposalOptionsEmailFromToken('token');
		const zip = new PizZip(rendered);
		assertZipXmlEntriesWellFormed(zip);

		const documentXml = getZipEntryText(zip, 'word/document.xml');
		expect(documentXml).not.toContain('<w:rPr><w:r>');
		expect(documentXml).toContain('<w:drawing>');
	});

	it('renders all proposal-option templates with screenshot as well-formed DOCX XML', async () => {
		const templatePaths = [
			'/email_templates/partner/proposal_options/renewal/ai.docx',
			'/email_templates/partner/proposal_options/renewal/security.docx',
			'/email_templates/partner/proposal_options/renewal/ai_and_security.docx',
			'/email_templates/partner/proposal_options/new_customer/new_customer.docx',
		];
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn().mockResolvedValue(getTinyPngBuffer()),
		};

		for (const templatePath of templatePaths) {
			const relativeTemplatePath = templatePath.slice(
				'/email_templates/'.length,
			);
			await expect(
				fs.access(
					path.resolve(
						process.cwd(),
						'assets',
						'email_templates',
						relativeTemplatePath,
					),
				),
			).resolves.toBeUndefined();

			const dlTokenService = {
				createToken: vi.fn(),
				verifyTokenForScope: vi.fn(() => ({
					proposalOptionsEmail: {
						templatePath,
						journey: templatePath.includes('/new_customer/')
							? 'new_customer'
							: 'renewal',
						filter: templatePath.includes('/security/')
							? 'security'
							: templatePath.includes('/ai_and_security/')
								? 'all'
								: 'ai',
						customerId: 'cust-1',
						customerName: 'Contoso',
						opportunityId: 'opp-1',
						renewalDate: '2026-12-01',
						startingSkuId: 'bs',
						startingSkuName: 'Business Standard',
						seats: 40,
						expiringArr: 6123,
						url: 'https://pupp.cloud-programs.com/csp-partners',
						options: [
							{
								endingSkuId: 'bs_cb',
								solutionName: 'Business Standard + Copilot Business',
								flyerUrl: 'https://blob.example/flyer-1.pptx',
							},
							{
								endingSkuId: 'bp_cb',
								solutionName: 'Business Premium + Copilot Business',
								flyerUrl: 'https://blob.example/flyer-2.pptx',
							},
						],
						screenshotUrl: 'https://blob.example/screenshot.png',
						screenshotBlobName:
							'proposal-options/screenshots/cust-1/opp-1/screen.png',
						screenshotMimeType: 'image/png',
						documentsZipUrl: 'https://blob.example/documents.zip',
						documentsZipBlobName:
							'proposal-options/documents/cust-1/opp-1/123.zip',
					},
				})),
			};
			const service = new ProposalOptionsEmailService(
				dlTokenService as never,
				blobStorageService as never,
			);

			const rendered =
				await service.renderProposalOptionsEmailFromToken('token');
			const zip = new PizZip(rendered);
			assertZipXmlEntriesWellFormed(zip);

			const documentXml = getZipEntryText(zip, 'word/document.xml');
			expect(documentXml).toContain('<w:drawing>');
			expect(documentXml).not.toContain('<w:rPr><w:r>');
			expect(documentXml).not.toContain('__SCENARIO_IMAGE_ANCHOR__');
			expect(documentXml).toContain('Download Proposal Documents');
			expect(documentXml).not.toContain('View Proposal Flyer');
		}
	});

	it('removes image anchor when screenshot is unavailable', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalOptionsEmail: {
					templatePath:
						'/email_templates/partner/proposal_options/renewal/ai.docx',
					journey: 'renewal',
					filter: 'ai',
					customerId: 'cust-1',
					customerName: 'Contoso',
					opportunityId: 'opp-1',
					renewalDate: '2026-12-01',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					seats: 40,
					expiringArr: 6123,
					url: 'https://pupp.cloud-programs.com/csp-partners',
					options: [
						{
							endingSkuId: 'bs_cb',
							solutionName: 'Business Standard + Copilot Business',
							flyerUrl: 'https://blob.example/flyer-1.pptx',
						},
					],
					screenshotUrl: null,
					screenshotBlobName: null,
					screenshotMimeType: null,
					documentsZipUrl: null,
					documentsZipBlobName: null,
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createTemplateBuffer(),
		);

		const rendered = await service.renderProposalOptionsEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(documentXml).not.toContain('__SCENARIO_IMAGE_ANCHOR__');
		expect(documentXml).not.toContain('<w:drawing>');
		expect(blobStorageService.download).not.toHaveBeenCalled();
	});

	it('injects hyperlinks without corrupting runs that include run properties', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalOptionsEmail: {
					templatePath:
						'/email_templates/partner/proposal_options/renewal/ai.docx',
					journey: 'renewal',
					filter: 'ai',
					customerId: 'cust-1',
					customerName: 'Contoso',
					opportunityId: 'opp-1',
					renewalDate: '2026-12-01',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					seats: 40,
					expiringArr: 6123,
					url: 'https://pupp.cloud-programs.com/csp-partners',
					options: [
						{
							endingSkuId: 'bs_cb',
							solutionName: 'Business Standard + Copilot Business',
							flyerUrl: 'https://blob.example/flyer-1.pptx',
						},
					],
					screenshotUrl: null,
					screenshotBlobName: null,
					screenshotMimeType: null,
					documentsZipUrl: null,
					documentsZipBlobName: null,
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createTemplateBufferWithRunProperties(),
		);

		const rendered = await service.renderProposalOptionsEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(documentXml).toContain('<w:hyperlink');
		expect(documentXml).toContain('View Proposal Flyer');
		expect(documentXml).not.toContain('<w:rPr><w:hyperlink');
	});

	it('renders per-solution ZIP links when options have documentsZipUrl', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalOptionsEmail: {
					templatePath:
						'/email_templates/partner/proposal_options/renewal/ai.docx',
					journey: 'renewal',
					filter: 'ai',
					customerId: 'cust-1',
					customerName: 'Contoso',
					opportunityId: 'opp-1',
					renewalDate: '2026-12-01',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					seats: 40,
					expiringArr: 6123,
					url: 'https://pupp.cloud-programs.com/csp-partners',
					options: [
						{
							endingSkuId: 'bs_cb',
							solutionName: 'Business Standard + Copilot Business',
							flyerUrl: 'https://blob.example/flyer-1.pptx',
							documentsZipUrl: 'https://blob.example/zip-bs_cb.zip',
						},
						{
							endingSkuId: 'bp_cb',
							solutionName: 'Business Premium + Copilot Business',
							flyerUrl: 'https://blob.example/flyer-2.pptx',
							documentsZipUrl: 'https://blob.example/zip-bp_cb.zip',
						},
					],
					screenshotUrl: null,
					screenshotBlobName: null,
					screenshotMimeType: null,
					documentsZipUrl: null,
					documentsZipBlobName: null,
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createTemplateBuffer(),
		);

		const rendered = await service.renderProposalOptionsEmailFromToken('token');
		const zip = new PizZip(rendered);
		assertZipXmlEntriesWellFormed(zip);

		const documentXml = getZipEntryText(zip, 'word/document.xml');
		const relsXml = getZipEntryText(zip, 'word/_rels/document.xml.rels');

		// Per-solution "Download Proposal Documents" links should be present
		expect(documentXml).toContain('Download Proposal Documents');
		// No "View Proposal Flyer" for per-solution ZIP era
		expect(documentXml).not.toContain('View Proposal Flyer');
		// No bottom-of-page "Download Proposal Documents" paragraph (legacy combined ZIP)
		expect(documentXml).not.toContain('<w:spacing w:before="240"/>');

		// Rels should contain per-solution ZIP URLs
		expect(relsXml).toContain('Target="https://blob.example/zip-bs_cb.zip"');
		expect(relsXml).toContain('Target="https://blob.example/zip-bp_cb.zip"');
		// Should NOT contain individual flyer URLs
		expect(relsXml).not.toContain('Target="https://blob.example/flyer-1.pptx"');
		expect(relsXml).not.toContain('Target="https://blob.example/flyer-2.pptx"');
	});

	it('rejects token payloads that do not include proposal-options metadata', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalOptionsEmail: undefined,
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		await expect(
			service.renderProposalOptionsEmailFromToken('token'),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('creates opportunity-list link with tokenized payload', () => {
		const dlTokenService = {
			createToken: vi.fn(() => 'signed-token'),
			verifyTokenForScope: vi.fn(),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		const result = service.createOpportunityListEmailLink({
			viewMode: 'reseller',
			resellerCount: 20,
			customerCount: 50,
			totalRenewals: 120,
			totalSeats: 1600,
			expiringArr: 1_450_000,
			selectedSkuIds: ['bs_cb', 'bp_defender'],
		});

		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'opportunity-list-email',
				selectedSkuIds: ['bs_cb', 'bp_defender'],
				opportunityListEmail: expect.objectContaining({
					templatePath:
						'/email_templates/partner/opportunity_list/reseller_list/ai_and_security.docx',
					solutions: expect.arrayContaining([
						expect.objectContaining({
							solutionName: 'Business Standard + Copilot Business',
						}),
						expect.objectContaining({
							solutionName: 'Business Premium + Defender Suite',
						}),
					]),
				}),
			}),
		);
		expect(
			dlTokenService.createToken.mock.calls[0]?.[0]?.singleUse,
		).toBeUndefined();
		expect(result.url).toContain(
			'/api/email/opportunity-list/download?dlToken=signed-token',
		);
	});

	it('renders opportunity-list template with hyperlink', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				opportunityListEmail: {
					templatePath:
						'/email_templates/partner/opportunity_list/reseller_list/ai.docx',
					viewMode: 'reseller',
					resellerCount: 20,
					customerCount: 50,
					totalRenewals: 120,
					totalSeats: 1600,
					expiringArr: 1_450_000,
					url: 'https://pupp.cloud-programs.com/csp-partners',
					solutions: [
						{
							solutionName: 'Business Standard + Copilot Business',
							bestFor: 'Best for productivity',
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		const templateBuffer = (() => {
			const documentXml = `
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:t>{resellers}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{customers}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{opportunities}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{seats}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{expiring_arr}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{url}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{#solutions}{name}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{bestFor}{/solutions}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

			const relationshipsXml =
				'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
			const zip = new PizZip();
			zip.file('word/document.xml', documentXml.trim());
			zip.file('word/_rels/document.xml.rels', relationshipsXml);
			zip.file(
				'[Content_Types].xml',
				'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
			);
			return zip.generate({
				type: 'nodebuffer',
				mimeType:
					'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			});
		})();

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			templateBuffer,
		);

		const rendered = await service.renderOpportunityListEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');
		const relsXml = getZipEntryText(zip, 'word/_rels/document.xml.rels');

		expect(documentXml).toContain('20');
		expect(documentXml).toContain('50');
		expect(documentXml).toContain('120');
		expect(documentXml).toContain('$1.45 Million');
		expect(documentXml).toContain(
			'https://pupp.cloud-programs.com/csp-partners',
		);
		expect(documentXml).toContain('Business Standard + Copilot Business');
		expect(relsXml).toContain(
			'Target="https://pupp.cloud-programs.com/csp-partners"',
		);
	});

	it('creates customer-proposal link with tokenized payload', () => {
		const dlTokenService = {
			createToken: vi.fn(() => 'signed-token'),
			verifyTokenForScope: vi.fn(),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		const result = service.createCustomerProposalEmailLink({
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bb',
					startingSkuName: 'Business Basic',
					endingSkuId: 'bs_cb',
					selectedSeats: 20,
					originalSeats: 24,
					expiringArr: 1200,
					region: 'Canada',
				},
				{
					opportunityId: 'opp-2',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bp_cb',
					selectedSeats: 35,
					originalSeats: 40,
					expiringArr: 3600,
					region: 'Canada',
				},
			],
		});

		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'customer-proposal-email',
				customerId: 'cust-1',
				selectedSkuIds: ['bs_cb', 'bp_cb'],
				customerProposalEmail: expect.objectContaining({
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					templatePath:
						'/email_templates/customer/renewal/multi_solution_renewal/ai.docx',
					pricingContext: expect.objectContaining({
						country: 'CA',
						currencySymbol: 'CA$',
						locale: 'en-CA',
					}),
					scenarios: expect.arrayContaining([
						expect.objectContaining({
							opportunityId: 'opp-1',
							startingSkuId: 'bb',
							endingSkuId: 'bs_cb',
							region: 'Canada',
						}),
						expect.objectContaining({
							opportunityId: 'opp-2',
							startingSkuId: 'bs',
							endingSkuId: 'bp_cb',
							region: 'Canada',
						}),
					]),
				}),
			}),
		);
		expect(
			dlTokenService.createToken.mock.calls[0]?.[0]?.singleUse,
		).toBeUndefined();
		expect(result.url).toContain(
			'/api/email/customer-proposal/download?dlToken=signed-token',
		);
	});

	it('creates new-customer customer-proposal link for multiple scenarios', () => {
		const dlTokenService = {
			createToken: vi.fn(() => 'signed-token'),
			verifyTokenForScope: vi.fn(),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		const result = service.createCustomerProposalEmailLink({
			journey: 'new_customer',
			customerId: 'cust-1',
			customerName: 'Contoso',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bb',
					startingSkuName: 'Business Basic',
					endingSkuId: 'bs_cb',
					selectedSeats: 20,
					originalSeats: 24,
					expiringArr: 1200,
					region: 'Brazil',
				},
				{
					opportunityId: 'opp-2',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bp_cb',
					selectedSeats: 35,
					originalSeats: 40,
					expiringArr: 3600,
					region: 'Brazil',
				},
			],
		});

		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'customer-proposal-email',
				customerId: 'cust-1',
				selectedSkuIds: ['bs_cb', 'bp_cb'],
				customerProposalEmail: expect.objectContaining({
					journey: 'new_customer',
					templatePath:
						'/email_templates/customer/renewal/multi_solution_renewal/ai.docx',
					pricingContext: expect.objectContaining({
						country: 'BR',
						currencySymbol: 'R$',
						locale: 'pt-BR',
					}),
					scenarios: expect.arrayContaining([
						expect.objectContaining({
							opportunityId: 'opp-1',
							region: 'Brazil',
						}),
						expect.objectContaining({
							opportunityId: 'opp-2',
							region: 'Brazil',
						}),
					]),
				}),
			}),
		);
		expect(result.url).toContain(
			'/api/email/customer-proposal/download?dlToken=signed-token',
		);
	});

	it('renders customer-proposal template with hydrated values', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				customerProposalEmail: {
					templatePath:
						'/email_templates/customer/renewal/single_solution_renewal/ai.docx',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6000,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createCustomerEmailTemplateBuffer(),
		);

		const startingSku = STARTING_SKU_BY_ID.get('bs');
		const endingSku = getValidUpgradePaths('bs', { country: 'US' }).find(
			(candidate) => candidate.id === 'bp_cb',
		);
		if (!startingSku || !endingSku) {
			throw new Error('Expected fixture SKU IDs to be available');
		}

		const scenario = calculateScenario(startingSku, endingSku, 35, {
			journey: 'renewal',
			expiringArr: 6000,
			originalSeats: 40,
		});
		const actualPricePerUserAnnual = scenario.listAnnualValue / 35;
		const afterPromoPerUserAnnual = roundCurrency(endingSku.promoPrice * 12);
		const promoSavingsPerUserAnnual = roundCurrency(
			(endingSku.listPrice - endingSku.promoPrice) * 12,
		);
		const incrementalPerUserAnnual = computeIncrementalCostPerUserAnnual({
			offerAnnualValue: scenario.offerAnnualValue,
			currentAnnualValue: scenario.currentAnnualValue,
			seats: 35,
		});

		const rendered =
			await service.renderCustomerProposalEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(documentXml).toContain('Contoso');
		expect(documentXml).toContain('1');
		expect(documentXml).toContain('Business Standard');
		expect(documentXml).toContain('Business Premium + Copilot Business');
		expect(documentXml).toContain('Unlock Secure AI Transformation');
		expect(documentXml).toContain(formatCurrency(6000));
		expect(documentXml).toContain(formatCurrency(actualPricePerUserAnnual));
		expect(documentXml).toContain(formatCurrency(afterPromoPerUserAnnual));
		expect(documentXml).toContain(formatCurrency(promoSavingsPerUserAnnual));
		expect(documentXml).toContain(formatCurrency(scenario.incrementalCost));
		expect(documentXml).toContain(formatCurrency(incrementalPerUserAnnual));
		const expectedCapability =
			endingSku.solutionCapabilities?.[0] ?? endingSku.planHighlights?.[0];
		expect(expectedCapability).toBeDefined();
		expect(documentXml.replaceAll('&apos;', "'")).toContain(
			`• ${expectedCapability}`,
		);
		expect(documentXml).not.toContain('{customer_name}');
		expect(documentXml).not.toContain('{start_sku}');
	});

	it('renders customer-proposal currency from the scenario region when payload pricing context is USD', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				customerProposalEmail: {
					templatePath:
						'/email_templates/customer/renewal/single_solution_renewal/ai.docx',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					pricingContext: createUsdPricingContextPayload(),
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6000,
							region: 'Canada',
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createCustomerEmailTemplateBuffer(),
		);

		const startingSku = STARTING_SKU_BY_ID.get('bs');
		const endingSku = getValidUpgradePaths('bs', { country: 'CA' }).find(
			(candidate) => candidate.id === 'bp_cb',
		);
		if (!startingSku || !endingSku) {
			throw new Error('Expected fixture SKU IDs to be available');
		}

		const scenario = calculateScenario(startingSku, endingSku, 35, {
			journey: 'renewal',
			expiringArr: 6000,
			originalSeats: 40,
			region: 'Canada',
			country: 'CA',
		});
		const actualPricePerUserAnnual = scenario.listAnnualValue / 35;
		const afterPromoPerUserAnnual = roundCurrency(endingSku.promoPrice * 12);
		const promoSavingsPerUserAnnual = roundCurrency(
			(endingSku.listPrice - endingSku.promoPrice) * 12,
		);
		const incrementalPerUserAnnual = computeIncrementalCostPerUserAnnual({
			offerAnnualValue: scenario.offerAnnualValue,
			currentAnnualValue: scenario.currentAnnualValue,
			seats: 35,
		});

		const rendered =
			await service.renderCustomerProposalEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(documentXml).toContain(formatCurrencyForRegion(6000, 'Canada'));
		expect(documentXml).toContain(
			formatCurrencyForRegion(actualPricePerUserAnnual, 'Canada'),
		);
		expect(documentXml).toContain(
			formatCurrencyForRegion(afterPromoPerUserAnnual, 'Canada'),
		);
		expect(documentXml).toContain(
			formatCurrencyForRegion(promoSavingsPerUserAnnual, 'Canada'),
		);
		expect(documentXml).toContain(
			formatCurrencyForRegion(scenario.incrementalCost, 'Canada'),
		);
		expect(documentXml).toContain(
			formatCurrencyForRegion(incrementalPerUserAnnual, 'Canada'),
		);
	});

	it('renders customer-proposal multi template indexed slots', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				customerProposalEmail: {
					templatePath:
						'/email_templates/customer/renewal/multi_solution_renewal/ai.docx',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bb',
							startingSkuName: 'Business Basic',
							endingSkuId: 'bs_cb',
							selectedSeats: 20,
							originalSeats: 24,
							expiringArr: 1200,
						},
						{
							opportunityId: 'opp-2',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 3600,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createCustomerEmailTemplateBuffer(),
		);

		const rendered =
			await service.renderCustomerProposalEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(documentXml).toContain('Business Basic');
		expect(documentXml).toContain('Business Standard + Copilot Business');
		expect(documentXml).toContain('Business Standard');
		expect(documentXml).toContain('Business Premium + Copilot Business');
		expect(documentXml).not.toContain('{start_sku_1}');
		expect(documentXml).not.toContain('{target_sku_2}');
	});

	it('renders customer multi renewal conditional chunks for 2-solution AI payload', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				customerProposalEmail: {
					templatePath:
						'/email_templates/customer/renewal/multi_solution_renewal/ai.docx',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bb',
							startingSkuName: 'Business Basic',
							endingSkuId: 'bs_cb',
							selectedSeats: 20,
							originalSeats: 24,
							expiringArr: 1200,
						},
						{
							opportunityId: 'opp-2',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 3600,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createCustomerMultiRenewalConditionalTemplateBuffer(),
		);

		const rendered =
			await service.renderCustomerProposalEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(documentXml).toContain('C2:Business Basic|Business Standard');
		expect(documentXml).not.toContain('C1:');
		expect(documentXml).not.toContain('C3:');
		expect(documentXml).not.toContain('{#is_2col}');
		expect(documentXml).not.toContain('{/is_2col}');
		expect(documentXml).not.toContain('{#chunks}');
		expect(documentXml).not.toContain('{/chunks}');
	});

	it('renders customer multi renewal conditional chunks for 3-solution security payload', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				customerProposalEmail: {
					templatePath:
						'/email_templates/customer/renewal/multi_solution_renewal/security.docx',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_defender',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6000,
						},
						{
							opportunityId: 'opp-2',
							startingSkuId: 'bb',
							startingSkuName: 'Business Basic',
							endingSkuId: 'bp_purview',
							selectedSeats: 20,
							originalSeats: 24,
							expiringArr: 3200,
						},
						{
							opportunityId: 'opp-3',
							startingSkuId: 'bp',
							startingSkuName: 'Business Premium',
							endingSkuId: 'bp_defender_purview',
							selectedSeats: 15,
							originalSeats: 15,
							expiringArr: 1800,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createCustomerMultiRenewalConditionalTemplateBuffer(),
		);

		const rendered =
			await service.renderCustomerProposalEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(documentXml).toContain(
			'C3:Business Standard|Business Basic|Business Premium',
		);
		expect(documentXml).not.toContain('C1:');
		expect(documentXml).not.toContain('C2:');
		expect(documentXml).not.toContain('{#is_3col}');
		expect(documentXml).not.toContain('{/is_3col}');
		expect(documentXml).not.toContain('{#chunks}');
		expect(documentXml).not.toContain('{/chunks}');
	});

	it('creates partner-proposal link with tokenized payload', () => {
		const dlTokenService = {
			createToken: vi.fn(() => 'partner-token'),
			verifyTokenForScope: vi.fn(),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		const result = service.createPartnerProposalEmailLink({
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bb',
					startingSkuName: 'Business Basic',
					endingSkuId: 'bs_cb',
					selectedSeats: 20,
					originalSeats: 24,
					expiringArr: 1200,
					region: 'Brazil',
				},
			],
		});

		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'partner-proposal-email',
				customerId: 'cust-1',
				selectedSkuIds: ['bs_cb'],
				partnerProposalEmail: expect.objectContaining({
					templatePath: '/email_templates/partner/proposal/renewal/single.docx',
					customerName: 'Contoso',
					pricingContext: expect.objectContaining({
						country: 'BR',
						currencySymbol: 'R$',
						locale: 'pt-BR',
					}),
					scenarios: expect.arrayContaining([
						expect.objectContaining({
							opportunityId: 'opp-1',
							region: 'Brazil',
						}),
					]),
				}),
			}),
		);
		expect(
			dlTokenService.createToken.mock.calls[0]?.[0]?.singleUse,
		).toBeUndefined();
		expect(result.url).toContain(
			'/api/email/partner-proposal/download?dlToken=partner-token',
		);
	});

	it('renders partner-proposal template with hydrated values and hyperlinks', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				partnerProposalEmail: {
					templatePath: '/email_templates/partner/proposal/renewal/single.docx',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6000,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createPartnerEmailTemplateBuffer(),
		);

		const rendered = await service.renderPartnerProposalEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');
		const relsXml = getZipEntryText(zip, 'word/_rels/document.xml.rels');

		expect(documentXml).toContain('Contoso');
		expect(documentXml).toContain('Business Standard');
		expect(documentXml).toContain('Business Premium + Copilot Business');
		expect(documentXml).toContain(
			'https://pupp.cloud-programs.com/csp-partners',
		);
		expect(documentXml).not.toContain('{customer_name}');
		expect(documentXml).not.toContain('{link}');
		expect(documentXml).not.toContain('{url}');
		expect(relsXml).toContain(
			'Target="https://pupp.cloud-programs.com/csp-partners"',
		);
	});

	it('renders partner-proposal currency from the scenario region when payload pricing context is USD', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				partnerProposalEmail: {
					templatePath: '/email_templates/partner/proposal/renewal/single.docx',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					pricingContext: createUsdPricingContextPayload(),
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6000,
							region: 'Brazil',
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createPartnerEmailTemplateBuffer(),
		);

		const startingSku = STARTING_SKU_BY_ID.get('bs');
		const endingSku = getValidUpgradePaths('bs', { country: 'BR' }).find(
			(candidate) => candidate.id === 'bp_cb',
		);
		if (!startingSku || !endingSku) {
			throw new Error('Expected fixture SKU IDs to be available');
		}

		const scenario = calculateScenario(startingSku, endingSku, 35, {
			journey: 'renewal',
			expiringArr: 6000,
			originalSeats: 40,
			region: 'Brazil',
			country: 'BR',
		});
		const afterPromoPerUserAnnual = roundCurrency(endingSku.promoPrice * 12);
		const incrementalPerUserAnnual = computeIncrementalCostPerUserAnnual({
			offerAnnualValue: scenario.offerAnnualValue,
			currentAnnualValue: scenario.currentAnnualValue,
			seats: 35,
		});

		const rendered = await service.renderPartnerProposalEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(documentXml).toContain(formatCurrencyForRegion(6000, 'Brazil'));
		expect(documentXml).toContain(
			formatCurrencyForRegion(afterPromoPerUserAnnual, 'Brazil'),
		);
		expect(documentXml).toContain(
			formatCurrencyForRegion(scenario.incrementalCost, 'Brazil'),
		);
		expect(documentXml).toContain(
			formatCurrencyForRegion(
				scenario.economics.incrementalIncentive,
				'Brazil',
			),
		);
		expect(documentXml).toContain(
			formatCurrencyForRegion(incrementalPerUserAnnual, 'Brazil'),
		);
	});

	it('injects partner hyperlinks when tokens are inline with surrounding text', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				partnerProposalEmail: {
					templatePath:
						'/email_templates/partner/proposal/renewal/multiple.docx',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6000,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createPartnerEmailTemplateBufferWithInlineTokens(),
		);

		const rendered = await service.renderPartnerProposalEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');
		const relsXml = getZipEntryText(zip, 'word/_rels/document.xml.rels');

		expect(documentXml).toContain('<w:hyperlink');
		expect(documentXml).toContain('BOM link:');
		expect(documentXml).toContain('Upload details here:');
		expect(documentXml).not.toContain('__PARTNER_PROPOSAL_BOM_LINK__');
		expect(documentXml).not.toContain('__PARTNER_PROPOSAL_UPLOAD_LINK__');

		const hyperlinkRelationshipCount =
			relsXml.match(
				/Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/hyperlink"/g,
			)?.length ?? 0;
		expect(hyperlinkRelationshipCount).toBe(2);
	});

	it('renders renewal multi tables using chunk loops with indexed placeholders', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				partnerProposalEmail: {
					templatePath:
						'/email_templates/partner/proposal/renewal/multiple.docx',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6000,
						},
						{
							opportunityId: 'opp-2',
							startingSkuId: 'bb',
							startingSkuName: 'Business Basic',
							endingSkuId: 'bs_cb',
							selectedSeats: 20,
							originalSeats: 24,
							expiringArr: 3000,
						},
						{
							opportunityId: 'opp-3',
							startingSkuId: 'bb',
							startingSkuName: 'Business Basic',
							endingSkuId: 'bp_purview',
							selectedSeats: 15,
							originalSeats: 15,
							expiringArr: 1800,
						},
						{
							opportunityId: 'opp-4',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_defender',
							selectedSeats: 12,
							originalSeats: 12,
							expiringArr: 2200,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createPartnerMultiRenewalChunkTablesTemplateBuffer(),
		);

		const rendered = await service.renderPartnerProposalEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(documentXml).toContain('Business Standard');
		expect(documentXml).toContain('Business Basic');
		expect(documentXml).toContain('Business Premium + Copilot Business');
		expect(documentXml).toContain('Business Standard + Copilot Business');
		expect(documentXml).toContain('Business Premium + Purview Suite');
		expect(documentXml).toContain('Business Premium + Defender Suite');
		expect(documentXml).not.toContain('{#chunks}');
		expect(documentXml).not.toContain('{/chunks}');
		expect(documentXml).not.toContain('{starting_sku_1}');
		expect(documentXml).not.toContain('{incrementalCostPerUserAnnual_1}');

		const chunkMarkerMatches = documentXml.match(/CHUNK_BLOCK_START/g) ?? [];
		expect(chunkMarkerMatches).toHaveLength(2);

		const startingSku1 = STARTING_SKU_BY_ID.get('bs');
		const endingSku1 = getValidUpgradePaths('bs', { country: 'US' }).find(
			(candidate) => candidate.id === 'bp_cb',
		);
		const startingSku4 = STARTING_SKU_BY_ID.get('bs');
		const endingSku4 = getValidUpgradePaths('bs', { country: 'US' }).find(
			(candidate) => candidate.id === 'bp_defender',
		);
		if (!startingSku1 || !endingSku1 || !startingSku4 || !endingSku4) {
			throw new Error('Expected fixture SKU IDs to be available');
		}

		const scenarioOne = calculateScenario(startingSku1, endingSku1, 35, {
			journey: 'renewal',
			expiringArr: 6000,
			originalSeats: 40,
		});
		const scenarioFour = calculateScenario(startingSku4, endingSku4, 12, {
			journey: 'renewal',
			expiringArr: 2200,
			originalSeats: 12,
		});
		const scenarioOneIncrementalPerUser = formatCurrency(
			computeIncrementalCostPerUserAnnual({
				offerAnnualValue: scenarioOne.offerAnnualValue,
				currentAnnualValue: scenarioOne.currentAnnualValue,
				seats: 35,
			}),
		);
		const scenarioFourIncrementalPerUser = formatCurrency(
			computeIncrementalCostPerUserAnnual({
				offerAnnualValue: scenarioFour.offerAnnualValue,
				currentAnnualValue: scenarioFour.currentAnnualValue,
				seats: 12,
			}),
		);

		expect(documentXml).toContain(scenarioOneIncrementalPerUser);
		expect(documentXml).toContain(scenarioFourIncrementalPerUser);
		expect(documentXml).toContain(
			formatCurrency(scenarioOne.economics.incrementalIncentive),
		);
		expect(documentXml).toContain(
			formatCurrency(scenarioFour.economics.incrementalIncentive),
		);
	});

	it('renders partner multi renewal conditional chunks for 3+1 scenarios', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				partnerProposalEmail: {
					templatePath:
						'/email_templates/partner/proposal/renewal/multiple.docx',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6000,
						},
						{
							opportunityId: 'opp-2',
							startingSkuId: 'bb',
							startingSkuName: 'Business Basic',
							endingSkuId: 'bs_cb',
							selectedSeats: 20,
							originalSeats: 24,
							expiringArr: 3000,
						},
						{
							opportunityId: 'opp-3',
							startingSkuId: 'bb',
							startingSkuName: 'Business Basic',
							endingSkuId: 'bp_purview',
							selectedSeats: 15,
							originalSeats: 15,
							expiringArr: 1800,
						},
						{
							opportunityId: 'opp-4',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_defender',
							selectedSeats: 12,
							originalSeats: 12,
							expiringArr: 2200,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createPartnerMultiRenewalConditionalTemplateBuffer(),
		);

		const rendered = await service.renderPartnerProposalEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(documentXml).toContain(
			'P3:Business Standard|Business Basic|Business Basic',
		);
		expect(documentXml).toContain(
			'P1:Business Standard|Business Premium + Defender Suite',
		);
		expect(documentXml).not.toContain('P2:');
		expect(documentXml).not.toContain('{#is_1col}');
		expect(documentXml).not.toContain('{#is_3col}');
		expect(documentXml).not.toContain('{#chunks}');
		expect(documentXml).not.toContain('{/chunks}');
	});

	it('renders partner multi renewal conditional chunks for 2 scenarios', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				partnerProposalEmail: {
					templatePath:
						'/email_templates/partner/proposal/renewal/multiple.docx',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6000,
						},
						{
							opportunityId: 'opp-2',
							startingSkuId: 'bb',
							startingSkuName: 'Business Basic',
							endingSkuId: 'bs_cb',
							selectedSeats: 20,
							originalSeats: 24,
							expiringArr: 3000,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createPartnerMultiRenewalConditionalTemplateBuffer(),
		);

		const rendered = await service.renderPartnerProposalEmailFromToken('token');
		const zip = new PizZip(rendered);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(documentXml).toContain(
			'P2:Business Standard|Business Basic|Business Standard + Copilot Business',
		);
		expect(documentXml).not.toContain('P1:');
		expect(documentXml).not.toContain('P3:');
		expect(documentXml).not.toContain('{#is_2col}');
		expect(documentXml).not.toContain('{#chunks}');
		expect(documentXml).not.toContain('{/chunks}');
	});

	it('creates and renders single-scenario proposal-assets bundle zip without duplicate ppt', async () => {
		const dlTokenService = {
			createToken: vi.fn(() => 'assets-token'),
			verifyTokenForScope: vi.fn(() => ({
				proposalAssetsBundle: {
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					fileName: 'contoso-consolidated-proposals.pptx',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6000,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		const linkResult = service.createProposalAssetsBundleLink({
			mode: 'consolidated',
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			fileName: 'contoso-consolidated-proposals.pptx',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bp_cb',
					selectedSeats: 35,
					originalSeats: 40,
					expiringArr: 6000,
				},
			],
		});
		expect(linkResult.url).toContain(
			'/api/email/proposal-assets/download?dlToken=assets-token',
		);
		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'proposal-assets-bundle',
				proposalAssetsBundle: expect.objectContaining({
					customerName: 'Contoso',
				}),
			}),
		);
		expect(
			dlTokenService.createToken.mock.calls[0]?.[0]?.singleUse,
		).toBeUndefined();

		const renderProposalPptSpy = vi
			.spyOn(service as any, 'renderProposalPpt')
			.mockResolvedValue(Buffer.from('pptx-binary'));
		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createCustomerEmailTemplateBuffer(),
		);

		const rendered = await service.renderProposalAssetsBundleFromToken('token');
		const zip = new PizZip(rendered.buffer);
		const zipEntries = Object.keys(zip.files).filter(
			(entry) => !entry.endsWith('/'),
		);
		const pptEntries = zipEntries.filter((entry) => entry.endsWith('.pptx'));

		expect(rendered.fileName).toBe('contoso-proposal-assets.zip');
		expect(pptEntries).toEqual(['contoso-consolidated-proposals.pptx']);
		expect(zipEntries).toContain('contoso-customer-proposal-email.docx');
		expect(renderProposalPptSpy).toHaveBeenCalledTimes(1);
	});

	it('records issuance when creating a proposal-assets bundle link', () => {
		const tokenPayload = {
			jti: 'assets-jti',
			scope: 'proposal-assets-bundle',
			tenantId: 'default-tenant',
		};
		const dlTokenService = {
			createToken: vi.fn(() => 'assets-token'),
			readTokenPayload: vi.fn(() => tokenPayload),
			verifyTokenForScope: vi.fn(),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const adminAnalyticsDownloadTrackingService = {
			recordIssuance: vi.fn().mockResolvedValue(undefined),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
			adminAnalyticsDownloadTrackingService as never,
		);

		service.createProposalAssetsBundleLink(
			{
				mode: 'consolidated',
				journey: 'renewal',
				customerId: 'cust-1',
				customerName: 'Contoso',
				fileName: 'contoso-consolidated-proposals.pptx',
				scenarios: [
					{
						opportunityId: 'opp-1',
						startingSkuId: 'bs',
						startingSkuName: 'Business Standard',
						endingSkuId: 'bp_cb',
						selectedSeats: 35,
						originalSeats: 40,
						expiringArr: 6000,
					},
				],
			},
			{
				actorId: 'user-1',
				tenantId: 'tenant-1',
				requestId: 'req-1',
				route: '/api/email/proposal-assets/link',
			},
		);

		expect(dlTokenService.readTokenPayload).toHaveBeenCalledWith(
			'assets-token',
		);
		expect(
			dlTokenService.createToken.mock.calls[0]?.[0]?.singleUse,
		).toBeUndefined();
		expect(
			adminAnalyticsDownloadTrackingService.recordIssuance,
		).toHaveBeenCalledWith({
			tokenPayload,
			category: 'proposals',
			actorId: 'user-1',
			tenantId: 'tenant-1',
			requestId: 'req-1',
			route: '/api/email/proposal-assets/link',
		});
	});

	it('loads multi-scenario proposal assets for new-customer subscriptions', async () => {
		const tokenPayload = {
			jti: 'bundle-jti',
			scope: 'proposal-assets-bundle',
			tenantId: 'default-tenant',
		};
		const dlTokenService = {
			createToken: vi.fn(() => 'assets-token'),
			readTokenPayload: vi.fn(() => tokenPayload),
			verifyTokenForScope: vi.fn(),
		};
		const blobStorageService = {
			upload: vi
				.fn()
				.mockResolvedValue(
					'https://blob.example.com/northwind_consolidated_proposals.pptx',
				),
			download: vi.fn(),
		};
		const adminAnalyticsDownloadTrackingService = {
			recordIssuance: vi.fn().mockResolvedValue(undefined),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
			adminAnalyticsDownloadTrackingService as never,
		);
		const renderProposalPptSpy = vi
			.spyOn(service as any, 'renderProposalPpt')
			.mockResolvedValue(Buffer.from('pptx-binary'));
		const subscription = service.createSyntheticSubscriptionForNewCustomer({
			customerId: 'cust-1',
			partnerName: 'Contoso',
			customerName: 'Northwind',
			currentSku: 'Business Standard',
			seatCount: 100,
			costPerUser: 71.6,
			region: 'Brazil',
		});

		const result = await service.loadProposalAssetsFromSubscriptions({
			journey: 'new_customer',
			customerId: 'cust-1',
			customerName: 'Northwind',
			subscriptions: [subscription],
			selections: [
				{
					opportunityId: 'cust-1:local-cust-1',
					endingSkuId: 'bs_cb',
					seats: 50,
					targetSkuPrice: 126,
					targetSkuMarginPercent: 13.7,
				},
				{
					opportunityId: 'cust-1:local-cust-1',
					endingSkuId: 'bp_cb',
					seats: 50,
					targetSkuPrice: 183.3,
					targetSkuMarginPercent: 15.1,
				},
			],
			issuanceContext: {
				actorId: 'user-1',
				tenantId: 'tenant-1',
				requestId: 'req-1',
				route: '/api/email/proposal-assets/load',
			},
		});

		expect(result.customer).toEqual({
			customerId: 'cust-1',
			customerName: 'Northwind',
		});
		expect(result.selectedScenarios).toHaveLength(2);
		expect(result.selectedScenarios).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					opportunityId: 'cust-1:local-cust-1',
					endingSkuId: 'bs_cb',
					selectedSeats: 50,
					region: 'Brazil',
				}),
				expect.objectContaining({
					opportunityId: 'cust-1:local-cust-1',
					endingSkuId: 'bp_cb',
					selectedSeats: 50,
					region: 'Brazil',
				}),
			]),
		);
		expect(result.pricingContext).toEqual(
			expect.objectContaining({
				region: 'Brazil',
				country: 'BR',
				currency: 'BRL',
				currencySymbol: 'R$',
				locale: 'pt-BR',
			}),
		);
		expect(result.assets.consolidated).toEqual({
			blobUrl: 'https://blob.example.com/northwind_consolidated_proposals.pptx',
			fileName: 'northwind_consolidated_proposals.pptx',
		});
		expect(result.assets.lineItems).toEqual([
			expect.objectContaining({
				opportunityId: 'cust-1:local-cust-1',
				endingSkuId: 'bs_cb',
				selectedSeats: 50,
				status: 'not_generated',
			}),
			expect.objectContaining({
				opportunityId: 'cust-1:local-cust-1',
				endingSkuId: 'bp_cb',
				selectedSeats: 50,
				status: 'not_generated',
			}),
		]);
		expect(result.assets.bundleDownloadUrl).toBe(
			'/api/email/proposal-assets/download?dlToken=assets-token',
		);
		expect(result.assets.uploadedAt).toEqual(expect.any(String));
		expect(renderProposalPptSpy).toHaveBeenCalledTimes(1);
		expect(blobStorageService.upload).toHaveBeenCalledTimes(1);
		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'proposal-assets-bundle',
				customerId: 'cust-1',
				selectedSkuIds: ['bs_cb', 'bp_cb'],
				proposalAssetsBundle: expect.objectContaining({
					journey: 'new_customer',
					customerId: 'cust-1',
					customerName: 'Northwind',
					fileName: 'northwind_consolidated_proposals.pptx',
					scenarios: expect.arrayContaining([
						expect.objectContaining({
							opportunityId: 'cust-1:local-cust-1',
							endingSkuId: 'bs_cb',
							selectedSeats: 50,
						}),
						expect.objectContaining({
							opportunityId: 'cust-1:local-cust-1',
							endingSkuId: 'bp_cb',
							selectedSeats: 50,
						}),
					]),
				}),
			}),
		);
		expect(dlTokenService.readTokenPayload).toHaveBeenCalledWith(
			'assets-token',
		);
		expect(
			adminAnalyticsDownloadTrackingService.recordIssuance,
		).toHaveBeenCalledWith({
			tokenPayload,
			category: 'proposals',
			actorId: 'user-1',
			tenantId: 'tenant-1',
			requestId: 'req-1',
			route: '/api/email/proposal-assets/load',
		});
	});

	it('renders customer proposal-assets email with scenario region currency', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalAssetsBundle: {
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					fileName: 'contoso-consolidated-proposals.pptx',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6000,
							region: 'Brazil',
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createCustomerEmailTemplateBuffer(),
		);

		const startingSku = STARTING_SKU_BY_ID.get('bs');
		const endingSku = getValidUpgradePaths('bs', { country: 'BR' }).find(
			(candidate) => candidate.id === 'bp_cb',
		);
		if (!startingSku || !endingSku) {
			throw new Error('Expected fixture SKU IDs to be available');
		}

		const scenario = calculateScenario(startingSku, endingSku, 35, {
			journey: 'renewal',
			expiringArr: 6000,
			originalSeats: 40,
			region: 'Brazil',
			country: 'BR',
		});
		const actualPricePerUserAnnual = scenario.listAnnualValue / 35;
		const afterPromoPerUserAnnual = roundCurrency(endingSku.promoPrice * 12);

		const rendered = await service.renderProposalAssetsBundleFromToken(
			'token',
			'email',
		);
		const zip = new PizZip(rendered.buffer);
		const documentXml = getZipEntryText(zip, 'word/document.xml');

		expect(rendered.fileName).toBe('contoso-customer-proposal-email.docx');
		expect(rendered.contentType).toBe(
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		);
		expect(documentXml).toContain(formatCurrencyForRegion(6000, 'Brazil'));
		expect(documentXml).toContain(
			formatCurrencyForRegion(actualPricePerUserAnnual, 'Brazil'),
		);
		expect(documentXml).toContain(
			formatCurrencyForRegion(afterPromoPerUserAnnual, 'Brazil'),
		);
		expect(documentXml).toContain(
			formatCurrencyForRegion(scenario.incrementalCost, 'Brazil'),
		);
	});

	it('creates and renders multi-scenario proposal-assets bundle zip with individual ppts', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalAssetsBundle: {
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					fileName: 'contoso-consolidated-proposals.pptx',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6_000,
							region: 'Brazil',
						},
						{
							opportunityId: 'opp-2',
							startingSkuId: 'bb',
							startingSkuName: 'Business Basic',
							endingSkuId: 'bs_cb',
							selectedSeats: 20,
							originalSeats: 24,
							expiringArr: 3_000,
							region: 'Brazil',
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);
		const renderProposalPptSpy = vi
			.spyOn(service as any, 'renderProposalPpt')
			.mockResolvedValue(Buffer.from('pptx-binary'));
		vi.spyOn(service as any, 'loadTemplateBuffer').mockResolvedValue(
			createCustomerEmailTemplateBuffer(),
		);

		const rendered = await service.renderProposalAssetsBundleFromToken('token');
		const zip = new PizZip(rendered.buffer);
		const zipEntries = Object.keys(zip.files).filter(
			(entry) => !entry.endsWith('/'),
		);
		const pptEntries = zipEntries.filter((entry) => entry.endsWith('.pptx'));

		expect(rendered.fileName).toBe('contoso-proposal-assets.zip');
		expect(zipEntries).toContain('contoso-customer-proposal-email.docx');
		expect(pptEntries).toContain('contoso-consolidated-proposals.pptx');
		expect(
			pptEntries.some(
				(entry) =>
					entry.startsWith('proposal_document_1_') &&
					entry.endsWith('_35_seats.pptx'),
			),
		).toBe(true);
		expect(
			pptEntries.some(
				(entry) =>
					entry.startsWith('proposal_document_2_') &&
					entry.endsWith('_20_seats.pptx'),
			),
		).toBe(true);
		expect(pptEntries).toHaveLength(3);
		expect(renderProposalPptSpy).toHaveBeenCalledTimes(3);
		const customerEmailBuffer = zip
			.file('contoso-customer-proposal-email.docx')
			?.asNodeBuffer();
		expect(customerEmailBuffer).toBeDefined();
		const customerEmailZip = new PizZip(customerEmailBuffer!);
		const customerDocumentXml = getZipEntryText(
			customerEmailZip,
			'word/document.xml',
		);
		expect(customerDocumentXml).toContain(
			formatCurrencyForRegion(6_000, 'Brazil'),
		);
		expect(customerDocumentXml).toContain('R$');
		expect(renderProposalPptSpy).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				mode: 'consolidated',
				fileName: 'contoso-consolidated-proposals.pptx',
			}),
		);
	});

	it('creates proposal-ppt session with proposal-ppt token scope', () => {
		const dlTokenService = {
			createToken: vi.fn(() => 'ppt-token'),
			verifyTokenForScope: vi.fn(),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		const result = service.createProposalPptSession({
			mode: 'single',
			journey: 'renewal',
			customerId: 'cust-1',
			customerName: 'Contoso',
			fileName: 'Contoso Proposal.pptx',
			scenarios: [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bp_cb',
					selectedSeats: 35,
					originalSeats: 40,
					expiringArr: 6_000,
				},
			],
		});

		expect(dlTokenService.createToken).toHaveBeenCalledWith(
			expect.objectContaining({
				scope: 'proposal-ppt',
				selectedSkuIds: ['bp_cb'],
				proposalPpt: expect.objectContaining({
					mode: 'single',
					journey: 'renewal',
					customerId: 'cust-1',
					fileName: 'contoso-proposal.pptx',
				}),
			}),
		);
		expect(
			dlTokenService.createToken.mock.calls.every(
				([params]: [{ singleUse?: boolean }]) => params.singleUse === undefined,
			),
		).toBe(true);
		expect(result.renderUrl).toContain(
			'/api/email/proposal-ppt/render?dlToken=',
		);
		expect(result.downloadUrl).toContain(
			'/api/email/proposal-ppt/download?dlToken=',
		);
	});

	it('records issuance for the download token when creating a proposal-ppt session', () => {
		const tokenPayload = {
			jti: 'download-jti',
			scope: 'proposal-ppt',
			tenantId: 'default-tenant',
		};
		const dlTokenService = {
			createToken: vi
				.fn()
				.mockReturnValueOnce('render-token')
				.mockReturnValueOnce('download-token'),
			readTokenPayload: vi.fn(() => tokenPayload),
			verifyTokenForScope: vi.fn(),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const adminAnalyticsDownloadTrackingService = {
			recordIssuance: vi.fn().mockResolvedValue(undefined),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
			adminAnalyticsDownloadTrackingService as never,
		);

		service.createProposalPptSession(
			{
				mode: 'single',
				journey: 'renewal',
				customerId: 'cust-1',
				customerName: 'Contoso',
				fileName: 'Contoso Proposal.pptx',
				scenarios: [
					{
						opportunityId: 'opp-1',
						startingSkuId: 'bs',
						startingSkuName: 'Business Standard',
						endingSkuId: 'bp_cb',
						selectedSeats: 35,
						originalSeats: 40,
						expiringArr: 6_000,
					},
				],
			},
			{
				actorId: 'user-1',
				tenantId: 'tenant-1',
				requestId: 'req-1',
				route: '/api/email/proposal-ppt/session',
			},
		);

		expect(dlTokenService.readTokenPayload).toHaveBeenCalledTimes(1);
		expect(dlTokenService.readTokenPayload).toHaveBeenCalledWith(
			'download-token',
		);
		expect(
			dlTokenService.createToken.mock.calls.every(
				([params]: [{ singleUse?: boolean }]) => params.singleUse === undefined,
			),
		).toBe(true);
		expect(
			adminAnalyticsDownloadTrackingService.recordIssuance,
		).toHaveBeenCalledWith({
			tokenPayload,
			category: 'proposals',
			actorId: 'user-1',
			tenantId: 'tenant-1',
			requestId: 'req-1',
			route: '/api/email/proposal-ppt/session',
		});
	});

	it('renders multi-opportunity proposal-ppt with deterministic page ordering', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalPpt: {
					mode: 'consolidated',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					fileName: 'contoso-consolidated.pptx',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bs_cb',
							selectedSeats: 30,
							originalSeats: 40,
							expiringArr: 6_000,
						},
						{
							opportunityId: 'opp-2',
							startingSkuId: 'bp',
							startingSkuName: 'Business Premium',
							endingSkuId: 'bp_defender',
							selectedSeats: 20,
							originalSeats: 25,
							expiringArr: 4_000,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		const result = await service.renderProposalPptFromToken('token');
		const zip = new PizZip(result.buffer);
		const slidePaths = Object.keys(zip.files)
			.filter((entryPath) => /^ppt\/slides\/slide\d+\.xml$/.test(entryPath))
			.sort((left, right) => {
				const leftNumber = Number.parseInt(
					left.match(/slide(\d+)\.xml$/)?.[1] ?? '0',
					10,
				);
				const rightNumber = Number.parseInt(
					right.match(/slide(\d+)\.xml$/)?.[1] ?? '0',
					10,
				);
				return leftNumber - rightNumber;
			});

		expect(slidePaths).toHaveLength(7);

		const firstPageSlide = zip.file('ppt/slides/slide1.xml')?.asText() ?? '';
		const aiInvestmentSlide = zip.file('ppt/slides/slide4.xml')?.asText() ?? '';
		const securityInvestmentSlide =
			zip.file('ppt/slides/slide5.xml')?.asText() ?? '';

		const aiStartingSku =
			STARTING_SKU_BY_ID.get('bs')?.name ?? 'Business Standard';
		const aiTargetSku =
			ENDING_SKU_BY_ID.get('bs_cb')?.name ??
			'Business Standard + Copilot Business';
		const securityTargetSku =
			ENDING_SKU_BY_ID.get('bp_defender')?.name ??
			'Business Premium + Defender Suite';

		expect(firstPageSlide).toContain(aiStartingSku);
		expect(firstPageSlide).toContain(aiTargetSku);
		expect(firstPageSlide).toContain('30');
		expect(firstPageSlide).toContain('20');
		expect(aiInvestmentSlide).toContain(aiStartingSku);
		expect(aiInvestmentSlide).toContain(aiTargetSku);
		expect(aiInvestmentSlide).not.toContain(securityTargetSku);
		expect(securityInvestmentSlide).toContain(securityTargetSku);

		const appXmlSummary = parseAppXmlSummary(zip);
		const notesSlideCount = Object.keys(zip.files).filter((entryPath) =>
			/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(entryPath),
		).length;
		const compressionMethods = listZipEntryCompressionMethods(result.buffer);
		const mediaEntryPaths = [...compressionMethods.keys()].filter((entryPath) =>
			entryPath.startsWith('ppt/media/'),
		);

		expect(listUnreferencedThemeParts(zip)).toEqual([]);
		expect(listChangesInfoArtifacts(zip)).toEqual([]);
		expect(appXmlSummary.slides).toBe(slidePaths.length);
		expect(appXmlSummary.notes).toBe(notesSlideCount);
		expect(appXmlSummary.hiddenSlides).toBeGreaterThanOrEqual(0);
		expect(appXmlSummary.words).toBeGreaterThan(0);
		expect(appXmlSummary.paragraphs).toBeGreaterThan(0);
		expect(appXmlSummary.slideTitleCount).toBe(slidePaths.length);
		expect(appXmlSummary.fontCount).toBeGreaterThan(0);
		expect(appXmlSummary.themeCount).toBeGreaterThan(0);
		expect(appXmlSummary.titlesVectorSize).toBe(
			appXmlSummary.titlesEntriesCount,
		);
		expect(listDuplicateMediaHashes(zip)).toEqual([]);
		expect(compressionMethods.get('ppt/presentation.xml')).toBe(8);
		expect(compressionMethods.get('ppt/_rels/presentation.xml.rels')).toBe(8);
		for (const mediaEntryPath of mediaEntryPaths) {
			expect(compressionMethods.get(mediaEntryPath)).toBe(0);
		}

		expect(result.fileName).toBe('contoso-consolidated.pptx');
		expect(listMissingInternalRelationshipTargets(zip)).toEqual([]);
		expect(listUnregisteredPresentationMasterReferences(zip)).toEqual([]);
		expect(listLegacyMergedPartPaths(zip)).toEqual([]);
		expect(listPptPartsMissingContentTypeOverrides(zip)).toEqual([]);
		expect(listCrossPoolPresentationIdCollisions(zip)).toEqual([]);
		expect(listDuplicateSlideMasterLayoutIds(zip)).toEqual([]);
	});

	it('repeats investment pages for each matching scenario and keeps grouped order', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalPpt: {
					mode: 'consolidated',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					fileName: 'contoso-consolidated.pptx',
					scenarios: [
						{
							opportunityId: 'opp-ai-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bs_cb',
							selectedSeats: 30,
							originalSeats: 40,
							expiringArr: 6_000,
						},
						{
							opportunityId: 'opp-ai-2',
							startingSkuId: 'bp',
							startingSkuName: 'Business Premium',
							endingSkuId: 'bp_cb',
							selectedSeats: 20,
							originalSeats: 25,
							expiringArr: 4_000,
						},
						{
							opportunityId: 'opp-sec-1',
							startingSkuId: 'bp',
							startingSkuName: 'Business Premium',
							endingSkuId: 'bp_defender',
							selectedSeats: 15,
							originalSeats: 18,
							expiringArr: 3_000,
						},
						{
							opportunityId: 'opp-sec-2',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_purview',
							selectedSeats: 10,
							originalSeats: 12,
							expiringArr: 2_500,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		const result = await service.renderProposalPptFromToken('token');
		const zip = new PizZip(result.buffer);
		const slidePaths = Object.keys(zip.files)
			.filter((entryPath) => /^ppt\/slides\/slide\d+\.xml$/.test(entryPath))
			.sort((left, right) => {
				const leftNumber = Number.parseInt(
					left.match(/slide(\d+)\.xml$/)?.[1] ?? '0',
					10,
				);
				const rightNumber = Number.parseInt(
					right.match(/slide(\d+)\.xml$/)?.[1] ?? '0',
					10,
				);
				return leftNumber - rightNumber;
			});

		expect(slidePaths).toHaveLength(10);

		const firstPageSlide = zip.file('ppt/slides/slide1.xml')?.asText() ?? '';
		const aiInvestmentSlideOne =
			zip.file('ppt/slides/slide5.xml')?.asText() ?? '';
		const aiInvestmentSlideTwo =
			zip.file('ppt/slides/slide6.xml')?.asText() ?? '';
		const securityInvestmentSlideOne =
			zip.file('ppt/slides/slide7.xml')?.asText() ?? '';
		const securityInvestmentSlideTwo =
			zip.file('ppt/slides/slide8.xml')?.asText() ?? '';

		expect(firstPageSlide).toContain('Business Standard');
		expect(firstPageSlide).toContain('Business Premium');
		expect(firstPageSlide).toContain('30');
		expect(firstPageSlide).toContain('20');
		expect(firstPageSlide).toContain('15');
		expect(firstPageSlide).toContain('10');

		expect(aiInvestmentSlideOne).toContain('Business Standard');
		expect(aiInvestmentSlideTwo).toContain('Business Premium');
		expect(securityInvestmentSlideOne).toContain('Business Premium');
		expect(securityInvestmentSlideTwo).toContain('Business Standard');
		expect(listUnreferencedThemeParts(zip)).toEqual([]);
		expect(listChangesInfoArtifacts(zip)).toEqual([]);
		expect(listDuplicateMediaHashes(zip)).toEqual([]);
		expect(listMissingInternalRelationshipTargets(zip)).toEqual([]);
		expect(listUnregisteredPresentationMasterReferences(zip)).toEqual([]);
		expect(listLegacyMergedPartPaths(zip)).toEqual([]);
		expect(listPptPartsMissingContentTypeOverrides(zip)).toEqual([]);
		expect(listCrossPoolPresentationIdCollisions(zip)).toEqual([]);
		expect(listDuplicateSlideMasterLayoutIds(zip)).toEqual([]);
	});

	describe('resolveMultiRenewalTemplatePaths', () => {
		const MULTI_RENEWAL_FIRST_PAGE = 'multiple_renewals/first_page.pptx';
		const MULTI_RENEWAL_LAST_PAGE = 'multiple_renewals/last_page.pptx';
		const MULTI_RENEWAL_BS_OR_BP_AND_CB =
			'multiple_renewals/bs_or_bp_and_cb.pptx';
		const MULTI_RENEWAL_BP_AND_CB_AND_PURVIEW =
			'multiple_renewals/bp_and_cb_and_purview.pptx';
		const MULTI_RENEWAL_DEFENDER_SUITE =
			'multiple_renewals/defender_suite.pptx';
		const MULTI_RENEWAL_PURVIEW_SUITE = 'multiple_renewals/purview_suite.pptx';
		const MULTI_RENEWAL_DEFENDER_AND_PURVIEW =
			'multiple_renewals/defender_and_purview_suite.pptx';
		const MULTI_RENEWAL_INVESTMENT_AI = 'multiple_renewals/investment_ai.pptx';
		const MULTI_RENEWAL_INVESTMENT_SUMMARY_PAGE =
			'multiple_renewals/Investment_summary_page.pptx';
		const MULTI_RENEWAL_INVESTMENT_SECURITY =
			'multiple_renewals/investment_security.pptx';
		const MULTI_RENEWAL_DISCLAIMER_CONSOLIDATED =
			'multiple_renewals/disclaimer_consolidated.pptx';

		type MultiRenewalEndingSkuId =
			| 'bs_cb'
			| 'bp_cb'
			| 'bp_cb_purview'
			| 'bp_defender'
			| 'bp_purview'
			| 'bp_defender_purview';

		const createService = () =>
			new ProposalOptionsEmailService(
				{ createToken: vi.fn(), verifyTokenForScope: vi.fn() } as never,
				{ upload: vi.fn(), download: vi.fn() } as never,
				{} as never,
			);

		const createScenario = (
			endingSkuId: MultiRenewalEndingSkuId,
			index: number,
		) =>
			({
				opportunityId: `opp-${index}`,
				startingSkuId: endingSkuId.startsWith('bs') ? 'bs' : 'bp',
				startingSkuName: endingSkuId.startsWith('bs')
					? 'Business Standard'
					: 'Business Premium',
				endingSkuId,
				selectedSeats: 10 + index,
				originalSeats: 10 + index,
				expiringArr: 1_000 + index,
			}) as any;

		const resolvePaths = (
			service: ProposalOptionsEmailService,
			endingSkuIds: MultiRenewalEndingSkuId[],
		): string[] =>
			(service as any).resolveMultiRenewalTemplatePaths(
				endingSkuIds.map((endingSkuId, index) =>
					createScenario(endingSkuId, index + 1),
				),
			) as string[];

		it('prefers bp_and_cb_and_purview over bs_or_bp_and_cb when bp_cb_purview exists', () => {
			const service = createService();
			const templatePaths = resolvePaths(service, ['bs_cb', 'bp_cb_purview']);

			expect(templatePaths).toContain(MULTI_RENEWAL_BP_AND_CB_AND_PURVIEW);
			expect(templatePaths).not.toContain(MULTI_RENEWAL_BS_OR_BP_AND_CB);
		});

		it('does not include standalone purview slide for bp_cb_purview without bp_defender_purview', () => {
			const service = createService();
			const templatePaths = resolvePaths(service, [
				'bp_cb_purview',
				'bp_purview',
			]);

			expect(templatePaths).not.toContain(MULTI_RENEWAL_PURVIEW_SUITE);
		});

		it('includes only defender_and_purview_suite when bp_defender_purview exists', () => {
			const service = createService();
			const templatePaths = resolvePaths(service, [
				'bp_defender_purview',
				'bp_defender',
				'bp_purview',
			]);

			expect(templatePaths).toContain(MULTI_RENEWAL_DEFENDER_AND_PURVIEW);
			expect(templatePaths).not.toContain(MULTI_RENEWAL_DEFENDER_SUITE);
			expect(templatePaths).not.toContain(MULTI_RENEWAL_PURVIEW_SUITE);
		});

		it('suppresses standalone purview and defender when bp_cb_purview and bp_defender_purview both exist', () => {
			const service = createService();
			const templatePaths = resolvePaths(service, [
				'bp_cb_purview',
				'bp_defender_purview',
			]);

			expect(templatePaths).toContain(MULTI_RENEWAL_BP_AND_CB_AND_PURVIEW);
			expect(templatePaths).toContain(MULTI_RENEWAL_DEFENDER_AND_PURVIEW);
			expect(templatePaths).not.toContain(MULTI_RENEWAL_DEFENDER_SUITE);
			expect(templatePaths).not.toContain(MULTI_RENEWAL_PURVIEW_SUITE);
		});

		it('covers all multi-renewal SKU combinations with deterministic precedence and no duplicate base flyers', () => {
			const service = createService();
			const allEndingSkuIds: MultiRenewalEndingSkuId[] = [
				'bs_cb',
				'bp_cb',
				'bp_cb_purview',
				'bp_defender',
				'bp_purview',
				'bp_defender_purview',
			];
			const AI_ENDING_SKU_IDS = new Set<MultiRenewalEndingSkuId>([
				'bs_cb',
				'bp_cb',
				'bp_cb_purview',
			]);

			for (let mask = 1; mask < 1 << allEndingSkuIds.length; mask += 1) {
				const selection = allEndingSkuIds.filter((_, index) => {
					return Boolean(mask & (1 << index));
				});
				const selectedEndingSkuIds = new Set(selection);
				const hasBsCb = selectedEndingSkuIds.has('bs_cb');
				const hasBpCb = selectedEndingSkuIds.has('bp_cb');
				const hasBpCbPurview = selectedEndingSkuIds.has('bp_cb_purview');
				const hasBpDefender = selectedEndingSkuIds.has('bp_defender');
				const hasBpPurview = selectedEndingSkuIds.has('bp_purview');
				const hasBpDefenderPurview = selectedEndingSkuIds.has(
					'bp_defender_purview',
				);

				const templatePaths = resolvePaths(service, selection);
				expect(templatePaths[0]).toBe(MULTI_RENEWAL_FIRST_PAGE);
				expect(templatePaths.at(-1)).toBe(MULTI_RENEWAL_DISCLAIMER_CONSOLIDATED);
				expect(templatePaths.at(-2)).toBe(MULTI_RENEWAL_LAST_PAGE);
				expect(templatePaths.at(-3)).toBe(
					MULTI_RENEWAL_INVESTMENT_SUMMARY_PAGE,
				);

				const nonInvestmentTemplatePaths = templatePaths.filter((path) => {
					return (
						path !== MULTI_RENEWAL_INVESTMENT_AI &&
						path !== MULTI_RENEWAL_INVESTMENT_SECURITY &&
						path !== MULTI_RENEWAL_INVESTMENT_SUMMARY_PAGE
					);
				});
				expect(new Set(nonInvestmentTemplatePaths).size).toBe(
					nonInvestmentTemplatePaths.length,
				);

				if (hasBpCbPurview) {
					expect(templatePaths).toContain(MULTI_RENEWAL_BP_AND_CB_AND_PURVIEW);
					expect(templatePaths).not.toContain(MULTI_RENEWAL_BS_OR_BP_AND_CB);
					if (!hasBpDefenderPurview) {
						expect(templatePaths).not.toContain(MULTI_RENEWAL_PURVIEW_SUITE);
					}
				} else if (hasBsCb || hasBpCb) {
					expect(templatePaths).toContain(MULTI_RENEWAL_BS_OR_BP_AND_CB);
					expect(templatePaths).not.toContain(
						MULTI_RENEWAL_BP_AND_CB_AND_PURVIEW,
					);
				} else {
					expect(templatePaths).not.toContain(MULTI_RENEWAL_BS_OR_BP_AND_CB);
					expect(templatePaths).not.toContain(
						MULTI_RENEWAL_BP_AND_CB_AND_PURVIEW,
					);
				}

				if (hasBpDefenderPurview) {
					expect(templatePaths).toContain(MULTI_RENEWAL_DEFENDER_AND_PURVIEW);
					expect(templatePaths).not.toContain(MULTI_RENEWAL_DEFENDER_SUITE);
					expect(templatePaths).not.toContain(MULTI_RENEWAL_PURVIEW_SUITE);
				} else {
					if (hasBpDefender) {
						expect(templatePaths).toContain(MULTI_RENEWAL_DEFENDER_SUITE);
					} else {
						expect(templatePaths).not.toContain(MULTI_RENEWAL_DEFENDER_SUITE);
					}

					if (hasBpPurview && !hasBpCbPurview) {
						expect(templatePaths).toContain(MULTI_RENEWAL_PURVIEW_SUITE);
					} else {
						expect(templatePaths).not.toContain(MULTI_RENEWAL_PURVIEW_SUITE);
					}

					expect(templatePaths).not.toContain(
						MULTI_RENEWAL_DEFENDER_AND_PURVIEW,
					);
				}

				const aiScenarioCount = selection.filter((endingSkuId) =>
					AI_ENDING_SKU_IDS.has(endingSkuId),
				).length;
				const securityScenarioCount = selection.length - aiScenarioCount;
				expect(
					templatePaths.filter((path) => path === MULTI_RENEWAL_INVESTMENT_AI)
						.length,
				).toBe(aiScenarioCount);
				expect(
					templatePaths.filter(
						(path) => path === MULTI_RENEWAL_INVESTMENT_SECURITY,
					).length,
				).toBe(securityScenarioCount);
			}
		});

		it('always places investment summary page immediately before last page, with disclaimer at the very end', () => {
			const service = createService();
			const templatePaths = resolvePaths(service, [
				'bs_cb',
				'bp_defender',
				'bp_purview',
			]);

			expect(templatePaths.at(-1)).toBe(MULTI_RENEWAL_DISCLAIMER_CONSOLIDATED);
			expect(templatePaths.at(-2)).toBe(MULTI_RENEWAL_LAST_PAGE);
			expect(templatePaths.at(-3)).toBe(MULTI_RENEWAL_INVESTMENT_SUMMARY_PAGE);
			expect(
				templatePaths.filter(
					(path) => path === MULTI_RENEWAL_INVESTMENT_SUMMARY_PAGE,
				),
			).toHaveLength(1);
			expect(
				templatePaths.filter(
					(path) => path === MULTI_RENEWAL_DISCLAIMER_CONSOLIDATED,
				),
			).toHaveLength(1);
		});
	});

	describe('buildInvestmentSummaryData', () => {
		const createService = () =>
			new ProposalOptionsEmailService(
				{ createToken: vi.fn(), verifyTokenForScope: vi.fn() } as never,
				{ upload: vi.fn(), download: vi.fn() } as never,
				{} as never,
			);

		it('returns one row per scenario with correct fields and computes total', () => {
			const service = createService();
			const scenarios = [
				{
					opportunityId: 'opp-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bs_cb',
					selectedSeats: 20,
					originalSeats: 20,
					expiringArr: 3_000,
					region: '',
				},
				{
					opportunityId: 'opp-2',
					startingSkuId: 'bp',
					startingSkuName: 'Business Premium',
					endingSkuId: 'bp_defender',
					selectedSeats: 10,
					originalSeats: 10,
					expiringArr: 5_000,
					region: '',
				},
			];

			const pricingContext = {
				currencySymbol: '$',
				locale: 'en-US',
				country: '',
				exchangeRate: 1,
			};

			const result = (service as any).buildInvestmentSummaryData(
				scenarios,
				pricingContext,
			);

			expect(result.scenarios).toHaveLength(2);
			expect(result.scenarios[0].start_sku).toBe('Business Standard');
			expect(result.scenarios[0].target_sku).toBeDefined();
			expect(result.scenarios[0].seats).toBeDefined();
			expect(result.scenarios[0].incremental_cost_per_user).toBeDefined();
			expect(result.scenarios[0].overall_incremental_cost).toBeDefined();
			expect(result.scenarios[1].start_sku).toBe('Business Premium');
			expect(result.total_overall_incremental_cost).toBeDefined();
			expect(typeof result.total_overall_incremental_cost).toBe('string');
		});

		it('returns empty scenarios array and zero total for no scenarios', () => {
			const service = createService();
			const pricingContext = {
				currencySymbol: '$',
				locale: 'en-US',
				country: '',
				exchangeRate: 1,
			};

			const result = (service as any).buildInvestmentSummaryData(
				[],
				pricingContext,
			);

			expect(result.scenarios).toHaveLength(0);
			expect(result.total_overall_incremental_cost).toBeDefined();
		});
	});

	it('fails proposal-ppt render when multi-renewal first page is missing dynamic table placeholders', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalPpt: {
					mode: 'consolidated',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					fileName: 'contoso-consolidated.pptx',
					scenarios: [
						{
							opportunityId: 'opp-ai-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bs_cb',
							selectedSeats: 30,
							originalSeats: 40,
							expiringArr: 6_000,
						},
						{
							opportunityId: 'opp-sec-1',
							startingSkuId: 'bp',
							startingSkuName: 'Business Premium',
							endingSkuId: 'bp_defender',
							selectedSeats: 20,
							originalSeats: 25,
							expiringArr: 4_000,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadFlyerTemplateBuffer').mockImplementation(
			(relativePath: string) => {
				if (relativePath === 'multiple_renewals/first_page.pptx') {
					return createFirstPageFlyerTemplateBufferWithoutDynamicRows();
				}
				return createFlyerTemplateBuffer();
			},
		);

		await expect(service.renderProposalPptFromToken('token')).rejects.toThrow(
			/missing row placeholders/i,
		);
	});

	it('renders multi-renewal first page when row placeholders are split across text runs', () => {
		const service = new ProposalOptionsEmailService(
			{ createToken: vi.fn(), verifyTokenForScope: vi.fn() } as never,
			{ upload: vi.fn(), download: vi.fn() } as never,
			{} as never,
		);

		const rendered = (service as any).hydrateMultiRenewalFirstPageRows(
			createFirstPageFlyerTemplateBufferWithSplitDynamicRow(),
			[
				{
					opportunityId: 'opp-ai-1',
					startingSkuId: 'bs',
					startingSkuName: 'Business Standard',
					endingSkuId: 'bs_cb',
					selectedSeats: 30,
					originalSeats: 40,
					expiringArr: 6_000,
				},
				{
					opportunityId: 'opp-sec-1',
					startingSkuId: 'bp',
					startingSkuName: 'Business Premium',
					endingSkuId: 'bp_defender',
					selectedSeats: 20,
					originalSeats: 25,
					expiringArr: 4_000,
				},
			],
		) as Buffer;
		const zip = new PizZip(rendered);
		const firstPageSlide = zip.file('ppt/slides/slide1.xml')?.asText() ?? '';

		expect(firstPageSlide).toContain('Business Standard');
		expect(firstPageSlide).toContain('Business Premium');
		expect(firstPageSlide).toContain('30');
		expect(firstPageSlide).toContain('20');
		expect(firstPageSlide).not.toContain('{start_sku}');
		expect(firstPageSlide).not.toContain('{target_sku}');
		expect(firstPageSlide).not.toContain('{seats}');
	});

	it('fails proposal-ppt render when flyer contains unsupported placeholders', async () => {
		const dlTokenService = {
			createToken: vi.fn(),
			verifyTokenForScope: vi.fn(() => ({
				proposalPpt: {
					mode: 'single',
					journey: 'renewal',
					customerId: 'cust-1',
					customerName: 'Contoso',
					fileName: 'contoso-single.pptx',
					scenarios: [
						{
							opportunityId: 'opp-1',
							startingSkuId: 'bs',
							startingSkuName: 'Business Standard',
							endingSkuId: 'bp_cb',
							selectedSeats: 35,
							originalSeats: 40,
							expiringArr: 6_000,
						},
					],
				},
			})),
		};
		const blobStorageService = {
			upload: vi.fn(),
			download: vi.fn(),
		};
		const service = new ProposalOptionsEmailService(
			dlTokenService as never,
			blobStorageService as never,
			{} as never,
		);

		vi.spyOn(service as any, 'loadFlyerTemplateBuffer').mockResolvedValue(
			createFlyerTemplateBufferWithUnknownPlaceholder(),
		);

		await expect(
			service.renderProposalPptFromToken('token'),
		).rejects.toBeInstanceOf(UnprocessableEntityException);
	});
});
