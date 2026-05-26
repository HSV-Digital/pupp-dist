import { SetMetadata } from '@nestjs/common';
import type { AuthenticatedUserType } from '../interfaces/auth-user.interface';

export const ALLOWED_USER_TYPES_KEY = 'allowedUserTypes';

export const AllowedUserTypes = (...types: AuthenticatedUserType[]) =>
	SetMetadata(ALLOWED_USER_TYPES_KEY, types);
