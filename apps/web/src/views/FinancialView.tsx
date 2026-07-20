import React, { useEffect, useState } from 'react';
import { FinancialSubTab } from '../types';
import { apiCommand, apiGet, ApiError } from '../apiClient';

interface FinancialViewProps {
  financialSubTab: FinancialSubTab;
  setFinancialSubTab: (tab: FinancialSubTab) => void;
  actorId: string;
  warehouseId: string;
}
interface Supplier { id: string; code: string; name: string; }
interface ReportData { [key: string]: any; }

const tabs: Array<[FinancialSubTab, string]> = [
  ['valuation', 'Giá trị tồn kho'], ['deposit', 'Vỏ két / tiền cọc'],
  ['leadtime', 'Supplier KPI'], ['reconciliation', 'Đối soát hoạt động'],
  ['loss', 'Chất lượng / thu hồi'], ['planning', 'Planning ROP']
];

export function FinancialView({ financialSubTab, setFinancialSubTab, actorId, warehouseId }: FinancialViewProps) {
  const [data, setData] = useState<ReportData | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!actorId) return;
    void apiGet<Supplier[]>('/suppliers', { actorId }).then((items) => {
      setSuppliers(items);
      if (!supplierId && items[0]) setSupplierId(items[0].id);
    }).catch(() => undefined);
  }, [actorId, supplierId]);

  useEffect(() => {
    if (!actorId || !warehouseId) return;
    setError(null); setMessage(null);
    if (financialSubTab === 'deposit') {
      setData({ status: 'BLOCKED', reason: 'D-005 deposit/vỏ két chưa có policy và ledger contract chính thức.' });
      return;
    }
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const from = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    let path: string | null = null;
    if (financialSubTab === 'valuation') path = `/reports/inventory-value?warehouseId=${encodeURIComponent(warehouseId)}`;
    if (financialSubTab === 'reconciliation') path = `/reports/inventory-activity?warehouseId=${encodeURIComponent(warehouseId)}&from=${from}&to=${to}`;
    if (financialSubTab === 'loss') path = `/reports/quality-recall?warehouseId=${encodeURIComponent(warehouseId)}&from=${from}&to=${to}`;
    if (financialSubTab === 'planning') path = `/planning/policies?warehouseId=${encodeURIComponent(warehouseId)}`;
    if (financialSubTab === 'leadtime' && supplierId) path = `/reports/supplier-kpi?supplierId=${encodeURIComponent(supplierId)}&from=${from}&to=${to}&timezone=Asia%2FHo_Chi_Minh`;
    if (!path) return;
    setLoading(true);
    void apiGet<ReportData>(path, { actorId }).then(setData).catch((reason) => {
      setData(null); setError(reason instanceof ApiError ? reason.message : 'Không tải được dữ liệu báo cáo');
    }).finally(() => setLoading(false));
  }, [actorId, warehouseId, financialSubTab, supplierId]);

  const runPlanning = async () => {
    setLoading(true); setError(null); setMessage(null);
    try {
      const run = await apiCommand<ReportData>('/planning/runs', 'POST', { warehouseId, businessDate: new Date().toISOString().slice(0, 10) }, actorId);
      setData(run); setMessage('Đã chạy planning và lưu kết quả qua API.');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Không thể chạy planning');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div><h2 className="font-headline-md text-primary font-bold">Tài chính &amp; vận hành kho</h2><p className="text-on-surface-variant">Báo cáo dùng typed fields từ Reporting/Planning Core; không hiển thị JSON raw.</p></div>
      <div className="flex border-b border-outline-variant overflow-x-auto text-xs font-semibold gap-1">{tabs.map(([tab, label]) => <button key={tab} onClick={() => setFinancialSubTab(tab)} className={`px-4 py-2 border-b-2 whitespace-nowrap ${financialSubTab === tab ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant'}`}>{label}</button>)}</div>
      {financialSubTab === 'leadtime' && <select className="border rounded p-2 text-xs" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">-- Chọn supplier --</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} · {supplier.name}</option>)}</select>}
      {error && <div className="bg-error-container text-on-error-container p-3 rounded text-sm">{error}</div>}
      {message && <div className="bg-tertiary-container/20 text-on-tertiary-container p-3 rounded text-sm">{message}</div>}
      {financialSubTab === 'planning' && <button onClick={() => void runPlanning()} disabled={loading} className="px-4 py-2 bg-primary text-on-primary rounded disabled:opacity-40">Chạy planning hôm nay</button>}
      <div className="bg-white border border-outline-variant rounded-xl overflow-auto">
        {loading ? <div className="p-8 text-center text-on-surface-variant">Đang tải…</div> : financialSubTab === 'deposit' ? <div className="p-8 text-center"><span className="font-bold text-error">BLOCKED</span><p className="text-xs mt-2">{data?.reason}</p></div> : data ? <TypedReport tab={financialSubTab} data={data} /> : <div className="p-8 text-center text-on-surface-variant">Chưa có dữ liệu.</div>}
      </div>
    </div>
  );
}

function TypedReport({ tab, data }: { tab: FinancialSubTab; data: ReportData }) {
  if (tab === 'valuation') return <><div className="grid grid-cols-3 gap-3 p-4 text-xs"><Metric label="Total value" value={data.totalValue} /><Metric label="Valued cases" value={data.valuedCases} /><Metric label="Unvalued cases" value={data.unvaluedCases} /></div><Table headers={['SKU', 'Batch', 'Status', 'Qty', 'Unit cost', 'Value']} rows={(data.items || []).map((item: any) => [item.skuCode, item.batchCode, item.valuationStatus, item.quantityOnHand, item.unitCost, item.inventoryValue])} /></>;
  if (tab === 'reconciliation') return <Table headers={['Movement', 'Document', 'SKU', 'Qty', 'Occurred']} rows={(data.movements || []).map((item: any) => [item.movementType, item.documentType, item.skuId, item.quantity, item.occurredAt])} />;
  if (tab === 'loss') return <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 text-xs"><Section title="Quality cases" rows={data.qualityCases} /><Section title="Returns" rows={data.returns} /><Section title="Recalls" rows={data.recalls} /></div>;
  if (tab === 'leadtime') return <><div className="grid grid-cols-4 gap-3 p-4 text-xs"><Metric label="OTD %" value={data.kpi?.otdPercent} /><Metric label="Fill rate %" value={data.kpi?.fillRatePercent} /><Metric label="Damage %" value={data.kpi?.damageRatePercent} /><Metric label="Return %" value={data.kpi?.returnRatePercent} /></div><Table headers={['PO', 'SKU', 'Ordered', 'Accepted', 'On time']} rows={(data.drilldown || []).map((item: any) => [item.poCode, item.skuId, item.orderedQuantity, item.acceptedTotal, item.onTime ? 'Yes' : 'No'])} /></>;
  if (tab === 'planning') return <Table headers={['SKU', 'Supplier', 'Lead time', 'Safety stock', 'Status']} rows={(Array.isArray(data) ? data : data.policies || []).map((item: any) => [item.skuId, item.supplierId, item.leadTimeDays, item.safetyStockQuantity, item.status])} />;
  return <div className="p-4 text-xs">Report không có dữ liệu trình bày.</div>;
}
function Metric({ label, value }: { label: string; value: unknown }) { return <div className="border rounded p-3"><div className="text-on-surface-variant">{label}</div><div className="font-data-mono font-bold text-lg">{String(value ?? 0)}</div></div>; }
function Table({ headers, rows }: { headers: string[]; rows: unknown[][] }) { return <table className="w-full text-left text-xs"><thead className="bg-surface-container border-b"><tr>{headers.map((header) => <th key={header} className="p-3">{header}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-b">{row.map((cell, j) => <td key={j} className="p-3 font-data-mono">{String(cell ?? '—')}</td>)}</tr>)}{!rows.length && <tr><td colSpan={headers.length} className="p-8 text-center text-on-surface-variant">Không có dữ liệu.</td></tr>}</tbody></table>; }
function Section({ title, rows }: { title: string; rows: any[] }) { return <div className="border rounded p-3"><h4 className="font-bold mb-2">{title}</h4>{(rows || []).map((row, i) => <div key={i} className="border-t py-2">{Object.entries(row).map(([key, value]) => <div key={key}><span className="text-on-surface-variant">{key}: </span>{String(value)}</div>)}</div>)}</div>; }
