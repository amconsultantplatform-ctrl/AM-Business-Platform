import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const suites = [
  ['Production-equivalent Runtime Certification', 'scripts/verify_production_equivalent_certification.ts'],
  ['Accounting and Annual Closing', 'scripts/verify_final_accounting_certification.ts'],
  ['Full Runtime HR Payroll Commission RBAC', 'scripts/verify_final_full_system_certification.ts']
] as const;
const results = suites.map(([name, script]) => {
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', script], { cwd: process.cwd(), env: process.env, encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  return { name, script, status: result.status === 0 ? 'PASS' : 'FAIL', exitCode: result.status ?? 1 };
});
const finalResult = results.every(result => result.status === 'PASS') ? 'PASS' : 'FAIL';
const report = { certification: 'FINAL FULL SYSTEM CERTIFICATION', generatedAt: new Date().toISOString(), results, finalResult };
fs.mkdirSync(path.resolve('data'), { recursive: true });
fs.writeFileSync(path.resolve('data/final-full-system-certification.json'), JSON.stringify(report, null, 2));
console.log('\nFINAL FULL SYSTEM CERTIFICATION');
for (const result of results) console.log(`${result.name}: ${result.status}`);
console.log(`FINAL RESULT: ${finalResult}`);
process.exitCode = finalResult === 'PASS' ? 0 : 1;
