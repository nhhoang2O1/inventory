import React from 'react';
import { InboundItem } from '../types';

interface InboundViewProps {
  operatorId: string;
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
  isLoading: boolean;
  error: string | null;
}

export function InboundView({
  operatorId,
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
  isLoading,
  error
}: InboundViewProps) {
  const activePo = purchaseOrders.find(po => po.id === selectedPoId);

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
            <span className="text-on-surface-variant">Nhà cung cấp: <strong>{activePo?.supplier_name || '—'}</strong></span>
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
        <div className="lg:col-span-8 bg-white border border-outline-variant rounded shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-outline-variant bg-surface flex justify-between items-center">
            <h3 className="font-headline-sm text-headline-sm text-on-background font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">inventory</span>
              Danh Sách Hàng Nhập Kho (Strict Unit Policy)
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="bg-surface-container-low border-b border-outline-variant font-label-caps text-label-caps text-on-surface-variant text-xs">
                <tr>
                  <th className="p-3 font-semibold">SKU / Tên Sản Phẩm</th>
                  <th className="p-3 font-semibold w-28">Đơn Vị</th>
                  <th className="p-3 font-semibold w-44 text-right">Số Nguyên Nhập (Thùng/Két)</th>
                  <th className="p-3 font-semibold w-28">Số Lô (Batch)</th>
                  <th className="p-3 font-semibold w-28">NSX / HSD</th>
                  <th className="p-3 font-semibold w-32">Vị Trí Lưu Trữ</th>
                  <th className="p-3 font-semibold w-12 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-divide divide-y divide-outline-variant text-xs">
                {inboundItems.map((item, index) => (
                  <tr key={index} className="hover:bg-surface-bright transition-colors group">
                    <td className="p-3">
                      <div className="font-data-mono text-primary font-bold">{item.sku}</div>
                      <div className="text-on-surface-variant font-semibold truncate max-w-[150px]">{item.name}</div>
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
                    <span className="text-on-surface-variant text-[11px]">
                      Chỉ nhận các dòng đã có trong PO; thêm dòng mới phải được thực hiện ở Purchase Order.
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Panel: Returnable Packaging & Deposit Tracker */}
        <div className="lg:col-span-4 flex flex-col gap-6">
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
              <div className="w-full flex items-center justify-center gap-2 border border-dashed border-outline text-on-surface-variant py-8 rounded mb-4">
                <span className="material-symbols-outlined">attach_file</span>
                <span className="font-body-md text-xs font-semibold">Đính kèm chứng từ sẽ được bật khi backend có upload contract.</span>
              </div>

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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
