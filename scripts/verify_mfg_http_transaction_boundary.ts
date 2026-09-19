import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const port = 3321;
const baseUrl = `http://127.0.0.1:${port}`;
const databasePath = path.resolve(process.cwd(), 'data/mfg_http_transaction_boundary.db');

async function cleanup() {
  for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    await fs.rm(file, { force: true });
  }
}

async function request<T>(route: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}${route}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    throw new Error(`${init.method || 'GET'} ${route} returned non-JSON response: ${text.slice(0, 200)}`);
  }
  return { status: response.status, body };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      });
      if (response.status > 0) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('HTTP server did not start');
}

async function login(email: string, password: string): Promise<string> {
  const response = await request<{ token?: string; error?: string }>(`/api/v1/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  assert(response.status === 200 && response.body.token, `login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.token as string;
}

async function createInventoryUser(token: string, email: string, name: string, role: string): Promise<string> {
  const response = await request<{ id?: string; email?: string; role?: string; error?: string }>(`/api/v1/users`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name,
      email,
      role,
      password: 'Inventory@2026!',
      tenantId: 'ten-001',
      companyId: 'comp-001'
    })
  });
  assert(response.status === 201 && response.body.id, `user creation failed: ${JSON.stringify(response.body)}`);
  return response.body.email as string;
}

function spawnServer(): ChildProcess {
  return spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      NODE_ENV: 'test',
      AUTH_TOKEN_SECRET: 'mfg-http-boundary-secret',
      INITIAL_ADMIN_PASSWORD: 'Admin@2026!',
      INITIAL_CASHIER_PIN: '1234',
      DEMO_MODE: 'true',
      ALLOW_DEMO_SEED_DATA: 'true',
      PERSISTENT_DATA_PATH: path.resolve(process.cwd(), 'data')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function stopServer(server: ChildProcess | undefined): Promise<void> {
  if (!server || !server.pid) return;
  server.kill('SIGTERM');
  await new Promise<void>(resolve => {
    const timeout = setTimeout(resolve, 4000);
    server.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main(): Promise<void> {
  await cleanup();
  let server: ChildProcess | undefined;
  try {
    server = spawnServer();
    await waitForServer();

    const adminToken = await login('a.mounir369@gmail.com', 'Admin@2026!');
    const adminHeaders = { authorization: `Bearer ${adminToken}` };
    await createInventoryUser(adminToken, 'mfg.plan@am-platform.com', 'Manufacturing Planner', 'Inventory Manager');
    await createInventoryUser(adminToken, 'mfg.creator@am-platform.com', 'Manufacturing Creator', 'Inventory Manager');
    await createInventoryUser(adminToken, 'mfg.release@am-platform.com', 'Manufacturing Releaser', 'Inventory Manager');
    await createInventoryUser(adminToken, 'mfg.approver@am-platform.com', 'Finance Manager', 'Finance Manager');

    const plannerToken = await login('mfg.plan@am-platform.com', 'Inventory@2026!');
    const plannerHeaders = { authorization: `Bearer ${plannerToken}` };
    const creatorToken = await login('mfg.creator@am-platform.com', 'Inventory@2026!');
    const creatorHeaders = { authorization: `Bearer ${creatorToken}` };
    const releaserToken = await login('mfg.release@am-platform.com', 'Inventory@2026!');
    const releaserHeaders = { authorization: `Bearer ${releaserToken}` };
    const approverToken = await login('mfg.approver@am-platform.com', 'Inventory@2026!');
    const approverHeaders = { authorization: `Bearer ${approverToken}` };
    const inventoryHeaders = releaserHeaders;

    const workCenter = await request<{ success?: boolean; workCenter?: { id: string }; error?: string }>(`/api/v1/mfg/work-centers`, {
      method: 'POST',
      headers: plannerHeaders,
      body: JSON.stringify({
        tenantId: 'ten-001',
        companyId: 'comp-001',
        workCenterCode: 'WC-MFG-HTTP',
        name: 'HTTP Test Work Center',
        costCenterCode: 'CC-MFG',
        hourlyLaborRate: 40,
        hourlyMachineRate: 25,
        hourlyOverheadRate: 10,
        capacityHoursPerDay: 8,
        efficiencyPercent: 100
      })
    });
    assert(workCenter.status === 200 && workCenter.body.success !== false && workCenter.body.workCenter?.id, `work center creation failed: ${JSON.stringify(workCenter.body)}`);

    const bom = await request<{ success?: boolean; bom?: { id: string }; error?: string }>(`/api/v1/mfg/boms`, {
      method: 'POST',
      headers: plannerHeaders,
      body: JSON.stringify({
        tenantId: 'ten-001',
        companyId: 'comp-001',
        bomNumber: 'BOM-HTTP-001',
        finishedGoodSku: 'FG-HTTP-001',
        finishedGoodName: 'HTTP Production Test Item',
        baseQuantity: 1,
        uom: 'EA',
        effectiveFrom: '2026-09-19',
        createdBy: 'mfg.inventory@am-platform.com',
        components: [{
          sku: 'HW-SRV-01',
          description: 'Enterprise Edge Server Blade Gen11',
          componentType: 'RAW_MATERIAL',
          quantityPerUnit: 1,
          scrapFactorPercent: 0,
          costPerUnit: 18500,
          warehouseId: 'wh-001',
          uom: 'PCS',
          itemType: 'INVENTORY_ITEM'
        }] 
      })
    });
    assert(bom.status === 200 && bom.body.success !== false && bom.body.bom?.id, `BOM creation failed: ${JSON.stringify(bom.body)}`);

    const approvedBom = await request<{ success?: boolean; bom?: { id: string; status: string }; error?: string }>(`/api/v1/mfg/boms/${bom.body.bom!.id}/approve`, {
      method: 'POST',
      headers: approverHeaders,
      body: JSON.stringify({ approvedBy: 'mfg.approver@am-platform.com' })
    });
    assert(approvedBom.status === 200 && approvedBom.body.success !== false && approvedBom.body.bom?.status === 'ACTIVE', `BOM approval failed: ${JSON.stringify(approvedBom.body)}`);

    const seededReceipt = await request<{ stockLedgerEntry?: { itemSku: string; quantity: number; warehouseId: string }; error?: string }>(`/api/v1/inventory/goods-receipt`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        tenantId: 'ten-001',
        companyId: 'comp-001',
        itemSku: 'HW-SRV-01',
        warehouseId: 'wh-001',
        binCode: 'BIN-DEFAULT',
        quantity: 25,
        uom: 'PCS',
        unitCost: 18500,
        sourceDocumentType: 'OpeningStock',
        sourceDocumentId: 'OPEN-HW-SRV-01',
        sourceDocumentNumber: 'OPN-001',
        reference: 'Manufacturing HTTP boundary seed',
        reason: 'Seed raw material stock for manufacturing transaction verification',
        userId: 'mfg.release@am-platform.com',
        userName: 'Manufacturing Releaser',
        userRole: 'Inventory Manager'
      })
    });
    assert(seededReceipt.status === 201 && seededReceipt.body.stockLedgerEntry?.itemSku === 'HW-SRV-01', `raw material inventory seed failed: ${JSON.stringify(seededReceipt.body)}`);

    const routing = await request<{ success?: boolean; routing?: { id: string }; error?: string }>(`/api/v1/mfg/routings`, {
      method: 'POST',
      headers: inventoryHeaders,
      body: JSON.stringify({
        tenantId: 'ten-001',
        companyId: 'comp-001',
        routingNumber: 'RTG-HTTP-001',
        finishedGoodSku: 'FG-HTTP-001',
        createdBy: 'mfg.inventory@am-platform.com',
        operations: [{
          operationNumber: 10,
          workCenterCode: 'WC-MFG-HTTP',
          name: 'Assembly',
          description: 'HTTP test assembly operation',
          operationType: 'ASSEMBLY',
          setupTimeHours: 0.5,
          runTimeHoursPerUnit: 1,
          isMilestone: true
        }]
      })
    });
    assert(routing.status === 200 && routing.body.success !== false && routing.body.routing?.id, `routing creation failed: ${JSON.stringify(routing.body)}`);

    const workOrderResponse = await request<{ success?: boolean; workOrder?: { id: string; status: string }; error?: string }>(`/api/v1/mfg/work-orders`, {
      method: 'POST',
      headers: creatorHeaders,
      body: JSON.stringify({
        bomId: bom.body.bom!.id,
        routingId: routing.body.routing!.id,
        plannedQuantity: 1,
        uom: 'EA',
        plannedStartDate: '2026-09-19',
        plannedEndDate: '2026-09-20',
        targetWarehouseId: 'wh-001',
        finishedGoodSku: 'FG-HTTP-001',
        finishedGoodName: 'HTTP Production Test Item',
        tenantId: 'ten-001',
        companyId: 'comp-001'
      })
    });
    assert(workOrderResponse.status === 200 && workOrderResponse.body.success !== false && workOrderResponse.body.workOrder?.id, `work order creation failed: ${JSON.stringify(workOrderResponse.body)}`);
    const workOrderId = workOrderResponse.body.workOrder!.id;

    const release = await request<{ success?: boolean; workOrder?: { id: string; status: string }; error?: string }>(`/api/v1/mfg/work-orders/${workOrderId}/release`, {
      method: 'POST',
      headers: inventoryHeaders,
      body: JSON.stringify({})
    });
    assert(release.status === 200 && release.body.success !== false && release.body.workOrder?.status === 'RELEASED', `release failed: ${JSON.stringify(release.body)}`);

    const beforeQuants = await request<Array<{ itemSku: string; qtyAvailable: number }>>(`/api/v1/inventory/quants`, { headers: inventoryHeaders });
    const beforeQty = beforeQuants.body.find(quant => quant.itemSku === 'HW-SRV-01')?.qtyAvailable ?? 0;

    const issueKey = `mfg-http-boundary-${Date.now()}`;
    const issueResponse = await request<{ success?: boolean; goodsIssueRecord?: { id: string; issueNumber: string; idempotencyKey?: string; totalIssuedValue: number }; error?: string }>(`/api/v1/mfg/work-orders/${workOrderId}/issue-materials`, {
      method: 'POST',
      headers: inventoryHeaders,
      body: JSON.stringify({
        issueType: 'MANUAL_STAGING',
        items: [{ componentSku: 'HW-SRV-01', quantity: 1 }],
        idempotencyKey: issueKey
      })
    });
    assert(issueResponse.status === 200 && issueResponse.body.success !== false && issueResponse.body.goodsIssueRecord?.id, `issue-materials failed: ${JSON.stringify(issueResponse.body)}`);
    const issueRecord = issueResponse.body.goodsIssueRecord!;
    assert(issueRecord.idempotencyKey === issueKey, 'idempotency key was not preserved on the durable result');
    assert(issueRecord.totalIssuedValue > 0, 'material issue did not record total value');

    const afterQuants = await request<Array<{ itemSku: string; qtyAvailable: number }>>(`/api/v1/inventory/quants`, { headers: inventoryHeaders });
    const currentQty = afterQuants.body.find(quant => quant.itemSku === 'HW-SRV-01')?.qtyAvailable ?? 0;
    assert(currentQty === beforeQty - 1, `inventory quantity did not decrement as expected: before=${beforeQty}, after=${currentQty}`);

    const financialEvents = await request<Array<{ eventType: string; sourceDocumentType?: string; sourceDocumentId?: string; sourceDocumentNumber?: string }>>(`/api/v1/financial-events`, { headers: inventoryHeaders });
    const productionEvents = financialEvents.body.filter(event => event.eventType === 'PRODUCTION_GOODS_ISSUE');
    assert(productionEvents.length >= 1, 'production goods issue financial event did not persist');

    const journals = await request<Array<{ sourceDocumentType?: string; originatingDocumentType?: string; sourceDocumentNumber?: string; originatingDocumentNumber?: string; reference?: string }>>(`/api/v1/accounting/journals`, { headers: inventoryHeaders });
    const productionJournals = journals.body.filter((entry: any) =>
      entry.originatingDocumentType === 'ProductionGoodsIssue' ||
      entry.sourceDocumentType === 'ProductionGoodsIssue' ||
      entry.originatingDocumentNumber === issueRecord.issueNumber ||
      entry.sourceDocumentNumber === issueRecord.issueNumber ||
      entry.reference === issueRecord.issueNumber
    );
    assert(productionJournals.length >= 1, 'production journal entry did not persist');

    const retryResponse = await request<{ success?: boolean; goodsIssueRecord?: { id: string; idempotencyKey?: string } }>(`/api/v1/mfg/work-orders/${workOrderId}/issue-materials`, {
      method: 'POST',
      headers: inventoryHeaders,
      body: JSON.stringify({
        issueType: 'MANUAL_STAGING',
        items: [{ componentSku: 'HW-SRV-01', quantity: 1 }],
        idempotencyKey: issueKey
      })
    });
    assert(retryResponse.status === 200 && retryResponse.body.success !== false && retryResponse.body.goodsIssueRecord?.id === issueRecord.id, `duplicate retry produced a different durable result: ${JSON.stringify(retryResponse.body)}`);

    const retryQuants = await request<Array<{ itemSku: string; qtyAvailable: number }>>(`/api/v1/inventory/quants`, { headers: inventoryHeaders });
    const retryQty = retryQuants.body.find(quant => quant.itemSku === 'HW-SRV-01')?.qtyAvailable ?? 0;
    assert(retryQty === currentQty, 'duplicate retry changed inventory stock');

    const concurrentPayload = JSON.stringify({ issueType: 'MANUAL_STAGING', items: [{ componentSku: 'HW-SRV-01', quantity: 1 }], idempotencyKey: issueKey });
    const concurrentRequests = await Promise.all([
      request<{ success?: boolean; goodsIssueRecord?: { id: string; idempotencyKey?: string } }>(`/api/v1/mfg/work-orders/${workOrderId}/issue-materials`, {
        method: 'POST',
        headers: inventoryHeaders,
        body: concurrentPayload
      }),
      request<{ success?: boolean; goodsIssueRecord?: { id: string; idempotencyKey?: string } }>(`/api/v1/mfg/work-orders/${workOrderId}/issue-materials`, {
        method: 'POST',
        headers: inventoryHeaders,
        body: concurrentPayload
      }),
      request<{ success?: boolean; goodsIssueRecord?: { id: string; idempotencyKey?: string } }>(`/api/v1/mfg/work-orders/${workOrderId}/issue-materials`, {
        method: 'POST',
        headers: inventoryHeaders,
        body: concurrentPayload
      })
    ]);
    const concurrentIds = concurrentRequests
      .map(response => response.body.goodsIssueRecord?.id)
      .filter((value): value is string => typeof value === 'string');
    assert(concurrentIds.length >= 1, 'all concurrent duplicates were rejected');
    assert(new Set(concurrentIds).size === 1, `concurrent requests did not resolve to a single durable result: ${JSON.stringify(concurrentIds)}`);

    const finalQuants = await request<Array<{ itemSku: string; qtyAvailable: number }>>(`/api/v1/inventory/quants`, { headers: inventoryHeaders });
    const finalQty = finalQuants.body.find(quant => quant.itemSku === 'HW-SRV-01')?.qtyAvailable ?? 0;
    assert(finalQty === currentQty, 'concurrent retry changed inventory after the winning result');

    const finalFinancialEvents = await request<Array<{ eventType: string; sourceDocumentNumber?: string }>>(`/api/v1/financial-events`, { headers: inventoryHeaders });
    const finalProductionEvents = finalFinancialEvents.body.filter(event => event.eventType === 'PRODUCTION_GOODS_ISSUE');
    assert(finalProductionEvents.length === productionEvents.length, 'concurrent duplicate production event persisted');

    await stopServer(server);
    server = spawnServer();
    await waitForServer();

    const restartedToken = await login('mfg.release@am-platform.com', 'Inventory@2026!');
    const restartedHeaders = { authorization: `Bearer ${restartedToken}` };

    const restartedWorkOrder = await request<{ success?: boolean; workOrders?: Array<{ id: string; status: string }> }>(`/api/v1/mfg/work-orders`, { headers: restartedHeaders });
    assert(restartedWorkOrder.status === 200 && Array.isArray(restartedWorkOrder.body.workOrders), 'restart lost manufacturing work-order state');
    const persistedWorkOrder = restartedWorkOrder.body.workOrders.find(order => order.id === workOrderId);
    assert(persistedWorkOrder && (persistedWorkOrder.status === 'IN_PROGRESS' || persistedWorkOrder.status === 'RELEASED'), 'work order state did not survive restart');

    const restartedFinancialEvents = await request<Array<{ eventType: string; sourceDocumentNumber?: string }>>(`/api/v1/financial-events`, { headers: restartedHeaders });
    const restartedProductionEvents = restartedFinancialEvents.body.filter(event => event.eventType === 'PRODUCTION_GOODS_ISSUE');
    assert(restartedProductionEvents.length === finalProductionEvents.length, 'financial event did not survive restart');

    const restartedJournals = await request<Array<{ sourceDocumentType?: string; sourceDocumentNumber?: string }>>(`/api/v1/accounting/journals`, { headers: restartedHeaders });
    const restartedProductionJournals = restartedJournals.body.filter(entry => entry.sourceDocumentType === 'ProductionGoodsIssue');
    assert(restartedProductionJournals.length >= 1, 'journal did not survive restart');

    const restartedQuants = await request<Array<{ itemSku: string; qtyAvailable: number }>>(`/api/v1/inventory/quants`, { headers: restartedHeaders });
    const restartedQty = restartedQuants.body.find(quant => quant.itemSku === 'HW-SRV-01')?.qtyAvailable ?? 0;
    assert(restartedQty === finalQty, 'inventory stock did not survive restart');

    console.log('PASS: real manufacturing HTTP transaction boundary, duplicate retry, concurrency, and restart persistence proof');
  } finally {
    if (server && server.pid) {
      await stopServer(server);
    }
    await cleanup();
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
});
