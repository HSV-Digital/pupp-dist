import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHasBeenVisible } from './use-has-been-visible';

class MockIntersectionObserver {
	static instances: MockIntersectionObserver[] = [];

	readonly callback: IntersectionObserverCallback;
	readonly disconnect = vi.fn();
	readonly observe = vi.fn();
	readonly unobserve = vi.fn();

	constructor(callback: IntersectionObserverCallback) {
		this.callback = callback;
		MockIntersectionObserver.instances.push(this);
	}

	trigger(target: Element, isIntersecting: boolean) {
		this.callback(
			[
				{
					isIntersecting,
					target,
				} as IntersectionObserverEntry,
			],
			this as unknown as IntersectionObserver,
		);
	}
}

vi.stubGlobal(
	'IntersectionObserver',
	MockIntersectionObserver as unknown as typeof IntersectionObserver,
);

describe('useHasBeenVisible', () => {
	beforeEach(() => {
		MockIntersectionObserver.instances = [];
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.stubGlobal(
			'IntersectionObserver',
			MockIntersectionObserver as unknown as typeof IntersectionObserver,
		);
	});

	it('starts observing when the target element is attached after the initial render', async () => {
		const { result } = renderHook(() =>
			useHasBeenVisible<HTMLDivElement>('400px 0px'),
		);

		expect(result.current.hasBeenVisible).toBe(false);
		expect(MockIntersectionObserver.instances).toHaveLength(0);

		const element = document.createElement('div');

		act(() => {
			result.current.ref(element);
		});

		await waitFor(() => {
			expect(MockIntersectionObserver.instances).toHaveLength(1);
		});

		const observer = MockIntersectionObserver.instances[0];

		expect(observer.observe).toHaveBeenCalledWith(element);

		act(() => {
			observer.trigger(element, true);
		});

		await waitFor(() => {
			expect(result.current.hasBeenVisible).toBe(true);
		});
		expect(observer.disconnect).toHaveBeenCalled();
	});

	it('marks the element as visible immediately when IntersectionObserver is unavailable', async () => {
		vi.stubGlobal('IntersectionObserver', undefined);

		const { result } = renderHook(() => useHasBeenVisible<HTMLDivElement>());
		const element = document.createElement('div');

		act(() => {
			result.current.ref(element);
		});

		await waitFor(() => {
			expect(result.current.hasBeenVisible).toBe(true);
		});
	});
});
