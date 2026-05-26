import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { getEnv } from '../../config/env';

@Injectable()
export class DemoModeGuard implements CanActivate {
	canActivate(): boolean {
		if (getEnv().demoModeEnabled) {
			return true;
		}

		throw new NotFoundException();
	}
}
