import React, { useEffect, useState } from 'react';

interface DashboardViewProps {
  actorId: string;
  warehouseId: string;
  pendingApprovalsCount: number;
}

interface DashboardData {
  inventory?: {
    totalCases?: number;
    availableCases?: number;
    blockedCases?: number;
    quarantinedCases?: number;
    damagedCases?: number;
    expiredCases?: number;
    nearExpiryCases?: number;
  };
  alerts?: Record<string, number>;
  reportRunId?: string;
  sourceCutoff?: string;
}

export function DashboardView({ actorId, warehouseId, pendingApprovalsCount }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!actorId || !warehouseId) return;
    const date = new Date().toISOString().slice(0, 10);
    void fetch(`/api/v1/reports/dashboard?warehouseId=${encodeURIComponent(warehouseId)}&businessDate=${date}`, {
      credentials: 'include',
      headers: { 'X-Correlation-Id': crypto.randomUUID() }
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Không tải được dashboard');
      setData(result);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Không tải được dashboard'));
  }, [actorId, warehouseId]);

  const inventory = data?.inventory || {};
  const cards = [
    ['Tổng tồn (case)', inventory.totalCases ?? '—', 'inventory_2'],
    ['ATP khả dụng', inventory.availableCases ?? '—', 'check_circle'],
    ['Chờ duyệt', pendingApprovalsCount, 'rule'],
    ['Cận hạn', inventory.nearExpiryCases ?? '—', 'warning']
  ];
  const alerts = Object.entries(data?.alerts || {});

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="font-headline-md text-primary font-bold">Dashboard vận hành</h2>
          <p className="text-on-surface-variant">Số liệu được đọc từ Reporting Core theo kho đang chọn.</p>
        </div>
        {data?.sourceCutoff && <span className="text-xs text-on-surface-variant font-data-mono">cutoff {data.sourceCutoff}</span>}
      </div>

      {error && <div className="bg-error-container text-on-error-container p-3 rounded border border-error/20">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {cards.map(([label, value, icon]) => (
          <div key={label} className="bg-white border border-outline-variant rounded-xl p-4">
            <div className="flex justify-between text-xs text-on-surface-variant font-bold"><span>{label}</span><span className="material-symbols-outlined text-secondary">{icon}</span></div>
            <div className="mt-4 text-3xl text-primary font-bold font-data-mono">{typeof value === 'number' ? value.toLocaleString() : value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden">
        <div className="p-4 bg-surface-container border-b border-outline-variant">
          <h3 className="font-bold text-primary">Cảnh báo và công việc cần xử lý</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-container-low text-xs text-on-surface-variant"><tr><th className="p-3">Chỉ tiêu</th><th className="p-3 text-right">Số lượng</th></tr></thead>
          <tbody>
            {alerts.map(([name, count]) => <tr key={name} className="border-b border-outline-variant"><td className="p-3">{name}</td><td className="p-3 text-right font-data-mono font-bold">{count}</td></tr>)}
            {!alerts.length && <tr><td colSpan={2} className="p-6 text-center text-on-surface-variant">Chưa có cảnh báo hoặc chưa tải được dữ liệu.</td></tr>}
          </tbody>
        </table>
      </div>
      {data?.reportRunId && <p className="text-[11px] text-on-surface-variant font-data-mono">reportRunId: {data.reportRunId}</p>}
    </div>
  );
}
