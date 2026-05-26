/**
 * Skeleton placeholder matching the compact ScenarioCard shape.
 * Rendered while customer subscription data is still loading.
 */
export function ScenarioCardSkeleton() {
	return (
		<div className="flex h-full w-full min-w-0 flex-col gap-4 rounded-xl border border-neutral-200 bg-neutral-50 px-6 py-4">
			{/* Title */}
			<div className="h-6 w-40 animate-pulse rounded bg-gray-200" />

			<div className="h-px bg-gray-200" />

			{/* Description */}
			<div className="h-3 w-full animate-pulse rounded bg-gray-200" />

			{/* Hero price */}
			<div className="h-10 w-28 animate-pulse rounded bg-gray-200" />
			{/* Subtitle */}
			<div className="h-3 w-32 animate-pulse rounded bg-gray-200" />

			<div className="h-px bg-gray-200" />

			{/* 3 metric rows */}
			{Array.from({ length: 3 }, (_, i) => (
				<div key={i} className="flex items-center justify-between">
					<div className="h-3 w-36 animate-pulse rounded bg-gray-200" />
					<div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
				</div>
			))}
		</div>
	);
}
