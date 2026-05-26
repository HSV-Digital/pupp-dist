import path from 'path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { env, isDemoModeEnabled, validatePublicEnv } from './src/env';
import { validateServerEnv } from './src/env.server';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

validatePublicEnv();
validateServerEnv();
const demoEnabled = isDemoModeEnabled();

const nextConfig: NextConfig = {
	assetPrefix: '/csp-partners',
	turbopack: {
		root: path.resolve(process.cwd(), '../..'), // monorepo root
	},
	reactCompiler: true,
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: 'uhf.microsoft.com' },
			{ protocol: 'https', hostname: 'cdn-dynmedia-1.microsoft.com' },
			{
				protocol: 'https',
				hostname: 'agentb-c5dggfbkhbb6gndk.z01.azurefd.net',
			},
			{
				protocol: 'https',
				hostname: 'agentbprodstorage.blob.core.windows.net',
			},
		],
	},
	async redirects() {
		return [
			{
				source: '/resellers',
				destination: '/csp-partners',
				permanent: true,
			},
			{
				source: '/resellers/:path*',
				destination: '/csp-partners/:path*',
				permanent: true,
			},
		];
	},
	async rewrites() {
		return [
			// Surface the CSP-partners path prefix on Next.js API routes so that
			// browser-visible URLs match the page surface (e.g. the Network tab
			// shows /csp-partners/api/email/... instead of a bare /api/email/...).
			{
				source: '/csp-partners/api/:path*',
				destination: '/api/:path*',
			},
		];
	},
	async headers() {
		const apiBaseUrl = env.NEXT_PUBLIC_API_BASE_URL;
		const scriptSrc = [
			"script-src 'self' 'unsafe-inline'",
			env.isProduction ? null : "'unsafe-eval'",
			'https://us-assets.i.posthog.com',
			'https://www.microsoft.com',
			'https://mem.gfx.ms',
		]
			.filter(Boolean)
			.join(' ');
		const styleSrc = [
			"style-src 'self' 'unsafe-inline'",
			'https://fonts.googleapis.com',
			'https://www.microsoft.com',
		].join(' ');
		return [
			{
				source: '/(.*)',
				headers: [
					{ key: 'X-Content-Type-Options', value: 'nosniff' },
					{ key: 'X-Frame-Options', value: 'DENY' },
					{
						key: 'Referrer-Policy',
						value: 'strict-origin-when-cross-origin',
					},
					{ key: 'X-DNS-Prefetch-Control', value: 'on' },
					{
						key: 'Strict-Transport-Security',
						value: 'max-age=63072000; includeSubDomains',
					},
					{
						key: 'Permissions-Policy',
						value: 'camera=(), microphone=(), geolocation=()',
					},
					{
						key: 'Content-Security-Policy',
						value: [
							"default-src 'self'",
							scriptSrc,
							styleSrc,
							"img-src 'self' data: blob: https://uhf.microsoft.com https://www.microsoft.com https://cdn-dynmedia-1.microsoft.com https://agentb-c5dggfbkhbb6gndk.z01.azurefd.net https://agentbprodstorage.blob.core.windows.net",
							"font-src 'self' data: https://fonts.gstatic.com https://www.microsoft.com",
							[
								"frame-src 'self'",
								'https://view.officeapps.live.com',
								demoEnabled ? 'https://app.supademo.com' : null,
							]
								.filter(Boolean)
								.join(' '),
							`connect-src 'self' https://api.partnercenter.microsoft.com ${apiBaseUrl} ${env.NEXT_PUBLIC_POSTHOG_HOST} https://us-assets.i.posthog.com https://us.posthog.com https://login.microsoftonline.com https://accounts.google.com https://www.microsoft.com https://mem.gfx.ms https://uhf.microsoft.com`,
							"frame-ancestors 'none'",
							"base-uri 'self'",
							"form-action 'self' https://login.microsoftonline.com https://login.live.com https://accounts.google.com",
						].join('; '),
					},
				],
			},
		];
	},
};

export default withNextIntl(nextConfig);
