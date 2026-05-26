export type Plan =
	| 'good'
	| 'better'
	| 'best'
	| 'sec-defender'
	| 'sec-purview'
	| 'sec-full';

export type PptRenderMode = 'single' | 'consolidated';

export interface PptRenderItem {
	plan: Plan;
	seats: number;
}

export interface PptSessionRequest {
	mode: PptRenderMode;
	fileName: string;
	items: PptRenderItem[];
}

export interface PptSessionResponse {
	token: string;
	renderUrl: string;
	downloadUrl: string;
}

export interface SignedPptTokenPayload {
	version: 1;
	mode: PptRenderMode;
	fileName: string;
	items: PptRenderItem[];
	issuedAt: number;
	expiresAt: number;
}
