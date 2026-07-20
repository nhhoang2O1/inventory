import React, { useEffect, useState } from 'react';
import { apiGet, ApiError } from '../apiClient';

interface DashboardViewProps { actorId: string; warehouseId: string; pendingApprovalsCount: number; }
interface DashboardData { inventory?: Record<string, number>; alerts?: Record<string, number>; reportRunId?: string; sourceCutoff?: string; }

export function DashboardView({ actorId, warehouseId, pendingApprovalsCount }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!actorId || !warehouseId) return;
    const date = new Date().toISOString().slice(0, 10);
    void apiGet<DashboardData>(`/reports/dashboard?warehouseId=${encodeURIComponent(warehouseId)}&businessDate=${date}`, { actorId })
      .then(setData).catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Không tải được dashboard'));
  }, [actorId, warehouseId]);
  const inventory = data?.inventory || {};
  const cards: Array<[string, unknown]> = [['Tổng tồn (case)', inventory.totalCases], ['ATP khả dụng', inventory.availableCases], ['Chờ duyệt', pendingApprovalsCount], ['Cận hạn', inventory.nearExpiryCases]];
  return <div className="max-w-7xl mx-auto flex flex-col gap-6"><div className="flex justify-between items-end"><div><h2 className="font-headline-md text-primary font-bold">Dashboard vận hành</h2><p className="text-on-surface-variant">Số liệu đọc từ Reporting Core theo kho đang chọn.</p></div>{data?.sourceCutoff && <span className="text-xs font-data-mono">cutoff {data.sourceCutoff}</span>}</div>{error && <div className="bg-error-container text-on-error-container p-3 rounded text-xs">{error}</div>}<div className="grid grid-cols-1 md:grid-cols-4 gap-4">{cards.map(([label, value]) => <div key={label} className="bg-white border rounded-xl p-4"><div className="text-xs font-bold text-on-surface-variant">{label}</div><div className="mt-4 text-3xl text-primary font-bold font-data-mono">{typeof value === 'number' ? value.toLocaleString() : '—'}</div></div>)}</div><div className="bg-white border rounded-xl overflow-hidden"><div className="p-4 bg-surface-container border-b font-bold text-primary">Alerts &amp; work queue</div><table className="w-full text-left text-xs"><thead className="bg-surface-container-low"><tr><th className="p-3">Metric</th><th className="p-3 text-right">Count</th></tr></thead><tbody>{Object.entries(data?.alerts || {}).map(([name, count]) => <tr key={name} className="border-b"><td className="p-3">{name}</td><td className="p-3 text-right font-data-mono font-bold">{count}</td></tr>)}</tbody></table></div>{data?.reportRunId && <p className="text-[11px] font-data-mono">reportRunId: {data.reportRunId}</p>}</div>;
}
