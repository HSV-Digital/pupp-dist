import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { getEnv } from '../config/env';

@Injectable()
export class MailService {
	private readonly logger = new Logger(MailService.name);
	private readonly resend: Resend | null;
	private readonly fromEmail: string;

	constructor() {
		const env = getEnv();
		this.fromEmail = env.resendFromEmail;

		if (env.resendApiKey) {
			this.resend = new Resend(env.resendApiKey);
		} else {
			this.resend = null;
			this.logger.warn(
				'RESEND_API_KEY is not configured. Email sending is disabled.',
			);
		}
	}

	async sendEmail(params: {
		to: string;
		subject: string;
		html: string;
		from?: string;
	}): Promise<void> {
		if (!this.resend) {
			this.logger.warn(
				`Email not sent (Resend not configured): to=${params.to}, subject=${params.subject}`,
			);
			return;
		}

		try {
			await this.resend.emails.send({
				from: params.from ?? this.fromEmail,
				to: params.to,
				subject: params.subject,
				html: params.html,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(`Failed to send email to ${params.to}: ${message}`);
		}
	}

	async sendPdfPasswordEmail(params: {
		to: string;
		recipientName: string;
		password: string;
		listType: string;
	}): Promise<void> {
		const subject = `Your PDF Password from Partner Uplift Planner and Proposal`;
		const html = `
			<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
				<h2 style="color: #323130; margin-bottom: 16px;">Your PDF Password</h2>
				<p style="color: #605E5C; font-size: 14px;">Hi ${params.recipientName},</p>
				<p style="color: #605E5C; font-size: 14px;">
					Here is the password for your password-protected <strong>${params.listType}</strong> PDF:
				</p>
				<div style="background: #F3F2F1; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
					<code style="font-size: 20px; font-weight: 600; color: #323130; letter-spacing: 2px;">${params.password}</code>
				</div>
				<p style="color: #A19F9D; font-size: 12px;">
					Please save this password. You will need it to open the PDF file attached in the email template.
				</p>
			</div>
		`;

		await this.sendEmail({ to: params.to, subject, html });
	}

	async sendOtpEmail(params: {
		to: string;
		otpCode: string;
	}): Promise<void> {
		const subject = 'Your Partner Uplift and Proposal Planning platform Verification Code';
		const html = `
			<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
				<h2 style="color: #323130; margin-bottom: 16px;">Verification Code</h2>
				<p style="color: #605E5C; font-size: 14px;">
					Use the following code to sign in to Partner Uplift and Proposal Planning platform. This code expires in 10 minutes.
				</p>
				<div style="background: #F3F2F1; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
					<code style="font-size: 28px; font-weight: 600; color: #323130; letter-spacing: 6px;">${params.otpCode}</code>
				</div>
				<p style="color: #A19F9D; font-size: 12px;">
					If you did not request this code, you can safely ignore this email.
				</p>
			</div>
		`;

		await this.sendEmail({ to: params.to, subject, html });
	}

	async sendAccessRequestEmail(params: {
		to: string;
		requesterEmail: string;
	}): Promise<void> {
		const subject = 'Partner Uplift Planner and Proposal – New Access Request';
		const html = `
			<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #F3F2F1;">
				<div style="background: #ffffff; border-radius: 8px; padding: 32px;">
					<h2 style="color: #323130; margin: 0 0 16px;">Access Request</h2>
					<p style="color: #605E5C; font-size: 14px; line-height: 1.6;">
						A user (<strong style="color: #0078d4;">${params.requesterEmail}</strong>) has requested access to Partner Uplift Planner and Proposal.
					</p>
				</div>
			</div>
		`;

		await this.sendEmail({ to: params.to, subject, html });
	}

	async sendAccessApprovedEmail(params: { to: string }): Promise<void> {
		const subject =
			'Partner Uplift Planner and Proposal – Access Approved';
		const html = `
			<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #F3F2F1;">
				<div style="background: #ffffff; border-radius: 8px; padding: 32px;">
					<h2 style="color: #323130; margin: 0 0 16px;">Access Approved</h2>
					<p style="color: #605E5C; font-size: 14px; line-height: 1.6;">
						Your request to access Partner Uplift Planner and Proposal has been <strong style="color: #107C10;">approved</strong>.
					</p>
					<p style="color: #605E5C; font-size: 14px; line-height: 1.6;">
						You can now sign in to the application.
					</p>
				</div>
			</div>
		`;

		await this.sendEmail({ to: params.to, subject, html });
	}

	async sendUploadCompletedEmail(params: {
		to: string;
		recipientName?: string;
		filename: string;
		accepted: number;
		rejected: number;
		flagged: number;
		dashboardUrl: string;
	}): Promise<void> {
		const greeting = params.recipientName
			? `Hi ${params.recipientName},`
			: 'Hi,';
		const subject = `Your upload "${params.filename}" has finished processing`;
		const html = `
			<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #F3F2F1;">
				<div style="background: #ffffff; border-radius: 8px; padding: 32px;">
					<h2 style="color: #323130; margin: 0 0 16px;">Upload processed</h2>
					<p style="color: #605E5C; font-size: 14px; line-height: 1.6;">${greeting}</p>
					<p style="color: #605E5C; font-size: 14px; line-height: 1.6;">
						Your file <strong>${params.filename}</strong> has finished processing.
					</p>
					<ul style="color: #605E5C; font-size: 14px; line-height: 1.8;">
						<li><strong>${params.accepted.toLocaleString()}</strong> rows accepted</li>
						<li><strong>${params.rejected.toLocaleString()}</strong> rows rejected</li>
						<li><strong>${params.flagged.toLocaleString()}</strong> rows flagged for review</li>
					</ul>
					<p style="margin: 24px 0;">
						<a href="${params.dashboardUrl}" style="background: #0078d4; color: #ffffff; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-size: 14px;">View your data</a>
					</p>
				</div>
			</div>
		`;

		await this.sendEmail({ to: params.to, subject, html });
	}

	async sendUploadFailedEmail(params: {
		to: string;
		recipientName?: string;
		filename: string;
		errorMessage: string;
	}): Promise<void> {
		const greeting = params.recipientName
			? `Hi ${params.recipientName},`
			: 'Hi,';
		const subject = `Your upload "${params.filename}" could not be processed`;
		const html = `
			<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #F3F2F1;">
				<div style="background: #ffffff; border-radius: 8px; padding: 32px;">
					<h2 style="color: #323130; margin: 0 0 16px;">Upload failed</h2>
					<p style="color: #605E5C; font-size: 14px; line-height: 1.6;">${greeting}</p>
					<p style="color: #605E5C; font-size: 14px; line-height: 1.6;">
						We were unable to process your file <strong>${params.filename}</strong>.
					</p>
					<p style="color: #605E5C; font-size: 14px; line-height: 1.6;">
						Reason: <em>${params.errorMessage}</em>
					</p>
					<p style="color: #605E5C; font-size: 14px; line-height: 1.6;">
						Please check your file and try again. Contact support if the issue persists.
					</p>
				</div>
			</div>
		`;

		await this.sendEmail({ to: params.to, subject, html });
	}

	async sendAccessRejectedEmail(params: { to: string }): Promise<void> {
		const subject =
			'Partner Uplift Planner and Proposal – Access Request Declined';
		const html = `
			<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #F3F2F1;">
				<div style="background: #ffffff; border-radius: 8px; padding: 32px;">
					<h2 style="color: #323130; margin: 0 0 16px;">Access Request Declined</h2>
					<p style="color: #605E5C; font-size: 14px; line-height: 1.6;">
						Your request to access Partner Uplift Planner and Proposal has been <strong style="color: #D13438;">declined</strong>.
					</p>
					
				</div>
			</div>
		`;

		await this.sendEmail({ to: params.to, subject, html });
	}
}
