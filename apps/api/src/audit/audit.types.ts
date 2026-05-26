export type AuditActionStatus = 'success' | 'failure';
export type AuditActorType = 'user' | 'anonymous' | 'system';
export type AuditSourceSystem = 'api' | 'web';
export type AuditUserType = 'internal' | 'reseller';

export type AuditEventName =
	| 'auth.login.attempt'
	| 'auth.login.success'
	| 'auth.login.failure'
	| 'auth.logout.success'
	| 'auth.session.me.success'
	| 'auth.session.me.failure'
	| 'dashboard.query.success'
	| 'dashboard.query.failure'
	| 'ingestion.csv.upload.success'
	| 'ingestion.csv.upload.failure'
	| 'pdf.list_link.create.success'
	| 'pdf.list_link.create.failure'
	| 'pdf.list_link.create.async.success'
	| 'pdf.async.cancel.success'
	| 'pdf.async.cancel.failure'
	| 'pdf.async.password.reveal.success'
	| 'pdf.async.password.reveal.failure'
	| 'pdf.render.reseller.success'
	| 'pdf.render.reseller.failure'
	| 'pdf.render.reseller.async.success'
	| 'pdf.render.reseller.async.failure'
	| 'pdf.render.customer.success'
	| 'pdf.render.customer.failure'
	| 'pdf.render.customer.async.success'
	| 'pdf.render.customer.async.failure'
	| 'pdf.render.opportunities.success'
	| 'pdf.render.opportunities.failure'
	| 'pdf.render.reseller_opportunities.success'
	| 'pdf.render.reseller_opportunities.failure'
	| 'gtm.bundle_link.create.success'
	| 'gtm.bundle_link.create.failure'
	| 'gtm.bundle.download.success'
	| 'gtm.bundle.download.failure'
	| 'email.proposal_options.link.create.success'
	| 'email.proposal_options.link.create.failure'
	| 'email.proposal_options.render.success'
	| 'email.proposal_options.render.failure'
	| 'email.opportunity_list.link.create.success'
	| 'email.opportunity_list.link.create.failure'
	| 'email.opportunity_list.render.success'
	| 'email.opportunity_list.render.failure'
	| 'email.customer_proposal.link.create.success'
	| 'email.customer_proposal.link.create.failure'
	| 'email.customer_proposal.render.success'
	| 'email.customer_proposal.render.failure'
	| 'email.partner_proposal.link.create.success'
	| 'email.partner_proposal.link.create.failure'
	| 'email.partner_proposal.render.success'
	| 'email.partner_proposal.render.failure'
	| 'proposal.ppt.upload.success'
	| 'proposal.ppt.upload.failure'
	| 'proposal.ppt.session.create.success'
	| 'proposal.ppt.session.create.failure'
	| 'proposal.ppt.render.success'
	| 'proposal.ppt.render.failure'
	| 'proposal.ppt.download.success'
	| 'proposal.ppt.download.failure'
	| 'proposal.assets.link.create.success'
	| 'proposal.assets.link.create.failure'
	| 'proposal.assets.download.success'
	| 'proposal.assets.download.failure'
	| 'proposal.assets.prepare.success'
	| 'proposal.assets.prepare.failure'
	| 'proposal.assets.load.success'
	| 'proposal.assets.load.failure'
	| 'proposal.assets.load_public.success'
	| 'proposal.assets.load_public.failure'
	| 'proposal.assets.line_item.generate.success'
	| 'proposal.assets.line_item.generate.failure'
	| 'proposal.assets.line_item.generate_public.success'
	| 'proposal.assets.line_item.generate_public.failure'
	| 'partner_customer.create.success'
	| 'partner_customer.create.failure'
	| 'partner_customer.list.success'
	| 'partner_customer.list.failure'
	| 'partner_customer.get.success'
	| 'partner_customer.get.failure'
	| 'email.demo.proposal_options.link.create.success'
	| 'email.demo.proposal_options.link.create.failure'
	| 'email.demo.opportunity_list.link.create.success'
	| 'email.demo.opportunity_list.link.create.failure'
	| 'pdf.demo.render.success'
	| 'pdf.demo.render.failure'
	| 'reseller_customer.list.success'
	| 'reseller_customer.list.failure'
	| 'reseller_customer.get.success'
	| 'reseller_customer.get.failure'
	| 'reseller_customer.create.success'
	| 'reseller_customer.create.failure'
	| 'reseller_customer.update.success'
	| 'reseller_customer.update.failure'
	| 'reseller_customer.delete.success'
	| 'reseller_customer.delete.failure'
	| 'subscription.list.success'
	| 'subscription.list.failure'
	| 'subscription.create.success'
	| 'subscription.create.failure'
	| 'subscription.update.success'
	| 'subscription.update.failure'
	| 'subscription.delete.success'
	| 'subscription.delete.failure'
	| 'reseller_customer.bulk_create.success'
	| 'reseller_customer.bulk_create.failure'
	| 'auth.otp.request.success'
	| 'auth.otp.request.failure'
	| 'auth.otp.verify.success'
	| 'auth.otp.verify.failure';

export interface CreateAuditEventInput {
	eventName: AuditEventName;
	actionStatus: AuditActionStatus;
	actorType: AuditActorType;
	actorId?: string | null;
	tenantId: string;
	orgId?: string | null;
	userType?: AuditUserType;
	sourceSystem: AuditSourceSystem;
	targetType?: string | null;
	targetId?: string | null;
	requestId?: string | null;
	route?: string | null;
	httpMethod?: string | null;
	httpStatus?: number | null;
	durationMs?: number | null;
	metadata?: Record<string, unknown>;
}

export interface AuditEventRecord {
	id: string;
	occurredAt: string;
	eventName: AuditEventName;
	actionStatus: AuditActionStatus;
	actorType: AuditActorType;
	actorId: string | null;
	actorEmail: string | null;
	actorDisplayName: string | null;
	tenantId: string;
	sourceSystem: AuditSourceSystem;
	targetType: string | null;
	targetId: string | null;
	requestId: string | null;
	route: string | null;
	httpMethod: string | null;
	httpStatus: number | null;
	durationMs: number | null;
	metadata: Record<string, unknown>;
}

export interface AuditEventQuery {
	page?: number;
	pageSize?: number;
	from?: string;
	to?: string;
	eventName?: string[];
	actionStatus?: AuditActionStatus;
	actorId?: string;
	targetType?: string;
	targetId?: string;
	requestId?: string;
	search?: string;
}

export interface AuditEventListResponse {
	page: number;
	pageSize: number;
	total: number;
	rows: AuditEventRecord[];
}
