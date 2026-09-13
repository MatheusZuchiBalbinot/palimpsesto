import { describe, expect, it } from 'vitest';

import { cursorColorForId, hexString, rgbString } from '../../lib/presenceColor';

describe('hexString', () => {
	it('formats an {r,g,b} color as 6-digit lowercase hex', () => {
		expect(hexString({ r: 140, g: 106, b: 63 })).toBe('#8c6a3f');
	});

	it('pads single-digit channel values with a leading zero', () => {
		expect(hexString({ r: 0, g: 5, b: 255 })).toBe('#0005ff');
	});

	// y-codemirror.next derives a remote selection's translucent highlight
	// color by string-concatenating an alpha suffix onto whatever color
	// string it's given (`color + '33'`) — see codemirrorEditor.ts's comment.
	// That only produces a valid CSS color when the base is hex; an rgb(...)
	// string silently produced an invalid color and the highlight never
	// rendered (only the caret, which uses the color directly, ever showed).
	it('produces a valid 8-digit hex color when an alpha suffix is appended', () => {
		const withAlpha = `${hexString({ r: 140, g: 106, b: 63 })}33`;
		expect(withAlpha).toMatch(/^#[0-9a-f]{8}$/);
	});
});

describe('cursorColorForId + hexString', () => {
	it('is deterministic for the same id', () => {
		expect(hexString(cursorColorForId('user-1'))).toBe(hexString(cursorColorForId('user-1')));
	});
});

describe('rgbString', () => {
	it('formats an {r,g,b} color as a bare "r, g, b" triplet', () => {
		expect(rgbString({ r: 140, g: 106, b: 63 })).toBe('140, 106, 63');
	});
});
