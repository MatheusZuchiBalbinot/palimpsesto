const DEVICE_LABEL_FALLBACK_LENGTH = 40;
const BROWSER_NAME_PATTERN = /Firefox|Edg|Chrome|Safari/;

/** device_label is a raw User-Agent string (r.UserAgent() from
 * auth_handler.go on login/refresh) — this extracts just enough of it to
 * read as "which browser", not the whole string nobody wants to parse at a
 * glance. */
export function browserNameFromDeviceLabel(deviceLabel: string): string {
	return BROWSER_NAME_PATTERN.exec(deviceLabel)?.[0] ?? (deviceLabel.slice(0, DEVICE_LABEL_FALLBACK_LENGTH) || 'Browser');
}
