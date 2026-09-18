export type ReconciliationModule =
  | 'AR'
  | 'AP'
  | 'INVENTORY'
  | 'ASSETS'
  | 'BANK'
  | 'TAX'
  | 'PAYROLL'
  | 'OPENING_BALANCES';

export type ReconciliationStatus = 'COMPLETED' | 'EXCEPTION' | 'PENDING';

export interface ReconciliationLine {
  module: ReconciliationModule;
  period: string;
  companyId: string;
  branchId?: string;
  opening: number | null;
  movements: number | null;
  adjustments: number | null;
  subledgerBalance: number | null;
  glBalance: number | null;
  difference: number | null;
  status: ReconciliationStatus;
  lastUpdated: string;
  source: string;
  exception?: string;
}

export interface ReconciliationReport {
  period: string;
  companyId: string;
  generatedAt: string;
  modules: ReconciliationLine[];
}

type SourceRecord = object;
type RecordShape = Record<string, unknown>;

function numeric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function periodBounds(period: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new Error(`Invalid reconciliation period '${period}'. Expected YYYY-MM.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid reconciliation month '${period}'.`);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start: `${match[1]}-${match[2]}-01`, end };
}

function entityScope(records: SourceRecord[], tenantId: string | undefined, companyId: string): SourceRecord[] {
  return records.filter(record => {
    const value = record as RecordShape;
    const recordCompany = value.companyId ?? value.company_id;
    const recordTenant = value.tenantId ?? value.tenant_id;
    return recordCompany === companyId && (tenantId === undefined || recordTenant === tenantId);
  });
}

function recordDate(record: SourceRecord): string | undefined {
  const value = record as RecordShape;
  const raw = value.postingDate ?? value.date ?? value.effectiveDate ?? value.createdAt ?? value.updatedAt;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(raw)) return undefined;
  return raw.slice(0, 10);
}

function datedRecords(records: SourceRecord[], period: string): SourceRecord[] {
  const { start, end } = periodBounds(period);
  return records.filter(record => {
    const date = recordDate(record);
    return date !== undefined && date >= start && date <= end;
  });
}

function sumField(records: SourceRecord[], fields: string[]): number | undefined {
  if (records.length === 0) return undefined;
  let total = 0;
  for (const record of records) {
    const value = fields.map(field => numeric((record as RecordShape)[field])).find(value => value !== undefined);
    if (value === undefined) return undefined;
    total += value;
  }
  return rounded(total);
}

function journalBalance(journalEntries: SourceRecord[], codes: string[], normalBalance: 'debit' | 'credit' = 'debit'): number | undefined {
  if (journalEntries.length === 0) return undefined;
  let total = 0;
  for (const entry of journalEntries) {
    const lines = Array.isArray((entry as RecordShape).lines) ? (entry as RecordShape).lines as SourceRecord[] : [];
    for (const line of lines) {
      const value = line as RecordShape;
      if (!codes.includes(String(value.accountCode ?? value.code))) continue;
      const debit = numeric(value.debit);
      const credit = numeric(value.credit);
      if (debit === undefined || credit === undefined) return undefined;
      total += normalBalance === 'debit' ? debit - credit : credit - debit;
    }
  }
  return rounded(total);
}

function line(
  module: ReconciliationModule,
  period: string,
  companyId: string,
  opening: number | undefined,
  movements: number | undefined,
  subledgerBalance: number | undefined,
  gl: number | undefined,
  source: string,
  exception?: string,
  requireMovements = true
): ReconciliationLine {
  const complete = [opening, subledgerBalance, gl, ...(requireMovements ? [movements] : [])].every(value => value !== undefined);
  const difference = subledgerBalance !== undefined && gl !== undefined
    ? rounded(subledgerBalance - gl)
    : null;
  return {
    module,
    period,
    companyId,
    opening: opening === undefined ? null : rounded(opening),
    movements: movements === undefined ? null : rounded(movements),
    adjustments: null,
    subledgerBalance: subledgerBalance === undefined ? null : rounded(subledgerBalance),
    glBalance: gl === undefined ? null : rounded(gl),
    difference,
    status: exception ? 'PENDING' : !complete ? 'PENDING' : Math.abs(difference || 0) < 0.01 ? 'COMPLETED' : 'EXCEPTION',
    lastUpdated: new Date().toISOString(),
    source,
    ...(exception || !complete ? { exception: exception || 'A persisted source is missing or contains an invalid amount.' } : {})
  };
}

export class ReconciliationEngine {
  static generateReport(params: {
    tenantId?: string;
    companyId: string;
    period: string;
    accounts?: SourceRecord[];
    journalEntries?: SourceRecord[];
    financialEvents?: SourceRecord[];
    openingBalances?: SourceRecord[];
    payrollRuns?: SourceRecord[];
    customers: SourceRecord[];
    vendors: SourceRecord[];
    inventory: SourceRecord[];
    fixedAssets: SourceRecord[];
    banks: SourceRecord[];
    invoices: SourceRecord[];
    purchaseInvoices: SourceRecord[];
  }): ReconciliationReport {
    const { tenantId, companyId, period } = params;
    periodBounds(period);
    const scope = (records: SourceRecord[] = []) => entityScope(records, tenantId, companyId);
    const periodSource = (records: SourceRecord[] = []) => datedRecords(scope(records), period);
    const journals = periodSource(params.journalEntries);
    const { start } = periodBounds(period);
    const openingRecords = scope(params.openingBalances).filter(record => {
      const value = record as RecordShape;
      const date = recordDate(record);
      return date !== undefined && date < start && String(value.module ?? '') !== '';
    });
    const openingFor = (module: ReconciliationModule): number | undefined =>
      sumField(openingRecords.filter(record => String((record as RecordShape).module) === module), ['amount', 'balance', 'openingBalance']);
    const financialEvents = periodSource(params.financialEvents);
    const payroll = periodSource(params.payrollRuns);
    const payrollValue = sumField(payroll, ['netTotal', 'grossTotal', 'total']);

    const customers = periodSource(params.customers);
    const vendors = periodSource(params.vendors);
    const inventory = periodSource(params.inventory);
    const assets = periodSource(params.fixedAssets);
    const banks = periodSource(params.banks);
    const invoices = periodSource(params.invoices);
    const purchaseInvoices = periodSource(params.purchaseInvoices);
    const eventMovements = sumField(financialEvents, ['amount', 'totalAmount']);

    const ar = sumField(customers, ['balance', 'outstandingBalance']);
    const ap = sumField(vendors, ['balance', 'outstandingBalance']);
    const inventoryBalance = inventory.length === 0 ? undefined : inventory.reduce<number | undefined>((total, item) => {
        const value = item as RecordShape;
        const quantity = numeric(value.stockQty ?? value.quantity);
        const cost = numeric(value.costPrice ?? value.unitCost);
      return total === undefined || quantity === undefined || cost === undefined ? undefined : total + quantity * cost;
    }, 0);
    const assetBalance = sumField(assets, ['netBookValue', 'bookValue', 'currentBookValue', 'acquisitionCost']);
    const bankBalance = sumField(banks, ['currentBalance', 'balance', 'availableBalance']);
    const invoiceMovement = sumField(invoices, ['grandTotal', 'totalAmount', 'amount']);
    const purchaseMovement = sumField(purchaseInvoices, ['grandTotal', 'totalAmount', 'amount']);

    const gl = (codes: string[], normalBalance: 'debit' | 'credit' = 'debit') => journalBalance(journals, codes, normalBalance);
    const moduleMovements = (module: ReconciliationModule, fallback: number | undefined): number | undefined => {
      const moduleEvents = financialEvents.filter(event => String((event as RecordShape).module ?? (event as RecordShape).eventType ?? '').toUpperCase().includes(module));
      return moduleEvents.length ? sumField(moduleEvents, ['amount', 'totalAmount']) : fallback;
    };
    const source = (name: string, records: SourceRecord[], extra = '') =>
      `${name}${records.length ? ` (${records.length} persisted record${records.length === 1 ? '' : 's'})` : ''}${extra}`;

    return {
      period,
      companyId,
      generatedAt: new Date().toISOString(),
      modules: [
        line('AR', period, companyId, openingFor('AR'), moduleMovements('AR', invoiceMovement), ar, gl(['1020']), source('AR', customers)),
        line('AP', period, companyId, openingFor('AP'), moduleMovements('AP', purchaseMovement), ap, gl(['2010'], 'credit'), source('AP', vendors)),
        line('INVENTORY', period, companyId, openingFor('INVENTORY'), moduleMovements('INVENTORY', eventMovements), inventoryBalance, gl(['1030', '1200', '1250', '1300']), source('Inventory', inventory)),
        line('ASSETS', period, companyId, openingFor('ASSETS'), moduleMovements('ASSETS', undefined), assetBalance, gl(['1510', '1520', '1530']), source('Assets', assets)),
        line('BANK', period, companyId, openingFor('BANK'), moduleMovements('BANK', undefined), bankBalance, gl(['1010']), source('Bank', banks)),
        line('TAX', period, companyId, openingFor('TAX'), moduleMovements('TAX', undefined), gl(['1040', '2020']), gl(['1040', '2020']), source('Tax', journals)),
        line('PAYROLL', period, companyId, openingFor('PAYROLL'), moduleMovements('PAYROLL', payrollValue), payrollValue, gl(['2100', '2110', '2200'], 'credit'), source('Payroll', payroll)),
        line('OPENING_BALANCES', period, companyId, openingFor('OPENING_BALANCES'), undefined, openingFor('OPENING_BALANCES'), openingFor('OPENING_BALANCES'), source('Opening balances', openingRecords), undefined, false)
      ]
    };
  }
}
