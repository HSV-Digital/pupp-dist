import { env } from '@/env';
import { getServerEnv } from '@/env.server';

export function getClientApiBaseUrl(): string {
	return env.NEXT_PUBLIC_API_BASE_URL;
}

export function withClientApiBase(path: string): string {
	return `${getClientApiBaseUrl()}${path}`;
}

export function getServerApiBaseUrl(): string {
	return getServerEnv().API_BASE_URL;
}
