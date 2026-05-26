import type { NextRequest } from 'next/server';
import { proxyBackendRequest } from '@/lib/backend-proxy';

type RouteContext = {
	params: Promise<{
		path?: string[];
	}>;
};

async function handleRequest(
	request: NextRequest,
	context: RouteContext,
): Promise<Response> {
	const { path = [] } = await context.params;
	return proxyBackendRequest({
		request,
		pathSegments: ['api', 'pdf', ...path],
		accessToken: null,
	});
}

export async function GET(request: NextRequest, context: RouteContext) {
	return handleRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
	return handleRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
	return handleRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
	return handleRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
	return handleRequest(request, context);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
	return handleRequest(request, context);
}
