import { ReconciliationEngine } from '../src/engine/reconciliationEngine';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

const report = ReconciliationEngine.generateReport({
  tenantId: 'ten-001',
  companyId: 'comp-001',
  period: '2026-09',
  accounts: [],
  openingBalances: [{ tenantId: 'ten-001', companyId: 'comp-001', period: '2026-01', amount: 100 }],
  financialEvents: [{ tenantId: 'ten-001', companyId: 'comp-001', postingDate: '2026-09-10', amount: 0 }],
  journalEntries: [
    {
      tenantId: 'ten-001',
      companyId: 'comp-001',
      postingDate: '2026-09-10',
      lines: [
        { accountCode: '1020', debit: 100, credit: 0 },
        { accountCode: '2010', debit: 0, credit: 80 },
        { accountCode: '1030', debit: 50, credit: 0 },
        { accountCode: '1040', debit: 10, credit: 0 },
        { accountCode: '2020', debit: 0, credit: 20 }
      ]
    },
    { tenantId: 'ten-002', companyId: 'comp-001', postingDate: '2026-09-10', lines: [{ accountCode: '1020', debit: 999, credit: 0 }] },
    { tenantId: 'ten-001', companyId: 'comp-001', postingDate: '2026-08-10', lines: [{ accountCode: '1020', debit: 500, credit: 0 }] }
  ],
  customers: [{ tenantId: 'ten-001', companyId: 'comp-001', balance: 100 }],
  vendors: [{ tenantId: 'ten-001', companyId: 'comp-001', balance: 80 }],
  inventory: [{ tenantId: 'ten-001', companyId: 'comp-001', stockQty: 6, costPrice: 10 }],
  fixedAssets: [],
  banks: [],
  invoices: [{ tenantId: 'ten-001', companyId: 'comp-001', postingDate: '2026-09-10', grandTotal: 100 }],
  purchaseInvoices: [{ tenantId: 'ten-001', companyId: 'comp-001', postingDate: '2026-09-10', grandTotal: 80 }],
  payrollRuns: []
});

const byModule = (module: string) => report.modules.find(line => line.module === module)!;

assert(byModule('AR').status === 'COMPLETED', 'AR uses the scoped period journal and subledger');
assert(byModule('AP').status === 'COMPLETED', 'AP uses the scoped period journal and subledger');
assert(byModule('INVENTORY').status === 'EXCEPTION', 'inventory difference remains visible');
assert(byModule('ASSETS').status === 'PENDING', 'asset reconciliation is pending without a persisted asset source');
assert(byModule('BANK').status === 'PENDING', 'bank reconciliation is pending without a persisted bank source');
assert(byModule('PAYROLL').status === 'PENDING', 'payroll is pending without a persisted payroll source');
assert(byModule('PAYROLL').subledgerBalance === null, 'missing payroll data is not represented as zero');
assert(byModule('INVENTORY').difference === 10, 'inventory difference is reported without auto-balancing');
assert(byModule('AR').glBalance === 100, 'company and period isolation exclude unrelated journals');
assert(byModule('OPENING_BALANCES').status === 'COMPLETED', 'opening balance comes from a persisted accounting source');

console.log('PASS: reconciliation report is source-aware, scoped, and explicit about missing data');
