import React, { useCallback, useEffect, useState } from 'react';
import { apiCommand, apiGet, ApiError } from '../apiClient';

interface QualityViewProps { actorId?: string; warehouseId?: string; warehouseCode?: string; }
interface QualityCase {
  id: string; case_code: string; case_line_id: string; sku_code: string; sku_name: string;
  batch_code: string; quantity: number; location_id: string; location_code: string;
  reason: string; status: string; version: number; disposition_type?: string | null;
}
interface ExpiryRun { id: string; business_date: string; expired_line_count: number; created_at: string; quality_case_id?: string | null; }
interface CustomerReturn { id: string; return_code: string; customer_reference: string; reason: string; status: string; total_qty: number; created_at: string; version?: number; }
interface Recall { id: string; recall_code: string; severity: string; reason: string; status: string; sku_code: string; sku_name: string; batch_code: string; created_at: string; version?: number; }
interface Position { id: string; sku_id: string; batch_id: string; sku_code: string; batch_code: string; location_id: string; location_code: string; }

type Tab = 'quality' | 'expiry' | 'returns' | 'recalls';

export function QualityView({ actorId, warehouseId }: QualityViewProps) {
  const [tab, setTab] = useState<Tab>('quality');
  const [cases, setCases] = useState<QualityCase[]>([]);
  const [expiryRuns, setExpiryRuns] = useState<ExpiryRun[]>([]);
  const [returns, setReturns] = useState<CustomerReturn[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [locations, setLocations] = useState<Array<{ id: string; code?: string; location_code?: string }>>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [expiryLocationId, setExpiryLocationId] = useState('');
  const [returnPositionId, setReturnPositionId] = useState('');
  const [returnCustomer, setReturnCustomer] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [recallPositionId, setRecallPositionId] = useState('');
  const [recallCode, setRecallCode] = useState('');
  const [recallSeverity, setRecallSeverity] = useState('CLASS_II');
  const [recallReason, setRecallReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!actorId || !warehouseId) return;
    setLoading(true);
    setError(null);
    try {
      const [qualityData, expiryData, returnData, recallData, locationData, positionData] = await Promise.all([
        apiGet<QualityCase[]>(`/quality/cases?warehouseId=${encodeURIComponent(warehouseId)}`, { actorId }),
        apiGet<ExpiryRun[]>(`/quality/expiry-runs?warehouseId=${encodeURIComponent(warehouseId)}`, { actorId }),
        apiGet<CustomerReturn[]>(`/returns?warehouseId=${encodeURIComponent(warehouseId)}`, { actorId }),
        apiGet<Recall[]>(`/recalls?warehouseId=${encodeURIComponent(warehouseId)}`, { actorId }),
        apiGet<any[]>(`/inventory/locations?warehouseId=${encodeURIComponent(warehouseId)}`, { actorId }),
        apiGet<Position[]>(`/inventory/positions?warehouseId=${encodeURIComponent(warehouseId)}`, { actorId })
      ]);
      setCases(qualityData);
      setExpiryRuns(expiryData);
      setReturns(returnData);
      setRecalls(recallData);
      setLocations(locationData);
      setPositions(positionData);
      if (!expiryLocationId && locationData[0]) setExpiryLocationId(locationData[0].id);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Không tải được dữ liệu chất lượng/returns/recall');
    } finally { setLoading(false); }
  }, [actorId, warehouseId, expiryLocationId]);

  useEffect(() => { void load(); }, [load]);

  const command = async (path: string, body: Record<string, unknown>, success: string) => {
    if (!actorId) return;
    setLoading(true); setError(null); setMessage(null);
    try {
      await apiCommand(path, 'POST', body, actorId);
      setMessage(success);
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Command không thành công');
    } finally { setLoading(false); }
  };

  const requestDisposition = (qualityCase: QualityCase, type: 'RELEASE' | 'DESTROY') => command(
    `/quality/cases/${qualityCase.id}/dispositions`,
    {
      dispositionCode: `DSP-${Date.now().toString().slice(-8)}`,
      dispositionType: type,
      reason: type === 'RELEASE' ? 'Quality review requested release' : 'Quality review requested destruction',
      expectedVersion: qualityCase.version,
      destinations: type === 'RELEASE' ? [{ qualityCaseLineId: qualityCase.case_line_id, destinationLocationId: qualityCase.location_id }] : []
    },
    'Đã tạo disposition request. Người approve và người post phải là các session khác nhau.'
  );

  const createReturn = async (event: React.FormEvent) => {
    event.preventDefault();
    const position = positions.find((item) => item.id === returnPositionId);
    const quarantine = locations.find((item) => (item.code || item.location_code || '').toUpperCase().includes('QC')) || locations[0];
    if (!position || !quarantine || !returnCustomer.trim() || !returnReason.trim()) {
      setError('Chọn SKU/batch, nhập customer reference/reason và cần location quarantine.');
      return;
    }
    await command('/returns', {
      returnCode: `RET-${Date.now().toString().slice(-8)}`,
      warehouseId,
      customerReference: returnCustomer.trim(),
      reason: returnReason.trim(),
      lines: [{ skuId: position.sku_id, batchId: position.batch_id, quarantineLocationId: quarantine.id, quantity: returnQuantity }]
    }, 'Đã tạo customer return ở trạng thái DRAFT.');
    setReturnCustomer(''); setReturnReason(''); setReturnQuantity(1);
  };

  const createRecall = async (event: React.FormEvent) => {
    event.preventDefault();
    const position = positions.find((item) => item.id === recallPositionId);
    const recallLocation = locations.find((item) => (item.code || item.location_code || '').toUpperCase().includes('RECALL')) || locations[0];
    if (!position || !recallLocation || !recallCode.trim() || !recallReason.trim()) {
      setError('Chọn SKU/batch, nhập recall code/reason và cần recall location.');
      return;
    }
    await command('/recalls', {
      recallCode: recallCode.trim(),
      skuId: position.sku_id,
      batchId: position.batch_id,
      severity: recallSeverity,
      reason: recallReason.trim(),
      scopes: [{ warehouseId, recallLocationId: recallLocation.id }]
    }, 'Đã tạo recall ở trạng thái DRAFT.');
    setRecallCode(''); setRecallReason('');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="font-headline-md text-primary font-bold">Quality, Returns, Expiry &amp; Recall</h2>
        <p className="text-on-surface-variant">Các command dùng đúng version/correlation/idempotency; backend giữ quyền quyết định state và four-eyes.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['quality', 'expiry', 'returns', 'recalls'] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`px-3 py-2 rounded text-xs font-bold ${tab === item ? 'bg-primary text-on-primary' : 'bg-surface-container'}`}>{item.toUpperCase()}</button>)}
      </div>
      {error && <div className="bg-error-container text-on-error-container p-3 rounded text-xs">{error}</div>}
      {message && <div className="bg-tertiary-container/20 text-on-tertiary-container p-3 rounded text-xs">{message}</div>}

      {tab === 'quality' && <div className="bg-white border border-outline-variant rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs"><thead className="bg-surface-container border-b border-outline-variant font-bold"><tr><th className="p-3">Case</th><th className="p-3">SKU / batch</th><th className="p-3">Qty</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead><tbody>
          {cases.map((item) => <tr key={item.id} className="border-b border-outline-variant"><td className="p-3 font-data-mono font-bold text-primary">{item.case_code}</td><td className="p-3">{item.sku_name} ({item.sku_code})<div className="font-data-mono">{item.batch_code}</div></td><td className="p-3">{item.quantity}</td><td className="p-3">{item.status} · v{item.version}</td><td className="p-3 text-right">{['OPEN', 'REPORTED'].includes(item.status) && <button onClick={() => void command(`/quality/cases/${item.id}/contain`, { expectedVersion: item.version }, 'Đã contain quality case.')} className="px-2 py-1 bg-primary text-on-primary rounded mr-1">Contain</button>}{item.status === 'CONTAINED' && <><button disabled={loading} onClick={() => void requestDisposition(item, 'RELEASE')} className="px-2 py-1 bg-secondary text-on-secondary rounded mr-1">Release</button><button disabled={loading} onClick={() => void requestDisposition(item, 'DESTROY')} className="px-2 py-1 bg-error text-on-error rounded">Destroy</button></>}</td></tr>)}
          {!cases.length && <tr><td colSpan={5} className="p-8 text-center">{loading ? 'Đang tải…' : 'Không có quality case.'}</td></tr>}
        </tbody></table>
      </div>}

      {tab === 'expiry' && <div className="space-y-4"><div className="bg-white border rounded-xl p-4 flex flex-wrap gap-2 items-end text-xs"><div><label className="block font-bold mb-1">Expired location</label><select className="border rounded p-2" value={expiryLocationId} onChange={(e) => setExpiryLocationId(e.target.value)}>{locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.code || loc.location_code || loc.id}</option>)}</select></div><button disabled={!expiryLocationId || loading} onClick={() => void command('/quality/expiry-runs', { warehouseId, expiredLocationId: expiryLocationId, businessDate: new Date().toISOString().slice(0, 10) }, 'Đã tạo expiry run.')} className="bg-primary text-on-primary rounded p-2 font-bold">Tạo expiry run</button></div><div className="bg-white border rounded-xl overflow-hidden"><table className="w-full text-left text-xs"><thead className="bg-surface-container font-bold"><tr><th className="p-3">Business date</th><th className="p-3">Affected lines</th><th className="p-3">Quality case</th><th className="p-3">Created</th></tr></thead><tbody>{expiryRuns.map((run) => <tr key={run.id} className="border-t"><td className="p-3">{run.business_date}</td><td className="p-3">{run.expired_line_count}</td><td className="p-3 font-data-mono">{run.quality_case_id || '—'}</td><td className="p-3">{run.created_at?.slice(0, 19)}</td></tr>)}</tbody></table></div></div>}

      {tab === 'returns' && <div className="space-y-4"><form onSubmit={createReturn} className="bg-white border rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs"><select className="border rounded p-2" value={returnPositionId} onChange={(e) => setReturnPositionId(e.target.value)}><option value="">-- SKU / batch --</option>{positions.map((item) => <option key={item.id} value={item.id}>{item.sku_code} · {item.batch_code}</option>)}</select><input className="border rounded p-2" placeholder="Customer reference" value={returnCustomer} onChange={(e) => setReturnCustomer(e.target.value)} /><input className="border rounded p-2" placeholder="Reason" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} /><input className="border rounded p-2" type="number" min="1" value={returnQuantity} onChange={(e) => setReturnQuantity(Number(e.target.value))} /><button className="bg-primary text-on-primary rounded p-2 font-bold">Create return</button></form><div className="bg-white border rounded-xl overflow-hidden"><table className="w-full text-left text-xs"><thead className="bg-surface-container font-bold"><tr><th className="p-3">Return</th><th className="p-3">Customer</th><th className="p-3">Reason</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{returns.map((item) => <tr key={item.id} className="border-t"><td className="p-3 font-data-mono">{item.return_code}</td><td className="p-3">{item.customer_reference}</td><td className="p-3">{item.reason}</td><td className="p-3">{item.status}</td><td className="p-3">{item.version && item.status === 'DRAFT' && <button onClick={() => void command(`/returns/${item.id}/approve`, { expectedVersion: item.version }, 'Đã approve customer return.')} className="px-2 py-1 bg-primary text-on-primary rounded">Approve</button>}{item.version && item.status === 'APPROVED' && <button onClick={() => void command(`/returns/${item.id}/post`, { expectedVersion: item.version }, 'Đã post customer return vào inventory.')} className="px-2 py-1 bg-secondary text-on-secondary rounded">Post</button>}</td></tr>)}</tbody></table></div></div>}

      {tab === 'recalls' && <div className="space-y-4"><form onSubmit={createRecall} className="bg-white border rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs"><select className="border rounded p-2" value={recallPositionId} onChange={(e) => setRecallPositionId(e.target.value)}><option value="">-- SKU / batch --</option>{positions.map((item) => <option key={item.id} value={item.id}>{item.sku_code} · {item.batch_code}</option>)}</select><input className="border rounded p-2" placeholder="Recall code" value={recallCode} onChange={(e) => setRecallCode(e.target.value)} /><select className="border rounded p-2" value={recallSeverity} onChange={(e) => setRecallSeverity(e.target.value)}><option>CLASS_I</option><option>CLASS_II</option><option>CLASS_III</option></select><input className="border rounded p-2" placeholder="Reason" value={recallReason} onChange={(e) => setRecallReason(e.target.value)} /><button className="bg-primary text-on-primary rounded p-2 font-bold">Create recall</button></form><div className="bg-white border rounded-xl overflow-hidden"><table className="w-full text-left text-xs"><thead className="bg-surface-container font-bold"><tr><th className="p-3">Recall</th><th className="p-3">SKU / batch</th><th className="p-3">Severity</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{recalls.map((item) => <tr key={item.id} className="border-t"><td className="p-3 font-data-mono">{item.recall_code}</td><td className="p-3">{item.sku_name} ({item.sku_code}) · {item.batch_code}</td><td className="p-3">{item.severity}</td><td className="p-3">{item.status}</td><td className="p-3 space-x-1">{item.version && item.status === 'DRAFT' && <button onClick={() => void command(`/recalls/${item.id}/approve`, { expectedVersion: item.version }, 'Đã approve recall.')} className="px-2 py-1 bg-primary text-on-primary rounded">Approve</button>}{item.version && item.status === 'APPROVED' && <button onClick={() => void command(`/recalls/${item.id}/contain`, { expectedVersion: item.version }, 'Đã contain recall.')} className="px-2 py-1 bg-secondary text-on-secondary rounded">Contain</button>}{item.version && item.status === 'CONTAINED' && <button onClick={() => void command(`/recalls/${item.id}/close`, { expectedVersion: item.version }, 'Đã close recall.')} className="px-2 py-1 bg-tertiary text-on-tertiary rounded">Close</button>}</td></tr>)}</tbody></table></div></div>}
    </div>
  );
}
