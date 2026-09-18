import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

const port = Number(process.env.FIRST_RUN_BROWSER_PORT || (3361 + (process.pid % 1000)));
const baseUrl = `http://127.0.0.1:${port}`;
const databasePath = path.resolve(process.cwd(), 'data/first-run-browser.db');
const evidencePath = path.resolve(process.cwd(), 'data/browser-acceptance/first-run-welcome.png');
let server: ChildProcess | undefined;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function main(): Promise<void> {
  await fs.rm(databasePath, { force: true });
  await fs.rm(`${databasePath}-wal`, { force: true });
  await fs.rm(`${databasePath}-shm`, { force: true });
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
      if ((await fetch(`${baseUrl}/api/health`)).ok) {
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
}).finally(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
});
