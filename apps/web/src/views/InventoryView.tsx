import React, { useState } from 'react';
import { useInventory, InventoryPosition } from '../hooks/useInventory';

interface InventoryViewProps {
  brandFilter: string;
  setBrandFilter: (brand: string) => void;
  onRefresh: () => void;
  actorId: string;
  warehouseId: string;
  warehouseCode: string;
}

type InventorySubTab = 'atp' | 'map' | 'transfer' | 'stocktake';

export function InventoryView({
  brandFilter,
  setBrandFilter,
  onRefresh,
  actorId,
  warehouseId,
  warehouseCode
}: InventoryViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<InventorySubTab>('atp');
  const [selectedLocationCode, setSelectedLocationCode] = useState<string | null>(null);

  const {
    positions,
    reservations,
    transfers,
    stocktakes,
    allWarehouses,
    allLocations,
    allZones,
    isLoading,
    error,
    destWarehouseId,
    setDestWarehouseId,
    selectedPosId,
    setSelectedPosId,
    transQty,
    setTransQty,
    destLocationId,
    setDestLocationId,
    selectedZoneId,
    setSelectedZoneId,
    fetchAllData,
    handleCreateTransfer,
    handleCreateStocktake
  } = useInventory(actorId, warehouseId);

  const handleRefresh = () => {
    fetchAllData();
    onRefresh();
  };

  // Filter positions based on Brand
  const filteredPositions = positions.filter(pos => {
    if (brandFilter === 'All') return true;
    if (brandFilter === 'Heineken') return pos.sku_code.toLowerCase().includes('hn') || pos.sku_name.toLowerCase().includes('heineken');
    if (brandFilter === 'Tiger') return pos.sku_code.toLowerCase().includes('tg') || pos.sku_name.toLowerCase().includes('tiger');
    if (brandFilter === 'Coca-Cola') return pos.sku_code.toLowerCase().includes('cc') || pos.sku_name.toLowerCase().includes('coca');
    return true;
  });

  // Calculate totals for KPI header
  const totalOnHand = positions.reduce((sum, p) => sum + Number(p.quantity_on_hand || 0), 0);
  const totalReserved = reservations.reduce((sum, r) => sum + Number(r.quantity_reserved || 0), 0);
  const totalATP = Math.max(0, totalOnHand - totalReserved);
  const quarantinedCount = positions.filter(p => p.stock_status === 'QUARANTINED').length;

  // Selected Location Positions for Warehouse Map Inspector
  const selectedLocationPositions = selectedLocationCode
    ? positions.filter(p =>
        p.location_code === selectedLocationCode ||
        p.location_id === selectedLocationCode ||
        (selectedLocationCode.toUpperCase() === 'A1' && (p.location_code.includes('A1') || p.location_code.includes('Z1')))
      )
    : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-outline-variant pb-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-primary font-bold">Tra Cứu Tồn Kho &amp; Sơ Đồ Mặt Bằng Kho</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Quản lý số dư tồn kho khả dụng (ATP), sơ đồ ô kệ trực quan, điều chuyển nội bộ và kiểm kê kho ({warehouseCode}).
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors font-bold"
          >
            <span className={`material-symbols-outlined text-[18px] ${isLoading ? 'animate-spin' : ''}`}>sync</span>
            Làm Mới Dữ Liệu
          </button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold">
        <div className="bg-white border border-outline-variant p-4 rounded-xl shadow-sm border-l-4 border-l-primary">
          <p className="text-on-surface-variant font-label-caps uppercase text-[10px]">Tổng Tồn Vật Lý (On-Hand)</p>
          <p className="text-2xl font-bold text-primary font-data-mono mt-1">{totalOnHand.toLocaleString()} <span className="text-xs text-on-surface-variant font-normal">Thùng</span></p>
          <p className="text-[10px] text-secondary mt-1">Ghi nhận từ Core Inventory</p>
        </div>

        <div className="bg-white border border-outline-variant p-4 rounded-xl shadow-sm border-l-4 border-l-secondary">
          <p className="text-on-surface-variant font-label-caps uppercase text-[10px]">Đang Giữ Chỗ (Active Reservation)</p>
          <p className="text-2xl font-bold text-secondary font-data-mono mt-1">{totalReserved.toLocaleString()} <span className="text-xs text-on-surface-variant font-normal">Thùng</span></p>
          <p className="text-[10px] text-on-surface-variant mt-1">Cam kết đơn hàng xuất</p>
        </div>

        <div className="bg-white border border-outline-variant p-4 rounded-xl shadow-sm border-l-4 border-l-tertiary-container bg-tertiary-container/5">
          <p className="text-on-surface-variant font-label-caps uppercase text-[10px]">Khả Dụng Bán (ATP)</p>
          <p className="text-2xl font-bold text-tertiary-container font-data-mono mt-1">{totalATP.toLocaleString()} <span className="text-xs text-on-surface-variant font-normal">Thùng</span></p>
          <p className="text-[10px] text-tertiary-container font-bold mt-1">Có thể chào bán mới</p>
        </div>

        <div className="bg-white border border-outline-variant p-4 rounded-xl shadow-sm border-l-4 border-l-warning">
          <p className="text-on-surface-variant font-label-caps uppercase text-[10px]">Cách Ly Kiểm Định (Quarantine)</p>
          <p className="text-2xl font-bold text-warning font-data-mono mt-1">{quarantinedCount} <span className="text-xs text-on-surface-variant font-normal">Lô hàng</span></p>
          <p className="text-[10px] text-warning font-bold mt-1">Chờ QA phê duyệt</p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-outline-variant overflow-x-auto text-xs font-semibold gap-1">
        <button
          onClick={() => setActiveSubTab('atp')}
          className={`px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeSubTab === 'atp' ? 'border-primary text-primary font-bold bg-primary-fixed/10' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">inventory_2</span>
          Số Dư Tồn Kho Khả Dụng (ATP)
        </button>
        <button
          onClick={() => setActiveSubTab('map')}
          className={`px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeSubTab === 'map' ? 'border-primary text-primary font-bold bg-primary-fixed/10' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">map</span>
          Sơ Đồ Trực Quan Mặt Bằng Kho (Layout Map)
        </button>
        <button
          onClick={() => setActiveSubTab('transfer')}
          className={`px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeSubTab === 'transfer' ? 'border-primary text-primary font-bold bg-primary-fixed/10' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
          Điều Chuyển Nội Bộ (Transfer)
        </button>
        <button
          onClick={() => setActiveSubTab('stocktake')}
          className={`px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeSubTab === 'stocktake' ? 'border-primary text-primary font-bold bg-primary-fixed/10' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">fact_check</span>
          Kiểm Kê Định Kỳ (Stocktake)
        </button>
      </div>

      {/* SUB TAB 1: ATP TABLE */}
      {activeSubTab === 'atp' && (
        <div className="space-y-6">
          {/* Filter bar */}
          <div className="bg-white border border-outline-variant rounded-xl p-4 flex flex-wrap gap-4 items-end text-xs shadow-sm">
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="font-label-caps text-on-surface-variant font-bold">Chọn Kho Phân Vùng</label>
              <select className="w-full bg-surface border border-outline-variant rounded px-3 py-2 focus:border-secondary outline-none font-semibold">
                <option>Kho hiện tại ({warehouseCode})</option>
              </select>
            </div>

            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="font-label-caps text-on-surface-variant font-bold">Thương Hiệu Sản Phẩm</label>
              <select
                className="w-full bg-surface border border-outline-variant rounded px-3 py-2 focus:border-secondary outline-none font-semibold"
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
              >
                <option value="All">Tất cả thương hiệu (Heineken, Tiger, Coca-Cola...)</option>
                <option value="Heineken">Heineken</option>
                <option value="Tiger">Tiger</option>
                <option value="Coca-Cola">Coca-Cola</option>
              </select>
            </div>

            <div className="flex-none">
              <button
                onClick={() => setBrandFilter('All')}
                className="h-9 px-4 border border-outline text-on-surface rounded hover:bg-surface-container-low transition-colors font-bold"
              >
                Xóa Bộ Lọc
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-error-container/20 text-error p-4 rounded border border-error/30 flex items-center gap-2 font-semibold text-xs">
              <span className="material-symbols-outlined">error</span>
              {error}
            </div>
          )}

          {/* Grid table */}
          <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className="bg-surface-container-low border-b border-outline-variant text-xs">
                  <tr>
                    <th className="p-3 font-bold">Chi Tiết Mặt Hàng SKU</th>
                    <th className="p-3 font-bold text-center">Vị Trí Kệ (Location)</th>
                    <th className="p-3 font-bold text-center">Mã Lô (Batch Code)</th>
                    <th className="p-3 font-bold text-right">Tổng Tồn Vật Lý (On-hand)</th>
                    <th className="p-3 font-bold text-right">Tồn Giữ Chỗ (Active Reservation)</th>
                    <th className="p-3 font-bold text-right bg-primary-fixed/20 text-primary font-bold">Tồn Khả Dụng Bán (ATP)</th>
                    <th className="p-3 font-bold text-center">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-on-surface-variant">
                        <div className="flex items-center justify-center gap-2">
                          <span className="animate-spin material-symbols-outlined">sync</span>
                          Đang tải dữ liệu số dư tồn kho từ Database...
                        </div>
                      </td>
                    </tr>
                  ) : filteredPositions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-on-surface-variant font-semibold">
                        Không có tồn kho khả dụng nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredPositions.map((pos, idx) => {
                      const activeRes = reservations
                        .filter((r: any) => r.sku_id === pos.sku_code || r.sku_id === pos.sku_name)
                        .reduce((sum: number, r: any) => sum + (Number(r.quantity_reserved) || 0), 0);

                      const onHand = Number(pos.quantity_on_hand);
                      const atp = Math.max(0, onHand - activeRes);
                      const ratio = pos.ratio || 24;
                      const isQuarantined = pos.stock_status === 'QUARANTINED';
                      const isBlocked = pos.stock_status === 'BLOCKED' || pos.stock_status === 'DAMAGED';

                      return (
                        <tr key={idx} className={`hover:bg-surface-bright transition-colors ${isQuarantined ? 'bg-warning/5' : isBlocked ? 'bg-error/5' : ''}`}>
                          <td className="p-3">
                            <p className="font-bold text-primary text-sm">{pos.sku_name}</p>
                            <p className="font-data-mono text-on-surface-variant text-[10px]">SKU: {pos.sku_code}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-data-mono font-bold px-2 py-1 bg-surface-container-high rounded text-on-surface text-xs">
                              {pos.location_code}
                            </span>
                          </td>
                          <td className="p-3 font-data-mono text-center text-on-surface font-semibold">
                            {pos.batch_code}
                          </td>
                          <td className="p-3 text-right">
                            <div className="font-data-mono font-bold text-on-surface">{onHand.toLocaleString()} Thùng/Két</div>
                            <div className="font-data-mono text-[10px] text-secondary">({(onHand * ratio).toLocaleString()} Lon/Chai)</div>
                            <div className="font-data-mono text-[10px] text-on-surface-variant">HSD: {pos.expiration_date ? new Date(pos.expiration_date).toLocaleDateString('vi-VN') : 'Không giới hạn'}</div>
                          </td>
                          <td className="p-3 text-right font-data-mono text-on-surface-variant">
                            {activeRes.toLocaleString()} Thùng/Két
                          </td>
                          <td className="p-3 text-right bg-primary-fixed/5 font-bold">
                            <div className={`font-data-mono text-sm ${atp === 0 ? 'text-error' : 'text-primary'}`}>
                              {atp.toLocaleString()} Thùng/Két
                            </div>
                            <div className="font-data-mono text-[10px] text-secondary">
                              ({(atp * ratio).toLocaleString()} Lon/Chai)
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            {isQuarantined ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-warning-container text-on-warning-container font-bold text-[9px]">Cách Ly QC</span>
                            ) : isBlocked ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-bold text-[9px]">Khoá Hàng</span>
                            ) : atp > 100 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-bold text-[9px]">Sẵn Sàng</span>
                            ) : atp > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-warning text-white font-bold text-[9px]">Tồn Thấp</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-error text-on-error font-bold text-[9px]">Hết Hàng</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB 2: INTERACTIVE WAREHOUSE MAP (LAYOUT TOPOLOGY) */}
      {activeSubTab === 'map' && (
        <div className="space-y-6">
          <div className="bg-white border border-outline-variant rounded-xl p-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs">
            <div>
              <h3 className="font-bold text-primary text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-secondary">grid_view</span>
                Sơ Đồ Mặt Bằng Ô Kệ Kho Tương Tác (Interactive 2D Topology Layout)
              </h3>
              <p className="text-on-surface-variant">Nhấp vào từng Ô kệ (Location Cell) bên dưới để soi chi tiết các mặt hàng và số lượng đang lưu trữ.</p>
            </div>

            {/* Map Legend */}
            <div className="flex flex-wrap items-center gap-3 font-semibold text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block"></span>
                <span>Ô kệ có hàng (Available)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-500 inline-block"></span>
                <span>Hàng Cách ly (QC Hold)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-rose-500 inline-block"></span>
                <span>Hàng Khóa / Hỏng</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300 inline-block"></span>
                <span>Ô Trống (Empty)</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Visual Floor Map Canvas */}
            <div className="lg:col-span-2 bg-white border border-outline-variant rounded-xl p-5 shadow-sm space-y-6">

              {/* Zone A: Ambient Rack Storage */}
              <div className="border border-outline-variant/60 rounded-lg p-4 bg-slate-50/50 space-y-3">
                <div className="flex justify-between items-center border-b border-outline-variant/40 pb-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-primary">
                    <span className="material-symbols-outlined text-[18px] text-primary">warehouse</span>
                    ZONE A - KHU LƯU KHO HÀNG NGUYÊN ĐAI NGUYÊN KIỆN (Ambient Bulk Racks)
                  </div>
                  <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded">High Capacity Racks</span>
                </div>

                <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                  {allLocations.length > 0 ? (
                    allLocations.map((loc) => {
                      const posInLoc = positions.filter(p => p.location_code === loc.code || p.location_id === loc.id);
                      const hasStock = posInLoc.length > 0;
                      const hasQuarantine = posInLoc.some(p => p.stock_status === 'QUARANTINED');
                      const hasBlocked = posInLoc.some(p => p.stock_status === 'BLOCKED' || p.stock_status === 'DAMAGED');
                      const totalLocQty = posInLoc.reduce((s, p) => s + Number(p.quantity_on_hand || 0), 0);
                      const isSelected = selectedLocationCode === loc.code || selectedLocationCode === loc.id;

                      let cellBg = 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200';
                      if (hasBlocked) cellBg = 'bg-rose-100 text-rose-800 border-rose-400 hover:bg-rose-200';
                      else if (hasQuarantine) cellBg = 'bg-amber-100 text-amber-800 border-amber-400 hover:bg-amber-200';
                      else if (hasStock) cellBg = 'bg-emerald-100 text-emerald-800 border-emerald-400 hover:bg-emerald-200';

                      return (
                        <button
                          key={loc.id}
                          onClick={() => setSelectedLocationCode(loc.code)}
                          className={`p-3 rounded border text-center transition-all flex flex-col items-center justify-between min-h-[64px] cursor-pointer ${cellBg} ${
                            isSelected ? 'ring-2 ring-primary ring-offset-2 font-bold scale-105 shadow' : ''
                          }`}
                        >
                          <span className="font-data-mono font-bold text-xs">{loc.code}</span>
                          <span className="text-[10px] font-semibold mt-1">
                            {hasStock ? `${totalLocQty} Thùng` : 'Trống'}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    // Default fallback visual rack representation if locations list is dynamically loading
                    ['A1-R1-B01', 'A1-R1-B02', 'A1-R1-B03', 'A1-R1-B04', 'A1-R2-B01', 'A1-R2-B02', 'A2-R1-B01', 'A2-R1-B02'].map((code) => {
                      const posInLoc = positions.filter(p => p.location_code === code);
                      const hasStock = posInLoc.length > 0;
                      const totalLocQty = posInLoc.reduce((s, p) => s + Number(p.quantity_on_hand || 0), 0);
                      const isSelected = selectedLocationCode === code;

                      return (
                        <button
                          key={code}
                          onClick={() => setSelectedLocationCode(code)}
                          className={`p-3 rounded border text-center transition-all flex flex-col items-center justify-between min-h-[64px] ${
                            hasStock ? 'bg-emerald-100 text-emerald-800 border-emerald-400' : 'bg-slate-100 text-slate-600 border-slate-300'
                          } ${isSelected ? 'ring-2 ring-primary ring-offset-2 font-bold' : ''}`}
                        >
                          <span className="font-data-mono font-bold text-xs">{code}</span>
                          <span className="text-[10px] font-semibold mt-1">
                            {hasStock ? `${totalLocQty} Thùng` : 'Trống'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Zone C: Quarantine & Quality Area */}
              <div className="border border-amber-300/80 rounded-lg p-4 bg-amber-50/30 space-y-3">
                <div className="flex justify-between items-center border-b border-amber-200 pb-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-amber-900">
                    <span className="material-symbols-outlined text-[18px] text-amber-600">verified_user</span>
                    ZONE C - KHU CÁCH LY KIỂM ĐỊNH CHẤT LƯỢNG (QC Quarantine Zone)
                  </div>
                  <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded">QC Hold Only</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {['QC-BAY-01', 'QC-BAY-02', 'REJECT-BIN-01', 'REJECT-BIN-02'].map((locCode) => {
                    const posInLoc = positions.filter(p => p.location_code === locCode);
                    const totalLocQty = posInLoc.reduce((s, p) => s + Number(p.quantity_on_hand || 0), 0);
                    const isSelected = selectedLocationCode === locCode;

                    return (
                      <button
                        key={locCode}
                        onClick={() => setSelectedLocationCode(locCode)}
                        className={`p-3 rounded border text-center transition-all flex flex-col items-center justify-between min-h-[60px] bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 ${
                          isSelected ? 'ring-2 ring-amber-600 ring-offset-2 font-bold' : ''
                        }`}
                      >
                        <span className="font-data-mono font-bold text-xs">{locCode}</span>
                        <span className="text-[10px] font-semibold mt-1">
                          {totalLocQty > 0 ? `${totalLocQty} Thùng (Cách ly)` : 'Sẵn sàng'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Location Inspector Side Panel */}
            <div className="bg-white border border-outline-variant rounded-xl p-4 shadow-sm h-fit space-y-4 text-xs font-semibold">
              <div className="border-b border-outline-variant pb-3">
                <h4 className="font-bold text-sm text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px] text-secondary">search</span>
                  Chi Tiết Ô Kệ ({selectedLocationCode || 'Chưa chọn ô kệ'})
                </h4>
                <p className="text-[11px] text-on-surface-variant font-normal">Hiển thị toàn bộ thùng hàng và mã lô đang lưu trữ tại ô kệ được chọn.</p>
              </div>

              {selectedLocationCode ? (
                selectedLocationPositions.length > 0 ? (
                  <div className="space-y-3">
                    {selectedLocationPositions.map((pos) => (
                      <div key={pos.id} className="bg-surface-container-low p-3 rounded-lg border border-outline-variant space-y-1">
                        <p className="font-bold text-primary text-xs">{pos.sku_name}</p>
                        <p className="font-data-mono text-[10px] text-on-surface-variant">SKU: {pos.sku_code}</p>
                        <div className="flex justify-between items-center font-data-mono text-xs pt-1 border-t border-outline-variant/40 mt-1">
                          <span className="text-secondary font-bold">Lô: {pos.batch_code}</span>
                          <span className="font-bold text-primary text-sm">{pos.quantity_on_hand} Thùng</span>
                        </div>
                        <p className="text-[10px] text-on-surface-variant pt-0.5">
                          Hạn dùng: {pos.expiration_date ? new Date(pos.expiration_date).toLocaleDateString('vi-VN') : 'Không có'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-on-surface-variant bg-surface-container-low rounded-lg border border-dashed border-outline-variant">
                    <span className="material-symbols-outlined text-3xl text-outline mb-1">inbox</span>
                    <p className="font-bold">Ô kệ đang trống</p>
                    <p className="text-[10px] text-on-surface-variant mt-1">Chưa có mã lô hay thùng hàng nào xếp trên ô kệ này.</p>
                  </div>
                )
              ) : (
                <div className="p-6 text-center text-on-surface-variant bg-surface-container-low rounded-lg border border-dashed border-outline-variant">
                  <span className="material-symbols-outlined text-3xl text-outline mb-1">touch_app</span>
                  <p className="font-bold">Hãy nhấp vào 1 ô kệ trên sơ đồ</p>
                  <p className="text-[10px] text-on-surface-variant mt-1">Để xem danh sách hàng hóa và số lượng lưu kho trực quan.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB 3: TRANSFER */}
      {activeSubTab === 'transfer' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-outline-variant bg-surface-container-low font-bold text-sm text-primary flex justify-between items-center">
                <span>Yêu Cầu Chuyển Kho Đang Xử Lý (Physical Transfer)</span>
                {isLoading && <span className="text-xs font-normal text-on-surface-variant animate-pulse">Đang đồng bộ DB...</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface border-b border-outline-variant text-[10px] text-on-surface-variant font-bold uppercase">
                    <tr>
                      <th className="p-3">Mã Phiếu</th>
                      <th className="p-3">Kho Đi</th>
                      <th className="p-3">Kho Đến</th>
                      <th className="p-3 text-right">Tổng Số Lượng</th>
                      <th className="p-3">Ngày Tạo</th>
                      <th className="p-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant font-data-mono">
                    {transfers.map((t) => (
                      <tr key={t.id} className="hover:bg-surface-bright transition-colors text-xs">
                        <td className="p-3 font-bold text-primary">{t.transfer_code}</td>
                        <td className="p-3 font-body-md font-semibold text-on-surface">{t.source_warehouse_name}</td>
                        <td className="p-3 font-body-md font-semibold text-on-surface">{t.destination_warehouse_name}</td>
                        <td className="p-3 text-right font-bold">{t.total_qty} Thùng</td>
                        <td className="p-3">{new Date(t.created_at).toLocaleDateString()}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[9px] ${
                            t.status === 'DRAFT' ? 'bg-surface-container-high text-on-surface-variant' :
                            t.status === 'APPROVED' ? 'bg-secondary-fixed text-on-secondary-fixed' :
                            t.status === 'PICKING' ? 'bg-primary-container text-on-primary-container' :
                            t.status === 'DISPATCHED' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-primary text-on-primary'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {transfers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-on-surface-variant font-body-md">
                          Chưa có yêu cầu chuyển kho nào được khởi tạo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Form to create transfer */}
          <div className="bg-white border border-outline-variant rounded-xl p-4 shadow-sm h-fit">
            <h3 className="font-bold text-sm text-primary border-b pb-2 mb-3">Tạo Yêu Cầu Chuyển Kho Mới</h3>
            <form onSubmit={handleCreateTransfer} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-on-surface-variant mb-1">Đến kho (Destination Warehouse)</label>
                <select
                  value={destWarehouseId}
                  onChange={(e) => setDestWarehouseId(e.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold"
                >
                  <option value="">-- Chọn kho đích --</option>
                  {allWarehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.code} - {wh.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1">Chọn Lô Hàng Chuyển</label>
                <select
                  value={selectedPosId}
                  onChange={(e) => setSelectedPosId(e.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold"
                >
                  <option value="">-- Chọn tồn kho cần chuyển --</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku_code} - Lô {p.batch_code} ({p.quantity_on_hand} Thùng tại {p.location_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-on-surface-variant mb-1">Vị trí nhận hàng (Dest Loc)</label>
                  <select
                    value={destLocationId}
                    onChange={(e) => setDestLocationId(e.target.value)}
                    className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold"
                  >
                    <option value="">-- Chọn kệ nhận --</option>
                    {allLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} ({loc.zone_code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-on-surface-variant mb-1">Số lượng chuyển</label>
                  <input
                    type="number"
                    min="1"
                    value={transQty}
                    onChange={(e) => setTransQty(Number(e.target.value))}
                    className="w-full bg-surface border border-outline-variant rounded p-2 font-data-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary text-on-primary py-2.5 rounded font-bold hover:bg-primary-container transition-colors"
              >
                Lập Yêu Cầu Chuyển Kho
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUB TAB 4: STOCKTAKE */}
      {activeSubTab === 'stocktake' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-outline-variant bg-surface-container-low font-bold text-sm text-primary flex justify-between items-center">
                <span>Các Đợt Kiểm Kê Kho Blind Stocktake (Kiểm đếm mù)</span>
                {isLoading && <span className="text-xs font-normal text-on-surface-variant animate-pulse">Đang tải DB...</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface border-b border-outline-variant text-[10px] text-on-surface-variant font-bold uppercase">
                    <tr>
                      <th className="p-3">Mã Phiên</th>
                      <th className="p-3">Loại Kiểm Đếm</th>
                      <th className="p-3 text-center">Ngưỡng Kiểm Lại</th>
                      <th className="p-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant font-data-mono">
                    {stocktakes.map((s) => (
                      <tr key={s.id} className="hover:bg-surface-bright transition-colors text-xs">
                        <td className="p-3 font-bold text-primary">{s.session_code}</td>
                        <td className="p-3 font-body-md font-semibold text-on-surface">
                          {s.blind_count ? 'Đếm Mù (Blind Count)' : 'Đếm Thường'}
                        </td>
                        <td className="p-3 text-center">{s.recount_threshold} thùng</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[9px] ${
                            s.status === 'CREATED' || s.status === 'COUNTING' ? 'bg-primary-container text-on-primary-container animate-pulse' :
                            s.status === 'POSTED' ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-surface-container-high text-on-surface-variant'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {stocktakes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-on-surface-variant font-body-md">
                          Chưa có đợt kiểm kê nào được tạo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Form to initiate stocktake */}
          <div className="bg-white border border-outline-variant rounded-xl p-4 shadow-sm h-fit">
            <h3 className="font-bold text-sm text-primary border-b pb-2 mb-3">Tạo Phiên Kiểm Kê Mới</h3>
            <form onSubmit={handleCreateStocktake} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-on-surface-variant mb-1">Chọn Khu Vực Kiểm Kê (Zone)</label>
                <select
                  value={selectedZoneId}
                  onChange={(e) => setSelectedZoneId(e.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold"
                >
                  <option value="">-- Tất cả khu vực kho --</option>
                  {allZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.code} - {z.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-surface-container-low p-3 rounded text-[11px] text-on-surface-variant space-y-1">
                <p className="font-bold text-primary">Quy định kiểm kê mù (Phase 7):</p>
                <p>• Tự động khóa toàn bộ tồn kho tại khu vực kiểm kê.</p>
                <p>• Người đếm không thấy số dư sổ sách để đảm bảo minh bạch.</p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary text-on-primary py-2.5 rounded font-bold hover:bg-primary-container transition-colors flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">lock</span>
                Khởi Tạo Phiên &amp; Khóa Kệ
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
