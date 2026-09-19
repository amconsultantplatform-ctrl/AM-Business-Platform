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
  openingBalances: [
    { tenantId: 'ten-001', companyId: 'comp-001', module: 'AR', effectiveDate: '2026-01-01', amount: 25 },
    { tenantId: 'ten-001', companyId: 'comp-001', module: 'AP', effectiveDate: '2026-01-01', amount: 0 },
    { tenantId: 'ten-001', companyId: 'comp-001', module: 'INVENTORY', effectiveDate: '2026-01-01', amount: 0 },
    { tenantId: 'ten-001', companyId: 'comp-001', module: 'OPENING_BALANCES', effectiveDate: '2026-01-01', amount: 100 }
  ],
  financialEvents: [{ tenantId: 'ten-001', companyId: 'comp-001', module: 'INVENTORY', postingDate: '2026-09-10', amount: 50 }],
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
    { tenantId: 'ten-001', companyId: 'comp-001', postingDate: '2026-08-10', lines: [{ accountCode: '1020', debit: 500, credit: 0 }] },
    { tenantId: 'ten-001', companyId: 'comp-001', postingDate: '2026-10-10', lines: [{ accountCode: '1020', debit: 700, credit: 0 }] },
    { companyId: 'comp-001', postingDate: '2026-09-10', lines: [{ accountCode: '1020', debit: 800, credit: 0 }] },
    { tenantId: 'ten-001', companyId: 'comp-001', lines: [{ accountCode: '1020', debit: 900, credit: 0 }] }
  ],
  customers: [{ tenantId: 'ten-001', companyId: 'comp-001', postingDate: '2026-09-15', balance: 125 }],
  vendors: [{ tenantId: 'ten-001', companyId: 'comp-001', postingDate: '2026-09-15', balance: 80 }],
  inventory: [{ tenantId: 'ten-001', companyId: 'comp-001', postingDate: '2026-09-15', stockQty: 6, costPrice: 10 }],
  fixedAssets: [],
  banks: [],
  invoices: [
    { tenantId: 'ten-001', companyId: 'comp-001', postingDate: '2026-09-10', grandTotal: 100 },
    { tenantId: 'ten-001', companyId: 'comp-001', postingDate: '2026-10-10', grandTotal: 900 }
  ],
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
assert(byModule('INVENTORY').movements === 50, 'inventory movement uses the explicitly tagged canonical event');
assert(byModule('INVENTORY').closing === 50, 'inventory closing is opening plus movements plus adjustments');
assert(byModule('AR').glBalance === 125, 'GL balance includes the scoped opening balance and period journal');
assert(byModule('AR').movements === 100, 'AR movement uses only the requested period');
assert(byModule('AR').opening === 25, 'AR opening is module-specific at period start');
assert(byModule('AR').closing === 125, 'AR closing is opening plus movements plus adjustments');
assert(byModule('AR').status === 'COMPLETED', 'AR reconciles closing subledger balance to opening plus GL movement');
assert(byModule('OPENING_BALANCES').status === 'COMPLETED', 'opening balance comes from a persisted accounting source');
assert(byModule('OPENING_BALANCES').opening === 100, 'opening balance excludes later-period and undated records');

console.log('PASS: reconciliation report is source-aware, scoped, and explicit about missing data');
