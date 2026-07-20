/**
 * Serializes a payload as a server-sent-event `data:` frame. HTML
 * metacharacters are escaped as JSON unicode escapes so the stream stays
 * inert if it is ever interpreted as HTML; the parsed JSON is unchanged.
 */
export function serializeSseData(payload: unknown): string {
	const json = JSON.stringify(payload)
		.replaceAll('&', '\\u0026')
		.replaceAll('<', '\\u003c')
		.replaceAll('>', '\\u003e');

	return `data: ${json}\n\n`;
}
