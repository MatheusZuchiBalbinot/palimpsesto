import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// @testing-library/react's own auto-cleanup only registers itself against
// a *global* afterEach (globalThis.afterEach) — this project's vitest
// config doesn't set `test.globals: true`, so every test file imports its
// own afterEach/describe/it from 'vitest' explicitly, and that global
// never exists for RTL to find. Without this, a component rendered in one
// test stays mounted in the next one in the same file — found by an
// actual test failure ("Found multiple elements") the first time this
// project ever rendered two components across two tests in one file.
afterEach(() => {
	cleanup();
});
