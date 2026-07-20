import React from 'react';
import { IssueRequest, IssueRequestDetail, SkuOption } from '../hooks/useOutbound';

interface OutboundViewProps {
  requests: IssueRequest[];
  selectedId: string | null;
  detail: IssueRequestDetail | null;
  skuOptions: SkuOption[];
  scanInput: string;
  setScanInput: (input: string) => void;
  scanQuantity: number;
  setScanQuantity: (quantity: number) => void;
  pickAlert: string | null;
  isLoading: boolean;
  handleScanSubmit: (e: React.FormEvent) => void;
  handlePickRowClick: (id: string) => void;
  onCompletePick: () => void;
  onCancelPick: () => void;
  transition: (request: IssueRequest, action: string) => void;
  allocateAutomatically: (requestId?: string | null) => void;
  createPickTask: (requestId?: string | null) => void;
  createIssueRequest: (e: React.FormEvent) => void;
  newIssueCode: string;
  setNewIssueCode: (value: string) => void;
  newRecipient: string;
  setNewRecipient: (value: string) => void;
  newSkuId: string;
  setNewSkuId: (value: string) => void;
  newQuantity: number;
  setNewQuantity: (value: number) => void;
}

export function OutboundView({
  requests, selectedId, detail, skuOptions, scanInput, setScanInput, scanQuantity, setScanQuantity,
  pickAlert, isLoading, handleScanSubmit, handlePickRowClick, onCompletePick, onCancelPick,
  transition, allocateAutomatically, createPickTask, createIssueRequest, newIssueCode, setNewIssueCode,
  newRecipient, setNewRecipient, newSkuId, setNewSkuId, newQuantity, setNewQuantity
}: OutboundViewProps) {
  const selected = requests.find((request) => request.id === selectedId);
  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <div>
        <h2 className="font-headline-md text-primary font-bold">Xuất kho &amp; Pick hàng</h2>
        <p className="text-on-surface-variant">Issue request, FEFO allocation và pick task được đọc/ghi trực tiếp qua Outbound Core.</p>
      </div>

      {pickAlert && <div className="bg-primary-container/20 text-primary p-3 rounded border border-secondary-container text-xs font-semibold">{pickAlert}</div>}

      <div className="bg-white border border-outline-variant rounded-xl p-4">
        <h3 className="font-bold text-primary mb-3">Tạo issue request</h3>
        <form onSubmit={createIssueRequest} className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
          <input className="border rounded p-2" placeholder="Issue code" value={newIssueCode} onChange={(e) => setNewIssueCode(e.target.value)} />
          <input className="border rounded p-2" placeholder="Người nhận / tham chiếu" value={newRecipient} onChange={(e) => setNewRecipient(e.target.value)} />
          <select className="border rounded p-2" value={newSkuId} onChange={(e) => setNewSkuId(e.target.value)}>
            <option value="">-- SKU --</option>
            {skuOptions.map((sku) => <option key={sku.id} value={sku.id}>{sku.code || sku.sku_code || sku.id} · {sku.name || sku.sku_name || ''}</option>)}
          </select>
          <input className="border rounded p-2" type="number" min="1" value={newQuantity} onChange={(e) => setNewQuantity(Number(e.target.value))} />
          <button disabled={isLoading} className="bg-primary text-on-primary rounded p-2 font-bold">Tạo DRAFT</button>
        </form>
      </div>

      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-surface-container border-b border-outline-variant text-on-surface-variant font-bold">
              <tr><th className="p-3">Mã phiếu</th><th className="p-3">Người tạo</th><th className="p-3">Trạng thái</th><th className="p-3">Version</th><th className="p-3">Ngày tạo</th><th className="p-3 text-right">Thao tác</th></tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} onClick={() => handlePickRowClick(request.id)} className={`border-b cursor-pointer ${request.id === selectedId ? 'bg-secondary-container/20' : 'hover:bg-surface-bright'}`}>
                  <td className="p-3 font-data-mono font-bold text-primary">{request.issue_code}</td>
                  <td className="p-3 font-data-mono">{request.requested_by}</td>
                  <td className="p-3"><span className="px-2 py-1 rounded bg-surface-container font-bold">{request.status}</span></td>
                  <td className="p-3 font-data-mono">{request.version}</td>
                  <td className="p-3 font-data-mono">{request.created_at?.slice(0, 19).replace('T', ' ')}</td>
                  <td className="p-3 text-right">
                    {request.status === 'DRAFT' && <button onClick={(e) => { e.stopPropagation(); transition(request, 'submit'); }} className="px-2 py-1 bg-secondary text-on-secondary rounded mr-1">Submit</button>}
                    {request.status === 'SUBMITTED' && <button onClick={(e) => { e.stopPropagation(); transition(request, 'approve'); }} className="px-2 py-1 bg-primary text-on-primary rounded mr-1">Approve</button>}
                    {request.status === 'APPROVED' && <button onClick={(e) => { e.stopPropagation(); handlePickRowClick(request.id); allocateAutomatically(request.id); }} className="px-2 py-1 bg-secondary text-on-secondary rounded mr-1">Allocate FEFO</button>}
                    {request.status === 'ALLOCATED' && <button onClick={(e) => { e.stopPropagation(); handlePickRowClick(request.id); createPickTask(request.id); }} className="px-2 py-1 bg-secondary text-on-secondary rounded mr-1">Create task</button>}
                  </td>
                </tr>
              ))}
              {!requests.length && <tr><td colSpan={6} className="p-8 text-center text-on-surface-variant">{isLoading ? 'Đang tải…' : 'Không có phiếu xuất trong phạm vi kho.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="bg-white border border-secondary rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div><h3 className="font-bold text-primary">{selected.issue_code}</h3><span className="text-xs text-on-surface-variant">version {selected.version} · {selected.status}</span></div>
            <div className="flex gap-2">
              <button onClick={onCancelPick} disabled={['POSTED', 'CANCELLED'].includes(selected.status)} className="px-3 py-2 border border-error text-error rounded text-xs disabled:opacity-40">Hủy phiếu</button>
              <button onClick={onCompletePick} disabled={selected.status !== 'PICKING'} className="px-3 py-2 bg-primary text-on-primary rounded text-xs disabled:opacity-40">Post goods issue</button>
            </div>
          </div>
          {detail && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="border rounded p-3"><h4 className="font-bold mb-2">Lines</h4>{detail.lines.map((line) => <div key={String(line.id)} className="font-data-mono">#{String(line.line_number)} · SKU {String(line.sku_id)} · yêu cầu {String(line.requested_quantity)} · đã pick {String(line.picked_quantity)}</div>)}</div>
              <div className="border rounded p-3"><h4 className="font-bold mb-2">Allocations FEFO</h4>{detail.allocations.map((item) => <div key={String(item.id)} className="font-data-mono">batch {String(item.batch_id)} · loc {String(item.location_id)} · {String(item.quantity)} · {String(item.status)}</div>)}</div>
              <div className="border rounded p-3"><h4 className="font-bold mb-2">Pick tasks</h4>{detail.pickTasks.map((task) => <div key={task.id} className="font-data-mono">{task.task_code} · {task.status} · v{task.version}</div>)}</div>
            </div>
          )}
          <form onSubmit={handleScanSubmit} className="flex flex-wrap gap-2">
            <input className="flex-1 min-w-[220px] border border-outline-variant rounded p-2 font-data-mono" value={scanInput} onChange={(e) => setScanInput(e.target.value)} placeholder="Barcode / batch" />
            <input className="w-24 border border-outline-variant rounded p-2 font-data-mono" type="number" min="1" value={scanQuantity} onChange={(e) => setScanQuantity(Number(e.target.value))} />
            <button className="px-4 py-2 bg-secondary text-on-secondary rounded" type="submit">Quét</button>
          </form>
        </div>
      )}
    </div>
  );
}
