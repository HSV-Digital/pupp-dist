export function encodeResellerCustomerRouteKey(customerName: string): string {
	return encodeURIComponent(encodeURIComponent(customerName));
}

export function decodeResellerCustomerRouteKey(routeKey: string): string {
	try {
		return decodeURIComponent(decodeURIComponent(routeKey));
	} catch {
		try {
			return decodeURIComponent(routeKey);
		} catch {
			return routeKey;
		}
	}
}
