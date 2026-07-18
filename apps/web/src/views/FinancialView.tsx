import React from 'react';
import { FinancialSubTab } from '../types';

interface FinancialViewProps {
  financialSubTab: FinancialSubTab;
  setFinancialSubTab: (tab: FinancialSubTab) => void;
  selectedPartnerId: string;
  setSelectedPartnerId: (partnerId: string) => void;
}

export function FinancialView({
  financialSubTab,
  setFinancialSubTab,
  selectedPartnerId,
  setSelectedPartnerId
}: FinancialViewProps) {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header & Sub-tab switching */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-outline-variant">
        <div>
          <h2 className="font-headline-md text-headline-md text-primary font-bold">Thống Kê Tài Chính &amp; Vận Hành Kho</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Giá trị tồn kho MAC, công nợ vỏ két và phân tích Lead Time của nhà cung cấp.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <button className="px-3 py-2 border border-outline bg-white rounded font-bold hover:bg-surface-container-low">Xuất Báo Cáo PDF</button>
          <button className="px-3 py-2 bg-secondary text-on-secondary rounded font-bold hover:bg-secondary/90">In Dữ Liệu</button>
        </div>
      </div>

      {/* Sub-tab selection row */}
      <div className="flex border-b border-outline-variant overflow-x-auto text-xs font-semibold gap-1">
        <button
          onClick={() => setFinancialSubTab('valuation')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            financialSubTab === 'valuation' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Tài Sản Tồn Kho (MAC)
        </button>
        <button
          onClick={() => setFinancialSubTab('deposit')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            financialSubTab === 'deposit' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Công Nợ Vỏ &amp; Tiền Cọc
        </button>
        <button
          onClick={() => setFinancialSubTab('leadtime')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            financialSubTab === 'leadtime' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Tiến Độ PO &amp; Lead Time
        </button>
        <button
          onClick={() => setFinancialSubTab('reconciliation')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            financialSubTab === 'reconciliation' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Đối Soát PO-GR Variance
        </button>
        <button
          onClick={() => setFinancialSubTab('loss')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            financialSubTab === 'loss' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Tổn Thất Tiêu Hủy
        </button>
      </div>

      {/* SUB TAB: INVENTORY VALUATION (MAC) */}
      {financialSubTab === 'valuation' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white border border-outline-variant p-5 rounded-xl shadow-sm">
              <p className="text-[10px] font-label-caps text-on-surface-variant mb-1 font-bold">TỔNG GIÁ TRỊ TỒN KHO</p>
              <h3 className="font-headline-md text-headline-md text-primary font-bold">45.2B VNĐ</h3>
              <span className="text-[10px] text-tertiary font-semibold flex items-center mt-2 gap-1">
                <span className="material-symbols-outlined text-xs">trending_up</span> +2.4% so với tháng trước
              </span>
            </div>
            <div className="bg-white border border-outline-variant p-5 rounded-xl shadow-sm border-l-4 border-l-tertiary-container">
              <p className="text-[10px] font-label-caps text-on-surface-variant mb-1 font-bold">GIÁ TRỊ HÀNG KHẢ DỤNG</p>
              <h3 className="font-headline-md text-headline-md text-primary font-bold">42.8B VNĐ</h3>
              <p className="text-[10px] text-on-surface-variant font-bold mt-2 text-right">Chiếm 94.7%</p>
            </div>
            <div className="bg-white border border-outline-variant p-5 rounded-xl shadow-sm border-l-4 border-l-error">
              <p className="text-[10px] font-label-caps text-on-surface-variant mb-1 font-bold">TIÊU HỦY / HAO HỤT</p>
              <h3 className="font-headline-md text-headline-md text-error font-bold">0.5B VNĐ</h3>
              <p className="text-[10px] text-on-surface-variant font-bold mt-2 text-right">Chiếm 1.1%</p>
            </div>
          </div>

          <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-outline-variant bg-surface-container-low font-bold text-sm text-primary">
              Bảng Tính Giá Vốn Bình Quân Di Động (Moving Average Cost)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-surface border-b border-outline-variant text-[11px] text-on-surface-variant">
                  <tr>
                    <th className="p-3 font-semibold">MÃ SKU / SẢN PHẨM</th>
                    <th className="p-3 text-right font-semibold">TỒN VẬT LÝ</th>
                    <th className="p-3 text-right font-semibold">GIÁ MUA BÌNH QUÂN</th>
                    <th className="p-3 text-right font-semibold">CHI PHÍ VẬN CHUYỂN PHÂN BỔ</th>
                    <th className="p-3 text-right font-semibold">ĐƠN GIÁ VỐN MAC</th>
                    <th className="p-3 text-right font-semibold">TỔNG GIÁ TRỊ TỒN KHO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant font-data-mono">
                  <tr>
                    <td className="p-3 font-body-md font-semibold">Tiger Crystal Can 330ml</td>
                    <td className="p-3 text-right">5,420 Thùng</td>
                    <td className="p-3 text-right">240,000 ₫</td>
                    <td className="p-3 text-right">8,000 ₫</td>
                    <td className="p-3 text-right font-bold text-secondary">248,000 ₫</td>
                    <td className="p-3 text-right font-bold text-primary">1,344,160,000 ₫</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-body-md font-semibold">Heineken Silver 250ml Chai</td>
                    <td className="p-3 text-right">850 Két</td>
                    <td className="p-3 text-right">310,000 ₫</td>
                    <td className="p-3 text-right">12,000 ₫</td>
                    <td className="p-3 text-right font-bold text-secondary">322,000 ₫</td>
                    <td className="p-3 text-right font-bold text-primary">273,700,000 ₫</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB: DEPOSIT & PACKAGING LEDGER */}
      {financialSubTab === 'deposit' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col h-[500px]">
            <div className="p-4 border-b border-outline-variant bg-surface-container-low font-bold text-sm text-primary">
              Sổ Công Nợ Vỏ Két &amp; Tiền Cọc Đại Lý
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-surface sticky top-0 border-b border-outline-variant text-[10px] text-on-surface-variant font-bold uppercase">
                  <tr>
                    <th className="p-3">Đại Lý Phân Phối</th>
                    <th className="p-3 text-right">Nợ Két Vỏ</th>
                    <th className="p-3 text-right">Nợ Chai Rỗng</th>
                    <th className="p-3 text-right">Tiền Cọc Đang Giữ</th>
                    <th className="p-3 text-center">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant font-data-mono">
                  <tr
                    onClick={() => setSelectedPartnerId('D-10024')}
                    className={`cursor-pointer hover:bg-surface-bright transition-colors ${selectedPartnerId === 'D-10024' ? 'bg-secondary-fixed/20' : ''}`}
                  >
                    <td className="p-3">
                      <p className="font-bold text-primary font-body-md">Công ty Hoàng Long (Hà Nội)</p>
                      <span className="text-[10px] text-on-surface-variant">Mã: D-10024</span>
                    </td>
                    <td className="p-3 text-right">1,250 két</td>
                    <td className="p-3 text-right">14,400 vỏ</td>
                    <td className="p-3 text-right font-bold text-secondary">350,000,000 ₫</td>
                    <td className="p-3 text-center">
                      <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 rounded-full font-bold text-[9px]">Cân Bằng</span>
                    </td>
                  </tr>

                  <tr
                    onClick={() => setSelectedPartnerId('D-10089')}
                    className={`cursor-pointer hover:bg-surface-bright transition-colors ${selectedPartnerId === 'D-10089' ? 'bg-secondary-fixed/20 border-l-4 border-secondary' : ''}`}
                  >
                    <td className="p-3">
                      <p className="font-bold text-primary font-body-md">Đại lý Minh Trí (Đà Nẵng)</p>
                      <span className="text-[10px] text-on-surface-variant">Mã: D-10089</span>
                    </td>
                    <td className="p-3 text-right">890 két</td>
                    <td className="p-3 text-right">10,200 vỏ</td>
                    <td className="p-3 text-right font-bold text-secondary">180,000,000 ₫</td>
                    <td className="p-3 text-center">
                      <span className="inline-block bg-error-container text-on-error-container px-2 py-0.5 rounded-full font-bold text-[9px]">Thiếu Hụt Cọc</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col p-4">
            <h3 className="font-bold text-sm text-primary border-b pb-2 mb-3">
              {selectedPartnerId === 'D-10089' ? 'Đại Lý Minh Trí' : 'Công ty Hoàng Long'} - Chi Tiết Đối Soát
            </h3>
            <div className="bg-surface-container-low rounded p-3 text-xs space-y-2 mb-4 font-semibold">
              <div className="flex justify-between">
                <span>Định Mức Tiền Cọc Cần Có:</span>
                <span className="font-data-mono">200,000,000 ₫</span>
              </div>
              <div className="flex justify-between">
                <span>Thực Tế Đang Giữ:</span>
                <span className="font-data-mono text-error">180,000,000 ₫</span>
              </div>
              <div className="flex justify-between border-t pt-2 border-dashed">
                <span>Chênh Lệch Cần Bổ Sung:</span>
                <span className="font-data-mono text-error font-bold">20,000,000 ₫</span>
              </div>
            </div>

            <button
              onClick={() => alert("Đã gửi thông báo yêu cầu nộp thêm tiền cọc vỏ nhựa bổ sung cho đối tác.")}
              className="w-full bg-primary text-on-primary py-2 rounded text-xs font-bold hover:bg-primary-container transition-colors mb-4"
            >
              Gửi Yêu Cầu Nộp Thêm Tiền Cọc
            </button>

            <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Lịch Sử Biến Động Vỏ Cọc</h4>
            <div className="space-y-3 pl-3 border-l border-outline-variant text-[11px] flex-1 overflow-y-auto">
              <div>
                <p className="font-bold text-on-surface">Xuất Hàng Phiếu #PO-2026-1102</p>
                <p className="text-secondary font-data-mono">+150 két Heineken (18/07/2026)</p>
              </div>
              <div>
                <p className="font-bold text-on-surface">Thu Hồi Vỏ Phiếu #RET-2026-094</p>
                <p className="text-tertiary font-data-mono">-120 két rỗng thu về (17/07/2026)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB: SUPPLIER LEAD TIME ANALYTICS (GANTT & KPI) */}
      {financialSubTab === 'leadtime' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-outline-variant rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-sm text-primary mb-4">Biểu Đồ Ngang Gantt: Tiến Độ Giao Hàng Đơn PO</h3>

            <div className="space-y-4">
              <div className="flex border-b pb-2 text-[10px] font-bold text-on-surface-variant font-data-mono">
                <div className="w-28">Số PO Mua</div>
                <div className="flex-1 flex justify-between px-2">
                  <span>Ngày Gửi PO</span>
                  <span>T+2 Ngày</span>
                  <span>T+4 Ngày</span>
                  <span>Hợp Đồng (ROP)</span>
                  <span>Thực Tế</span>
                </div>
              </div>

              {/* PO-001 (On Time) */}
              <div className="flex items-center text-xs font-semibold">
                <div className="w-28 font-data-mono font-bold">PO-2026-1105</div>
                <div className="flex-1 relative h-6 bg-surface-container rounded ml-2">
                  <div className="absolute left-0 top-0 h-full bg-secondary rounded w-[55%]" title="Thời gian giao chuyến đầu"></div>
                  <div className="absolute left-[75%] -top-1">
                    <span className="material-symbols-outlined text-on-tertiary-container text-[18px] filled-icon">flag</span>
                  </div>
                </div>
              </div>

              {/* PO-002 (Delayed) */}
              <div className="flex items-center text-xs font-semibold bg-error-container/10 p-1 rounded">
                <div className="w-28 font-data-mono font-bold">PO-2026-1104</div>
                <div className="flex-1 relative h-6 bg-surface-container rounded ml-2">
                  <div className="absolute left-0 top-0 h-full bg-secondary rounded w-[70%]"></div>
                  <div className="absolute left-[70%] -top-1">
                    <span className="material-symbols-outlined text-on-tertiary-container text-[18px] filled-icon">flag</span>
                  </div>
                  <div className="absolute left-[70%] top-0 h-full bg-error rounded-r w-[25%] flex items-center justify-end px-2">
                    <span className="text-[9px] text-on-error font-bold">Trễ 2 Ngày</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col">
            <div className="p-4 border-b border-outline-variant bg-surface-container-low font-bold text-sm text-primary">
              Đánh Giá Nhà Cung Cấp (KPI Fill Rate)
            </div>
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-surface border-b border-outline-variant font-bold text-[10px] text-on-surface-variant">
                <tr>
                  <th className="p-3">Nhà Cung Cấp</th>
                  <th className="p-3 text-right">Lead Time TB</th>
                  <th className="p-3 text-right">Tỷ Lệ Đầy Đủ (Fill Rate)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-surface-bright">
                  <td className="p-3 font-semibold">Heineken Vietnam</td>
                  <td className="p-3 text-right font-data-mono text-secondary font-bold">3.5 ngày</td>
                  <td className="p-3 text-right font-data-mono text-tertiary font-bold">98.5%</td>
                </tr>
                <tr className="border-b hover:bg-surface-bright bg-error-container/5">
                  <td className="p-3 font-semibold text-error flex items-center gap-1">
                    Coca-Cola VN
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                  </td>
                  <td className="p-3 text-right font-data-mono text-error font-bold">5.2 ngày</td>
                  <td className="p-3 text-right font-data-mono text-error font-bold">92.0%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB TAB: PO-GR Price/Qty Reconciliation */}
      {financialSubTab === 'reconciliation' && (
        <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-outline-variant bg-surface-container-low font-bold text-sm text-primary">
            Báo Cáo Đối Soát Đơn Đặt Mua Hàng &amp; Nhập Thực Tế (PO-GR Variance)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-surface border-b border-outline-variant text-[10px] text-on-surface-variant font-bold">
                <tr>
                  <th className="p-3">MÃ CHỨNG TỪ</th>
                  <th className="p-3">MÃ SKU / MÔ TẢ</th>
                  <th className="p-3 text-right">SL ĐẶT (PO)</th>
                  <th className="p-3 text-right">SL NHẬN (GR)</th>
                  <th className="p-3 text-right text-error">CHÊNH LỆCH QTY</th>
                  <th className="p-3 text-right">ĐƠN GIÁ PO</th>
                  <th className="p-3 text-right text-error font-bold">THIỆT HẠI HỤT HÀNG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant font-data-mono">
                <tr>
                  <td className="p-3 font-body-md font-semibold text-primary">PO-2026-0610 / GR-8924</td>
                  <td className="p-3 font-body-md font-semibold">SKU-HN-330-CAN (Heineken Can)</td>
                  <td className="p-3 text-right">200 Thùng</td>
                  <td className="p-3 text-right">195 Thùng</td>
                  <td className="p-3 text-right text-error font-bold">-5 Thùng</td>
                  <td className="p-3 text-right">240,000 ₫</td>
                  <td className="p-3 text-right text-error font-bold">1,200,000 ₫</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB TAB: Scrap & Financial Loss */}
      {financialSubTab === 'loss' && (
        <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-outline-variant bg-surface-container-low font-bold text-sm text-primary">
            Báo Cáo Tổn Thất Tài Chính Tiêu Hủy Hàng Hỏng &amp; Hết Hạn
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-surface border-b border-outline-variant text-[10px] text-on-surface-variant font-bold">
                <tr>
                  <th className="p-3">BIÊN BẢN HỦY / NGÀY</th>
                  <th className="p-3">SẢN PHẨM SKU</th>
                  <th className="p-3 text-right">SL TIÊU HỦY</th>
                  <th className="p-3 text-right">ĐƠN GIÁ VỐN (MAC)</th>
                  <th className="p-3 text-right text-error font-bold">TỔNG THIỆT HẠI TÀI CHÍNH</th>
                  <th className="p-3">NGUYÊN NHÂN HAO HỤT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant font-data-mono">
                <tr className="bg-error/5">
                  <td className="p-3 font-body-md font-semibold text-primary">SCRAP-2026-004 / 15-07</td>
                  <td className="p-3 font-body-md font-semibold">SKU-HN-330-BTL (Heineken Chai)</td>
                  <td className="p-3 text-right text-error font-bold">12 Két</td>
                  <td className="p-3 text-right">322,000 ₫</td>
                  <td className="p-3 text-right text-error font-bold">3,864,000 ₫</td>
                  <td className="p-3 text-on-surface-variant font-body-md">Rơi vỡ vật lý khi xe nâng bốc xếp ô kệ</td>
                </tr>
                <tr className="bg-error/5">
                  <td className="p-3 font-body-md font-semibold text-primary">SCRAP-2026-005 / 16-07</td>
                  <td className="p-3 font-body-md font-semibold">Aquafina 500ml Chai</td>
                  <td className="p-3 text-right text-error font-bold">40 Thùng</td>
                  <td className="p-3 text-right">98,000 ₫</td>
                  <td className="p-3 text-right text-error font-bold">3,920,000 ₫</td>
                  <td className="p-3 text-on-surface-variant font-body-md">Hết hạn sử dụng (Lô cận hạn cận biên FEFO)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
