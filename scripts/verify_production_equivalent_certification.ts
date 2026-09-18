import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const command = 'tsx scripts/verify_production_first_run_closure.ts';
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

assert(process.env.NODE_ENV === undefined || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'production', 'certification environment is supported');
const certificationEnv = {
  NODE_ENV: 'production',
  DEMO_MODE: 'false',
  ALLOW_DEMO_SEED_DATA: 'false',
  REQUIRE_PERSISTENT_STORAGE: 'true',
  STRICT_PERSISTENCE_ABORT: 'true'
};
const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/verify_production_first_run_closure.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ...certificationEnv
  },
  encoding: 'utf8'
});

process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
const status = result.status === 0 ? 'PASS' : 'FAIL';
assert(result.status === 0, 'production-equivalent runtime exits successfully');
assert((result.stdout || '').includes('PRODUCTION_FIRST_RUN_CLOSURE: PASS'), 'real HTTP, auth, GL, invalid-posting, and restart assertions passed');
assert((result.stdout || '').includes('demo seed flags are disabled'), 'production-equivalent run proves demo seed flags are disabled');
assert((result.stdout || '').includes('opening journal persists after server restart'), 'production-equivalent run proves restart persistence');
const report = {
  certification: 'PRODUCTION-EQUIVALENT RUNTIME CERTIFICATION',
  mode: 'production-equivalent',
  environment: certificationEnv,
  command,
  status,
  evidence: [
    'real SQLite persistence',
    'real HTTP runtime APIs',
    'real authentication and authorization',
    'canonical GL posting and balance verification',
    'server restart persistence'
  ],
  generatedAt: new Date().toISOString()
};
fs.mkdirSync(path.resolve('data'), { recursive: true });
fs.writeFileSync(path.resolve('data/production-equivalent-certification.json'), JSON.stringify(report, null, 2));
console.log(`PRODUCTION-EQUIVALENT RUNTIME CERTIFICATION: ${status}`);
process.exitCode = result.status === 0 ? 0 : 1;
