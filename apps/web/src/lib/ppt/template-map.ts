import path from 'node:path';
import fs from 'node:fs';
import type { Plan } from '@/lib/ppt-types';

const TEMPLATE_BY_PLAN: Record<Plan, string> = {
	good: 'good.pptx',
	better: 'better.pptx',
	best: 'best.pptx',
	'sec-defender': 'sec-defender.pptx',
	'sec-purview': 'sec-purview.pptx',
	'sec-full': 'sec-full.pptx',
};

function findTemplateDirectory(): string {
	const candidates = [
		path.join(process.cwd(), 'public', 'proposal_templates'),
		path.join(process.cwd(), 'apps', 'web', 'public', 'proposal_templates'),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return candidates[0];
}

export function getTemplatePath(plan: Plan): string {
	return path.join(findTemplateDirectory(), TEMPLATE_BY_PLAN[plan]);
}
