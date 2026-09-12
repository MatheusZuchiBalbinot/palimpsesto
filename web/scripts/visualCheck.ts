import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://web:5173';
const SCREENSHOT_DIR = path.join(import.meta.dirname, 'screenshots');

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(`ASSERTION FAILED: ${message}`);
	}
}

function log(message: string): void {
	console.log(`  ${message}`);
}

async function main() {
	fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
	let shotIndex = 0;
	async function shot(page: import('playwright').Page, name: string) {
		shotIndex += 1;
		// App.css's page-fade-in animation runs var(--duration-slow), 200ms —
		// a screenshot taken right after a navigation resolves can land mid
		// fade, looking washed-out for no real reason (found exactly this
		// way on the first run of this script: the vault page's very first
		// screenshot came out faded, which briefly looked like a genuine
		// contrast bug before checking the CSS).
		await page.waitForTimeout(300);
		const file = path.join(SCREENSHOT_DIR, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
		await page.screenshot({ path: file, fullPage: true });
		log(`screenshot: ${file}`);
	}

	const browser = await chromium.launch();

	console.log('1. Alice registers through the real UI');
	// Taller than default (1280x720): SettingsPage.tsx is a fixed-height,
	// internally-scrolling layout (.settings-page/.settings-body), and
	// Playwright's fullPage screenshot only ever captures the outer
	// document's natural scroll height — it can't "unroll" a nested
	// overflow:auto container the way it does the page itself. A short
	// viewport made an early screenshot here look like clipped/cut-off
	// cards; it was really just everything below the fold in that inner
	// scroll area, correctly there but not visible without scrolling (or,
	// for a screenshot, a tall enough viewport that nothing needs to).
	const aliceCtx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
	const alice = await aliceCtx.newPage();
	await alice.goto(`${BASE_URL}/register`);

	const aliceEmail = `alice-visual-${Date.now()}@example.com`;
	await alice.getByLabel('Nome').fill('Alice Visual');
	await alice.getByLabel('E-mail').fill(aliceEmail);
	await alice.getByLabel('Senha').fill('correct horse battery staple');
	await alice.getByRole('button', { name: 'Continuar' }).click();

	await alice.getByText('Entendi — se eu esquecer a senha').click();
	const aliceLoginResponse = alice.waitForResponse((r) => r.url().includes('/api/auth/login'));
	await alice.getByRole('button', { name: 'Abrir meus documentos' }).click();
	const aliceLoginBody = (await (await aliceLoginResponse).json()) as {
		user: { user_id: string };
	};
	const aliceUserId = aliceLoginBody.user.user_id;
	await alice.waitForURL('**/docs');
	log(`alice registered, user_id=${aliceUserId}`);
	await shot(alice, 'vault-empty');

	console.log('2. Alice creates a document');
	await alice.getByRole('button', { name: 'Novo documento' }).click();
	await alice.getByLabel('Título').fill('Documento de verificação visual');
	await alice.getByRole('button', { name: 'Criar', exact: true }).click();
	await alice.waitForURL(/\/docs\/[^/]+$/);
	const docId = new URL(alice.url()).pathname.split('/').pop();
	assert(docId, 'expected a document id in the URL after creating one');
	log(`document created, id=${docId}`);
	await alice.waitForSelector('textarea');
	await shot(alice, 'document-page');

	console.log('3. Bob registers through the real UI (separate browser context)');
	const bobCtx = await browser.newContext();
	const bob = await bobCtx.newPage();
	await bob.goto(`${BASE_URL}/register`);
	const bobEmail = `bob-visual-${Date.now()}@example.com`;
	await bob.getByLabel('Nome').fill('Bob Visual');
	await bob.getByLabel('E-mail').fill(bobEmail);
	await bob.getByLabel('Senha').fill('correct horse battery staple');
	await bob.getByRole('button', { name: 'Continuar' }).click();
	await bob.getByText('Entendi — se eu esquecer a senha').click();
	const bobLoginResponse = bob.waitForResponse((r) => r.url().includes('/api/auth/login'));
	await bob.getByRole('button', { name: 'Abrir meus documentos' }).click();
	const bobLoginBody = (await (await bobLoginResponse).json()) as {
		user: { user_id: string };
	};
	const bobUserId = bobLoginBody.user.user_id;
	await bob.waitForURL('**/docs');
	log(`bob registered, user_id=${bobUserId}`);
	await bobCtx.close();

	console.log("4. Alice's browser is primed with a bogus trusted key for bob (simulates a stale/attacker key already on file)");
	await alice.evaluate((uid) => {
		localStorage.setItem(
			`palimpsesto:knownKey:${uid}`,
			JSON.stringify({
				identityPub: 'bm90LXRoZS1yZWFsLWtleQ==',
				signingPub: 'bm90LXRoZS1yZWFsLWtleQ==',
			}),
		);
	}, bobUserId);

	console.log('5. Alice opens Share and invites bob — the real key mismatch must trip KeyChangeWarning');
	await alice.getByRole('button', { name: 'Compartilhar', exact: true }).click();
	await alice.waitForSelector('.share-invite-row');
	await shot(alice, 'share-modal-empty');

	await alice.getByPlaceholder('Convidar por e-mail').fill(bobEmail);
	await alice.getByRole('button', { name: 'Convidar' }).click();
	await alice.waitForSelector('text=A chave de identidade mudou');
	await shot(alice, 'key-change-warning');

	await alice.getByRole('button', { name: 'Confere, confiar nesta chave' }).click();
	await alice.waitForSelector('.share-member__email >> text=' + bobEmail);
	await shot(alice, 'share-modal-with-member');
	log('bob successfully invited after confirming the key change');

	console.log('6. Alice removes bob — confirmation dialog, then the rotation completes');
	await alice.getByRole('button', { name: 'Remover' }).click();
	await alice.waitForSelector('text=Remover deste documento');
	await shot(alice, 'remove-member-confirm');

	await alice.getByRole('button', { name: 'Remover', exact: true }).last().click();
	await alice.waitForSelector('.share-member__email >> text=' + bobEmail, {
		state: 'detached',
	});
	await shot(alice, 'share-modal-after-remove');
	log('bob removed, key rotated');

	await alice.getByRole('button', { name: 'Concluído' }).click();

	console.log('7. Settings page: the real device list');
	await alice.goto(`${BASE_URL}/settings`);
	await alice.waitForSelector('text=Dispositivos');
	await alice.waitForTimeout(500); // let the devices fetch resolve and render
	await shot(alice, 'settings-devices');

	console.log('8. Back to the document: 220 real keystrokes, to actually exercise the auto-snapshot trigger');
	await alice.goto(`${BASE_URL}/docs/${docId}`);
	const textarea = alice.locator('textarea');
	await textarea.waitFor();
	await textarea.click();
	const content = 'A '.repeat(110).trim(); // 220 characters, one keystroke at a time
	await textarea.pressSequentially(content, { delay: 5 });
	log(`typed ${content.length} characters as ${content.length} individual keystrokes`);
	await shot(alice, 'document-after-typing');

	// DocumentPage.tsx's snapshot check is recurring (every
	// SNAPSHOT_CHECK_INTERVAL_MS = 30s), not just the first one at connect
	// time — typing 220 real keystrokes takes long enough that the first
	// check (2s after connecting, before most of the typing even happened)
	// won't see the threshold crossed yet. Wait past one full interval so
	// a *later* check gets the chance the first one didn't.
	console.log('9. Waiting past one snapshot-check interval for the recurring trigger to actually fire');
	await alice.waitForTimeout(33_000);
	log('done waiting');

	await browser.close();

	console.log(`\nVISUAL CHECK COMPLETE — doc_id=${docId}`);
	console.log('Check for an auto-created snapshot with:');
	console.log(`  docker compose exec db psql -U palimpsesto -d palimpsesto -c "SELECT * FROM doc_snapshots WHERE doc_id='${docId}';"`);
}

main()
	.catch((err) => {
		console.error('\nVISUAL CHECK FAILED');
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => {
		// A launched browser process left open (e.g. main() throwing before
		// its own browser.close()) keeps the event loop alive indefinitely —
		// this ran for 26 minutes as a hung container before being killed by
		// hand the first time this script failed early. Never again.
		process.exit(process.exitCode ?? 0);
	});
