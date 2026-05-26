import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { requestContextMiddleware } from './common/request-context/request-context';
import { getEnv } from './config/env';
import { runDatabaseMigrations } from './database/migrate';
import { PostHogRequestInterceptor } from './posthog/posthog-request.interceptor';

async function bootstrap() {
	const env = getEnv();
	await runDatabaseMigrations();
	const app = await NestFactory.create(AppModule);
	const expressApp = app.getHttpAdapter().getInstance();

	expressApp.set('trust proxy', env.trustProxyHops);
	app.use(json({ limit: '10mb' }));
	app.use(
		helmet({
			hsts: {
				maxAge: 63072000,
				includeSubDomains: true,
				preload: false,
			},
			contentSecurityPolicy: {
				directives: {
					defaultSrc: ["'none'"],
					frameAncestors: ["'none'"],
				},
			},
			crossOriginResourcePolicy: { policy: 'cross-origin' },
		}),
	);
	app.enableShutdownHooks();
	app.use(requestContextMiddleware);
	app.use(cookieParser());
	app.useGlobalInterceptors(app.get(PostHogRequestInterceptor));
	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			forbidNonWhitelisted: true,
			transform: true,
		}),
	);
	app.enableCors({
		origin: env.frontendUrl,
		credentials: true,
	});

	await app.listen(env.port);
}
void bootstrap();
