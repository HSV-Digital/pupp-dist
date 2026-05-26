'use client';

import { useCallback, useEffect, useState, type RefCallback } from 'react';

export function useHasBeenVisible<T extends Element>(
	rootMargin = '200px',
): { hasBeenVisible: boolean; ref: RefCallback<T> } {
	const [element, setElement] = useState<T | null>(null);
	const [hasBeenVisible, setHasBeenVisible] = useState(false);
	const ref = useCallback<RefCallback<T>>((node) => {
		setElement(node);
	}, []);

	useEffect(() => {
		if (hasBeenVisible) {
			return;
		}

		if (!element) {
			return;
		}

		if (typeof IntersectionObserver === 'undefined') {
			setHasBeenVisible(true);
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) {
					return;
				}

				setHasBeenVisible(true);
				observer.disconnect();
			},
			{ rootMargin },
		);

		observer.observe(element);

		return () => observer.disconnect();
	}, [element, hasBeenVisible, rootMargin]);

	return { hasBeenVisible, ref };
}
