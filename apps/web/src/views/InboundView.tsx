import React from 'react';
import { InboundItem } from '../types';

interface InboundViewProps {
  operatorId: string;
  userRole?: string;
  warehouseCode?: string;
  inboundItems: InboundItem[];
  setInboundItems: (items: InboundItem[]) => void;
  handleInboundQtyChange: (index: number, val: string) => void;
  handleInboundAddLine: () => void;
  handleInboundRemoveLine: (index: number) => void;
  returnedCrateQty: number;
  setReturnedCrateQty: (qty: number) => void;
  uploadedFiles: string[];
  setUploadedFiles: (files: string[]) => void;
  inboundSuccessMessage: string | null;
  handleConfirmReceipt: () => void;

  purchaseOrders: any[];
  selectedPoId: string;
  setSelectedPoId: (id: string) => void;
  locationsList: any[];
  skusList?: any[];
  fetchSkus?: () => Promise<any>;
  isLoading: boolean;
  error: string | null;
}

export function InboundView({
  operatorId,
  userRole = 'MANAGER',
  warehouseCode = 'KHO-A',
  inboundItems,
  setInboundItems,
  handleInboundQtyChange,
  handleInboundAddLine,
  handleInboundRemoveLine,
  returnedCrateQty,
  setReturnedCrateQty,
  uploadedFiles,
  setUploadedFiles,
  inboundSuccessMessage,
  handleConfirmReceipt,

  purchaseOrders,
  selectedPoId,
  setSelectedPoId,
  locationsList,
  skusList = [],
  fetchSkus,
  isLoading,
  error
}: InboundViewProps) {
  const [showAddSkuModal, setShowAddSkuModal] = React.useState(false);
  const [newSkuCode, setNewSkuCode] = React.useState('');
  const [newSkuName, setNewSkuName] = React.useState('');
  const [newSkuUnit, setNewSkuUnit] = React.useState('CASE');
  const [newSkuRatio, setNewSkuRatio] = React.useState('24');
  const [newSkuBarcode, setNewSkuBarcode] = React.useState('');
  const [skuError, setSkuError] = React.useState<string | null>(null);
  const [isCreatingSku, setIsCreatingSku] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const names = Array.from(e.target.files).map(f => f.name);
      setUploadedFiles([...uploadedFiles, ...names]);
      e.target.value = '';
    }
  };

  const activePo = purchaseOrders.find(po => po.id === selectedPoId);

  const handleCreateSkuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSkuError(null);
    if (!newSkuCode.trim() || !newSkuName.trim()) {
      setSkuError('Mã SKU và Tên sản phẩm không được để trống.');
      return;
    }
    setIsCreatingSku(true);
    try {
      const res = await fetch('/api/v1/inventory/skus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-actor-id': '482538f3-1ea3-43a2-a07d-24b28a853742'
        },
        body: JSON.stringify({
          code: newSkuCode.trim(),
          name: newSkuName.trim(),
          uomCode: newSkuUnit,
          ratio: parseInt(newSkuRatio, 10) || 24,
          barcode: newSkuBarcode.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Không thể tạo SKU mới.');
      }
      if (fetchSkus) {
        await fetchSkus();
      }
      const mfgStr = new Date().toISOString().split('T')[0] || '';
      const expStr = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0] || '';
      setInboundItems([
        ...inboundItems,
        {
          skuId: data.id,
          sku: data.code || newSkuCode.trim(),
          name: data.name || newSkuName.trim(),
          qty: 1,
          unit: data.uom_code || newSkuUnit,
          ratio: data.ratio || parseInt(newSkuRatio, 10) || 24,
          batch: `B-${warehouseCode}-${Math.floor(1000 + Math.random() * 9000)}`,
          mfg: mfgStr,
          exp: expStr,
          locationId: locationsList[0]?.id || '',
          poLineId: '',
          uomId: ''
        }
      ]);
      setShowAddSkuModal(false);
      setNewSkuCode('');
      setNewSkuName('');
      setNewSkuBarcode('');
    } catch (err: any) {
      setSkuError(err.message || 'Lỗi khi tạo SKU mới.');
    } finally {
      setIsCreatingSku(false);
    }
  };

  const [dockTrucks, setDockTrucks] = React.useState<any[]>([]);
  const [dockConfirmMsg, setDockConfirmMsg] = React.useState<string | null>(null);
  const [truckQtyInputs, setTruckQtyInputs] = React.useState<Record<string, number>>({});

  const fetchDockTrucks = async () => {
    try {
      const res = await fetch('/api/v1/gate/entries');
      const data = await res.json();
      if (Array.isArray(data)) {
        setDockTrucks(
          data.filter(
            (e: any) =>
              Boolean(e.dock_code || e.dock_location_id) &&
              (e.status === 'LOADING' || e.status === 'DOCK_RECEIVED')
          )
        );
      }
    } catch (e) {
      console.error('Failed to fetch dock trucks for Storekeeper:', e);
    }
  };

  React.useEffect(() => {
    fetchDockTrucks();
  }, []);

  const handleStorekeeperConfirmDock = async (truckEntryId: string, confirmedQtyCases?: number) => {
    try {
      const res = await fetch('/api/v1/gate/confirm-dock-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truckEntryId, confirmedQtyCases })
      });
      if (res.ok) {
        const msg = confirmedQtyCases
          ? `🟢 ĐÃ XÁC NHẬN THỦ KHO: Đã kiểm đếm & hạ ${confirmedQtyCases} thùng cho xe này! Bảo vệ trạm cân có thể cân W2 và mở cổng xuất xe.`
          : '🟢 ĐÃ XÁC NHẬN THỦ KHO: Đã kiểm đếm & nhận đủ hàng tại Dock! Bảo vệ tại trạm cân cổng ra có thể cho xe lên Cân W2 và xuất cổng.';
        setDockConfirmMsg(msg);
        fetchDockTrucks();
      } else {
        const err = await res.json();
        alert(err.message || 'Lỗi khi xác nhận nhận hàng');
      }
    } catch (e: any) {
      alert('Lỗi kết nối khi xác nhận nhận hàng');
    }
  };

  const isManager = !userRole || userRole.toUpperCase().includes('MANAGER') || userRole.toLowerCase().includes('manager');

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-headline-md text-headline-md text-on-background font-bold">
              Lập Phiếu Nhập Kho Từ PO:
            </h2>
            {purchaseOrders.length > 0 ? (
              <select
                value={selectedPoId}
                onChange={(e) => setSelectedPoId(e.target.value)}
                className="px-3 py-1.5 border border-outline rounded bg-surface font-data-mono text-primary font-bold focus:outline-none"
              >
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.po_code} ({po.status})
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-error font-semibold text-sm">Không có PO khả dụng cho kho này</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-xs">
            <span className="text-on-surface-variant">Nhà cung cấp: <strong>Heineken Vietnam N.V</strong></span>
            <span className="text-on-surface-variant">Nhân viên nhận: <strong>{operatorId}</strong></span>
            <span className="text-on-surface-variant">Ngày PO: <strong>{activePo ? new Date(activePo.order_date).toLocaleDateString('vi-VN') : 'N/A'}</strong></span>
          </div>
        </div>
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-caps text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-secondary"></span>
            ĐANG THỰC HIỆN
          </span>
        </div>
      </div>

      {/* Dock Operations Banner for Storekeeper */}
      <div className="bg-indigo-50/90 border border-indigo-200 p-4 rounded-xl shadow-sm space-y-3">
        <div className="flex justify-between items-center border-b border-indigo-200 pb-2">
          <h3 className="text-sm font-bold text-indigo-950 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-700">move_location</span>
            DANH SÁCH XE ĐANG HẠ HÀNG TẠI DOCK (DÀNH CHO THỦ KHO KIỂM ĐẾM &amp; XÁC NHẬN)
          </h3>
          <span className="bg-indigo-200 text-indigo-900 font-extrabold text-[10px] px-2 py-0.5 rounded uppercase">
            {dockTrucks.length} XE TẠI DOCK
          </span>
        </div>

        {dockConfirmMsg && (
          <div className="bg-emerald-100 text-emerald-950 p-2.5 rounded border border-emerald-300 font-bold text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-700">verified</span>
            {dockConfirmMsg}
          </div>
        )}

        {dockTrucks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dockTrucks.map(truck => {
              const isConfirmed = truck.storekeeper_confirmed || truck.status === 'DOCK_RECEIVED';
              const skuLines: any[] = Array.isArray(truck.po_sku_lines) ? truck.po_sku_lines : [];
              const totalExpectedKg = skuLines.reduce((sum, l) => sum + Number(l.lineWeightKg || 0), 0);
              const totalOrderedCases = skuLines.reduce((sum, l) => sum + Number(l.orderedQty || 0), 0);
              const weightInKg = Number(truck.weight_in || 0);

              // Detect multi-truck for the same PO
              const poCode = truck.po_do_code;
              const samePoTrucks = dockTrucks.filter(t => poCode && t.po_do_code === poCode);
              const isMultiTruck = samePoTrucks.length > 1;
              const truckIndex = samePoTrucks.findIndex(t => t.id === truck.id) + 1;

              const defaultAllocatedCases = isMultiTruck
                ? Math.round(totalOrderedCases / samePoTrucks.length)
                : (totalOrderedCases || 400);
              const currentInputQty = truckQtyInputs[truck.id] ?? defaultAllocatedCases;
              const unitWeightKg = skuLines[0]?.unitWeightKg || 8.5;
              const calculatedTruckWeightKg = currentInputQty * unitWeightKg;

              return (
                <div key={truck.id} className="bg-white p-3.5 rounded-xl border border-indigo-200 shadow-sm space-y-2.5 text-xs">
                  <div className="flex justify-between items-center font-bold font-data-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-indigo-900 text-sm font-extrabold">{truck.po_do_code || 'PO-20260728-08'}</span>
                      {isMultiTruck && (
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md text-[10px] font-extrabold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">local_shipping</span>
                          Xe {truckIndex}/{samePoTrucks.length}
                        </span>
                      )}
                    </div>
                    <span className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{truck.license_plate}</span>
                  </div>

                  {isMultiTruck && (
                    <div className="bg-amber-50/90 border border-amber-200/80 p-2 rounded-lg text-[11px] text-amber-950 flex items-center gap-1.5 font-semibold">
                      <span className="material-symbols-outlined text-amber-600 text-[14px]">info</span>
                      <span>Đoàn {samePoTrucks.length} xe giao cho Đơn [{poCode}]. Đây là <strong>Xe số {truckIndex}/{samePoTrucks.length}</strong>.</span>
                    </div>
                  )}
                  <div className="text-slate-700 space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tài xế:</span>
                      <strong className="text-slate-900">{truck.driver_name}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cửa Dock:</span>
                      <strong className="text-indigo-700 font-data-mono font-bold">{truck.dock_code || truck.dock_location_id || 'DOCK-01'}</strong>
                    </div>
                    <div className="flex justify-between border-t border-slate-200/60 pt-1">
                      <span className="text-slate-500">Tổng Đơn PO Khai Báo:</span>
                      <strong className="text-primary font-bold">{skuLines.length > 0 ? `${skuLines.length} SKU (${totalOrderedCases.toLocaleString()} thùng)` : '1 SKU (400 thùng)'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 font-semibold">Tải Trọng Dự Kiến Cả Đơn:</span>
                      <strong className="text-emerald-700 font-data-mono font-bold">
                        {totalExpectedKg > 0 ? `${totalExpectedKg.toLocaleString('vi-VN')} kg (${(totalExpectedKg / 1000).toFixed(2)} Tấn)` : '3,400 kg (3.40 Tấn)'}
                      </strong>
                    </div>
                    {weightInKg > 0 && (
                      <div className="flex justify-between border-t border-slate-200/60 pt-1">
                        <span className="text-slate-500">Trọng lượng đè cân vào ($W_1$):</span>
                        <strong className="text-slate-900 font-data-mono">{weightInKg.toLocaleString()} kg</strong>
                      </div>
                    )}
                  </div>

                  {/* Input field for Storekeeper to specify exact cases unloaded by THIS TRUCK */}
                  {!isConfirmed && (
                    <div className="bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-lg space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <label className="font-bold text-emerald-950 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px] text-emerald-700">edit_note</span>
                          Số lượng xe này thực hạ xuống Dock:
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={currentInputQty}
                            onChange={(e) => setTruckQtyInputs({ ...truckQtyInputs, [truck.id]: Math.max(1, Number(e.target.value)) })}
                            className="w-20 px-2 py-1 bg-white font-data-mono font-extrabold text-sm text-indigo-950 border border-emerald-300 rounded text-center focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                          />
                          <span className="font-bold text-slate-700">thùng</span>
                        </div>
                      </div>
                      <div className="flex justify-between text-[11px] text-emerald-900 border-t border-emerald-200/60 pt-1.5 font-semibold">
                        <span>Tải trọng tương ứng xe này ({currentInputQty} thùng):</span>
                        <strong className="font-data-mono text-emerald-800">{calculatedTruckWeightKg.toLocaleString()} kg ({(calculatedTruckWeightKg / 1000).toFixed(2)} Tấn)</strong>
                      </div>
                    </div>
                  )}

                  {/* SKU Breakdown list if available */}
                  {skuLines.length > 0 && (
                    <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-2.5 space-y-1.5 text-[11px]">
                      <div className="font-bold text-indigo-950 flex items-center gap-1 border-b border-indigo-200/50 pb-1">
                        <span className="material-symbols-outlined text-[14px] text-indigo-600">inventory_2</span>
                        Chi Tiết Quy Đổi Trọng Lượng Theo Từng SKU:
                      </div>
                      {skuLines.map((line: any, idx: number) => (
                        <div key={idx} className="flex flex-col sm:flex-row sm:justify-between text-slate-800 gap-0.5">
                          <span>• <strong>{line.skuName || line.skuCode}</strong></span>
                          <span className="font-data-mono font-semibold text-slate-900">
                            {line.orderedQty} thùng × {line.unitWeightKg} kg = <span className="text-indigo-900 font-bold">{Number(line.lineWeightKg).toLocaleString()} kg</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-1 flex justify-between items-center">
                    {isConfirmed ? (
                      <span className="w-full justify-center bg-emerald-100 text-emerald-900 text-[11px] font-extrabold py-2 px-3 rounded-lg border border-emerald-300 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">verified</span>
                        🟢 Đã Xác Nhận Hạ Hàng Tại Dock {truck.storekeeper_notes ? `(${truck.storekeeper_notes})` : ''}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStorekeeperConfirmDock(truck.id, currentInputQty)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.99]"
                      >
                        <span className="material-symbols-outlined text-[15px]">check_circle</span>
                        [Thủ Kho] Xác Nhận Đã Hạ {currentInputQty} Thùng Của Xe Này
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic text-center py-2">
            Hiện chưa có xe nào đỗ tại Dock chờ Thủ kho kiểm đếm.
          </div>
        )}
      </div>

      {error && (
        <div className="bg-error-container/20 text-error p-4 rounded border border-error/30 flex items-center gap-2 font-semibold text-xs">
          <span className="material-symbols-outlined">error</span>
          {error}
        </div>
      )}

      {inboundSuccessMessage && (
        <div className="bg-tertiary-container/20 text-on-tertiary-container p-4 rounded border border-tertiary-container/30 flex items-center gap-2 font-semibold text-xs">
          <span className="material-symbols-outlined">check_circle</span>
          {inboundSuccessMessage}
        </div>
      )}

      {/* Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Receipt Items Table */}
        <div className="lg:col-span-9 bg-white border border-outline-variant rounded shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-outline-variant bg-surface flex justify-between items-center">
            <h3 className="font-headline-sm text-headline-sm text-on-background font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">inventory</span>
              Danh Sách Hàng Nhập Kho (Strict Unit Policy)
            </h3>
            {isManager && (
              <button
                type="button"
                onClick={() => setShowAddSkuModal(true)}
                className="px-3 py-1.5 bg-secondary text-on-secondary rounded text-xs font-bold flex items-center gap-1.5 hover:bg-secondary-container hover:text-on-secondary-container transition-colors shadow-xs"
              >
                <span className="material-symbols-outlined text-[16px]">add_box</span>
                Khai Báo SKU Mới
              </button>
            )}
          </div>

          <div className="max-h-[500px] overflow-auto scrollbar-thin">
            <table className="w-full text-left border-collapse min-w-[1050px]">
              <thead className="bg-surface-container-low border-b border-outline-variant font-label-caps text-label-caps text-on-surface-variant text-xs sticky top-0 z-10 shadow-xs">
                <tr>
                  <th className="p-3 font-semibold min-w-[280px]">SKU / Tên Sản Phẩm</th>
                  <th className="p-3 font-semibold min-w-[110px]">Đơn Vị</th>
                  <th className="p-3 font-semibold min-w-[180px] text-right">Số Nguyên Nhập (Thùng/Két)</th>
                  <th className="p-3 font-semibold min-w-[140px]">Số Lô (Batch)</th>
                  <th className="p-3 font-semibold min-w-[210px]">NSX / HSD</th>
                  <th className="p-3 font-semibold min-w-[170px]">Vị Trí Lưu Trữ</th>
                  <th className="p-3 font-semibold w-12 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-divide divide-y divide-outline-variant text-xs">
                {inboundItems.map((item, index) => (
                  <tr key={index} className="hover:bg-surface-bright transition-colors group">
                    <td className="p-3">
                      {skusList && skusList.length > 0 ? (
                        <select
                          value={item.skuId}
                          onChange={(e) => {
                            const selectedSku = skusList.find(s => s.id === e.target.value);
                            if (selectedSku) {
                              const updated = [...inboundItems];
                              const prev = updated[index];
                              if (prev) {
                                updated[index] = {
                                  ...prev,
                                  skuId: selectedSku.id,
                                  sku: selectedSku.code,
                                  name: selectedSku.name,
                                  unit: selectedSku.uom_code || 'CASE',
                                  ratio: selectedSku.ratio || 24
                                };
                                setInboundItems(updated);
                              }
                            }
                          }}
                          className="w-full px-2 py-1 border border-outline-variant rounded font-data-mono text-primary font-bold text-xs bg-surface focus:border-secondary focus:ring-1 focus:ring-secondary outline-none"
                        >
                          {skusList.map((sku) => (
                            <option key={sku.id} value={sku.id}>
                              {sku.code} - {sku.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <div className="font-data-mono text-primary font-bold">{item.sku}</div>
                          <div className="text-on-surface-variant font-semibold truncate max-w-[150px]">{item.name}</div>
                        </>
                      )}
                    </td>
                    <td className="p-3 text-on-surface-variant font-semibold">{item.unit} (1:{item.ratio})</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <input
                          className="w-16 px-1.5 py-1 border border-outline-variant rounded text-right font-data-mono text-data-mono focus:border-secondary focus:ring-1 focus:ring-secondary outline-none"
                          type="number"
                          min="0"
                          value={item.qty}
                          onChange={(e) => handleInboundQtyChange(index, e.target.value)}
                        />
                        <span className="text-[10px] text-on-surface-variant whitespace-nowrap bg-surface-container px-1.5 py-1 rounded font-data-mono">
                          = {(item.qty * item.ratio).toLocaleString()} lẻ
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <input
                        className="w-full px-1.5 py-1 border border-outline-variant rounded font-data-mono text-data-mono uppercase focus:border-secondary focus:ring-1 focus:ring-secondary outline-none text-xs"
                        type="text"
                        value={item.batch}
                        onChange={(e) => {
                          const updated = [...inboundItems];
                          const currentItem = updated[index];
                          if (currentItem) {
                            currentItem.batch = e.target.value;
                          }
                          setInboundItems(updated);
                        }}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1 text-[10px]">
                        <div className="flex items-center gap-1">
                          <span className="text-outline w-7 font-bold">NSX:</span>
                          <input
                            className="px-1 py-0.5 border border-outline-variant rounded text-on-surface-variant outline-none"
                            type="date"
                            value={item.mfg}
                            onChange={(e) => {
                              const updated = [...inboundItems];
                              const currentItem = updated[index];
                              if (currentItem) {
                                currentItem.mfg = e.target.value;
                              }
                              setInboundItems(updated);
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-outline w-7 font-bold">HSD:</span>
                          <input
                            className="px-1 py-0.5 border border-outline-variant rounded text-on-surface-variant outline-none"
                            type="date"
                            value={item.exp}
                            onChange={(e) => {
                              const updated = [...inboundItems];
                              const currentItem = updated[index];
                              if (currentItem) {
                                currentItem.exp = e.target.value;
                              }
                              setInboundItems(updated);
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <select
                        value={item.locationId}
                        onChange={(e) => {
                          const updated = [...inboundItems];
                          const currentItem = updated[index];
                          if (currentItem) {
                            currentItem.locationId = e.target.value;
                          }
                          setInboundItems(updated);
                        }}
                        className="w-full px-1.5 py-1 border border-outline-variant rounded font-semibold text-xs bg-surface outline-none"
                      >
                        {locationsList.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.code} ({loc.zone_code})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleInboundRemoveLine(index)}
                        className="text-on-surface-variant hover:text-error transition-colors p-1"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={7} className="p-3">
                    <button
                      onClick={handleInboundAddLine}
                      className="text-secondary hover:text-primary font-bold flex items-center gap-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                      Thêm Dòng Sản Phẩm Mới
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Panel: Returnable Packaging & Deposit Tracker */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {/* Returnables & Deposits */}
          <div className="bg-white border border-outline-variant rounded shadow-sm p-4">
            <h3 className="font-headline-sm text-headline-sm text-on-background font-bold flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-secondary">recycling</span>
              Bao Bì Quay Vòng &amp; Tiền Cọc
            </h3>
            <div className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block font-label-caps text-on-surface-variant mb-1">Số Vỏ Cọc Thực Trả Lại (Rỗng)</label>
                <div className="flex items-center">
                  <input
                    className="w-full px-3 py-2 border border-outline-variant rounded-l focus:border-secondary focus:ring-1 focus:ring-secondary outline-none font-data-mono text-data-mono text-right"
                    type="number"
                    value={returnedCrateQty}
                    onChange={(e) => setReturnedCrateQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                  <span className="bg-surface-container-low border border-l-0 border-outline-variant px-3 py-2 rounded-r text-on-surface-variant font-bold">Két Vỏ</span>
                </div>
              </div>

              <div>
                <label className="block font-label-caps text-on-surface-variant mb-1">Số Két Nợ Phát Sinh (Khách Nợ Kho)</label>
                <div className="flex items-center">
                  <input
                    className="w-full px-3 py-2 border border-outline-variant rounded-l bg-error-container/20 text-error outline-none font-data-mono text-data-mono text-right"
                    type="number"
                    readOnly
                    value={Math.max(0, inboundItems.reduce((sum, item) => sum + item.qty, 0) - returnedCrateQty)}
                  />
                  <span className="bg-surface-container-low border border-l-0 border-outline-variant px-3 py-2 rounded-r text-on-surface-variant font-bold">Két Vỏ</span>
                </div>
                <p className="text-[10px] text-on-surface-variant mt-1">Hệ số cọc định mức định biên: {inboundItems.reduce((sum, item) => sum + item.qty, 0)} Két</p>
              </div>

              <div className="pt-3 border-t border-outline-variant">
                <label className="block font-label-caps text-on-surface-variant mb-1">Giá Trị Cọc Nghĩa Vụ Quy Đổi (VNĐ)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold font-data-mono">₫</span>
                  <input
                    className="w-full pl-8 pr-3 py-2 border border-outline-variant rounded focus:border-secondary focus:outline-none font-data-mono text-data-mono text-right font-bold text-secondary"
                    type="text"
                    value={(Math.max(0, inboundItems.reduce((sum, item) => sum + item.qty, 0) - returnedCrateQty) * 50000).toLocaleString()}
                    readOnly
                  />
                </div>
                <p className="text-[10px] text-on-surface-variant mt-1">Đơn giá cọc định mức: <strong>50.000 ₫ / két nhựa</strong></p>
              </div>
            </div>
          </div>

          {/* Attachment Document Upload section */}
          <div className="bg-white border border-outline-variant rounded shadow-sm p-4 flex flex-col justify-between flex-1">
            <div>
              <h3 className="font-headline-sm text-headline-sm text-on-background font-bold flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary">attach_file</span>
                Hồ Sơ &amp; Chứng Từ Kèm Theo
              </h3>
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="image/*,.pdf,.doc,.docx"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-outline hover:border-secondary hover:bg-surface-bright text-secondary py-6 rounded-lg transition-colors mb-4 group cursor-pointer"
              >
                <span className="material-symbols-outlined text-[28px] group-hover:scale-110 transition-transform">upload_file</span>
                <span className="font-body-md text-xs font-bold">Tải Lên Phiếu Giao Nhận (PDF / HÌNH ẢNH)</span>
                <span className="text-[10px] text-on-surface-variant font-medium">Nhấn vào đây để chọn tệp từ máy tính</span>
              </button>

              {/* Mock list of uploaded */}
              <div className="space-y-2">
                {uploadedFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-surface-container-low rounded border border-outline-variant text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant text-[18px]">description</span>
                      <span className="truncate max-w-[150px]">{file}</span>
                    </div>
                    <button
                      onClick={() => setUploadedFiles(uploadedFiles.filter(f => f !== file))}
                      className="text-on-surface-variant hover:text-error transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-outline-variant space-y-3">
              <button
                disabled={isLoading || purchaseOrders.length === 0}
                onClick={handleConfirmReceipt}
                className="w-full bg-primary hover:bg-primary-container disabled:bg-surface-container disabled:text-outline text-on-primary py-3 rounded font-headline-sm text-headline-sm flex items-center justify-center gap-2 transition-colors shadow-sm font-bold"
              >
                {isLoading ? (
                  <>
                    <span className="animate-spin material-symbols-outlined">sync</span>
                    Đang Ghi Nhập Kho...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">check_circle</span>
                    Xác Nhận Hoàn Tất Nhập
                  </>
                )}
              </button>
              <button
                onClick={() => alert("Đã lưu bản nháp phiếu nhập.")}
                className="w-full bg-white border border-outline hover:bg-surface-bright text-on-surface-variant py-2 rounded text-xs font-bold transition-colors"
              >
                Lưu Bản Nháp (Draft)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Add New SKU (Manager Only) */}
      {showAddSkuModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl border border-outline-variant shadow-2xl w-full max-w-lg overflow-hidden relative flex flex-col">
            <div className="bg-surface-container-low p-4 border-b border-outline-variant flex justify-between items-center">
              <h3 className="font-headline-sm text-headline-sm text-primary font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">add_box</span>
                Khai Báo Sản Phẩm / SKU Mới
              </h3>
              <button
                type="button"
                onClick={() => setShowAddSkuModal(false)}
                className="text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {skuError && (
              <div className="m-4 mb-0 bg-error-container text-on-error-container p-3 rounded text-xs font-semibold flex items-center gap-2 border border-error/20">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {skuError}
              </div>
            )}

            <form onSubmit={handleCreateSkuSubmit} className="p-6 space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="block font-label-caps text-on-surface-variant">MÃ SKU SẢN PHẨM *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: SKU-STRONG-330-CAN"
                  value={newSkuCode}
                  onChange={(e) => setNewSkuCode(e.target.value.toUpperCase())}
                  className="w-full p-2.5 border border-outline-variant rounded font-data-mono uppercase text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-label-caps text-on-surface-variant">TÊN SẢN PHẨM *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Strongbow Apple Ciders 330ml Can"
                  value={newSkuName}
                  onChange={(e) => setNewSkuName(e.target.value)}
                  className="w-full p-2.5 border border-outline-variant rounded text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary outline-none font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block font-label-caps text-on-surface-variant">ĐƠN VỊ TÍNH NGUYÊN</label>
                  <select
                    value={newSkuUnit}
                    onChange={(e) => setNewSkuUnit(e.target.value)}
                    className="w-full p-2.5 border border-outline-variant rounded text-on-surface bg-surface focus:border-secondary focus:ring-1 focus:ring-secondary outline-none font-semibold"
                  >
                    <option value="CASE">CASE (Thùng)</option>
                    <option value="CRATE">CRATE (Két nhựa)</option>
                    <option value="KEG">KEG (Bồn inox/Keg)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-label-caps text-on-surface-variant">TỈ LỆ QUY ĐỔI (LẺ/THÙNG)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newSkuRatio}
                    onChange={(e) => setNewSkuRatio(e.target.value)}
                    className="w-full p-2.5 border border-outline-variant rounded font-data-mono text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-label-caps text-on-surface-variant">MÃ BARCODE NGUYÊN KIỆN (TÙY CHỌN)</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 8931234567890"
                  value={newSkuBarcode}
                  onChange={(e) => setNewSkuBarcode(e.target.value)}
                  className="w-full p-2.5 border border-outline-variant rounded font-data-mono text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary outline-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setShowAddSkuModal(false)}
                  className="px-4 py-2 border border-outline-variant rounded text-on-surface-variant font-bold hover:bg-surface-container transition-colors"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSku}
                  className="px-5 py-2 bg-secondary text-on-secondary rounded font-bold hover:bg-secondary-container hover:text-on-secondary-container transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isCreatingSku ? (
                    <span>Đang lưu...</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      <span>Lưu SKU Mới</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
