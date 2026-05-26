import type { RenewalSubscription, UpgradeScenario } from '@repo/types';

export interface ScenarioProposal {
	opportunityId: string;
	subscription: RenewalSubscription;
	scenario: UpgradeScenario;
}
