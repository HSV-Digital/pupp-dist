import crypto from 'node:crypto';
import { GoneException, UnauthorizedException } from '@nestjs/common';
import type { DlTokenPayload } from './types/dl-token.types';

export function encodeDlTokenPayload(payload: DlTokenPayload): string {
	return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeDlTokenPayload(encodedPayload: string): DlTokenPayload {
	return JSON.parse(
		Buffer.from(encodedPayload, 'base64url').toString('utf8'),
	) as DlTokenPayload;
}

export function signDlTokenPayload(
	encodedPayload: string,
	secret: string,
): string {
	return crypto
		.createHmac('sha256', secret)
		.update(encodedPayload)
		.digest('base64url');
}

export function assertDlTokenSignatureMatch(params: {
	actualSignature: string;
	expectedSignature: string;
}): void {
	const actual = Buffer.from(params.actualSignature);
	const expected = Buffer.from(params.expectedSignature);

	if (actual.length !== expected.length) {
		throw new UnauthorizedException('Invalid download token signature');
	}

	if (!crypto.timingSafeEqual(actual, expected)) {
		throw new UnauthorizedException('Invalid download token signature');
	}
}

export function readSignedDlTokenPayload(params: {
	token: string | undefined;
	secret: string;
	allowExpired?: boolean;
}): DlTokenPayload {
	if (!params.token || params.token.trim().length === 0) {
		throw new UnauthorizedException('Missing download token');
	}

	const [encodedPayload, signature] = params.token.split('.');
	if (!encodedPayload || !signature) {
		throw new UnauthorizedException('Invalid download token');
	}

	const expectedSignature = signDlTokenPayload(encodedPayload, params.secret);
	assertDlTokenSignatureMatch({
		actualSignature: signature,
		expectedSignature,
	});

	let payload: DlTokenPayload;
	try {
		payload = decodeDlTokenPayload(encodedPayload);
	} catch {
		throw new UnauthorizedException('Invalid download token payload');
	}

	if (payload.v !== 1) {
		throw new UnauthorizedException('Unsupported download token version');
	}

	const now = Math.floor(Date.now() / 1000);
	if (!params.allowExpired && payload.exp < now) {
		throw new GoneException('Download link has expired');
	}

	return payload;
}

function parseEncryptionKey(rawKey: string): Buffer {
	const key = Buffer.from(rawKey, 'base64');
	if (key.length !== 32) {
		throw new Error(
			'DL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
		);
	}

	return key;
}

export function encryptDlTokenPayload(params: {
	payload: DlTokenPayload;
	encryptionKey: string;
}): string {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(
		'aes-256-gcm',
		parseEncryptionKey(params.encryptionKey),
		iv,
	);
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(params.payload), 'utf8'),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	return [
		'v2',
		iv.toString('base64url'),
		ciphertext.toString('base64url'),
		tag.toString('base64url'),
	].join('.');
}

export function readEncryptedDlTokenPayload(params: {
	token: string | undefined;
	encryptionKey: string;
	allowExpired?: boolean;
}): DlTokenPayload {
	if (!params.token || params.token.trim().length === 0) {
		throw new UnauthorizedException('Missing download token');
	}

	const [version, encodedIv, encodedCiphertext, encodedTag] =
		params.token.split('.');
	if (version !== 'v2' || !encodedIv || !encodedCiphertext || !encodedTag) {
		throw new UnauthorizedException('Invalid download token');
	}

	let payload: DlTokenPayload;
	try {
		const decipher = crypto.createDecipheriv(
			'aes-256-gcm',
			parseEncryptionKey(params.encryptionKey),
			Buffer.from(encodedIv, 'base64url'),
		);
		decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
		const decrypted = Buffer.concat([
			decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
			decipher.final(),
		]);
		payload = JSON.parse(decrypted.toString('utf8')) as DlTokenPayload;
	} catch {
		throw new UnauthorizedException('Invalid download token payload');
	}

	if (payload.v !== 2) {
		throw new UnauthorizedException('Unsupported download token version');
	}

	const now = Math.floor(Date.now() / 1000);
	if (!params.allowExpired && payload.exp < now) {
		throw new GoneException('Download link has expired');
	}

	return payload;
}
