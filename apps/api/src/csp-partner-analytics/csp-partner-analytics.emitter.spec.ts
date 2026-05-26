import { describe, expect, it, vi } from 'vitest';
import { CspPartnerAnalyticsEmitter } from './csp-partner-analytics.emitter';
import {
	CSP_PARTNER_ANALYTICS_JOB_NAME,
	DEMO_TENANT_ORG_ID,
} from './csp-partner-analytics.types';

function createEmitter() {
	const queue = { add: vi.fn().mockResolvedValue(undefined) };
	const emitter = new CspPartnerAnalyticsEmitter(queue as never);
	return { emitter, queue };
}

describe('CspPartnerAnalyticsEmitter', () => {
	it('enqueues a login event payload with no country and no SKU', async () => {
		const { emitter, queue } = createEmitter();

		await emitter.enqueueEvent({
			orgId: 'org-1',
			actorId: 'user-1',
			eventType: 'login',
			metadata: { provider: 'entra' },
		});

		expect(queue.add).toHaveBeenCalledTimes(1);
		expect(queue.add).toHaveBeenCalledWith(
			CSP_PARTNER_ANALYTICS_JOB_NAME,
			expect.objectContaining({
				orgId: 'org-1',
				actorId: 'user-1',
				eventType: 'login',
				country: null,
				startingSkuId: null,
				endingSkuId: null,
				uploadCount: null,
				metadata: { provider: 'entra' },
			}),
			expect.objectContaining({ attempts: 3 }),
		);
	});

	it('skips events from the demo tenant', async () => {
		const { emitter, queue } = createEmitter();

		await emitter.enqueueEvent({
			orgId: DEMO_TENANT_ORG_ID,
			actorId: 'demo-user',
			eventType: 'login',
		});

		expect(queue.add).not.toHaveBeenCalled();
	});

	it('rejects subscription_upload events without uploadCount', async () => {
		const { emitter, queue } = createEmitter();

		await emitter.enqueueEvent({
			orgId: 'org-1',
			actorId: 'user-1',
			eventType: 'subscription_upload',
			country: 'India',
		});

		expect(queue.add).not.toHaveBeenCalled();
	});

	it('rejects non-login events without a country', async () => {
		const { emitter, queue } = createEmitter();

		await emitter.enqueueEvent({
			orgId: 'org-1',
			actorId: 'user-1',
			eventType: 'view_proposal',
		});

		expect(queue.add).not.toHaveBeenCalled();
	});

	it('rejects events with an unknown country', async () => {
		const { emitter, queue } = createEmitter();

		await emitter.enqueueEvent({
			orgId: 'org-1',
			actorId: 'user-1',
			eventType: 'view_proposal',
			country: 'Atlantis' as never,
		});

		expect(queue.add).not.toHaveBeenCalled();
	});

	it('rejects proposal_generated events with an unknown starting SKU', async () => {
		const { emitter, queue } = createEmitter();

		await emitter.enqueueEvent({
			orgId: 'org-1',
			actorId: 'user-1',
			eventType: 'proposal_generated',
			country: 'India',
			startingSkuId: 'unknown' as never,
			endingSkuId: 'bs_cb',
		});

		expect(queue.add).not.toHaveBeenCalled();
	});

	it('does not throw when the queue is unreachable (fire-and-forget)', async () => {
		const queue = {
			add: vi.fn().mockRejectedValue(new Error('queue down')),
		};
		const emitter = new CspPartnerAnalyticsEmitter(queue as never);

		await expect(
			emitter.enqueueEvent({
				orgId: 'org-1',
				actorId: 'user-1',
				eventType: 'login',
			}),
		).resolves.toBeUndefined();
	});

	it('enqueues a view_proposal event with country', async () => {
		const { emitter, queue } = createEmitter();

		await emitter.enqueueEvent({
			orgId: 'org-1',
			actorId: 'user-1',
			eventType: 'view_proposal',
			country: 'India',
			metadata: { customerIdentifier: 'tpid-42' },
		});

		expect(queue.add).toHaveBeenCalledTimes(1);
		expect(queue.add).toHaveBeenCalledWith(
			CSP_PARTNER_ANALYTICS_JOB_NAME,
			expect.objectContaining({
				eventType: 'view_proposal',
				country: 'India',
				startingSkuId: null,
				endingSkuId: null,
				uploadCount: null,
				metadata: { customerIdentifier: 'tpid-42' },
			}),
			expect.any(Object),
		);
	});

	it('enqueues a proposal_generated event with start and end SKU ids', async () => {
		const { emitter, queue } = createEmitter();

		await emitter.enqueueEvent({
			orgId: 'org-1',
			actorId: 'user-1',
			eventType: 'proposal_generated',
			country: 'United Kingdom',
			startingSkuId: 'bp',
			endingSkuId: 'bp_cb',
			metadata: { generationRequestId: 'req-1', opportunityId: 'opp-1' },
		});

		expect(queue.add).toHaveBeenCalledTimes(1);
		expect(queue.add).toHaveBeenCalledWith(
			CSP_PARTNER_ANALYTICS_JOB_NAME,
			expect.objectContaining({
				eventType: 'proposal_generated',
				country: 'United Kingdom',
				startingSkuId: 'bp',
				endingSkuId: 'bp_cb',
				uploadCount: null,
				metadata: { generationRequestId: 'req-1', opportunityId: 'opp-1' },
			}),
			expect.any(Object),
		);
	});
});
