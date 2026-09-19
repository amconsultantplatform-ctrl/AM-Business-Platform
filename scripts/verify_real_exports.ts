import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import { PDFParse } from 'pdf-parse';
import { FinancialReportingEngine } from '../src/engine/financialReportingEngine';
import { findAvailablePort, removeDatabaseFiles, stopTestServer } from './test_server';

const databasePath = path.resolve(process.cwd(), 'data/test_real_exports.db');
let server: ChildProcess | undefined;
let baseUrl: string;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(route: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${route}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) }
  });
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) };
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Export verification server did not start');
}

async function main(): Promise<void> {
  const port = await findAvailablePort(process.env.REAL_EXPORTS_PORT);
  baseUrl = `http://127.0.0.1:${port}`;
  await removeDatabaseFiles(databasePath);
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      NODE_ENV: 'test',
      AUTH_TOKEN_SECRET: 'real-export-test-secret',
      INITIAL_ADMIN_PASSWORD: 'Admin@2026!',
      INITIAL_CASHIER_PIN: '1234',
      ALLOW_DEMO_SEED_DATA: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });

  try {
    await waitForServer();
    const login = await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'a.mounir369@gmail.com', password: 'Admin@2026!' })
    });
    assert(login.status === 200 && login.body.token, 'export verification login failed');
    const headers = { authorization: "Bearer " + login.body.token };
    const report = await request('/api/v1/reports/trial-balance', { headers });
    assert(report.status === 200, 'trial balance source report failed');

    const pdfExport = await request('/api/v1/reports/export', {
      method: 'POST',
      headers,
      body: JSON.stringify({ reportData: report.body, format: 'PDF', customTitle: 'AM Commercial Test Company Trial Balance' })
    });
    assert(pdfExport.status === 200 && pdfExport.body.mimeType === 'application/pdf', 'PDF export did not return application/pdf');
    const pdf = Buffer.from(pdfExport.body.content, 'base64');
    assert(pdf.subarray(0, 5).toString() === '%PDF-', 'generated file is not a PDF');
    const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
    assert(pageCount >= 1, 'PDF has no page objects');
    const parser = new PDFParse({ data: pdf });
    const parsedPdf = await parser.getText();
    await parser.destroy();
    assert(parsedPdf.total === pageCount && parsedPdf.text.includes('AM Commercial Test Company Trial Balance'), 'PDF reader could not parse expected report content');
    await fs.writeFile('data/am-commercial-trial-balance.pdf', pdf);

    const xlsxExport = await request('/api/v1/reports/export', {
      method: 'POST',
      headers,
      body: JSON.stringify({ reportData: report.body, format: 'EXCEL', customTitle: 'AM Commercial Test Company Trial Balance' })
    });
    assert(xlsxExport.status === 200 && xlsxExport.body.fileName.endsWith('.xlsx'), 'XLSX export did not return .xlsx');
    assert(xlsxExport.body.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'XLSX MIME type is not real workbook MIME');
    const xlsx = Buffer.from(xlsxExport.body.content, 'base64');
    const rows = await readXlsxFile(xlsx, { sheet: 'Report' });
    assert(rows.length > 1, 'XLSX contains no data rows');
    const multilingualExport = await FinancialReportingEngine.exportReportFile({
      English: 'Total revenue',
      العربية: 'إجمالي الإيرادات',
      totals: { English: 1250.75, العربية: 1250.75 }
    }, 'EXCEL', 'Bilingual totals');
    const multilingualRows = await readXlsxFile(Buffer.from(multilingualExport.content, 'base64'), { sheet: 'Report' });
    const multilingualText = multilingualRows.flat().map(value => String(value ?? '')).join('|');
    assert(multilingualText.includes('إجمالي الإيرادات') && multilingualText.includes('Total revenue'), 'XLSX lost Arabic/English values');
    assert(multilingualText.includes('1250.75'), 'XLSX lost bilingual totals');
    await fs.writeFile('data/am-commercial-trial-balance.xlsx', xlsx);
    console.log(`PASS: real PDF ${pdf.length} bytes, pages=${pageCount}, parsedPages=${parsedPdf.total}, saved=data/am-commercial-trial-balance.pdf`);
    console.log(`PASS: real XLSX ${xlsx.length} bytes, sheets=Report, rows=${rows.length}, saved=data/am-commercial-trial-balance.xlsx`);
  } finally {
    await stopTestServer(server);
    await removeDatabaseFiles(databasePath);
  }
}

main().catch(error => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
