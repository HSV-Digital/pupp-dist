import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { getEnv } from '../config/env';

interface MemoryCacheEntry {
	expiresAt: number;
	value: string;
}

@Injectable()
export class AdminAnalyticsCacheService implements OnModuleDestroy {
	private readonly logger = new Logger(AdminAnalyticsCacheService.name);
	private readonly memoryCache = new Map<string, MemoryCacheEntry>();
	private readonly env = getEnv();
	private readonly redis = new Redis({
		...this.env.redisConnection,
		lazyConnect: true,
		enableReadyCheck: false,
		maxRetriesPerRequest: 1,
	});
	private redisUnavailable = false;

	async getJson<T>(key: string): Promise<T | null> {
		const memoryValue = this.getMemoryValue(key);
		if (memoryValue) {
			return JSON.parse(memoryValue) as T;
		}

		const client = await this.getRedisClient();
		if (!client) {
			return null;
		}

		try {
			const value = await client.get(key);
			if (!value) {
				return null;
			}

			return JSON.parse(value) as T;
		} catch (error) {
			this.disableRedis(
				`Failed to read admin analytics cache: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
			return null;
		}
	}

	async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
		const serialized = JSON.stringify(value);
		this.memoryCache.set(key, {
			value: serialized,
			expiresAt: Date.now() + ttlSeconds * 1000,
		});

		const client = await this.getRedisClient();
		if (!client) {
			return;
		}

		try {
			await client.set(key, serialized, 'EX', ttlSeconds);
		} catch (error) {
			this.disableRedis(
				`Failed to write admin analytics cache: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	async deleteKeys(keys: string[]): Promise<void> {
		if (keys.length === 0) {
			return;
		}

		for (const key of keys) {
			this.memoryCache.delete(key);
		}

		const client = await this.getRedisClient();
		if (!client) {
			return;
		}

		try {
			await client.del(...keys);
		} catch (error) {
			this.disableRedis(
				`Failed to clear admin analytics cache: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	async onModuleDestroy(): Promise<void> {
		this.memoryCache.clear();
		try {
			await this.redis.quit();
		} catch {
			this.redis.disconnect();
		}
	}

	private getMemoryValue(key: string): string | null {
		const cached = this.memoryCache.get(key);
		if (!cached) {
			return null;
		}

		if (cached.expiresAt <= Date.now()) {
			this.memoryCache.delete(key);
			return null;
		}

		return cached.value;
	}

	private async getRedisClient(): Promise<Redis | null> {
		if (this.redisUnavailable) {
			return null;
		}

		try {
			if (this.redis.status === 'wait') {
				await this.redis.connect();
			}

			return this.redis;
		} catch (error) {
			this.disableRedis(
				`Admin analytics cache is falling back to memory: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
			return null;
		}
	}

	private disableRedis(message: string): void {
		if (this.redisUnavailable) {
			return;
		}

		this.redisUnavailable = true;
		this.logger.warn(message);
		this.redis.disconnect();
	}
}
