import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provisionUser } from './user-provisioning';

const fetchGraphUserProfileMock = vi.fn();

vi.mock('@/lib/microsoft-graph', () => ({
	fetchGraphUserProfile: (...args: unknown[]) =>
		fetchGraphUserProfileMock(...args),
}));

describe('provisionUser', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.API_BASE_URL = 'http://localhost:3001';
		global.fetch = vi.fn();
	});

	it('posts graph profile fields without photoBase64', async () => {
		fetchGraphUserProfileMock.mockResolvedValue({
			id: 'graph-user-id',
			displayName: 'Vandan',
			givenName: 'Vandan',
			surname: 'User',
			mail: 'vandan@hsv.digital',
			userPrincipalName: 'vandan@hsv.digital',
			jobTitle: 'Engineer',
			department: 'Engineering',
			officeLocation: 'Remote',
			companyName: 'HSV',
			city: 'Bengaluru',
			country: 'India',
			mobilePhone: null,
			businessPhones: [],
			preferredLanguage: 'en-US',
			employeeId: '123',
			employeeType: 'FullTime',
		});
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				email: 'vandan@hsv.digital',
				roles: ['ADMIN'],
				tenantId: 'tenant-1',
				entraObjectId: 'oid-1',
				displayName: 'Vandan',
			}),
		} as Response);

		await provisionUser({
			apiAccessToken: 'api-access-token',
			graphAccessToken: 'graph-access-token',
			entraObjectId: 'oid-1',
			tenantId: 'tenant-1',
		});

		expect(fetchGraphUserProfileMock).toHaveBeenCalledWith(
			'graph-access-token',
		);
		expect(global.fetch).toHaveBeenCalledTimes(1);
		const request = vi.mocked(global.fetch).mock.calls[0];
		const body = JSON.parse(String(request[1]?.body));

		expect(body).toMatchObject({
			identitySource: 'graph',
			entraObjectId: 'oid-1',
			tenantId: 'tenant-1',
			email: 'vandan@hsv.digital',
			userPrincipalName: 'vandan@hsv.digital',
		});
		expect(body).not.toHaveProperty('photoBase64');
	});
});
