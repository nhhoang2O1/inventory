import React from 'react';

interface InventoryViewProps {
  brandFilter: string;
  setBrandFilter: (brand: string) => void;
  onRefresh: () => void;
}

export function InventoryView({ brandFilter, setBrandFilter, onRefresh }: InventoryViewProps) {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-background font-bold">Tra Cứu Tồn Kho Khả Dụng (ATP)</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Lượng tồn thực tế đã trừ đi phần hàng giữ chỗ để phục vụ kinh doanh bán sỉ.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <button className="flex items-center gap-2 px-3 py-2 border border-outline bg-white text-on-surface rounded-lg hover:bg-surface-container-low transition-colors font-bold">
            <span className="material-symbols-outlined text-[18px]">download</span>
            Xuất Excel CSV
          </button>
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors font-bold"
          >
            <span className="material-symbols-outlined text-[18px]">sync</span>
            Làm Mới
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-outline-variant rounded-xl p-4 flex flex-wrap gap-4 items-end text-xs">
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="font-label-caps text-on-surface-variant font-bold">Chọn Kho Phân Vùng</label>
          <select className="w-full bg-surface border border-outline-variant rounded px-3 py-2 focus:border-secondary outline-none font-semibold">
            <option>WH-Alpha (Tổng kho miền Bắc)</option>
            <option>WH-Beta (Miền Nam)</option>
            <option>Tất cả các kho vật lý</option>
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

      {/* Grid table */}
      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-surface-container-low border-b border-outline-variant text-xs">
              <tr>
                <th className="p-3 font-bold">Chi Tiết Sản Phẩm SKU</th>
                <th className="p-3 font-bold text-right">Tổng Tồn Vật Lý (On-hand)</th>
                <th className="p-3 font-bold text-right">Tồn Giữ Chỗ (Active Reservation)</th>
                <th className="p-3 font-bold text-right bg-primary-fixed/20 text-primary">Tồn Kho Khả Dụng Bán (ATP)</th>
                <th className="p-3 font-bold text-center">Trạng Thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-xs">
              {/* Row 1 */}
              {(brandFilter === 'All' || brandFilter === 'Tiger') && (
                <tr className="hover:bg-surface-bright transition-colors">
                  <td className="p-3">
                    <p className="font-bold text-primary text-sm">Tiger Crystal 330ml Can (Thùng 24)</p>
                    <p className="font-data-mono text-on-surface-variant text-[10px]">SKU: TG-CRY-330C-24</p>
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-data-mono font-bold text-on-surface">5,420 Thùng</div>
                    <div className="font-data-mono text-[10px] text-secondary">130,080 Can</div>
                  </td>
                  <td className="p-3 text-right font-data-mono text-on-surface-variant">1,200 Thùng</td>
                  <td className="p-3 text-right bg-primary-fixed/5 font-bold">
                    <div className="font-data-mono text-sm text-primary">4,220 Thùng</div>
                    <div className="font-data-mono text-[10px] text-secondary">101,280 Can</div>
                  </td>
                  <td className="p-3 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-bold text-[9px]">Sẵn Sàng</span>
                  </td>
                </tr>
              )}

              {/* Row 2 */}
              {(brandFilter === 'All' || brandFilter === 'Heineken') && (
                <tr className="hover:bg-surface-bright transition-colors bg-error-container/10">
                  <td className="p-3">
                    <p className="font-bold text-primary text-sm">Heineken Silver 250ml Chai (Két 20)</p>
                    <p className="font-data-mono text-on-surface-variant text-[10px]">SKU: HK-SIL-250B-20</p>
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-data-mono font-bold text-on-surface">850 Két</div>
                    <div className="font-data-mono text-[10px] text-secondary">17,000 Chai</div>
                  </td>
                  <td className="p-3 text-right font-data-mono text-on-surface-variant">700 Két</td>
                  <td className="p-3 text-right bg-primary-fixed/5 font-bold text-error">
                    <div className="font-data-mono text-sm">150 Két</div>
                    <div className="font-data-mono text-[10px]">3,000 Chai</div>
                  </td>
                  <td className="p-3 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-bold text-[9px]">Tồn Kho Thấp</span>
                  </td>
                </tr>
              )}

              {/* Row 3 */}
              {(brandFilter === 'All' || brandFilter === 'Coca-Cola') && (
                <tr className="hover:bg-surface-bright transition-colors bg-error/5">
                  <td className="p-3">
                    <p className="font-bold text-primary text-sm">Coca Cola Classic 330ml Can (T24)</p>
                    <p className="font-data-mono text-on-surface-variant text-[10px]">SKU: CC-REG-330C-24</p>
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-data-mono font-bold text-on-surface">1,020 Thùng</div>
                    <div className="font-data-mono text-[10px] text-secondary">24,480 Can</div>
                  </td>
                  <td className="p-3 text-right font-data-mono text-on-surface-variant">1,020 Thùng</td>
                  <td className="p-3 text-right bg-primary-fixed/5 font-bold text-error">
                    <div className="font-data-mono text-sm">0 Thùng</div>
                    <div className="font-data-mono text-[10px]">0 Can</div>
                  </td>
                  <td className="p-3 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-error text-on-error font-bold text-[9px]">Hết Hàng</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
