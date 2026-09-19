import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { removeDatabaseFiles, stopTestServer } from './test_server';

const databasePath = path.resolve(process.cwd(), 'data/first-run-browser.db');
const evidencePath = path.resolve(process.cwd(), 'data/browser-acceptance/first-run-welcome.png');
let server: ChildProcess | undefined;
let port: number;
let baseUrl: string;

async function findAvailablePort(): Promise<number> {
  if (process.env.FIRST_RUN_BROWSER_PORT) return Number(process.env.FIRST_RUN_BROWSER_PORT);
  return await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close();
        reject(new Error('Unable to determine an available browser test port'));
        return;
      }
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main(): Promise<void> {
  port = await findAvailablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  await removeDatabaseFiles(databasePath);
  await fs.mkdir(path.dirname(evidencePath), { recursive: true });
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      NODE_ENV: 'production',
      AUTH_TOKEN_SECRET: 'first-run-browser-closure-secret-32-bytes',
      REQUIRE_PERSISTENT_STORAGE: 'true',
      STRICT_PERSISTENCE_ABORT: 'true',
      DEMO_MODE: 'false',
      ALLOW_DEMO_SEED_DATA: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  let serverReady = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      const health = await response.json() as { status?: string };
      if (response.ok && health.status === 'ok') {
        serverReady = true;
        break;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(serverReady, 'first-run browser server starts on the configured port');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.innerText.includes('Querying SQLite onboarding status'));
    const body = await page.locator('body').innerText();
    if (!body.includes('AM CONSULTANT')) console.log(`FIRST_RUN_BODY: ${body.slice(0, 1200)}`);
    assert(body.includes('AM CONSULTANT'), 'fresh production browser shows AM CONSULTANT branding');
    assert(body.includes('Financial & Management Platform') || body.includes('إعداد منشأتك'), 'fresh production browser shows the initialization/setup experience');
    assert(!/demo customer|fake revenue|pilot tenant/i.test(body), 'fresh production browser has no demo operational data');
    const state = await page.evaluate(() => ({
      dir: document.documentElement.dir || document.body.dir,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1
    }));
    assert(state.dir === 'ltr' && !state.overflow, 'fresh production welcome screen is LTR and has no horizontal overflow');
    await page.screenshot({ path: evidencePath, fullPage: true });
    console.log(`PASS: first-run browser evidence saved to ${evidencePath}`);
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => {
  await stopTestServer(server);
  await removeDatabaseFiles(databasePath);
});
