// Logs in as a real, existing account (not a freshly registered one — the
// user reported UI problems specifically on their own account after the
// recent wave of changes) and screenshots every page it can reach, so
// they can be reviewed for visual regressions the same way visualCheck.ts
// already found three real bugs. No interaction beyond navigation —
// visualCheck.ts already covers the interactive flows (invite, remove,
// key-change warning, typing).
//
// Run with (from web/):
//   docker run --rm --network palimpsesto_default \
//     -v "$PWD":/work -w /work \
//     mcr.microsoft.com/playwright:v1.55.0-jammy \
//     node --experimental-strip-types scripts/realUserCheck.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = 'http://web:5173';
const SCREENSHOT_DIR = path.join(import.meta.dirname, 'screenshots-real-user');
const EMAIL = process.env.PALIMPSESTO_TEST_EMAIL ?? 'teste@gmail.com';
const PASSWORD = process.env.PALIMPSESTO_TEST_PASSWORD ?? 'teste1234567';

function log(message: string): void {
	console.log(`  ${message}`);
}

async function main() {
	fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
	let shotIndex = 0;
	async function shot(page: import('playwright').Page, name: string) {
		shotIndex += 1;
		await page.waitForTimeout(400); // past App.css's page-fade-in (200ms)
		const file = path.join(SCREENSHOT_DIR, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
		await page.screenshot({ path: file, fullPage: true });
		log(`screenshot: ${file}`);
	}

	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
	const page = await ctx.newPage();

	const consoleErrors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') {
			consoleErrors.push(msg.text());
		}
	});
	page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
	page.on('response', (res) => {
		if (res.status() >= 400) {
			consoleErrors.push(`HTTP ${res.status()}: ${res.url()}`);
		}
	});

	console.log(`1. Logging in as ${EMAIL}`);
	await page.goto(`${BASE_URL}/login`);
	await page.getByLabel('E-mail').fill(EMAIL);
	await page.getByLabel('Senha').fill(PASSWORD);
	await page.getByRole('button', { name: 'Entrar' }).click();
	try {
		await page.waitForURL('**/docs', { timeout: 15000 });
	} catch (err) {
		await shot(page, 'login-failed');
		const errorText = await page
			.locator('.form-error')
			.textContent()
			.catch(() => null);
		log(`login did not navigate to /docs — visible form error: ${errorText ?? '(none)'}`);
		throw err;
	}
	log('logged in, on vault page');
	await shot(page, 'vault');

	console.log('2. Creating a fresh document (existing ones predate the DEK-wrapping flow)');
	await page.getByRole('button', { name: 'Novo documento' }).click();
	await page.getByLabel('Título').fill('Verificação real do usuário');
	await page.getByRole('button', { name: 'Criar', exact: true }).click();
	await page.waitForURL(/\/docs\/[^/]+$/);
	const docId = new URL(page.url()).pathname.split('/').pop();
	await page.waitForSelector('textarea');
	log(`fresh document created, id=${docId}`);
	await shot(page, 'fresh-document');

	console.log('3. Typing a little, to see the live editing chrome');
	await page.locator('textarea').click();
	await page.locator('textarea').pressSequentially('Este é um teste real de verificação da UI.', { delay: 15 });
	await shot(page, 'fresh-document-typed');

	console.log('4. Back to the vault, with the fresh document (and the old pending ones) listed');
	await page.goto(`${BASE_URL}/docs`);
	await page.waitForSelector('text=Documentos');
	await shot(page, 'vault-with-documents');

	console.log('5. Share modal on the fresh document');
	await page.goto(`${BASE_URL}/docs/${docId}`);
	await page.waitForSelector('textarea');
	await page.getByRole('button', { name: 'Compartilhar', exact: true }).click();
	await page.waitForSelector('.share-invite-row');
	await shot(page, 'share-modal');
	await page.keyboard.press('Escape');

	console.log('6. History page on the fresh document');
	await page.getByRole('button', { name: 'Histórico' }).click();
	await page.waitForURL(/\/history$/);
	await shot(page, 'history');

	console.log('7. Settings page');
	await page.goto(`${BASE_URL}/settings`);
	await page.waitForSelector('text=Dispositivos');
	await page.waitForTimeout(500);
	await shot(page, 'settings');

	await browser.close();

	console.log(`\nREAL USER CHECK COMPLETE — fresh doc_id=${docId}`);
	if (consoleErrors.length > 0) {
		console.log(`\n${consoleErrors.length} browser console error(s)/pageerror(s) seen during the run:`);
		for (const e of consoleErrors) {
			console.log(`  - ${e}`);
		}
	} else {
		console.log('\nNo browser console errors seen during the run.');
	}
}

main()
	.catch((err) => {
		console.error('\nREAL USER CHECK FAILED');
		console.error(err);
		process.exitCode = 1;
	})
	.finally(() => {
		process.exit(process.exitCode ?? 0);
	});
