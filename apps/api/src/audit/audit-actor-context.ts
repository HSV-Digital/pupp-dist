import type {
	AuthenticatedPrincipal,
	AuthUser,
} from '../auth/interfaces/auth-user.interface';
import type { CreateAuditEventInput } from './audit.types';

type AuditableUser = AuthenticatedPrincipal | AuthUser;

export interface AuditActorContext {
	actorType: CreateAuditEventInput['actorType'];
	actorId: string | null;
	tenantId: string;
	orgId?: string | null;
	userType?: CreateAuditEventInput['userType'];
}

export function resolveAuthenticatedAuditActorContext(
	user: AuditableUser,
): AuditActorContext {
	return {
		actorType: 'user',
		actorId: user.userId,
		tenantId: user.tenantId,
		orgId: user.orgId ?? null,
		userType: user.userType ?? 'internal',
	};
}

export function resolveAuditActorContext(
	user: AuditableUser | undefined,
	fallbackTenantId: string,
): AuditActorContext {
	if (!user) {
		return {
			actorType: 'anonymous',
			actorId: null,
			tenantId: fallbackTenantId,
		};
	}

	return resolveAuthenticatedAuditActorContext(user);
}
