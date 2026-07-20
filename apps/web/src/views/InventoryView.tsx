import React, { useState } from 'react';
import { useInventory } from '../hooks/useInventory';

interface InventoryViewProps {
  brandFilter: string;
  setBrandFilter: (brand: string) => void;
  actorId: string;
  warehouseId: string;
  warehouseCode: string;
}
type InventorySubTab = 'atp' | 'transfer' | 'stocktake';

export function InventoryView({ brandFilter, setBrandFilter, actorId, warehouseId, warehouseCode }: InventoryViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<InventorySubTab>('atp');
  const [countInputs, setCountInputs] = useState<Record<string, number>>({});
  const {
    positions, reservations, transfers, stocktakes, allWarehouses, allLocations, allZones,
    selectedTransfer, selectedStocktake, isLoading, error, successMessage,
    destWarehouseId, setDestWarehouseId, selectedPosId, setSelectedPosId, transQty, setTransQty,
    destLocationId, setDestLocationId, selectedZoneId, setSelectedZoneId,
    fetchAllData, handleCreateTransfer, handleCreateStocktake, loadTransfer, transferCommand,
    loadStocktake, stocktakeCommand
  } = useInventory(actorId, warehouseId);

  const filtered = positions.filter((item) => brandFilter === 'All' || item.sku_name.toLowerCase().includes(brandFilter.toLowerCase()) || item.sku_code.toLowerCase().includes(brandFilter.toLowerCase()));
  const onHand = filtered.reduce((sum, item) => sum + Number(item.quantity_on_hand || 0), 0);
  const reserved = reservations.reduce((sum, item) => sum + Number(item.quantity_reserved || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap justify-between gap-3 items-end border-b pb-4">
        <div><h2 className="font-headline-md text-primary font-bold">Inventory Control · {warehouseCode}</h2><p className="text-on-surface-variant text-sm">ATP, transfer và blind stocktake theo state machine backend.</p></div>
        <button onClick={() => void fetchAllData()} className="px-3 py-2 bg-primary text-on-primary rounded text-xs font-bold">{isLoading ? 'Đang tải…' : 'Refresh API'}</button>
      </div>
      {error && <div className="bg-error-container text-on-error-container rounded p-3 text-xs">{error}</div>}
      {successMessage && <div className="bg-tertiary-container/20 text-on-tertiary-container rounded p-3 text-xs">{successMessage}</div>}
      <div className="flex gap-2">{(['atp', 'transfer', 'stocktake'] as InventorySubTab[]).map((tab) => <button key={tab} onClick={() => setActiveSubTab(tab)} className={`px-3 py-2 rounded text-xs font-bold ${activeSubTab === tab ? 'bg-primary text-on-primary' : 'bg-surface-container'}`}>{tab.toUpperCase()}</button>)}</div>

      {activeSubTab === 'atp' && <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><Metric label="On-hand" value={onHand} /><Metric label="Active reservation" value={reserved} /><Metric label="ATP" value={Math.max(0, onHand - reserved)} /></div>
        <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="border rounded p-2 text-xs"><option>All</option><option>Heineken</option><option>Tiger</option><option>Coca-Cola</option></select>
        <Table headers={['SKU', 'Batch', 'Location', 'Status', 'On-hand', 'Expiry']} rows={filtered.map((item) => [item.sku_code, item.batch_code, item.location_code, item.stock_status, item.quantity_on_hand, item.expiration_date ? new Date(item.expiration_date).toLocaleDateString('vi-VN') : '—'])} />
      </div>}

      {activeSubTab === 'transfer' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4"><Table headers={['Code', 'From', 'To', 'Qty', 'State/version', 'Command']} rows={transfers.map((item) => [
          item.transfer_code, item.source_warehouse_name, item.destination_warehouse_name, item.total_qty, `${item.status} · v${item.version}`,
          <div className="space-x-1" key={item.id}><button onClick={() => void loadTransfer(item.id)} className="px-2 py-1 border rounded">Detail</button>{item.status === 'DRAFT' && <button onClick={() => void transferCommand(item.id, 'approve', item.version)} className="px-2 py-1 bg-primary text-on-primary rounded">Approve</button>}{item.status === 'APPROVED' && <button onClick={() => void transferCommand(item.id, 'start-picking', item.version)} className="px-2 py-1 bg-secondary text-on-secondary rounded">Pick</button>}{item.status === 'PICKING' && <button onClick={() => void transferCommand(item.id, 'dispatch', item.version)} className="px-2 py-1 bg-secondary text-on-secondary rounded">Dispatch</button>}{['DRAFT', 'APPROVED', 'PICKING'].includes(item.status) && <button onClick={() => void transferCommand(item.id, 'cancel', item.version, { reason: 'Cancelled from inventory workbench' })} className="px-2 py-1 border border-error text-error rounded">Cancel</button>}</div>
        ])} />
        {selectedTransfer && <div className="bg-white border border-secondary rounded-xl p-4 text-xs space-y-2"><div className="font-bold text-primary">{selectedTransfer.transferCode} · {selectedTransfer.status} · v{selectedTransfer.version}</div>{(selectedTransfer.lines || []).map((line: any) => <div key={line.id} className="border-t pt-2 font-data-mono flex flex-wrap items-center gap-2">Line {line.line_number}: SKU {line.sku_id} · planned {line.planned_quantity} · picked {line.picked_quantity} · dispatched {line.dispatched_quantity} · received {line.received_quantity}{selectedTransfer.status === 'PICKING' && Number(line.picked_quantity) < Number(line.planned_quantity) && <button onClick={() => void transferCommand(selectedTransfer.id, `lines/${line.id}/pick`, selectedTransfer.version, { quantity: Number(line.planned_quantity) - Number(line.picked_quantity) })} className="px-2 py-1 bg-secondary text-on-secondary rounded">Pick line</button>}</div>)}{selectedTransfer.status === 'DISPATCHED' && <button onClick={() => void transferCommand(selectedTransfer.id, 'receipts', selectedTransfer.version, { receiptCode: `RCV-${Date.now().toString().slice(-6)}`, lines: (selectedTransfer.lines || []).map((line: any) => ({ transferLineId: line.id, destinationLocationId: line.destination_location_id, receivedQuantity: Number(line.dispatched_quantity || line.planned_quantity) })) })} className="px-2 py-1 bg-primary text-on-primary rounded">Receive</button>}{selectedTransfer.status === 'RECEIVED' && <button onClick={() => void transferCommand(selectedTransfer.id, 'close', selectedTransfer.version)} className="px-2 py-1 bg-tertiary text-on-tertiary rounded">Close</button>}</div>}</div>
        <div className="bg-white border rounded-xl p-4"><h3 className="font-bold text-sm mb-3">Tạo transfer nội bộ</h3><form onSubmit={handleCreateTransfer} className="space-y-3 text-xs"><select value={destWarehouseId} onChange={(e) => setDestWarehouseId(e.target.value)} className="w-full border rounded p-2"><option value="">-- Kho đích --</option>{allWarehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select><select value={selectedPosId} onChange={(e) => setSelectedPosId(e.target.value)} className="w-full border rounded p-2"><option value="">-- Tồn/batch --</option>{positions.map((item) => <option key={item.id} value={item.id}>{item.sku_code} · {item.batch_code} · {item.quantity_on_hand}</option>)}</select><select value={destLocationId} onChange={(e) => setDestLocationId(e.target.value)} className="w-full border rounded p-2"><option value="">-- Vị trí đích --</option>{allLocations.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select><input type="number" min="1" value={transQty} onChange={(e) => setTransQty(Number(e.target.value))} className="w-full border rounded p-2" /><button disabled={isLoading} className="w-full bg-primary text-on-primary rounded p-2 font-bold">Tạo transfer</button></form></div>
      </div>}

      {activeSubTab === 'stocktake' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4"><Table headers={['Session', 'Blind', 'Status/version', 'Command']} rows={stocktakes.map((item) => [item.session_code, item.blind_count ? 'YES' : 'NO', `${item.status} · v${item.version}`, <div key={item.id} className="space-x-1"><button onClick={() => void loadStocktake(item.id)} className="px-2 py-1 border rounded">Detail</button>{item.status === 'PLANNED' && <button onClick={() => void stocktakeCommand(item.id, 'start', item.version)} className="px-2 py-1 bg-primary text-on-primary rounded">Start</button>}{['COUNTING', 'RECOUNT'].includes(item.status) && <button onClick={() => void stocktakeCommand(item.id, 'complete-round', item.version)} className="px-2 py-1 bg-secondary text-on-secondary rounded">Complete round</button>}{item.status === 'RECONCILED' && <button onClick={() => void stocktakeCommand(item.id, 'request-approval', item.version)} className="px-2 py-1 bg-secondary text-on-secondary rounded">Request approval</button>}{item.status === 'PENDING_APPROVAL' && <button onClick={() => void stocktakeCommand(item.id, 'approve', item.version, { reason: 'Approved from stocktake workbench' })} className="px-2 py-1 bg-primary text-on-primary rounded">Approve</button>}{item.status === 'PENDING_APPROVAL' && <button onClick={() => void stocktakeCommand(item.id, 'post-adjustment', item.version)} className="px-2 py-1 bg-tertiary text-on-tertiary rounded">Post adjustment</button>}{['PLANNED', 'COUNTING', 'RECOUNT'].includes(item.status) && <button onClick={() => void stocktakeCommand(item.id, 'cancel', item.version, { reason: 'Cancelled from inventory workbench' })} className="px-2 py-1 border border-error text-error rounded">Cancel</button>}</div>])} /></div>
        {selectedStocktake && <div className="bg-white border border-secondary rounded-xl p-4 text-xs space-y-2"><div className="font-bold text-primary">{selectedStocktake.session_code} · {selectedStocktake.status} · v{selectedStocktake.version}</div><p>Blind count: {selectedStocktake.blind_count ? 'YES' : 'NO'} — expected quantity chỉ hiển thị khi backend cho phép.</p>{(selectedStocktake.snapshots || []).map((line: any) => <div key={line.id} className="border-t pt-2 font-data-mono flex flex-wrap items-center gap-2">SKU {line.sku_id} · batch {line.batch_id} · counted {line.counted_quantity ?? '—'}{line.system_quantity === undefined ? '' : ` · system ${line.system_quantity}`}{['COUNTING', 'RECOUNT'].includes(selectedStocktake.status) && <><input className="w-20 border rounded p-1" type="number" min="0" value={countInputs[line.id] ?? ''} onChange={(e) => setCountInputs((current) => ({ ...current, [line.id]: Number(e.target.value) }))} placeholder="count" /><button disabled={!Number.isSafeInteger(countInputs[line.id] ?? -1) || (countInputs[line.id] ?? -1) < 0} onClick={() => void stocktakeCommand(selectedStocktake.id, 'counts', selectedStocktake.version, { snapshotLineId: line.id, countedQuantity: countInputs[line.id] })} className="px-2 py-1 bg-secondary text-on-secondary rounded">Record count</button></>}</div>)}</div>}
        <div className="bg-white border rounded-xl p-4"><h3 className="font-bold text-sm mb-3">Tạo blind stocktake</h3><form onSubmit={handleCreateStocktake} className="space-y-3 text-xs"><select value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)} className="w-full border rounded p-2"><option value="">-- Toàn kho --</option>{allZones.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select><button disabled={isLoading} className="w-full bg-primary text-on-primary rounded p-2 font-bold">Create &amp; lock</button></form></div>
      </div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="bg-white border rounded-xl p-4"><div className="text-xs text-on-surface-variant">{label}</div><div className="font-data-mono text-2xl font-bold text-primary">{value}</div></div>; }
function Table({ headers, rows }: { headers: string[]; rows: unknown[][] }) { return <div className="bg-white border rounded-xl overflow-auto"><table className="w-full text-left text-xs"><thead className="bg-surface-container border-b"><tr>{headers.map((header) => <th key={header} className="p-3">{header}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-b">{row.map((cell, j) => <td key={j} className="p-3">{cell as React.ReactNode}</td>)}</tr>)}{!rows.length && <tr><td colSpan={headers.length} className="p-8 text-center text-on-surface-variant">Không có dữ liệu.</td></tr>}</tbody></table></div>; }
