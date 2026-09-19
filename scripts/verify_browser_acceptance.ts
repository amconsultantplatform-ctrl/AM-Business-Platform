import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { findAvailablePort, removeDatabaseFiles, stopTestServer } from './test_server';

const databasePath = path.resolve(process.cwd(), 'data/browser-acceptance.db');
const evidenceDir = path.resolve(process.cwd(), 'data/browser-acceptance');
const adminEmail = 'a.mounir369@gmail.com';
const adminPassword = 'Admin@2026!';
let port: number;
let baseUrl: string;

const viewports = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'desktop-1280x800', width: 1280, height: 800 },
  { name: 'tablet-1024x768', width: 1024, height: 768 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-375x812', width: 375, height: 812 }
] as const;

const navigation = [
  { en: 'Dashboard', ar: 'لوحة التحكم' },
  { en: 'Sales', ar: 'المبيعات' },
  { en: 'Purchasing', ar: 'المشتريات' },
  { en: 'Inventory', ar: 'المخزون' },
  { en: 'Accounting', ar: 'المحاسبة' },
  { en: 'Reports', ar: 'التقارير' },
  { en: 'POS', ar: 'نقطة البيع' },
  { en: 'Settings', ar: 'الإعدادات' }
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Browser acceptance server did not start');
}

async function login(): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword })
  });
  const body = await response.json() as { token?: string };
  assert(response.ok && body.token, `Browser acceptance login failed: ${JSON.stringify(body)}`);
  return body.token;
}

async function waitForShell(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return !text.includes('Querying SQLite onboarding status') &&
      !text.includes('التحقق من سجلات المنشأة');
  }, undefined, { timeout: 20_000 });
  await page.waitForTimeout(500);
}

async function assertLayout(page: Page, expectedDir: 'ltr' | 'rtl', label: string): Promise<void> {
  const state = await page.evaluate(() => ({
    dir: document.documentElement.dir || document.body.dir || document.querySelector('div[dir]')?.getAttribute('dir') || getComputedStyle(document.querySelector('main') || document.body).direction,
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1,
    visibleErrors: [...document.querySelectorAll('[role="alert"]')].filter(el => (el as HTMLElement).offsetParent !== null).map(el => el.textContent?.trim()).filter(Boolean)
    , offenders: [...document.querySelectorAll('body *')].map(el => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return { tag: el.tagName, cls: (el as HTMLElement).className?.toString().slice(0, 80), right: Math.round(rect.right), width: Math.round(rect.width) };
    }).filter(item => item.right > window.innerWidth + 2).sort((a, b) => b.right - a.right).slice(0, 5)
  }));
  assert(state.dir === expectedDir, `${label}: expected ${expectedDir}, received ${state.dir}`);
  assert(!state.horizontalOverflow, `${label}: horizontal overflow ${state.documentWidth}/${state.viewportWidth}, body ${state.bodyWidth}; offenders=${JSON.stringify(state.offenders)}`);
  assert(state.visibleErrors.length === 0, `${label}: visible UI errors: ${state.visibleErrors.join(' | ')}`);
}

async function clickNavigation(page: Page, label: string): Promise<boolean> {
  const candidate = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
  if (await candidate.count() === 0 || !(await candidate.isVisible().catch(() => false))) return false;
  await candidate.click();
  await page.waitForTimeout(350);
  return true;
}

async function verifyLanguage(page: Page, token: string, lang: 'en' | 'ar', viewportName: string): Promise<void> {
  await page.addInitScript((authToken: string) => localStorage.setItem('am_erp_auth_token', authToken), token);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForShell(page);

  const currentDir = await page.evaluate(() => document.documentElement.dir || document.body.dir || document.querySelector('div[dir]')?.getAttribute('dir') || getComputedStyle(document.querySelector('main') || document.body).direction);
  if ((lang === 'ar' && currentDir !== 'rtl') || (lang === 'en' && currentDir !== 'ltr')) {
    const toggle = lang === 'ar'
      ? page.locator('button[title="Switch to Arabic"]').first()
      : page.locator('button[title="تغيير اللغة إلى الإنجليزية"]').first();
    assert(await toggle.count() > 0, `${viewportName}/${lang}: language toggle missing; body=${(await page.locator('body').innerText()).slice(0, 500)}`);
    await toggle.click({ force: true });
    await page.waitForTimeout(500);
    const switchedDir = await page.evaluate(() => document.documentElement.dir || document.body.dir || document.querySelector('div[dir]')?.getAttribute('dir') || getComputedStyle(document.querySelector('main') || document.body).direction);
    const controls = await page.getByRole('button').allTextContents();
    const dirs = await page.locator('[dir]').evaluateAll(elements => elements.map(element => element.getAttribute('dir')));
    const languageButton = await page.getByRole('button', { name: /العربية|English|AR|EN/ }).first().evaluate(element => element.outerHTML);
    assert(switchedDir === (lang === 'ar' ? 'rtl' : 'ltr'), `${viewportName}/${lang}: language toggle did not switch direction (received ${switchedDir}); dirs=${dirs.join(',')}; button=${languageButton}`);
  }

  await assertLayout(page, lang === 'ar' ? 'rtl' : 'ltr', `${viewportName}/${lang}/shell`);
  await page.screenshot({ path: path.join(evidenceDir, `${viewportName}-${lang}-dashboard.png`), fullPage: true });

  const isMobile = viewportName.startsWith('mobile-');
  if (isMobile) {
    const menu = page.getByTitle('Toggle Menu').first();
    assert(await menu.count() > 0, `${viewportName}/${lang}: mobile navigation toggle missing`);
    await menu.click();
    await page.waitForTimeout(200);
  }
  const labels = isMobile
    ? (lang === 'ar'
      ? ['نظرة عامة على الأعمال', 'المحاسبة', 'المخزون والإمداد', 'المبيعات', 'المشتريات', 'العملاء']
      : ['Business Overview', 'Accounting', 'Inventory & Supply', 'Sales', 'Purchasing', 'Customers'])
    : navigation.map(item => lang === 'ar' ? item.ar : item.en);
  let visited = 0;
  for (const label of labels) {
    if (isMobile && visited > 0) {
      await page.getByTitle('Toggle Menu').first().click();
      await page.waitForTimeout(100);
    }
    if (await clickNavigation(page, label)) {
      visited += 1;
      await assertLayout(page, lang === 'ar' ? 'rtl' : 'ltr', `${viewportName}/${lang}/${label}`);
      await page.screenshot({ path: path.join(evidenceDir, `${viewportName}-${lang}-${label.replace(/[^\w-]+/g, '_')}.png`), fullPage: true });
    }
  }
  assert(visited >= 2, `${viewportName}/${lang}: fewer than two operational navigation surfaces were reachable`);

  if (lang === 'en') {
    await clickNavigation(page, 'Dashboard');
    const revenueLink = page.getByRole('button', { name: /Sales|Revenue|General ledger/i }).first();
    if (await revenueLink.count() > 0 && await revenueLink.isVisible().catch(() => false)) {
      await revenueLink.click();
      await page.waitForTimeout(300);
      await assertLayout(page, 'ltr', `${viewportName}/en/drilldown`);
    }
  }
}

async function main(): Promise<void> {
  port = await findAvailablePort(process.env.BROWSER_ACCEPTANCE_PORT);
  baseUrl = `http://127.0.0.1:${port}`;
  await removeDatabaseFiles(databasePath);
  await fs.rm(evidenceDir, { recursive: true, force: true });
  await fs.mkdir(evidenceDir, { recursive: true });

  const server: ChildProcess = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      NODE_ENV: 'test',
      ALLOW_DEMO_SEED_DATA: 'true',
      AUTH_TOKEN_SECRET: 'browser-acceptance-secret',
      INITIAL_ADMIN_PASSWORD: adminPassword,
      INITIAL_CASHIER_PIN: '1234'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });

  let browser: Browser | undefined;
  try {
    await waitForServer();
    const token = await login();
    browser = await chromium.launch({ headless: true });
    for (const viewport of viewports) {
      for (const lang of ['en', 'ar'] as const) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        await verifyLanguage(page, token, lang, viewport.name);
        await context.close();
        console.log(`PASS: ${viewport.name} ${lang.toUpperCase()} layout, navigation, screenshots, and overflow checks`);
      }
    }
    console.log(`PASS: browser acceptance completed for ${viewports.length} viewports, both RTL/LTR languages; evidence=${evidenceDir}`);
  } finally {
    await browser?.close();
    await stopTestServer(server);
    await removeDatabaseFiles(databasePath);
  }
}

main().catch(error => {
  console.error(`FAIL: browser acceptance: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
