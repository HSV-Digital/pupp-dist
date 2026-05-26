import { buildProposalScenarios } from './pdf-rules';

describe('buildProposalScenarios', () => {
	it('returns all allowed scenarios when selectedSkuIds is empty', () => {
		const scenarios = buildProposalScenarios({
			currentProduct: 'Microsoft 365 Business Basic',
			seatCount: 10,
			selectedSkuIds: [],
		});

		const ids = scenarios.map((scenario) => scenario.endingSkuId).sort();
		expect(ids).toEqual(
			[
				'bp_cb',
				'bp_cb_purview',
				'bp_defender',
				'bp_defender_purview',
				'bp_purview',
				'bs_cb',
			].sort(),
		);
	});

	it('returns only selected scenarios when selectedSkuIds is provided', () => {
		const scenarios = buildProposalScenarios({
			currentProduct: 'Microsoft 365 Business Standard',
			seatCount: 25,
			selectedSkuIds: ['bp_cb'],
		});

		expect(scenarios).toHaveLength(1);
		expect(scenarios[0]?.endingSkuId).toBe('bp_cb');
	});

	it('returns no scenarios when starting sku cannot be mapped', () => {
		const scenarios = buildProposalScenarios({
			currentProduct: 'Office 365 E3',
			seatCount: 100,
			selectedSkuIds: [],
		});

		expect(scenarios).toEqual([]);
	});
});
