import React, { useEffect, useState } from 'react';
import { FinancialSubTab } from '../types';

interface FinancialViewProps {
  financialSubTab: FinancialSubTab;
  setFinancialSubTab: (tab: FinancialSubTab) => void;
  actorId: string;
  warehouseId: string;
}

const tabs: Array<[FinancialSubTab, string]> = [
  ['valuation', 'Giá trị tồn kho'],
  ['deposit', 'Vỏ két / tiền cọc'],
  ['leadtime', 'Lead time nhà cung cấp'],
  ['reconciliation', 'Đối soát hoạt động'],
  ['loss', 'Chất lượng / thu hồi'],
  ['planning', 'Chạy planning ROP']
];
const correlation = () => crypto.randomUUID();

export function FinancialView({ financialSubTab, setFinancialSubTab, actorId, warehouseId }: FinancialViewProps) {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!actorId || !warehouseId) return;
    setError(null);
    if (financialSubTab === 'deposit') {
      setData({ status: 'PENDING_POLICY', message: 'D-005: nghiệp vụ vỏ két/tiền cọc còn chờ quyết định nghiệp vụ và endpoint chính thức.' });
      return;
    }
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const from = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    let url = '';
    if (financialSubTab === 'valuation') url = `/api/v1/reports/inventory-value?warehouseId=${encodeURIComponent(warehouseId)}`;
    if (financialSubTab === 'reconciliation') url = `/api/v1/reports/inventory-activity?warehouseId=${encodeURIComponent(warehouseId)}&from=${from}&to=${to}`;
    if (financialSubTab === 'loss') url = `/api/v1/reports/quality-recall?warehouseId=${encodeURIComponent(warehouseId)}&from=${from}&to=${to}`;
    if (financialSubTab === 'leadtime') url = '/api/v1/suppliers';
    if (financialSubTab === 'planning') url = '/api/v1/planning/policies';
    setLoading(true);
    void fetch(url, { credentials: 'include', headers: { 'X-Correlation-Id': correlation() } })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Không tải được dữ liệu tài chính');
        setData(body);
      })
      .catch((reason) => { setData(null); setError(reason instanceof Error ? reason.message : 'Không tải được dữ liệu tài chính'); })
      .finally(() => setLoading(false));
  }, [actorId, warehouseId, financialSubTab]);

  const runPlanning = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/planning/runs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${crypto.randomUUID()}-${Date.now()}`, 'X-Correlation-Id': correlation() },
        body: JSON.stringify({ warehouseId, businessDate: new Date().toISOString().slice(0, 10) })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Không thể chạy planning');
      setData(body);
      setError('Đã chạy planning và lưu kết quả qua API.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể chạy planning');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div><h2 className="font-headline-md text-primary font-bold">Tài chính &amp; vận hành kho</h2><p className="text-on-surface-variant">Số liệu và lệnh planning lấy từ Reporting/Purchasing Core.</p></div>
      <div className="flex border-b border-outline-variant overflow-x-auto text-xs font-semibold gap-1">
        {tabs.map(([tab, label]) => <button key={tab} onClick={() => setFinancialSubTab(tab)} className={`px-4 py-2 border-b-2 whitespace-nowrap ${financialSubTab === tab ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant'}`}>{label}</button>)}
      </div>
      {error && <div className={`${error.startsWith('Đã') ? 'bg-tertiary-container/20 text-on-tertiary-container' : 'bg-error-container text-on-error-container'} p-3 rounded text-sm`}>{error}</div>}
      {financialSubTab === 'planning' && <button onClick={runPlanning} disabled={loading} className="px-4 py-2 bg-primary text-on-primary rounded disabled:opacity-40">Chạy planning hôm nay</button>}
      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden">
        {loading ? <div className="p-8 text-center text-on-surface-variant">Đang tải…</div> :
          data ? <pre className="p-4 text-xs font-data-mono overflow-auto max-h-[560px] whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre> :
          <div className="p-8 text-center text-on-surface-variant">Chưa có dữ liệu.</div>}
      </div>
    </div>
  );
}
