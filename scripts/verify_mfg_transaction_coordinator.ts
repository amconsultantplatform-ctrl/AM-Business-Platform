import fs from 'node:fs';
import path from 'node:path';
import { PilotDatabaseService } from '../server/pilotDatabase';
import { ManufacturingTransactionCoordinator } from '../server/manufacturingTransactionCoordinator';

const dbPath = path.resolve(process.cwd(), 'data/mfg-transaction-coordinator-test.db');
for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  try { fs.rmSync(file, { force: true }); } catch {}
}

const db = PilotDatabaseService.createIsolated(dbPath);
const coordinator = new ManufacturingTransactionCoordinator(db);
const state = {
  inventory: [{ id: 'inv-1', tenantId: 'ten-1', companyId: 'comp-1', quantity: 10 }],
  workOrders: [{ id: 'wo-1', tenantId: 'ten-1', companyId: 'comp-1', issued: 0 }],
  manufacturingGoodsIssues: [] as any[],
  financialEvents: [] as any[],
  journalEntries: [] as any[],
  auditLogs: [] as any[]
};
const operation = {
  tenantId: 'ten-1',
  companyId: 'comp-1',
  operationType: 'MANUFACTURING_GOODS_ISSUE',
  sourceDocumentId: 'wo-1',
  idempotencyKey: 'gi-idem-1',
  resultCollection: 'manufacturingGoodsIssues',
  resultId: 'gi-1'
};

coordinator.execute(state, staged => {
  staged.inventory[0].quantity -= 2;
  staged.workOrders[0].issued += 2;
  staged.financialEvents.push({ id: 'fe-1', ...operation, amount: 20 });
  staged.journalEntries.push({ id: 'je-1', ...operation, debit: 20, credit: 20 });
  staged.auditLogs.push({ id: 'audit-1', ...operation });
  staged.manufacturingGoodsIssues.push({ id: 'gi-1', ...operation });
  if (!db.claimIdempotentOperation(operation)) throw new Error('unexpected duplicate');
  return true;
});
if (state.inventory[0].quantity !== 8 || state.workOrders[0].issued !== 2) throw new Error('success was not published');

const beforeFailure = JSON.stringify(state);
try {
  coordinator.execute(state, staged => {
    staged.inventory[0].quantity = 0;
    staged.workOrders[0].issued = 99;
    throw new Error('injected downstream failure');
  });
  throw new Error('failure did not propagate');
} catch (error: any) {
  if (error.message !== 'injected downstream failure') throw error;
}
if (JSON.stringify(state) !== beforeFailure) throw new Error('failed operation mutated live context');
if (db.listEntities('financialEvents', 'ten-1', 'comp-1').length !== 1) throw new Error('rollback left financial side effects');

if (db.claimIdempotentOperation(operation)) throw new Error('retry was accepted twice');
if (db.listEntities('journalEntries', 'ten-1', 'comp-1').length !== 1) throw new Error('retry duplicated journal');
db.close();

const reopened = PilotDatabaseService.createIsolated(dbPath);
if (reopened.getEntity('financialEvents', 'fe-1') === null) throw new Error('financial event did not survive restart');
if (reopened.getEntity('journalEntries', 'je-1') === null) throw new Error('journal did not survive restart');
if (reopened.countAcceptedIdempotentExecutions(operation) !== 1) throw new Error('idempotency did not survive restart');
if (reopened.claimIdempotentOperation(operation)) throw new Error('restart retry was accepted twice');
if (reopened.getEntity('manufacturingGoodsIssues', operation.resultId) === null) throw new Error('goods issue did not survive restart');
reopened.close();
console.log('PASS: manufacturing transaction coordinator success, rollback, retry, and restart persistence');
