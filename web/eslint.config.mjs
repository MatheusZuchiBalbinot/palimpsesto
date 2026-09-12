// Deep, type-aware quality checks — complements oxlint (see .oxlintrc.json),
// it doesn't replace it. oxlint is the fast pass (filename case, import
// hygiene, react-hooks/rules-of-hooks) that runs constantly; this config
// covers what a Rust-based linter without full type info can't check:
// cognitive complexity, boolean naming, magic numbers, type-aware bug
// patterns (sonarjs). Run with `npm run lint:eslint`.
//
// Deliberately NOT enabled here (already owned elsewhere, would just
// fight the other tool):
//   - import/order            → .oxlintrc.json hands this to
//                                @ianvs/prettier-plugin-sort-imports on
//                                purpose (see the comment there).
//   - unicorn/filename-case    → oxlint already enforces this with the
//                                camelCase/PascalCase split by file type.
//   - react/rules-of-hooks,
//     react/only-export-components → already enforced by oxlint's react
//                                plugin under those same rule names.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },

	// Type-aware rules need a real tsconfig — src/ is the only tree one
	// covers (tsconfig.app.json's "include"). scripts/ (Playwright checks,
	// run via --experimental-strip-types, no tsc project) gets the
	// non-type-checked rules further down instead.
	{
		files: ['src/**/*.{ts,tsx}'],
		extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked, sonarjs.configs.recommended],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			'react-hooks': reactHooks,
			unicorn,
		},
		rules: {
			// Early return over nested branching — engineering-standards.md's
			// headline rule. These four together are what actually enforce it:
			// no dangling else after a return/throw, no if-inside-if instead of
			// combining or early-returning, always braced, and a hard cap on
			// how deep branching is allowed to nest in the first place.
			'no-else-return': ['error', { allowElseIf: false }],
			'no-lonely-if': 'error',
			curly: ['error', 'all'],
			'max-depth': ['warn', 2],
			'sonarjs/no-nested-conditional': 'error',

			// DTOs at boundaries, not loose positional parameters — a function
			// taking 4+ raw values invites transposing two same-typed args
			// (e.g. two strings) with no compiler error. Start as a warning:
			// the codebase predates this rule, tighten to "error" once existing
			// call sites are migrated to parameter objects.
			'max-params': ['warn', { max: 3 }],
			complexity: ['warn', 8],
			'sonarjs/cognitive-complexity': ['warn', 12],
			'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],

			// A condition assembled inline across several `&&`/`||` at a call
			// site is exactly the "extract to a named variable" case —
			// canReconstructText reads as intent, the raw boolean expression
			// doesn't.
			'no-nested-ternary': 'error',
			'no-unneeded-ternary': 'error',
			'unicorn/no-negated-condition': 'error',

			// is/has/should/can/did/will — the project's boolean naming
			// convention (engineering-standards.md). Needs type info (projectService
			// above) since it only fires for variables actually typed boolean,
			// not just anything named `flag`.
			'@typescript-eslint/naming-convention': [
				'error',
				{
					selector: 'variable',
					types: ['boolean'],
					format: ['PascalCase'],
					prefix: ['is', 'has', 'should', 'can', 'did', 'will'],
				},
			],

			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
			// useEffect's cleanup/cancellation-flag pattern needs a plain
			// function; forbidding floating promises would fight it. Everywhere
			// else, an un-awaited promise is exactly the "effect fired, nobody
			// checked the result" bug this project already found once in real
			// code (the snapshot trigger).
			'@typescript-eslint/no-floating-promises': 'error',

			'sonarjs/no-identical-functions': 'error',
			'sonarjs/no-duplicate-string': ['warn', { threshold: 4 }],

			'react-hooks/exhaustive-deps': 'error',

			// No bare numeric literals standing in for a named constant —
			// SNAPSHOT_THRESHOLD, CLOSE_ANIMATION_MS and friends exist in this
			// codebase for exactly this reason.
			'no-magic-numbers': [
				'warn',
				{
					ignore: [-1, 0, 1, 2, '0n'],
					ignoreArrayIndexes: true,
					enforceConst: true,
					detectObjects: false,
				},
			],
		},
	},

	// Test files: a describe/it callback's length reflects how many
	// scenarios or how much setup a test covers, not logic complexity —
	// splitting a long `describe` block to satisfy a line-count budget
	// makes tests harder to read (context scattered across helper
	// functions), not easier. Every other rule above still applies to
	// tests (nested-functions, complexity, naming, magic numbers, ...) —
	// this is the one purely-structural exception.
	{
		files: ['src/**/*.test.{ts,tsx}'],
		rules: {
			'max-lines-per-function': 'off',
		},
	},

	// scripts/ — same style rules, no type-aware ones (no tsconfig covers
	// this tree).
	{
		files: ['scripts/**/*.ts'],
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		rules: {
			'no-else-return': ['error', { allowElseIf: false }],
			'no-lonely-if': 'error',
			curly: ['error', 'all'],
			'no-nested-ternary': 'error',
		},
	},
);
