import { Injectable } from '@nestjs/common';

export type PdfOperation =
	| 'create-list-link'
	| 'render-reseller-list'
	| 'render-customer-list'
	| 'render-opportunities';

interface PdfOperationCounter {
	successCount: number;
	failureCount: number;
	totalDurationMs: number;
	minDurationMs: number | null;
	maxDurationMs: number | null;
	errors: Record<string, number>;
}

export interface PdfTelemetrySnapshot {
	operations: Record<PdfOperation, PdfOperationCounter>;
	tokenVerificationFailures: Record<string, number>;
}

const OPERATIONS: PdfOperation[] = [
	'create-list-link',
	'render-reseller-list',
	'render-customer-list',
	'render-opportunities',
];

function createEmptyOperationCounter(): PdfOperationCounter {
	return {
		successCount: 0,
		failureCount: 0,
		totalDurationMs: 0,
		minDurationMs: null,
		maxDurationMs: null,
		errors: {},
	};
}

function normalizeDuration(durationMs: number): number {
	if (!Number.isFinite(durationMs) || durationMs < 0) {
		return 0;
	}

	return Math.round(durationMs);
}

@Injectable()
export class PdfTelemetryService {
	private readonly operationCounters: Record<
		PdfOperation,
		PdfOperationCounter
	> = OPERATIONS.reduce(
		(accumulator, operation) => {
			accumulator[operation] = createEmptyOperationCounter();
			return accumulator;
		},
		{} as Record<PdfOperation, PdfOperationCounter>,
	);

	private readonly tokenVerificationFailures: Record<string, number> = {};

	recordOperationSuccess(operation: PdfOperation, durationMs: number): void {
		const counter = this.operationCounters[operation];
		const normalizedDuration = normalizeDuration(durationMs);

		counter.successCount += 1;
		counter.totalDurationMs += normalizedDuration;
		counter.minDurationMs =
			counter.minDurationMs === null
				? normalizedDuration
				: Math.min(counter.minDurationMs, normalizedDuration);
		counter.maxDurationMs =
			counter.maxDurationMs === null
				? normalizedDuration
				: Math.max(counter.maxDurationMs, normalizedDuration);
	}

	recordOperationFailure(
		operation: PdfOperation,
		durationMs: number,
		errorType: string,
	): void {
		const counter = this.operationCounters[operation];
		const normalizedDuration = normalizeDuration(durationMs);

		counter.failureCount += 1;
		counter.totalDurationMs += normalizedDuration;
		counter.minDurationMs =
			counter.minDurationMs === null
				? normalizedDuration
				: Math.min(counter.minDurationMs, normalizedDuration);
		counter.maxDurationMs =
			counter.maxDurationMs === null
				? normalizedDuration
				: Math.max(counter.maxDurationMs, normalizedDuration);

		counter.errors[errorType] = (counter.errors[errorType] ?? 0) + 1;
	}

	recordTokenVerificationFailure(reason: string): void {
		this.tokenVerificationFailures[reason] =
			(this.tokenVerificationFailures[reason] ?? 0) + 1;
	}

	getSnapshot(): PdfTelemetrySnapshot {
		return {
			operations: {
				'create-list-link': this.cloneCounter('create-list-link'),
				'render-reseller-list': this.cloneCounter('render-reseller-list'),
				'render-customer-list': this.cloneCounter('render-customer-list'),
				'render-opportunities': this.cloneCounter('render-opportunities'),
			},
			tokenVerificationFailures: { ...this.tokenVerificationFailures },
		};
	}

	private cloneCounter(operation: PdfOperation): PdfOperationCounter {
		const counter = this.operationCounters[operation];
		return {
			successCount: counter.successCount,
			failureCount: counter.failureCount,
			totalDurationMs: counter.totalDurationMs,
			minDurationMs: counter.minDurationMs,
			maxDurationMs: counter.maxDurationMs,
			errors: { ...counter.errors },
		};
	}
}
