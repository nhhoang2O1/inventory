import React, { useState } from 'react';
import { useInventory } from '../hooks/useInventory';

interface InventoryViewProps {
  brandFilter: string;
  setBrandFilter: (brand: string) => void;
  onRefresh: () => void;
  actorId: string;
  warehouseId: string;
  warehouseCode: string;
}

type InventorySubTab = 'atp' | 'transfer' | 'stocktake';

export function InventoryView({
  brandFilter,
  setBrandFilter,
  onRefresh,
  actorId,
  warehouseId,
  warehouseCode
}: InventoryViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<InventorySubTab>('atp');

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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-outline-variant pb-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-primary font-bold">Tra Cứu Tồn Kho &amp; Nghiệp Vụ Kho (Phase 7)</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Tra cứu số dư ATP thực tế, điều chuyển kho nội bộ và kiểm kê điều chỉnh chênh lệch.</p>
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

      {/* Sub tabs selection */}
      <div className="flex border-b border-outline-variant overflow-x-auto text-xs font-semibold gap-1">
        <button
          onClick={() => setActiveSubTab('atp')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'atp' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Số Dư Tồn Kho Khả Dụng (ATP)
        </button>
        <button
          onClick={() => setActiveSubTab('transfer')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'transfer' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Điều Chuyển Nội Bộ (Transfer)
        </button>
        <button
          onClick={() => setActiveSubTab('stocktake')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'stocktake' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Kiểm Kê Định Kỳ (Stocktake)
        </button>
      </div>

      {/* SUB TAB: ATP */}
      {activeSubTab === 'atp' && (
        <div className="space-y-6">
          {/* Filter bar */}
          <div className="bg-white border border-outline-variant rounded-xl p-4 flex flex-wrap gap-4 items-end text-xs">
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="font-label-caps text-on-surface-variant font-bold">Chọn Kho Phân Vùng</label>
              <select className="w-full bg-surface border border-outline-variant rounded px-3 py-2 focus:border-secondary outline-none font-semibold">
                <option>Kho hiện tại ({warehouseCode})</option>
              </select>
            </div>

            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="font-label-caps text-on-surface-variant font-bold">Thương Hiệu</label>
              <select
                className="w-full bg-surface border border-outline-variant rounded px-3 py-2 focus:border-secondary outline-none font-semibold"
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
              >
                <option value="All">Tất cả thương hiệu</option>
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
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-surface-container-low border-b border-outline-variant text-xs">
                  <tr>
                    <th className="p-3 font-bold">Chi Tiết Sản Phẩm SKU</th>
                    <th className="p-3 font-bold text-center">Mã Lô (Batch)</th>
                    <th className="p-3 font-bold text-right">Tổng Tồn Vật Lý (On-hand)</th>
                    <th className="p-3 font-bold text-right">Tồn Giữ Chỗ (Active Reservation)</th>
                    <th className="p-3 font-bold text-right bg-primary-fixed/20 text-primary font-bold">Tồn Kho Khả Dụng Bán (ATP)</th>
                    <th className="p-3 font-bold text-center">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant text-xs">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-on-surface-variant">
                        <div className="flex items-center justify-center gap-2">
                          <span className="animate-spin material-symbols-outlined">sync</span>
                          Đang tải dữ liệu tồn kho từ Database...
                        </div>
                      </td>
                    </tr>
                  ) : filteredPositions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-on-surface-variant font-semibold">
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
                      const isQuarantined = pos.stock_status === 'QUARANTINED';
                      const isBlocked = pos.stock_status === 'BLOCKED' || pos.stock_status === 'DAMAGED';

                      return (
                        <tr key={idx} className={`hover:bg-surface-bright transition-colors ${isQuarantined ? 'bg-warning/5' : isBlocked ? 'bg-error/5' : ''}`}>
                          <td className="p-3">
                            <p className="font-bold text-primary text-sm">{pos.sku_name}</p>
                            <p className="font-data-mono text-on-surface-variant text-[10px]">SKU: {pos.sku_code}</p>
                          </td>
                          <td className="p-3 font-data-mono text-center text-on-surface font-semibold">
                            {pos.batch_code}
                          </td>
                          <td className="p-3 text-right">
                            <div className="font-data-mono font-bold text-on-surface">{onHand.toLocaleString()} Thùng/Két</div>
                            <div className="font-data-mono text-[10px] text-secondary">HSD: {pos.expiration_date ? new Date(pos.expiration_date).toLocaleDateString('vi-VN') : 'Không giới hạn'}</div>
                          </td>
                          <td className="p-3 text-right font-data-mono text-on-surface-variant">
                            {activeRes.toLocaleString()} Thùng/Két
                          </td>
                          <td className="p-3 text-right bg-primary-fixed/5 font-bold">
                            <div className={`font-data-mono text-sm ${atp === 0 ? 'text-error' : 'text-primary'}`}>
                              {atp.toLocaleString()} Thùng/Két
                            </div>
                            <div className="font-data-mono text-[10px] text-secondary">
                              Trạng thái gốc: {pos.stock_status}
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

      {/* SUB TAB: TRANSFER */}
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

      {/* SUB TAB: STOCKTAKE */}
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
