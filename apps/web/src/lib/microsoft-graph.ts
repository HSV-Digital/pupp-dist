export interface EntraUserProfile {
	id: string;
	displayName: string;
	givenName: string | null;
	surname: string | null;
	mail: string | null;
	userPrincipalName: string;
	jobTitle: string | null;
	department: string | null;
	officeLocation: string | null;
	companyName: string | null;
	city: string | null;
	country: string | null;
	mobilePhone: string | null;
	businessPhones: string[];
	preferredLanguage: string | null;
	employeeId: string | null;
	employeeType: string | null;
}

const GRAPH_SELECT_FIELDS = [
	'id',
	'displayName',
	'givenName',
	'surname',
	'mail',
	'userPrincipalName',
	'jobTitle',
	'department',
	'officeLocation',
	'companyName',
	'city',
	'country',
	'mobilePhone',
	'businessPhones',
	'preferredLanguage',
	'employeeId',
	'employeeType',
].join(',');

export async function fetchGraphUserProfile(
	accessToken: string,
): Promise<EntraUserProfile> {
	const response = await fetch(
		`https://graph.microsoft.com/v1.0/me?$select=${GRAPH_SELECT_FIELDS}`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
			cache: 'no-store',
		},
	);

	if (!response.ok) {
		throw new Error(
			`Graph API profile request failed: ${response.status} ${response.statusText}`,
		);
	}

	return (await response.json()) as EntraUserProfile;
}
