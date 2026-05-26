import 'reflect-metadata';

process.env.DATABASE_URL ??=
	'postgres://agentb:agentb@127.0.0.1:5432/agentb_test';
process.env.DL_TOKEN_ENCRYPTION_KEY ??=
	'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
process.env.PDF_DL_TOKEN_SECRET ??= 'test-pdf-dl-token-secret';
process.env.RESELLER_API_TOKEN_SECRET ??= 'test-reseller-api-token-secret';
process.env.PDF_PASSWORD_ENCRYPTION_KEY ??=
	'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
process.env.AZURE_AD_CLIENT_ID ??= 'test-azure-ad-client-id';
process.env.AZURE_AD_RESELLER_CLIENT_ID ??= 'test-azure-ad-reseller-client-id';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
