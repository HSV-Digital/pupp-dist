import crypto from 'node:crypto';
import { GoneException, UnauthorizedException } from '@nestjs/common';
import type { ResellerApiTokenPayload } from './reseller-api-token.types';

export function encodeResellerApiTokenPayload(
	payload: ResellerApiTokenPayload,
): string {
	return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeResellerApiTokenPayload(
	encodedPayload: string,
): ResellerApiTokenPayload {
	return JSON.parse(
		Buffer.from(encodedPayload, 'base64url').toString('utf8'),
	) as ResellerApiTokenPayload;
}

export function signResellerApiTokenPayload(
	encodedPayload: string,
	secret: string,
): string {
	return crypto
		.createHmac('sha256', secret)
		.update(encodedPayload)
		.digest('base64url');
}

export function assertResellerApiTokenSignatureMatch(params: {
	actualSignature: string;
	expectedSignature: string;
}): void {
	const actual = Buffer.from(params.actualSignature);
	const expected = Buffer.from(params.expectedSignature);

	if (actual.length !== expected.length) {
		throw new UnauthorizedException('Invalid reseller API token signature');
	}

	if (!crypto.timingSafeEqual(actual, expected)) {
		throw new UnauthorizedException('Invalid reseller API token signature');
	}
}

export function readSignedResellerApiTokenPayload(params: {
	token: string | undefined;
	secret: string;
	allowExpired?: boolean;
}): ResellerApiTokenPayload {
	if (!params.token || params.token.trim().length === 0) {
		throw new UnauthorizedException('Missing reseller API token');
	}

	const [encodedPayload, signature] = params.token.split('.');
	if (!encodedPayload || !signature) {
		throw new UnauthorizedException('Invalid reseller API token');
	}

	const expectedSignature = signResellerApiTokenPayload(
		encodedPayload,
		params.secret,
	);
	assertResellerApiTokenSignatureMatch({
		actualSignature: signature,
		expectedSignature,
	});

	let payload: ResellerApiTokenPayload;
	try {
		payload = decodeResellerApiTokenPayload(encodedPayload);
	} catch {
		throw new UnauthorizedException('Invalid reseller API token payload');
	}

	if (payload.v !== 1 || payload.userType !== 'reseller') {
		throw new UnauthorizedException('Unsupported reseller API token version');
	}

	const now = Math.floor(Date.now() / 1000);
	if (!params.allowExpired && payload.exp < now) {
		throw new GoneException('Reseller API token has expired');
	}

	return payload;
}
