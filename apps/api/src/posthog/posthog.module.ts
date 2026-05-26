import { Module } from '@nestjs/common';
import { PostHogEndpointService } from './posthog-endpoint.service';
import { PostHogQueryService } from './posthog-query.service';
import { PostHogRequestInterceptor } from './posthog-request.interceptor';
import { PostHogService } from './posthog.service';

@Module({
	providers: [
		PostHogService,
		PostHogQueryService,
		PostHogEndpointService,
		PostHogRequestInterceptor,
	],
	exports: [
		PostHogService,
		PostHogQueryService,
		PostHogEndpointService,
		PostHogRequestInterceptor,
	],
})
export class PostHogModule {}
