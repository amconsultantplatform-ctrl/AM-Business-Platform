import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { PilotDatabaseService } from '../server/pilotDatabase';
import { OnboardingMaterializer } from '../src/verticals/onboardingReadinessEvaluator';

const databasePath = path.resolve(process.cwd(), 'data/deep-link-reload.db');
const tenantId = 'ten-deep-link';
const companyId = 'comp-deep-link';
const email = 'deep-link-admin@example.com';
const password = 'DeepLink!2026-Secure';
let server: ChildProcess | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function availablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') return reject(new Error('Unable to allocate browser port'));
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function main(): Promise<void> {
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) await fs.rm(file, { force: true });
  const db = PilotDatabaseService.createIsolated(databasePath);
  const setup = OnboardingMaterializer.materializeAll({
    tenantId,
    companyId,
    tenantName: 'Deep Link Tenant',
    legalName: 'Deep Link Tenant LLC',
    taxNumber: '310123456700003',
    commercialRegister: '1010998877',
    tradeNameAr: 'شركة الرابط',
    tradeNameEn: 'Deep Link Tenant',
    country: 'SA',
    baseCurrency: 'SAR',
    fiscalYearStart: '2026-01-01',
    fiscalYearEnd: '2026-12-31',
    branchName: 'Main Branch',
    warehouseName: 'Main Warehouse',
    industryProfile: 'COMMERCIAL_DISTRIBUTION',
    adminEmail: email,
    adminFullName: 'Deep Link Administrator',
    adminPassword: password,
    adminPin: '4826'
  }, db);
  assert(setup.success && setup.report.isReady, 'fresh environment completes onboarding before browser navigation');
  db.close();

  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), DATABASE_PATH: databasePath, NODE_ENV: 'production', DEMO_MODE: 'false', ALLOW_DEMO_SEED_DATA: 'false', REQUIRE_PERSISTENT_STORAGE: 'true', STRICT_PERSISTENCE_ABORT: 'true', AUTH_TOKEN_SECRET: 'deep-link-reload-secret-32-bytes-minimum' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  server.stderr?.on('data', chunk => process.stderr.write(`[deep-link-server] ${chunk}`));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) break;
    } catch {}
    if (attempt === 79) throw new Error('Deep-link server did not start');
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const login = await loginResponse.json() as { token?: string };
  assert(loginResponse.ok && login.token, 'completed-onboarding user authenticates through the runtime API');

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(token => localStorage.setItem('am_erp_auth_token', String(token)), login.token);
    const page = await context.newPage();
    const deepLink = `${baseUrl}/?module=accounting`;
    await page.goto(deepLink, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.innerText.includes('Loading platform'));
    assert(new URL(page.url()).searchParams.get('module') === 'accounting', 'direct accounting module URL is retained');
    assert(!/onboarding wizard|إعداد منشأتك/i.test(await page.locator('body').innerText()), 'completed onboarding does not redirect the deep link to onboarding');
    const initialBody = await page.locator('body').innerText();
    if (!/Finance|Accounting|المالية|المحاسبة/i.test(initialBody)) console.log(`DEEP_LINK_BODY: ${initialBody.slice(0, 1800)}`);
    assert(/Finance|Accounting|المالية|المحاسبة/i.test(initialBody), 'requested accounting module renders directly');
    const authBefore = await page.evaluate(async token => (await fetch('/api/v1/auth/me', { headers: { authorization: `Bearer ${token}` } })).ok, login.token);
    assert(authBefore, 'authenticated session is valid before hard refresh');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.body.innerText.includes('Loading platform'));
    assert(new URL(page.url()).searchParams.get('module') === 'accounting', 'hard refresh preserves the direct module URL');
    assert(!/onboarding wizard|إعداد منشأتك/i.test(await page.locator('body').innerText()), 'hard refresh does not fall back to onboarding');
    const reloadedBody = await page.locator('body').innerText();
    if (!/Finance|Accounting|المالية|المحاسبة/i.test(reloadedBody)) console.log(`DEEP_LINK_RELOADED_BODY: ${reloadedBody.slice(0, 1800)}`);
    assert(/Finance|Accounting|المالية|المحاسبة/i.test(reloadedBody), 'requested module survives hard refresh');
    assert(await page.evaluate(async token => (await fetch('/api/v1/auth/me', { headers: { authorization: `Bearer ${token}` } })).ok, login.token), 'authenticated session survives hard refresh');
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(() => {
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  }
});
