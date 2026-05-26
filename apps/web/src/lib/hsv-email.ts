const HSV_EMAIL_SUFFIX = '@hsv.digital';

export function isHsvEmail(email: string | null | undefined): boolean {
	return Boolean(email && email.toLowerCase().endsWith(HSV_EMAIL_SUFFIX));
}
