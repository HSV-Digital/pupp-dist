import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	randomInt,
} from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { getEnv } from '../config/env';

const PASSWORD_LENGTH = 16;
const PASSWORD_ALPHABET =
	'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

interface EncryptedPasswordPayload {
	v: 1;
	iv: string;
	tag: string;
	ciphertext: string;
}

function resolveEncryptionKey(): Buffer {
	const rawKey = getEnv().pdfPasswordEncryptionKey.trim();

	const key = Buffer.from(rawKey, 'base64');
	if (key.length !== 32) {
		throw new Error(
			'PDF_PASSWORD_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
		);
	}

	return key;
}

function parsePayload(ciphertext: string): EncryptedPasswordPayload | null {
	let decoded: string;
	try {
		decoded = Buffer.from(ciphertext, 'base64url').toString('utf8');
	} catch {
		return null;
	}

	try {
		const parsed = JSON.parse(decoded) as Partial<EncryptedPasswordPayload>;
		if (
			parsed.v !== 1 ||
			typeof parsed.iv !== 'string' ||
			typeof parsed.tag !== 'string' ||
			typeof parsed.ciphertext !== 'string'
		) {
			return null;
		}

		return {
			v: 1,
			iv: parsed.iv,
			tag: parsed.tag,
			ciphertext: parsed.ciphertext,
		};
	} catch {
		return null;
	}
}

@Injectable()
export class PdfPasswordService {
	private readonly encryptionKey = resolveEncryptionKey();

	generatePassword(): string {
		let result = '';
		for (let index = 0; index < PASSWORD_LENGTH; index += 1) {
			result += PASSWORD_ALPHABET[randomInt(0, PASSWORD_ALPHABET.length)];
		}
		return result;
	}

	encryptPassword(password: string): string {
		try {
			const iv = randomBytes(12);
			const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
			const encrypted = Buffer.concat([
				cipher.update(password, 'utf8'),
				cipher.final(),
			]);
			const payload: EncryptedPasswordPayload = {
				v: 1,
				iv: iv.toString('base64'),
				tag: cipher.getAuthTag().toString('base64'),
				ciphertext: encrypted.toString('base64'),
			};

			return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
		} catch {
			throw new InternalServerErrorException(
				'Failed to secure PDF password for this job',
			);
		}
	}

	decryptPassword(ciphertext: string): string {
		const payload = parsePayload(ciphertext);
		if (!payload) {
			throw new InternalServerErrorException(
				'Stored PDF password payload is invalid',
			);
		}

		try {
			const decipher = createDecipheriv(
				'aes-256-gcm',
				this.encryptionKey,
				Buffer.from(payload.iv, 'base64'),
			);
			decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
			const decrypted = Buffer.concat([
				decipher.update(Buffer.from(payload.ciphertext, 'base64')),
				decipher.final(),
			]);
			return decrypted.toString('utf8');
		} catch {
			throw new InternalServerErrorException(
				'Stored PDF password payload cannot be decrypted',
			);
		}
	}
}
