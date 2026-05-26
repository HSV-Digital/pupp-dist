import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
	getHello(): string {
		return 'Hello World!';
	}

	getHealth() {
		return {
			service: 'api',
			status: 'ok',
			timestamp: new Date().toISOString(),
		};
	}
}
