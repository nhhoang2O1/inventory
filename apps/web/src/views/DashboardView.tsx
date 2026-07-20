import React from 'react';

interface DashboardViewProps {
  pendingApprovalsCount: number;
}

export function DashboardView({ pendingApprovalsCount }: DashboardViewProps) {
  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="font-headline-md text-headline-md text-primary font-bold">Báo Cáo Tổng Quan Vận Hành</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Thông tin hoạt động và trạng thái tồn kho theo thời gian thực.</p>
        </div>
        <div className="text-data-mono font-data-mono text-on-surface-variant bg-surface-container px-3 py-1.5 rounded flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">update</span>
          Cập nhật: Vừa xong
        </div>
      </div>

      {/* KPI Top Row cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-level-1 p-4 rounded bg-white border border-outline-variant flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Tổng Giá Trị Tồn Kho</span>
            <span className="material-symbols-outlined text-secondary">payments</span>
          </div>
          <div>
            <div className="font-display-lg text-display-lg text-primary font-bold">₫42.8B</div>
            <div className="flex items-center gap-1 text-on-tertiary-container font-data-mono text-data-mono">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
              <span>+2.4% so với tuần trước</span>
            </div>
          </div>
        </div>

        <div className="card-level-1 p-4 rounded bg-white border border-outline-variant border-l-4 border-l-error">
          <div className="flex justify-between items-start mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Yêu Cầu Chờ Duyệt (4-Mắt)</span>
            <span className="material-symbols-outlined text-error">rule</span>
          </div>
          <div>
            <div className="font-display-lg text-display-lg text-primary font-bold">{pendingApprovalsCount}</div>
            <div className="flex items-center gap-1 text-on-surface-variant font-data-mono text-data-mono">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              <span>Cần quản lý phê duyệt</span>
            </div>
          </div>
        </div>

        <div className="card-level-1 p-4 rounded bg-white border border-outline-variant flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">Đơn Hàng Xuất Kho Trong Ngày</span>
            <span className="material-symbols-outlined text-secondary">local_shipping</span>
          </div>
          <div>
            <div className="font-display-lg text-display-lg text-primary font-bold">128</div>
            <div className="flex items-center gap-1 text-on-surface-variant font-data-mono text-data-mono">
              <span className="material-symbols-outlined text-[14px]">inbox</span>
              <span>45 đơn chờ bốc xếp</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bento Grid: Charts & Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Simulated Stacked Bar Chart */}
        <div className="bg-white rounded border border-outline-variant col-span-1 lg:col-span-3 flex flex-col">
          <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
            <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Biểu Đồ Trạng Thái Tồn Kho (7 Ngày)</h3>
            <div className="flex gap-2 text-xs">
              <button className="px-2.5 py-1 bg-surface-container text-on-surface-variant rounded border border-outline-variant font-semibold">7 Ngày</button>
              <button className="px-2.5 py-1 bg-secondary text-on-secondary rounded font-semibold">30 Ngày</button>
            </div>
          </div>
          <div className="p-6 flex-1 flex flex-col">
            <div className="flex-1 flex items-end gap-3 sm:gap-6 h-64 border-b border-l border-outline-variant pb-2 pl-2 relative">
              <div className="absolute left-[-30px] bottom-0 top-0 flex flex-col justify-between text-[10px] text-outline-variant font-data-mono py-2">
                <span>10k</span>
                <span>7.5k</span>
                <span>5k</span>
                <span>2.5k</span>
                <span>0</span>
              </div>

              <div className="absolute left-0 right-0 top-1/4 h-px bg-surface-variant z-0"></div>
              <div className="absolute left-0 right-0 top-2/4 h-px bg-surface-variant z-0"></div>
              <div className="absolute left-0 right-0 top-3/4 h-px bg-surface-variant z-0"></div>

              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day) => (
                <div key={day} className="w-full flex-1 flex flex-col justify-end group relative z-10 cursor-pointer">
                  <div className="bg-error w-full h-[5%]" title="Hàng hỏng"></div>
                  <div className="bg-[#eab308] w-full h-[8%]" title="Hàng kiểm định"></div>
                  <div className="bg-primary-container w-full h-[15%]" title="ATP"></div>
                  <div className="bg-secondary-container w-full h-[22%]" title="Tồn giữ chỗ"></div>
                  <div className="bg-secondary w-full h-[40%]" title="Sẵn sàng bán"></div>
                  <div className="absolute bottom-[-24px] w-full text-center text-[10px] text-outline font-data-mono font-bold">{day}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 mt-8 text-label-caps font-label-caps text-on-surface-variant justify-center">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-secondary rounded-sm"></div>Sẵn sàng bán</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-secondary-container rounded-sm"></div>Giữ chỗ (Reserve)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-primary-container rounded-sm"></div>Tồn khả dụng (ATP)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-[#eab308] rounded-sm"></div>Kiểm định (Quarantine)</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-error rounded-sm"></div>Hao hụt / Lỗi</div>
            </div>
          </div>
        </div>

        {/* Donut Chart Exp Alerts */}
        <div className="bg-white rounded border border-outline-variant col-span-1 flex flex-col min-h-[300px]">
          <div className="p-4 border-b border-outline-variant bg-surface-bright">
            <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Cảnh Báo Hạn Dùng</h3>
          </div>
          <div className="p-4 flex-1 flex flex-col items-center justify-center">
            <div
              className="w-36 h-36 rounded-full relative flex items-center justify-center"
              style={{
                background: 'conic-gradient(#1960a3 0% 65%, #7db6ff 65% 85%, #eab308 85% 95%, #ba1a1a 95% 100%)'
              }}
            >
              <div className="w-24 h-24 bg-white rounded-full flex flex-col items-center justify-center text-center absolute z-10 shadow-inner">
                <span className="font-display-lg text-headline-md text-primary font-bold leading-none">95%</span>
                <span className="font-label-caps text-[9px] text-on-surface-variant font-bold">AN TOÀN</span>
              </div>
            </div>

            <div className="w-full mt-6 space-y-2 text-xs font-semibold">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-secondary"></div> An toàn (&gt;90d)</div>
                <span className="font-data-mono">65%</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-secondary-container"></div> Hơi cận (30-90d)</div>
                <span className="font-data-mono">20%</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#eab308]"></div> Cận hạn (&lt;30d)</div>
                <span className="font-data-mono text-[#eab308]">10%</span>
              </div>
              <div className="flex justify-between items-center bg-error-container/30 px-2 py-1 -mx-2 rounded">
                <div className="flex items-center gap-2 text-error"><div className="w-2.5 h-2.5 rounded-full bg-error"></div> Hết hạn sử dụng</div>
                <span className="font-data-mono text-error font-bold">5%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Critical Low Stock list */}
      <div className="bg-white rounded border border-outline-variant overflow-hidden shadow-sm">
        <div className="p-4 border-b border-outline-variant bg-surface-bright flex justify-between items-center">
          <h3 className="font-headline-sm text-headline-sm text-primary font-bold">Cảnh Báo Tồn Kho Cực Thấp (Dưới ROP)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant font-label-caps text-label-caps text-on-surface-variant text-xs">
                <th className="p-3 font-bold">MÃ SKU</th>
                <th className="p-3 font-bold">MÔ TẢ SẢN PHẨM</th>
                <th className="p-3 font-bold">VỊ TRÍ</th>
                <th className="p-3 font-bold text-right">TỒN VẬT LÝ</th>
                <th className="p-3 font-bold text-right">ROP CƠ SỞ</th>
                <th className="p-3 font-bold text-center">TRẠNG THÁI</th>
              </tr>
            </thead>
            <tbody className="font-data-mono text-data-mono text-on-surface text-xs">
              <tr className="border-b border-surface-variant hover:bg-surface-container-low">
                <td className="p-3 text-secondary font-bold">SKU-HN-330-CAN</td>
                <td className="p-3 font-body-md text-body-md">Heineken Silver 330ml Can (T24)</td>
                <td className="p-3 text-on-surface-variant">Z1-A12</td>
                <td className="p-3 text-right text-error font-bold">142 Thùng</td>
                <td className="p-3 text-right text-on-surface-variant">500 Thùng</td>
                <td className="p-3 text-center">
                  <span className="inline-block bg-error text-on-error font-label-caps text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">Nguy Hiểm</span>
                </td>
              </tr>
              <tr className="border-b border-surface-variant hover:bg-surface-container-low">
                <td className="p-3 text-secondary font-bold">SKU-TIG-330-BTL</td>
                <td className="p-3 font-body-md text-body-md">Tiger Crystal 330ml Chai (K24)</td>
                <td className="p-3 text-on-surface-variant">Z2-B04</td>
                <td className="p-3 text-right text-[#b45309] font-bold">420 Két</td>
                <td className="p-3 text-right text-on-surface-variant">800 Két</td>
                <td className="p-3 text-center">
                  <span className="inline-block bg-[#fef08a] text-[#854d0e] font-label-caps text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border border-[#fde047]">Cần Nhập Hàng</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
