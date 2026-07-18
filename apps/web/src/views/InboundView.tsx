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
  handleConfirmReceipt
}: InboundViewProps) {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-background font-bold">
            Lập Phiếu Nhập Kho Từ PO:
            <span className="font-data-mono text-primary ml-2 font-bold">PO-2026-07-4492</span>
          </h2>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-xs">
            <span className="text-on-surface-variant">Nhà cung cấp: <strong>Heineken Vietnam N.V</strong></span>
            <span className="text-on-surface-variant">Nhân viên nhận: <strong>{operatorId}</strong></span>
            <span className="text-on-surface-variant">Thời gian ca: <strong>18/07/2026 08:30 AM</strong></span>
          </div>
        </div>
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-caps text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-secondary"></span>
            ĐANG THỰC HIỆN
          </span>
        </div>
      </div>

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
                  <th className="p-3 font-semibold w-48 text-right">Số Nguyên Nhập (Thùng/Két)</th>
                  <th className="p-3 font-semibold w-32">Số Lô (Batch)</th>
                  <th className="p-3 font-semibold w-36">Hạn Dùng (MFG / EXP)</th>
                  <th className="p-3 font-semibold w-12 text-center">Xóa</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-divide divide-y divide-outline-variant text-xs">
                {inboundItems.map((item, index) => (
                  <tr key={index} className="hover:bg-surface-bright transition-colors group">
                    <td className="p-3">
                      <div className="font-data-mono text-primary font-bold">{item.sku}</div>
                      <div className="text-on-surface-variant font-semibold truncate max-w-[200px]">{item.name}</div>
                    </td>
                    <td className="p-3 text-on-surface-variant font-semibold">{item.unit} (1:{item.ratio})</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <input
                          className="w-20 px-2 py-1 border border-outline-variant rounded text-right font-data-mono text-data-mono focus:border-secondary focus:ring-1 focus:ring-secondary outline-none"
                          type="number"
                          min="0"
                          value={item.qty}
                          onChange={(e) => handleInboundQtyChange(index, e.target.value)}
                        />
                        <span className="text-[11px] text-on-surface-variant whitespace-nowrap bg-surface-container px-2 py-1 rounded font-data-mono">
                          = {(item.qty * item.ratio).toLocaleString()} đơn vị lẻ
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <input
                        className="w-full px-2 py-1 border border-outline-variant rounded font-data-mono text-data-mono uppercase focus:border-secondary focus:ring-1 focus:ring-secondary outline-none"
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
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-outline w-6 font-bold">NSX:</span>
                          <input
                            className="px-1 py-0.5 border border-outline-variant rounded text-[10px] text-on-surface-variant outline-none"
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
                          <span className="text-[9px] text-outline w-6 font-bold">HSD:</span>
                          <input
                            className="px-1 py-0.5 border border-outline-variant rounded text-[10px] text-on-surface-variant outline-none"
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
                  <td colSpan={6} className="p-3">
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
                    value={Math.max(0, 100 - returnedCrateQty)}
                  />
                  <span className="bg-surface-container-low border border-l-0 border-outline-variant px-3 py-2 rounded-r text-on-surface-variant font-bold">Két Vỏ</span>
                </div>
                <p className="text-[10px] text-on-surface-variant mt-1">Hệ số cọc định mức định biên: 100 Két (Heineken Original)</p>
              </div>

              <div className="pt-3 border-t border-outline-variant">
                <label className="block font-label-caps text-on-surface-variant mb-1">Giá Trị Cọc Nghĩa Vụ Quy Đổi (VNĐ)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold font-data-mono">₫</span>
                  <input
                    className="w-full pl-8 pr-3 py-2 border border-outline-variant rounded focus:border-secondary focus:outline-none font-data-mono text-data-mono text-right font-bold text-secondary"
                    type="text"
                    value={((100 - returnedCrateQty) * 50000).toLocaleString()}
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
              <button
                onClick={() => {
                  const newFile = `photo_receipt_${Math.floor(100+Math.random()*900)}.jpg`;
                  setUploadedFiles([...uploadedFiles, newFile]);
                }}
                className="w-full flex items-center justify-center gap-2 border border-dashed border-outline hover:border-secondary hover:bg-surface-bright text-secondary py-8 rounded transition-colors mb-4 group"
              >
                <span className="material-symbols-outlined group-hover:scale-110 transition-transform">add_a_photo</span>
                <span className="font-body-md text-xs font-semibold">Tải Phiếu Giao Nhận Signed PDF / Photo</span>
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
                onClick={handleConfirmReceipt}
                className="w-full bg-primary hover:bg-primary-container text-on-primary py-3 rounded font-headline-sm text-headline-sm flex items-center justify-center gap-2 transition-colors shadow-sm font-bold"
              >
                <span className="material-symbols-outlined">check_circle</span>
                Xác Nhận Hoàn Tất Nhập
              </button>
              <button
                onClick={() => alert("Đã lưu bản nháp phiếu nhập PO-2026-07-4492.")}
                className="w-full bg-white border border-outline hover:bg-surface-bright text-on-surface-variant py-2 rounded text-xs font-bold transition-colors"
              >
                Lưu Bản Nháp (Draft)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
