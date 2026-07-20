import React from 'react';
import { OutboundItem } from '../types';

interface RequestRow {
  id: string;
  issue_code: string;
  status: string;
  version: number;
  requested_by: string;
  created_at: string;
  recipient_reference?: string | null;
}

interface OutboundViewProps {
  outboundItems: OutboundItem[];
  requests: RequestRow[];
  selectedId: string | null;
  scanInput: string;
  setScanInput: (input: string) => void;
  pickAlert: string | null;
  isLoading: boolean;
  handleScanSubmit: (e: React.FormEvent) => void;
  handlePickRowClick: (id: string) => void;
  onCompletePick: () => void;
  onCancelPick: () => void;
  transition: (request: RequestRow, action: string) => void;
}

export function OutboundView({
  requests, selectedId, scanInput, setScanInput, pickAlert, isLoading,
  handleScanSubmit, handlePickRowClick, onCompletePick, onCancelPick, transition
}: OutboundViewProps) {
  const selected = requests.find((request) => request.id === selectedId);
  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      <div>
        <h2 className="font-headline-md text-primary font-bold">Xuất kho &amp; Pick hàng</h2>
        <p className="text-on-surface-variant">Danh sách phiếu xuất được tải trực tiếp từ Outbound Core.</p>
      </div>

      {pickAlert && <div className="bg-primary-container/20 text-primary p-3 rounded border border-secondary-container text-xs font-semibold">{pickAlert}</div>}

      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-surface-container border-b border-outline-variant text-on-surface-variant font-bold">
              <tr><th className="p-3">Mã phiếu</th><th className="p-3">Người tạo</th><th className="p-3">Trạng thái</th><th className="p-3">Ngày tạo</th><th className="p-3 text-right">Thao tác</th></tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} onClick={() => handlePickRowClick(request.id)} className={`border-b cursor-pointer ${request.id === selectedId ? 'bg-secondary-container/20' : 'hover:bg-surface-bright'}`}>
                  <td className="p-3 font-data-mono font-bold text-primary">{request.issue_code}</td>
                  <td className="p-3 font-data-mono">{request.requested_by}</td>
                  <td className="p-3"><span className="px-2 py-1 rounded bg-surface-container font-bold">{request.status}</span></td>
                  <td className="p-3 font-data-mono">{request.created_at?.slice(0, 19).replace('T', ' ')}</td>
                  <td className="p-3 text-right">
                    {request.status === 'DRAFT' && <button onClick={(e) => { e.stopPropagation(); transition(request, 'submit'); }} className="px-2 py-1 bg-secondary text-on-secondary rounded mr-1">Submit</button>}
                    {request.status === 'SUBMITTED' && <button onClick={(e) => { e.stopPropagation(); transition(request, 'approve'); }} className="px-2 py-1 bg-primary text-on-primary rounded mr-1">Approve</button>}
                    {request.status === 'ALLOCATED' && <button onClick={(e) => { e.stopPropagation(); transition(request, 'pick-tasks'); }} className="px-2 py-1 bg-secondary text-on-secondary rounded mr-1">Create pick task</button>}
                  </td>
                </tr>
              ))}
              {!requests.length && <tr><td colSpan={5} className="p-8 text-center text-on-surface-variant">{isLoading ? 'Đang tải…' : 'Không có phiếu xuất trong phạm vi kho.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="bg-white border border-secondary rounded-xl p-4 space-y-4">
          <div className="flex justify-between items-center">
            <div><h3 className="font-bold text-primary">{selected.issue_code}</h3><span className="text-xs text-on-surface-variant">version {selected.version} · {selected.status}</span></div>
            <div className="flex gap-2">
              <button onClick={onCancelPick} className="px-3 py-2 border border-error text-error rounded text-xs">Hủy phiếu</button>
              <button onClick={onCompletePick} disabled={selected.status !== 'PICKING'} className="px-3 py-2 bg-primary text-on-primary rounded text-xs disabled:opacity-40">Post goods issue</button>
            </div>
          </div>
          <form onSubmit={handleScanSubmit} className="flex gap-2">
            <input className="flex-1 border border-outline-variant rounded p-2 font-data-mono" value={scanInput} onChange={(e) => setScanInput(e.target.value)} placeholder="Barcode / batch" />
            <button className="px-4 py-2 bg-secondary text-on-secondary rounded" type="submit">Quét</button>
          </form>
        </div>
      )}
    </div>
  );
}
