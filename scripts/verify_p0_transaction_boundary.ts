import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PilotDatabaseService } from '../server/pilotDatabase';
import { ManufacturingEngine, ManufacturingInventoryContext } from '../src/engine/manufacturingEngine';
import { InventoryItem, StockQuant, Warehouse } from '../src/types';
import { ProductionWorkOrder } from '../src/types/manufacturing';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

const databasePath = path.resolve(process.cwd(), 'data/p0-transaction-boundary.db');
const rollbackDatabasePath = path.resolve(process.cwd(), 'data/p0-manufacturing-rollback.db');
const scope = { tenantId: 'ten-boundary', companyId: 'comp-boundary' };

if (process.argv.includes('--worker')) {
  const db = PilotDatabaseService.createIsolated(databasePath);
  const idempotencyKey = 'idem-boundary-concurrent-001';
  const result = db.transaction(() => {
    const sourceDocumentId = 'purchase-boundary-001';
    const operation = {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      operationType: 'PURCHASE_RECEIPT',
      sourceDocumentId,
      idempotencyKey
    };
    const accepted = db.claimIdempotentOperation({
      ...operation,
      resultCollection: 'financialEvents',
      resultId: idempotencyKey
    });
    if (!accepted) {
      const existing = db.getEntity<{ id: string }>('financialEvents', idempotencyKey);
      if (!existing) throw new Error('Idempotency record exists without its committed result');
      return { ...existing, accepted: false };
    }
    const event = { id: idempotencyKey, ...scope, sourceDocumentId, idempotencyKey, amount: 125 };
    db.saveEntity('financialEvents', event, scope.tenantId, scope.companyId);
    db.saveEntity('journalEntries', { id: idempotencyKey, ...scope, originatingDocumentId: sourceDocumentId, totalDebit: 125, totalCredit: 125 }, scope.tenantId, scope.companyId);
    db.saveEntity('stockMovements', { id: idempotencyKey, ...scope, sourceDocumentId, quantity: 1 }, scope.tenantId, scope.companyId);
    db.saveEntity('boundaryAudit', { id: idempotencyKey, ...scope, sourceDocumentId, action: 'PURCHASE_RECEIPT_ACCEPTED' }, scope.tenantId, scope.companyId);
    return { ...event, accepted: true };
  });
  console.log(JSON.stringify(result));
  db.close();
  process.exit(0);
}

async function removeDatabase(target = databasePath): Promise<void> {
  for (const file of [target, `${target}-wal`, `${target}-shm`]) {
    await fs.rm(file, { force: true });
  }
}

async function testDurableConcurrentIdempotency(): Promise<void> {
  const db = PilotDatabaseService.createIsolated(databasePath);
  const workerScript = path.resolve(process.cwd(), 'scripts/verify_p0_transaction_boundary.ts');
  const results = await Promise.all(Array.from({ length: 8 }, () => new Promise<{ id: string; accepted: boolean }>((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', workerScript, '--worker'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: databasePath },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    let error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.once('error', reject);
    child.once('exit', code => {
      if (code !== 0) return reject(new Error(error || `worker exited with ${code}`));
      try { resolve(JSON.parse(output.trim()) as { id: string; accepted: boolean }); } catch { reject(new Error(`Invalid worker output: ${output}`)); }
    });
  })));
  assert(new Set(results.map(result => result.id)).size === 1, 'concurrent retries return one durable idempotent result');
  assert(results.filter(result => result.accepted).length === 1, 'exactly one worker is accepted as the new business operation');
  assert(db.listEntities('financialEvents', scope.tenantId, scope.companyId).length === 1, 'one financial event exists in shared SQLite state');
  assert(db.listEntities('journalEntries', scope.tenantId, scope.companyId).length === 1, 'one journal entry exists in shared SQLite state');
  assert(db.listEntities('stockMovements', scope.tenantId, scope.companyId).length === 1, 'one inventory mutation exists in shared SQLite state');
  assert(db.listEntities('boundaryAudit', scope.tenantId, scope.companyId).length === 1, 'one audit event exists in shared SQLite state');
  assert(db.countAcceptedIdempotentExecutions({
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    operationType: 'PURCHASE_RECEIPT',
    sourceDocumentId: 'purchase-boundary-001',
    idempotencyKey: 'idem-boundary-concurrent-001'
  }) === 1, 'durable instrumentation records one committed side-effect execution');
  db.close();

  const reopened = PilotDatabaseService.createIsolated(databasePath);
  const idempotencyKey = 'idem-boundary-concurrent-001';
  assert(reopened.getEntity('financialEvents', idempotencyKey) !== null, 'idempotent financial event survives process restart');
  assert(reopened.getEntity('journalEntries', idempotencyKey) !== null, 'idempotent journal survives process restart');
  assert(reopened.getEntity('stockMovements', idempotencyKey) !== null, 'idempotent inventory mutation survives process restart');
  assert(reopened.getEntity('boundaryAudit', idempotencyKey) !== null, 'idempotent audit event survives process restart');
  assert(reopened.countAcceptedIdempotentExecutions({
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    operationType: 'PURCHASE_RECEIPT',
    sourceDocumentId: 'purchase-boundary-001',
    idempotencyKey
  }) === 1, 'accepted execution count survives process restart');
  reopened.close();
}

function createManufacturingContext(): ManufacturingInventoryContext {
  const item = {
    id: 'item-boundary-component',
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    sku: 'COMP-BOUNDARY',
    name: 'Boundary Component',
    categoryId: 'raw',
    categoryName: 'Raw',
    uom: 'EA',
    costPrice: 10,
    stockQty: 1
  } as InventoryItem;
  const warehouse = { id: 'wh-boundary', tenantId: scope.tenantId, companyId: scope.companyId, name: 'Boundary Warehouse' } as Warehouse;
  const quant = {
    id: 'quant-boundary',
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    itemSku: item.sku,
    itemName: item.name,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    binId: 'bin-default',
    binCode: 'BIN-DEFAULT',
    qtyOnHand: 1,
    qtyAvailable: 1,
    qtyReserved: 0,
    qtyInTransit: 0,
    qtyDamaged: 0,
    qtyReturned: 0,
    unitCost: 10,
    totalValue: 10,
    uom: 'EA',
    status: 'Available',
    updatedAt: new Date().toISOString()
  } as StockQuant;
  return { items: [item], warehouses: [warehouse], bins: [], quants: [quant], batchLots: [], serials: [], stockLedgerEntries: [], userName: 'Boundary Test', userRole: 'Finance Manager' };
}

async function testManufacturingAtomicRollback(): Promise<void> {
  const db = PilotDatabaseService.createIsolated(rollbackDatabasePath);
  const context = createManufacturingContext();
  const contextBefore = JSON.stringify(context);
  const contextSnapshot = structuredClone(context);
  const workOrder: ProductionWorkOrder = {
    id: 'wo-boundary-001',
    ...scope,
    orderNumber: 'WO-BOUNDARY-001',
    finishedGoodSku: 'FG-BOUNDARY',
    finishedGoodName: 'Boundary Finished Good',
    bomId: 'bom-boundary',
    bomVersion: 1,
    routingId: 'routing-boundary',
    plannedQuantity: 1,
    completedQuantity: 0,
    scrappedQuantity: 0,
    uom: 'EA',
    status: 'RELEASED',
    plannedStartDate: new Date().toISOString(),
    plannedEndDate: new Date().toISOString(),
    targetWarehouseId: 'wh-boundary',
    materials: [{ componentSku: 'COMP-BOUNDARY', description: 'Boundary Component', componentType: 'RAW_MATERIAL', requiredQuantity: 1, issuedQuantity: 0, reservedQuantity: 1, scrappedQuantity: 0, unitCost: 10, totalPlannedCost: 10, totalActualCost: 0, uom: 'EA', warehouseId: 'wh-boundary' }],
    operationConfirmations: [],
    costSummary: { plannedMaterialCost: 10, plannedLaborCost: 0, plannedMachineCost: 0, plannedOverheadCost: 0, totalPlannedCost: 10, standardCostPerUnit: 10, actualMaterialCost: 0, actualLaborCost: 0, actualMachineCost: 0, actualOverheadCost: 0, totalActualCost: 0, actualCostPerUnit: 0, wipBalance: 0, materialVariance: 0, laborEfficiencyVariance: 0, overheadVariance: 0, totalVariance: 0 },
    createdBy: 'boundary-test',
    createdAt: new Date().toISOString(),
    version: 1
  };

  let failed = false;
  let mutatedBeforeRollback = false;
  try {
    db.transaction(() => {
      const result = ManufacturingEngine.issueMaterialsToWorkOrder({
        workOrder,
        issuedBy: 'boundary-test',
        issueType: 'MANUAL_STAGING',
        items: [{ componentSku: 'COMP-BOUNDARY', quantity: 1 }],
        inventoryContext: context
      });
      db.saveEntity('manufacturingWorkOrders', result.updatedWorkOrder, scope.tenantId, scope.companyId);
      db.saveEntity('stockMovements', result.inventoryMovements?.[0]?.stockLedgerEntry, scope.tenantId, scope.companyId);
      db.saveEntity('financialEvents', { id: result.goodsIssueRecord.financialEventId, ...scope, ...result.financialEvent.payload }, scope.tenantId, scope.companyId);
      db.saveEntity('glJournals', { id: result.goodsIssueRecord.financialEventId, ...scope, sourceDocumentId: result.goodsIssueRecord.issueNumber, debit: 10, credit: 10 }, scope.tenantId, scope.companyId);
      db.saveEntity('manufacturingAudit', { id: 'audit-boundary-001', ...scope, workOrderId: workOrder.id, action: 'MATERIAL_ISSUE' }, scope.tenantId, scope.companyId);
      mutatedBeforeRollback = JSON.stringify(context) !== contextBefore;
      throw new Error('Injected failure after manufacturing, inventory, WIP, financial event, and audit writes');
    }, {
      onRollback: () => {
        context.items.splice(0, context.items.length, ...contextSnapshot.items);
        context.quants.splice(0, context.quants.length, ...contextSnapshot.quants);
        context.stockLedgerEntries.splice(0, context.stockLedgerEntries.length, ...contextSnapshot.stockLedgerEntries);
      }
    });
  } catch {
    failed = true;
  }
  assert(failed, 'failure injection occurs inside the real SQLite transaction');
  assert(db.listEntities('manufacturingWorkOrders', scope.tenantId, scope.companyId).length === 0, 'manufacturing work order rolls back');
  assert(db.listEntities('stockMovements', scope.tenantId, scope.companyId).length === 0, 'inventory mutation rolls back');
  assert(db.listEntities('financialEvents', scope.tenantId, scope.companyId).length === 0, 'WIP financial event rolls back');
  assert(db.listEntities('glJournals', scope.tenantId, scope.companyId).length === 0, 'GL journal rolls back');
  assert(db.listEntities('manufacturingAudit', scope.tenantId, scope.companyId).length === 0, 'manufacturing audit rolls back');
  assert(JSON.stringify(context) === contextBefore, 'domain inventory context remains unchanged when the transaction rolls back');
  assert(mutatedBeforeRollback, 'failure occurs after the transactional manufacturing context has mutated');
  assert(JSON.stringify(contextSnapshot) === contextBefore && JSON.stringify(context) === contextBefore, 'transaction coordinator restores domain state after rollback');

  const retryContext = structuredClone(context);
  const retryOperation = {
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    operationType: 'MANUFACTURING_GOODS_ISSUE',
    sourceDocumentId: workOrder.id,
    idempotencyKey: 'idem-manufacturing-retry-001'
  };
  db.transaction(() => {
    if (!db.claimIdempotentOperation({ ...retryOperation, resultCollection: 'manufacturingWorkOrders', resultId: workOrder.id })) return;
    const result = ManufacturingEngine.issueMaterialsToWorkOrder({
      workOrder,
      issuedBy: 'boundary-test',
      issueType: 'MANUAL_STAGING',
      items: [{ componentSku: 'COMP-BOUNDARY', quantity: 1 }],
      inventoryContext: retryContext
    });
    db.saveEntity('manufacturingWorkOrders', result.updatedWorkOrder, scope.tenantId, scope.companyId);
    db.saveEntity('stockMovements', result.inventoryMovements?.[0]?.stockLedgerEntry, scope.tenantId, scope.companyId);
    db.saveEntity('financialEvents', { id: result.goodsIssueRecord.financialEventId, ...scope, ...result.financialEvent.payload }, scope.tenantId, scope.companyId);
    db.saveEntity('glJournals', { id: result.goodsIssueRecord.financialEventId, ...scope, sourceDocumentId: result.goodsIssueRecord.issueNumber, debit: 10, credit: 10 }, scope.tenantId, scope.companyId);
    db.saveEntity('manufacturingAudit', { id: 'audit-manufacturing-retry-001', ...scope, workOrderId: workOrder.id, action: 'MATERIAL_ISSUE' }, scope.tenantId, scope.companyId);
  });
  db.transaction(() => {
    assert(!db.claimIdempotentOperation({ ...retryOperation, resultCollection: 'manufacturingWorkOrders', resultId: workOrder.id }), 'successful retry is recognized as an existing operation');
  });
  assert(db.listEntities('manufacturingWorkOrders', scope.tenantId, scope.companyId).length === 1, 'successful retry creates one work order effect');
  assert(db.listEntities('stockMovements', scope.tenantId, scope.companyId).length === 1, 'successful retry creates one inventory effect');
  assert(db.listEntities('financialEvents', scope.tenantId, scope.companyId).length === 1, 'successful retry creates one financial effect');
  assert(db.listEntities('glJournals', scope.tenantId, scope.companyId).length === 1, 'successful retry creates one GL effect');
  assert(db.listEntities('manufacturingAudit', scope.tenantId, scope.companyId).length === 1, 'successful retry creates one audit effect');
  assert(db.countAcceptedIdempotentExecutions(retryOperation) === 1, 'successful retry has one accepted execution');
  db.close();
}

await removeDatabase();
await removeDatabase(rollbackDatabasePath);
await testDurableConcurrentIdempotency();
await testManufacturingAtomicRollback();
await removeDatabase();
await removeDatabase(rollbackDatabasePath);
console.log('PASS: durable uniqueness/idempotency and cross-domain manufacturing rollback are proven with SQLite persistence');
