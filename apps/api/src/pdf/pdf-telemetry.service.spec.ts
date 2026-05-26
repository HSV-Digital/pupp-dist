import { PdfTelemetryService } from './pdf-telemetry.service';

describe('PdfTelemetryService', () => {
	it('tracks success/failure counts and duration bounds per operation', () => {
		const service = new PdfTelemetryService();

		service.recordOperationSuccess('render-reseller-list', 25);
		service.recordOperationSuccess('render-reseller-list', 15);
		service.recordOperationFailure('render-reseller-list', 40, 'Error');

		const snapshot = service.getSnapshot();
		const operation = snapshot.operations['render-reseller-list'];

		expect(operation.successCount).toBe(2);
		expect(operation.failureCount).toBe(1);
		expect(operation.totalDurationMs).toBe(80);
		expect(operation.minDurationMs).toBe(15);
		expect(operation.maxDurationMs).toBe(40);
		expect(operation.errors.Error).toBe(1);
	});

	it('tracks token verification failures by reason', () => {
		const service = new PdfTelemetryService();

		service.recordTokenVerificationFailure('401_UnauthorizedException');
		service.recordTokenVerificationFailure('401_UnauthorizedException');
		service.recordTokenVerificationFailure('410_GoneException');

		const snapshot = service.getSnapshot();

		expect(snapshot.tokenVerificationFailures).toEqual({
			'401_UnauthorizedException': 2,
			'410_GoneException': 1,
		});
	});
});
