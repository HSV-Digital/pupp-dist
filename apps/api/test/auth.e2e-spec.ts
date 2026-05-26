import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AuthController (e2e)', () => {
	let app: INestApplication<App>;

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		await app.init();
	});

	afterEach(async () => {
		await app.close();
	});

	it('returns 404 for removed OTP request endpoint', async () => {
		await request(app.getHttpServer())
			.post('/api/auth/request-otp')
			.send({ email: 'user@microsoft.com' })
			.expect(404);
	});

	it('returns 404 for removed OTP login endpoint', async () => {
		await request(app.getHttpServer())
			.post('/api/auth/login')
			.send({ email: 'user@microsoft.com', code: '123456' })
			.expect(404);
	});

	it('rejects /api/auth/me without bearer token', async () => {
		await request(app.getHttpServer()).get('/api/auth/me').expect(401);
	});

	it('rejects /api/auth/entra/provision without bearer token', async () => {
		await request(app.getHttpServer())
			.post('/api/auth/entra/provision')
			.send({
				entraObjectId: 'oid',
				tenantId: 'tid',
				email: 'user@microsoft.com',
			})
			.expect(401);
	});

	it('POST /api/auth/logout returns success payload', async () => {
		const response = await request(app.getHttpServer())
			.post('/api/auth/logout')
			.expect(200);

		expect(response.body).toEqual({
			message: 'Logged out',
		});
	});
});
