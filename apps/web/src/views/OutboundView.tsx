import React from 'react';
import { OutboundItem } from '../types';

interface OutboundViewProps {
  outboundItems: OutboundItem[];
  scanInput: string;
  setScanInput: (input: string) => void;
  pickAlert: string | null;
  handleScanSubmit: (e: React.FormEvent) => void;
  handlePickRowClick: (id: string) => void;
  onCompletePick: () => void;
  onCancelPick: () => void;
}

export function OutboundView({
  outboundItems,
  scanInput,
  setScanInput,
  pickAlert,
  handleScanSubmit,
  handlePickRowClick,
  onCompletePick,
  onCancelPick
}: OutboundViewProps) {
  const pickedCount = outboundItems.filter(item => item.status === 'Picked').length;
  const totalPickItems = outboundItems.length;
  const isPickComplete = pickedCount === totalPickItems;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {/* Header Picking Context */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-label-caps text-[10px] bg-tertiary-container text-on-tertiary-container px-2 py-0.5 rounded font-bold">ĐANG THỰC HIỆN PICK</span>
            <span className="font-label-caps text-[10px] text-on-surface-variant font-bold">Khu vực: BEVERAGE-A</span>
          </div>
          <h2 className="font-display-lg text-headline-md font-bold text-primary">Nhiệm Vụ Lấy Hàng Xuất Kho: #PK-9824</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">Xuất giao hàng xe sỉ cho Đại lý Minh Trí - Quy tắc bốc xếp FEFO chặt chẽ.</p>
        </div>
        <div className="text-right w-full md:w-auto">
          <p className="font-label-caps text-xs text-on-surface-variant mb-1 font-bold">Tiến Độ Lấy Hàng</p>
          <div className="flex items-center gap-3">
            <div className="w-48 h-2.5 bg-surface-variant rounded-full overflow-hidden border border-outline-variant">
              <div
                className="h-full bg-secondary rounded-full transition-all duration-300"
                style={{ width: `${(pickedCount / totalPickItems) * 100}%` }}
              ></div>
            </div>
            <span className="font-headline-sm text-headline-sm text-primary font-bold">{pickedCount}/{totalPickItems} Mục</span>
          </div>
        </div>
      </div>

      {/* Barcode scanner sim */}
      <div className="bg-white border border-secondary p-4 rounded-xl shadow-sm flex flex-col md:flex-row gap-4 items-center focus-within:ring-2 focus-within:ring-secondary transition-all">
        <div className="flex-shrink-0 p-3 bg-secondary-container text-on-secondary-container rounded-lg">
          <span className="material-symbols-outlined text-[28px]">barcode_scanner</span>
        </div>
        <form onSubmit={handleScanSubmit} className="flex-1 w-full flex flex-col md:flex-row gap-2">
          <input
            className="w-full bg-transparent border border-outline-variant focus:border-secondary focus:ring-1 focus:ring-secondary rounded p-3 font-data-mono text-data-mono text-sm text-primary"
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            placeholder="Gõ mã vị trí kệ (VD: A2-R1-B12) hoặc Batch Code để giả lập quét Barcode..."
          />
          <button
            type="submit"
            className="px-6 py-3 bg-secondary text-on-secondary rounded-lg font-headline-sm text-xs font-bold hover:bg-primary transition-colors whitespace-nowrap"
          >
            Xác Nhận Quét (Scan)
          </button>
        </form>
      </div>

      {pickAlert && (
        <div className="bg-primary-container/20 text-primary p-3 rounded border border-secondary-container text-xs font-semibold">
          {pickAlert}
        </div>
      )}

      {/* Table of items to pick */}
      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container text-on-surface-variant font-label-caps text-label-caps border-b border-outline-variant text-xs">
              <tr>
                <th className="p-3 whitespace-nowrap">Trạng Thế</th>
                <th className="p-3 whitespace-nowrap">Vị Trí Kệ</th>
                <th className="p-3 min-w-[200px]">Tên SKU &amp; Sản Phẩm</th>
                <th className="p-3 whitespace-nowrap">Mã Lô &amp; Hạn Dùng (FEFO Enforced)</th>
                <th className="p-3 whitespace-nowrap text-right">Số Thùng/Két Cần Lấy</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-xs text-on-surface divide-y divide-outline-variant">
              {outboundItems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => handlePickRowClick(item.id)}
                  className={`cursor-pointer transition-colors ${
                    item.status === 'Picked'
                      ? 'bg-surface opacity-60'
                      : item.status === 'Picking'
                        ? 'bg-secondary-fixed/20 border-l-4 border-secondary font-semibold'
                        : 'bg-white hover:bg-surface-bright'
                  }`}
                >
                  <td className="p-3">
                    {item.status === 'Picked' ? (
                      <span className="inline-flex items-center gap-1 text-on-tertiary-container bg-tertiary-fixed rounded-full px-2.5 py-0.5 font-label-caps text-[10px] font-bold">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span> ĐÃ LẤY
                      </span>
                    ) : item.status === 'Picking' ? (
                      <span className="inline-flex items-center gap-1 text-on-secondary-container bg-secondary-fixed rounded-full px-2.5 py-0.5 font-label-caps text-[10px] font-bold animate-pulse">
                        <span className="material-symbols-outlined text-[14px]">qr_code_scanner</span> LẤY TIẾP THEO
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-on-surface-variant bg-surface-container rounded-full px-2.5 py-0.5 font-label-caps text-[10px] font-bold">
                        <span className="material-symbols-outlined text-[14px]">schedule</span> CHỜ BỐC XẾP
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="font-data-mono text-xs font-bold bg-surface-container px-2 py-1 border border-outline-variant rounded">
                      {item.location}
                    </span>
                  </td>
                  <td className="p-3">
                    <p className="font-bold text-primary text-sm">{item.name}</p>
                    <p className="text-[10px] text-on-surface-variant font-data-mono font-medium">Quy cách: 24 lon hoặc két vỏ nhựa cọc</p>
                  </td>
                  <td className="p-3">
                    <div className="font-data-mono font-bold text-error bg-error-container/20 text-on-error-container inline-block px-1 rounded mb-0.5">
                      Lô: {item.lot}
                    </div>
                    <div className="text-[10px] text-error font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">warning</span>
                      HSD: {item.exp} (FEFO Priority)
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-display-lg text-sm font-bold text-primary">
                      {item.reqQty} <span className="text-[11px] font-normal text-on-surface-variant">Thùng</span>
                    </div>
                    <div className="text-[10px] text-on-surface-variant font-data-mono">
                      = {(item.reqQty * item.ratio).toLocaleString()} đơn vị lẻ
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer confirm picking */}
        <div className="bg-surface-container p-4 border-t border-outline-variant flex justify-between items-center mt-auto">
          <button
            onClick={onCancelPick}
            className="px-4 py-2 bg-white text-on-surface-variant border border-outline rounded hover:bg-surface-container-high text-xs font-bold transition-colors"
          >
            Tạm Dừng Pick Run
          </button>
          <button
            disabled={!isPickComplete}
            onClick={onCompletePick}
            className={`px-8 py-3 rounded-lg font-headline-md text-xs font-bold transition-colors flex items-center gap-2 ${
              isPickComplete
                ? 'bg-primary text-on-primary hover:bg-primary-container shadow-sm cursor-pointer'
                : 'bg-surface-container-highest text-outline cursor-not-allowed opacity-55'
            }`}
          >
            <span className="material-symbols-outlined">done_all</span>
            Xác Nhận Xuất Xưởng (Complete Pick)
          </button>
        </div>
      </div>
    </div>
  );
}
