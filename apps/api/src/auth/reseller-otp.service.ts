import { createHash, randomInt, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import {
	ForbiddenException,
	HttpException,
	HttpStatus,
	Injectable,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { createDatabaseClient } from '../database/connection';
import { resolveDatabaseUrl } from '../database/database-url';
import { resellerOtps } from '../database/schema';
import { MailService } from '../mail/mail.service';
import { ResellerAuthService } from './reseller-auth.service';
import type { ResellerBootstrapResult } from './reseller-auth.service';
import { assertResellerCompanyEmail } from './reseller-domain';

const OTP_EXPIRY_SECONDS = 600; // 10 minutes
const MAX_OTPS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

function hashOtp(code: string): string {
	return createHash('sha256').update(code).digest('hex');
}

function generateOtpCode(): string {
	return String(randomInt(100000, 999999));
}

@Injectable()
export class ResellerOtpService implements OnModuleDestroy {
	private readonly logger = new Logger(ResellerOtpService.name);
	private readonly databaseClient = createDatabaseClient(resolveDatabaseUrl());
	private readonly db = this.databaseClient.db;
	private readonly sqlClient = this.databaseClient.sql;

	constructor(
		private readonly mailService: MailService,
		private readonly resellerAuthService: ResellerAuthService,
	) {}

	async requestOtp(email: string): Promise<{ email: string; expiresInSeconds: number }> {
		let normalized: ReturnType<typeof assertResellerCompanyEmail>;
		try {
			normalized = assertResellerCompanyEmail(email);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes('Generic email domains')
			) {
				throw new ForbiddenException(error.message);
			}
			throw error;
		}

		const normalizedEmail = normalized.email;
		const now = new Date();
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

		// Rate limit: max OTPs per email per hour
		const [countResult] = await this.db
			.select({ count: sql<number>`count(*)::int` })
			.from(resellerOtps)
			.where(
				and(
					eq(resellerOtps.email, normalizedEmail),
					gt(resellerOtps.createdAt, oneHourAgo),
				),
			);

		if (countResult && countResult.count >= MAX_OTPS_PER_HOUR) {
			throw new HttpException(
				'Too many OTP requests. Please try again later.',
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}

		const otpCode = generateOtpCode();
		const otpHash = hashOtp(otpCode);
		const expiresAt = new Date(now.getTime() + OTP_EXPIRY_SECONDS * 1000);

		await this.db.insert(resellerOtps).values({
			id: randomUUID(),
			email: normalizedEmail,
			otpHash,
			expiresAt,
			attempts: 0,
			createdAt: now,
		});

		await this.mailService.sendOtpEmail({
			to: normalizedEmail,
			otpCode,
		});

		this.logger.log(`OTP requested for ${normalizedEmail}`);

		return { email: normalizedEmail, expiresInSeconds: OTP_EXPIRY_SECONDS };
	}

	async verifyOtp(
		email: string,
		code: string,
	): Promise<ResellerBootstrapResult> {
		let normalized: ReturnType<typeof assertResellerCompanyEmail>;
		try {
			normalized = assertResellerCompanyEmail(email);
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.includes('Generic email domains')
			) {
				throw new ForbiddenException(error.message);
			}
			throw error;
		}

		const normalizedEmail = normalized.email;
		const now = new Date();

		// Find the latest unused, unexpired OTP for this email
		const [otpRecord] = await this.db
			.select()
			.from(resellerOtps)
			.where(
				and(
					eq(resellerOtps.email, normalizedEmail),
					gt(resellerOtps.expiresAt, now),
					isNull(resellerOtps.usedAt),
					sql`${resellerOtps.attempts} < ${MAX_VERIFY_ATTEMPTS}`,
				),
			)
			.orderBy(sql`${resellerOtps.createdAt} DESC`)
			.limit(1);

		if (!otpRecord) {
			throw new UnauthorizedException(
				'Invalid or expired verification code. Please request a new one.',
			);
		}

		const codeHash = hashOtp(code);
		if (codeHash !== otpRecord.otpHash) {
			// Increment attempts
			await this.db
				.update(resellerOtps)
				.set({ attempts: sql`${resellerOtps.attempts} + 1` })
				.where(eq(resellerOtps.id, otpRecord.id));

			throw new UnauthorizedException('Incorrect verification code.');
		}

		// Mark OTP as used
		await this.db
			.update(resellerOtps)
			.set({ usedAt: now })
			.where(eq(resellerOtps.id, otpRecord.id));

		// Bootstrap the reseller user (creates org + user if needed, issues token)
		const result = await this.resellerAuthService.bootstrapResellerUser({
			provider: 'email',
			providerSubject: `email:${normalizedEmail}`,
			email: normalizedEmail,
			displayName: null,
			issuer: null,
			externalTenantId: null,
		});

		this.logger.log(`OTP verified for ${normalizedEmail}, user ${result.user.userId}`);

		return result;
	}

	async onModuleDestroy(): Promise<void> {
		await this.sqlClient.end();
	}
}
