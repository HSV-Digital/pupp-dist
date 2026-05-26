export function maskEmail(email: string): string {
	const atIndex = email.indexOf('@');
	if (atIndex <= 1) {
		return email;
	}

	return `${email.slice(0, 1)}***${email.slice(atIndex - 1)}`;
}
