/** Triggers a browser download of `blob` named `filename` — the shared
 * mechanics behind downloadTextFile and any other client-side export
 * (no server round trip; the client already has the plaintext in memory,
 * that's the whole point of E2EE). */
export function downloadBlob(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

/** Triggers a browser download of `content` as a plain text file named
 * `filename`. */
export function downloadTextFile(filename: string, content: string): void {
	downloadBlob(filename, new Blob([content], { type: 'text/plain;charset=utf-8' }));
}
