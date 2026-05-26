import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getEnvMock, passportJwtSecretMock, tokenExtractorMock } = vi.hoisted(
	() => ({
		getEnvMock: vi.fn(() => ({})),
		passportJwtSecretMock: vi.fn(() => 'secret-provider'),
		tokenExtractorMock: vi.fn(() => 'extractor'),
	}),
);

vi.mock('../../config/env', () => ({
	getEnv: getEnvMock,
}));

vi.mock('@nestjs/passport', () => ({
	PassportStrategy: (Base: new (...args: any[]) => any) =>
		class extends Base {},
}));

vi.mock('passport-jwt', () => ({
	ExtractJwt: {
		fromAuthHeaderAsBearerToken: tokenExtractorMock,
	},
	Strategy: class {
		options: Record<string, unknown>;

		constructor(options: Record<string, unknown>) {
			this.options = options;
		}
	},
}));

vi.mock('jwks-rsa', () => ({
	passportJwtSecret: passportJwtSecretMock,
}));

describe('ResellerBootstrapEntraStrategy', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getEnvMock.mockReturnValue({});
	});

	it('uses AZURE_AD_RESELLER_CLIENT_ID as the accepted audience', async () => {
		getEnvMock.mockReturnValue({
			azureAdResellerClientId: 'reseller-client-id',
		});

		const { ResellerBootstrapEntraStrategy } =
			await import('./reseller-bootstrap-entra.strategy');
		const strategy = new ResellerBootstrapEntraStrategy() as {
			options: { audience: string[] };
		};

		expect(getEnvMock).toHaveBeenCalled();
		expect(passportJwtSecretMock).toHaveBeenCalled();
		expect(tokenExtractorMock).toHaveBeenCalled();
		expect(strategy.options.audience).toEqual([
			'reseller-client-id',
			'api://reseller-client-id',
		]);
	});

	it('throws when AZURE_AD_RESELLER_CLIENT_ID is missing', async () => {
		getEnvMock.mockReturnValue({
			azureAdResellerClientId: '',
		});
		const { ResellerBootstrapEntraStrategy } =
			await import('./reseller-bootstrap-entra.strategy');

		expect(() => new ResellerBootstrapEntraStrategy()).toThrow(
			'AZURE_AD_RESELLER_CLIENT_ID environment variable is required for reseller bootstrap token validation',
		);
	});
});
