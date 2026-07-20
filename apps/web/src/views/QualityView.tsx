import React, { useCallback, useEffect, useState } from 'react';

interface QualityViewProps { actorId?: string; warehouseId?: string; warehouseCode?: string; }
interface QualityCase {
  id: string; case_code: string; case_line_id: string; sku_code: string; sku_name: string;
  batch_code: string; quantity: number; location_id: string; location_code: string;
  reason: string; status: string; version: number; disposition_type?: string | null;
}
const correlation = () => crypto.randomUUID();

export function QualityView({ actorId, warehouseId }: QualityViewProps) {
  const [cases, setCases] = useState<QualityCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCases = useCallback(async () => {
    if (!actorId || !warehouseId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/quality/cases?warehouseId=${encodeURIComponent(warehouseId)}`, {
        credentials: 'include', headers: { 'X-Correlation-Id': correlation() }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không tải được sự cố chất lượng');
      setCases(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được sự cố chất lượng');
    } finally { setLoading(false); }
  }, [actorId, warehouseId]);

  useEffect(() => { void loadCases(); }, [loadCases]);

  const requestDisposition = async (qualityCase: QualityCase, type: 'RELEASE' | 'DESTROY') => {
    if (!actorId) return;
    setLoading(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/v1/quality/cases/${qualityCase.id}/dispositions`, {
        method: 'POST', credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlation(),
          'Idempotency-Key': `${crypto.randomUUID()}-${Date.now()}`
        },
        body: JSON.stringify({
          dispositionCode: `DSP-${Date.now().toString().slice(-8)}`,
          dispositionType: type,
          reason: type === 'RELEASE' ? 'Quality review requested release' : 'Quality review requested destruction',
          expectedVersion: qualityCase.version,
          destinations: type === 'RELEASE' ? [{ qualityCaseLineId: qualityCase.case_line_id, destinationLocationId: qualityCase.location_id }] : []
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không thể tạo yêu cầu disposition');
      setMessage(`Đã tạo yêu cầu ${data.id || ''}. Người duyệt và người post phải đăng nhập ở phiên riêng.`);
      await loadCases();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo yêu cầu disposition');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="font-headline-md text-primary font-bold">Kiểm soát chất lượng</h2>
        <p className="text-on-surface-variant">Yêu cầu disposition được tạo bằng actor của session hiện tại; không có luồng tự giả mạo approver/poster.</p>
      </div>
      {error && <div className="bg-error-container text-on-error-container p-3 rounded">{error}</div>}
      {message && <div className="bg-tertiary-container/20 text-on-tertiary-container p-3 rounded">{message}</div>}
      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-container border-b border-outline-variant text-on-surface-variant font-bold">
            <tr><th className="p-3">Sự cố</th><th className="p-3">SKU / batch</th><th className="p-3">Số lượng</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Thao tác</th></tr>
          </thead>
          <tbody>
            {cases.map((qualityCase) => (
              <tr key={qualityCase.id} className="border-b border-outline-variant">
                <td className="p-3 font-data-mono font-bold text-primary">{qualityCase.case_code}</td>
                <td className="p-3"><div className="font-bold">{qualityCase.sku_name} ({qualityCase.sku_code})</div><div className="font-data-mono">{qualityCase.batch_code}</div></td>
                <td className="p-3 font-data-mono">{qualityCase.quantity}</td>
                <td className="p-3"><span className="px-2 py-1 rounded bg-surface-container font-bold">{qualityCase.status}</span></td>
                <td className="p-3 text-right">
                  {qualityCase.status === 'CONTAINED' && <><button disabled={loading} onClick={() => void requestDisposition(qualityCase, 'RELEASE')} className="px-2 py-1 bg-secondary text-on-secondary rounded mr-1 disabled:opacity-40">Yêu cầu release</button><button disabled={loading} onClick={() => void requestDisposition(qualityCase, 'DESTROY')} className="px-2 py-1 bg-error text-on-error rounded disabled:opacity-40">Yêu cầu destroy</button></>}
                </td>
              </tr>
            ))}
            {!cases.length && <tr><td colSpan={5} className="p-8 text-center text-on-surface-variant">{loading ? 'Đang tải…' : 'Không có sự cố chất lượng.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
