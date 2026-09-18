import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { ApiClient } from '../../services/apiClient';
import { usePlatform } from '../../context/PlatformContext';

type ReconciliationLine = {
  module: string;
  period: string;
  opening: number | null;
  movements: number | null;
  adjustments: number | null;
  subledgerBalance: number | null;
  glBalance: number | null;
  difference: number | null;
  status: 'COMPLETED' | 'EXCEPTION' | 'PENDING';
  lastUpdated: string;
  source: string;
};

const labels: Record<string, { en: string; ar: string }> = {
  AR: { en: 'Accounts Receivable', ar: 'حسابات العملاء' },
  AP: { en: 'Accounts Payable', ar: 'حسابات الموردين' },
  INVENTORY: { en: 'Inventory', ar: 'المخزون' },
  ASSETS: { en: 'Fixed Assets', ar: 'الأصول الثابتة' },
  BANK: { en: 'Bank', ar: 'البنوك' },
  TAX: { en: 'Tax', ar: 'الضرائب' },
  PAYROLL: { en: 'Payroll', ar: 'الرواتب' },
  OPENING_BALANCES: { en: 'Opening Balances', ar: 'الأرصدة الافتتاحية' }
};

export const ReconciliationCenter: React.FC = () => {
  const { lang, activeCompany } = usePlatform();
  const isAr = lang === 'ar';
  const [rows, setRows] = useState<ReconciliationLine[]>([]);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const report = await ApiClient.getReconciliationReport({
        companyId: activeCompany?.id || 'comp-001',
        period
      });
      setRows(Array.isArray(report?.modules) ? report.modules : []);
    } catch (err: any) {
      setError(err?.message || (isAr ? 'تعذر تحميل المطابقة' : 'Unable to load reconciliation'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period, activeCompany?.id]);

  const format = (value: number | null) => value === null ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const completed = rows.filter(row => row.status === 'COMPLETED').length;
  const exceptions = rows.filter(row => row.status === 'EXCEPTION').length;
  const pending = rows.filter(row => row.status === 'PENDING').length;
  const difference = rows.reduce((total, row) => total + (row.difference === null ? 0 : Math.abs(row.difference)), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{isAr ? 'مركز المطابقة' : 'Reconciliation Center'}</h2>
          <p className="text-xs text-slate-500">{isAr ? 'مطابقة أرصدة الدفاتر الفرعية مع الأستاذ العام من البيانات المحفوظة.' : 'Reconcile subledger balances against the general ledger using persisted data.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={period} onChange={event => setPeriod(event.target.value)} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs" />
          <button onClick={load} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> {isAr ? 'تحديث' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-xs">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          [isAr ? 'مكتمل' : 'Completed', completed, 'text-emerald-600'],
          [isAr ? 'استثناءات' : 'Exceptions', exceptions, 'text-rose-600'],
          [isAr ? 'قيد الانتظار' : 'Pending', pending, 'text-amber-600'],
          [isAr ? 'إجمالي الفروقات' : 'Difference Amount', format(difference), 'text-slate-900 dark:text-white']
        ].map(([label, value, color]) => (
          <div key={String(label)} className="report-card rounded-xl p-4">
            <div className="text-[11px] text-slate-500">{label}</div>
            <div className={`text-xl font-bold mt-1 ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="report-card rounded-xl overflow-x-auto">
        {loading ? <div className="p-8 text-center text-xs text-slate-500">{isAr ? 'جاري التحميل...' : 'Loading...'}</div> : (
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500">
              <tr>{[isAr ? 'الوحدة' : 'Module', isAr ? 'الفترة' : 'Period', isAr ? 'الرصيد الفرعي' : 'Subledger Balance', 'GL', isAr ? 'الفرق' : 'Difference', isAr ? 'الحالة' : 'Status', isAr ? 'آخر تحديث' : 'Last Updated'].map(header => <th key={header} className="px-4 py-3 text-left rtl:text-right whitespace-nowrap">{header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const label = labels[row.module] || { en: row.module, ar: row.module };
                return <tr key={row.module} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-3 font-semibold">{isAr ? label.ar : label.en}</td>
                  <td className="px-4 py-3">{row.period}</td>
                  <td className="px-4 py-3">{format(row.subledgerBalance)}</td>
                  <td className="px-4 py-3">{format(row.glBalance)}</td>
                  <td className={`px-4 py-3 font-semibold ${row.difference === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{format(row.difference)}</td>
                  <td className="px-4 py-3"><span className="inline-flex items-center gap-1">{row.status === 'COMPLETED' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : row.status === 'EXCEPTION' ? <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> : <Clock3 className="w-3.5 h-3.5 text-amber-600" />}{row.status}</span></td>
                  <td className="px-4 py-3 text-slate-500">{new Date(row.lastUpdated).toLocaleString()}</td>
                </tr>;
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="text-[11px] text-slate-500">{isAr ? 'لا يتم إنشاء قيود تسوية تلقائية. أي فرق ظاهر يحتاج مراجعة وإجراءً محاسبياً مصرحاً.' : 'No automatic balancing journal is created. Any difference remains visible for an authorized accounting action.'}</div>
    </div>
  );
};
