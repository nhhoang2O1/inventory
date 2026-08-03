import React, { useEffect, useState } from 'react';

interface DashboardViewProps {
  pendingApprovalsCount: number;
  selectedWarehouseId?: string;
  warehouseCode?: string;
}

export function DashboardView({ pendingApprovalsCount, selectedWarehouseId, warehouseCode }: DashboardViewProps) {
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [reportData, setReportData] = useState<any>(null);
  const [inventoryValueData, setInventoryValueData] = useState<any>(null);
  const [gateEntries, setGateEntries] = useState<any[]>([]);
  const [approvedOrders, setApprovedOrders] = useState<any[]>([]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const whId = selectedWarehouseId || '64d77168-b30e-48b2-89de-4eb8ba46712f';
      const today = new Date().toISOString().split('T')[0];
      const headers = {
        'x-actor-id': '7075c245-a4cc-4ffe-883a-aac45011af3b',
        'x-correlation-id': '7075c245-a4cc-4ffe-883a-aac45011af3b'
      };

      const [dashRes, valRes, entriesRes, ordersRes] = await Promise.all([
        fetch(`/api/v1/reports/dashboard?warehouseId=${whId}&businessDate=${today}`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/v1/reports/inventory-value?warehouseId=${whId}`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/v1/gate/entries', { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/v1/gate/approved-orders', { headers }).then(r => r.ok ? r.json() : []).catch(() => [])
      ]);

      if (dashRes) setReportData(dashRes);
      if (valRes) setInventoryValueData(valRes);
      if (Array.isArray(entriesRes)) setGateEntries(entriesRes);
      if (Array.isArray(ordersRes)) setApprovedOrders(ordersRes);

      setLastUpdated(new Date().toLocaleTimeString('vi-VN'));
    } catch (err) {
      console.error('Failed to fetch live dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedWarehouseId]);

  const [showFourEyesModal, setShowFourEyesModal] = useState(false);

  // STRICTLY REAL DATA FROM DATABASE API (NO MOCK FALLBACKS)
  const totalValue = Number(inventoryValueData?.totalValue || 0);
  const valItems: any[] = Array.isArray(inventoryValueData?.items) ? inventoryValueData.items : [];

  const inv = reportData?.inventory || {
    totalCases: 0,
    availableCases: 0,
    blockedCases: 0,
    quarantinedCases: 0,
    damagedCases: 0,
    expiredCases: 0,
    recalledCases: 0,
    nearExpiryCases: 0
  };

  const alerts = reportData?.alerts || {
    belowRop: 0,
    draftPurchaseRequests: 0,
    latePurchaseOrders: 0,
    openTransfers: 0,
    pendingStocktakes: 0,
    stocktakeVarianceCases: 0,
    openQualityCases: 0,
    pendingReturns: 0,
    activeRecalls: 0
  };

  const safePct = inv.totalCases > 0 ? Math.round((inv.availableCases / inv.totalCases) * 100) : 0;
  const nearExpiryPct = inv.totalCases > 0 ? Math.round((inv.nearExpiryCases / inv.totalCases) * 100) : 0;
  const expiredPct = inv.totalCases > 0 ? Math.round((inv.expiredCases / inv.totalCases) * 100) : 0;
  const reservedPct = inv.totalCases > 0 ? Math.round((inv.blockedCases / inv.totalCases) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="font-headline-md text-headline-md text-primary font-bold flex items-center gap-2">
            <span>Báo Cáo Tổng Quan Vận Hành KHO</span>
            {warehouseCode && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-200">
                {warehouseCode}
              </span>
            )}
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Dữ liệu vận hành trạm cân, tồn kho &amp; cảnh báo 4-mắt trực tiếp 100% từ CSDL PostgreSQL.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-all flex items-center gap-1.5 shadow-sm"
          >
            <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
            {loading ? 'Đang truy vấn CSDL...' : 'Làm mới dữ liệu DB'}
          </button>
          <div className="text-data-mono font-data-mono text-on-surface-variant bg-surface-container px-3 py-1.5 rounded flex items-center gap-2 text-xs">
            <span className="material-symbols-outlined text-[16px] text-emerald-600">sync</span>
            TRUY VẤN DB: {lastUpdated || 'Đang kết nối...'}
          </div>
        </div>
      </div>

      {/* KPI Top Row cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-level-1 p-4 rounded-2xl bg-white border border-slate-200 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <span className="font-label-caps text-xs text-slate-500 uppercase tracking-wider font-bold">Tổng Định Giá Tồn Kho CSDL</span>
            <span className="material-symbols-outlined text-indigo-600">payments</span>
          </div>
          <div>
            <div className="font-display-lg text-display-lg text-indigo-950 font-bold font-data-mono">
              ₫{totalValue.toLocaleString('vi-VN')}
            </div>
            <div className="flex items-center gap-1 text-emerald-700 font-data-mono text-xs mt-1">
              <span className="material-symbols-outlined text-[14px]">database</span>
              <span>Ghi nhận {inv.totalCases.toLocaleString()} thùng/két trong CSDL</span>
            </div>
          </div>
        </div>

        <div className="card-level-1 p-4 rounded-2xl bg-white border-2 border-amber-300 border-l-4 border-l-amber-600 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow relative">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-1.5">
              <span className="font-label-caps text-xs text-amber-900 uppercase tracking-wider font-bold">Yêu Cầu Chờ Phê Duyệt (4-Mắt)</span>
              <button
                onClick={() => setShowFourEyesModal(true)}
                title="Bấm để xem giải thích Quy tắc Kiểm soát 4-Mắt (Four-Eyes Principle)"
                className="text-amber-700 hover:text-amber-950 transition-all p-0.5 rounded-full hover:bg-amber-200/60 flex items-center"
              >
                <span className="material-symbols-outlined text-[16px]">info</span>
              </button>
            </div>
            <span className="material-symbols-outlined text-amber-600">rule</span>
          </div>
          <div>
            <div className="font-display-lg text-display-lg text-amber-950 font-bold font-data-mono">
              {pendingApprovalsCount}
            </div>
            <div className="flex items-center gap-1 text-amber-800 font-data-mono text-xs mt-1">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              <span>{pendingApprovalsCount > 0 ? `${pendingApprovalsCount} đơn cần Quản lý duyệt 4-Mắt` : 'Không có yêu cầu chờ duyệt'}</span>
            </div>
          </div>
        </div>

        <div className="card-level-1 p-4 rounded-2xl bg-white border border-slate-200 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <span className="font-label-caps text-xs text-slate-500 uppercase tracking-wider font-bold">Lượt Xe Cân Cổng &amp; Đơn PO/DO CSDL</span>
            <span className="material-symbols-outlined text-indigo-600">local_shipping</span>
          </div>
          <div>
            <div className="font-display-lg text-display-lg text-indigo-950 font-bold font-data-mono">
              {gateEntries.length} xe tải
            </div>
            <div className="flex items-center gap-1 text-slate-600 font-data-mono text-xs mt-1">
              <span className="material-symbols-outlined text-[14px]">assignment</span>
              <span>{approvedOrders.length} Đơn PO/DO trong CSDL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bento Grid: Charts & Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Real Stacked Bar Chart */}
        <div className="bg-white rounded-2xl border border-slate-200 col-span-1 lg:col-span-3 flex flex-col shadow-sm">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
            <div>
              <h3 className="font-headline-sm text-base text-slate-900 font-bold">Biểu Đồ Phân Loại Trạng Thái Tồn Kho CSDL</h3>
              <p className="text-xs text-slate-500">Truy vấn trực tiếp số lượng thùng hạ kho từ bảng inventory_balance</p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="px-3 py-1 bg-emerald-100 text-emerald-900 rounded-full font-bold">
                🟢 {inv.availableCases.toLocaleString()} Thùng Sẵn Sàng Bán
              </span>
            </div>
          </div>
          <div className="p-6 flex-1 flex flex-col">
            {inv.totalCases === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <span className="material-symbols-outlined text-4xl text-slate-300">inventory_2</span>
                <span className="text-xs font-semibold text-slate-500">Chưa có dữ liệu tồn kho phát sinh trong CSDL PostgreSQL</span>
                <span className="text-[11px] text-slate-400">Hãy tạo đơn PO &amp; xác nhận cân hạ kho để ghi nhận tồn kho mới</span>
              </div>
            ) : (
              <div className="flex-1 flex items-end gap-3 sm:gap-6 h-64 border-b border-l border-slate-200 pb-2 pl-2 relative">
                <div className="absolute left-[-35px] bottom-0 top-0 flex flex-col justify-between text-[10px] text-slate-400 font-data-mono py-2">
                  <span>{(inv.totalCases * 1.0).toLocaleString()}</span>
                  <span>{(inv.totalCases * 0.75).toLocaleString()}</span>
                  <span>{(inv.totalCases * 0.5).toLocaleString()}</span>
                  <span>{(inv.totalCases * 0.25).toLocaleString()}</span>
                  <span>0</span>
                </div>

                <div className="absolute left-0 right-0 top-1/4 h-px bg-slate-100 z-0"></div>
                <div className="absolute left-0 right-0 top-2/4 h-px bg-slate-100 z-0"></div>
                <div className="absolute left-0 right-0 top-3/4 h-px bg-slate-100 z-0"></div>

                {['AVAILABLE', 'RESERVED', 'QUARANTINE', 'DAMAGED', 'EXPIRED'].map((statusKey) => {
                  let heightPct = 0;
                  let colorClass = 'bg-emerald-600';
                  let labelText = '';
                  let countVal = 0;

                  if (statusKey === 'AVAILABLE') {
                    countVal = inv.availableCases;
                    heightPct = inv.totalCases > 0 ? (inv.availableCases / inv.totalCases) * 100 : 0;
                    colorClass = 'bg-emerald-600';
                    labelText = 'Available';
                  } else if (statusKey === 'RESERVED') {
                    countVal = inv.blockedCases;
                    heightPct = inv.totalCases > 0 ? (inv.blockedCases / inv.totalCases) * 100 : 0;
                    colorClass = 'bg-indigo-400';
                    labelText = 'Blocked';
                  } else if (statusKey === 'QUARANTINE') {
                    countVal = inv.quarantinedCases;
                    heightPct = inv.totalCases > 0 ? (inv.quarantinedCases / inv.totalCases) * 100 : 0;
                    colorClass = 'bg-amber-400';
                    labelText = 'Quarantine';
                  } else if (statusKey === 'DAMAGED') {
                    countVal = inv.damagedCases;
                    heightPct = inv.totalCases > 0 ? (inv.damagedCases / inv.totalCases) * 100 : 0;
                    colorClass = 'bg-rose-400';
                    labelText = 'Damaged';
                  } else if (statusKey === 'EXPIRED') {
                    countVal = inv.expiredCases;
                    heightPct = inv.totalCases > 0 ? (inv.expiredCases / inv.totalCases) * 100 : 0;
                    colorClass = 'bg-rose-600';
                    labelText = 'Expired';
                  }

                  return (
                    <div key={statusKey} className="w-full flex-1 flex flex-col justify-end group relative z-10 cursor-pointer">
                      <div
                        className={`${colorClass} w-full rounded-t transition-all hover:brightness-110`}
                        style={{ height: `${Math.max(heightPct, countVal > 0 ? 5 : 0)}%` }}
                        title={`${labelText}: ${countVal} thùng`}
                      ></div>
                      <div className="absolute bottom-[-24px] w-full text-center text-[9px] text-slate-600 font-data-mono font-bold truncate">
                        {labelText}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-4 mt-8 text-xs font-semibold text-slate-700 justify-center">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-emerald-600 rounded-sm"></div>Sẵn sàng bán ({inv.availableCases.toLocaleString()})</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-indigo-400 rounded-sm"></div>Giữ chỗ ({inv.blockedCases.toLocaleString()})</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-amber-400 rounded-sm"></div>Kiểm định ({inv.quarantinedCases.toLocaleString()})</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-rose-500 rounded-sm"></div>Hao hụt / Lỗi ({inv.damagedCases + inv.expiredCases})</div>
            </div>
          </div>
        </div>

        {/* Donut Chart Exp Alerts */}
        <div className="bg-white rounded-2xl border border-slate-200 col-span-1 flex flex-col shadow-sm">
          <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
            <h3 className="font-headline-sm text-base text-slate-900 font-bold">Cảnh Báo Hạn Dùng CSDL</h3>
          </div>
          <div className="p-4 flex-1 flex flex-col items-center justify-center">
            <div
              className="w-36 h-36 rounded-full relative flex items-center justify-center transition-all"
              style={{
                background: inv.totalCases > 0
                  ? `conic-gradient(#059669 0% ${safePct}%, #818cf8 ${safePct}% ${safePct + reservedPct}%, #f59e0b ${safePct + reservedPct}% ${safePct + reservedPct + nearExpiryPct}%, #ef4444 ${safePct + reservedPct + nearExpiryPct}% 100%)`
                  : '#e2e8f0'
              }}
            >
              <div className="w-24 h-24 bg-white rounded-full flex flex-col items-center justify-center text-center absolute z-10 shadow-inner">
                <span className="font-display-lg text-2xl text-emerald-800 font-bold leading-none font-data-mono">{safePct}%</span>
                <span className="font-label-caps text-[9px] text-emerald-700 font-extrabold uppercase mt-1">AN TOÀN</span>
              </div>
            </div>

            <div className="w-full mt-6 space-y-2 text-xs font-semibold">
              <div className="flex justify-between items-center text-slate-700">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-emerald-600"></div> An toàn (&gt;90 ngày)</div>
                <span className="font-data-mono font-bold text-emerald-800">{safePct}%</span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-indigo-400"></div> Cận hạn (30-90 ngày)</div>
                <span className="font-data-mono font-bold text-indigo-700">{nearExpiryPct}%</span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div> Rất cận (&lt;30 ngày)</div>
                <span className="font-data-mono font-bold text-amber-700">{inv.nearExpiryCases} thùng</span>
              </div>
              <div className="flex justify-between items-center bg-rose-50 px-2.5 py-1 -mx-1 rounded-lg border border-rose-200">
                <div className="flex items-center gap-2 text-rose-900 font-bold"><div className="w-2.5 h-2.5 rounded-full bg-rose-600"></div> Hết hạn sử dụng</div>
                <span className="font-data-mono text-rose-900 font-extrabold">{inv.expiredCases} thùng</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real Inventory Value / Low Stock Items Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <div>
            <h3 className="font-headline-sm text-base text-slate-900 font-bold">Danh Mục Tồn Kho &amp; Định Giá Thực Tế CSDL</h3>
            <p className="text-xs text-slate-500">Danh sách các lô hàng đang lưu giữ trong kho truy vấn trực tiếp từ PostgreSQL</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
            📊 {valItems.length} Lô Hàng CSDL
          </span>
        </div>
        <div className="overflow-x-auto">
          {valItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <span className="material-symbols-outlined text-4xl text-slate-300">inventory_2</span>
              <p className="text-xs font-semibold">Chưa có lô hàng tồn phát sinh trong CSDL PostgreSQL</p>
              <p className="text-[11px] text-slate-400">Hãy nhập hàng mới từ đơn PO để hiển thị bảng tồn kho định giá thực tế</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700">
                  <th className="p-3">MÃ SKU</th>
                  <th className="p-3">TÊN SẢN PHẨM SKU</th>
                  <th className="p-3">MÃ LÔ BATCH</th>
                  <th className="p-3 text-right">TỒN VẬT LÝ</th>
                  <th className="p-3 text-right">ĐƠN GIÁ SPEC</th>
                  <th className="p-3 text-right">GIÁ TRỊ TỒN KHO</th>
                  <th className="p-3 text-center">TRẠNG THÁI</th>
                </tr>
              </thead>
              <tbody className="font-data-mono text-xs text-slate-800">
                {valItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 text-indigo-900 font-bold">{item.skuCode}</td>
                    <td className="p-3 font-medium text-slate-900">{item.skuName}</td>
                    <td className="p-3 text-slate-600">{item.batchCode || 'DEFAULT_BATCH'}</td>
                    <td className="p-3 text-right font-extrabold text-slate-900">{item.quantityOnHand.toLocaleString()} thùng</td>
                    <td className="p-3 text-right text-slate-600">₫{item.unitCost.toLocaleString('vi-VN')}</td>
                    <td className="p-3 text-right text-emerald-800 font-bold">₫{item.inventoryValue.toLocaleString('vi-VN')}</td>
                    <td className="p-3 text-center">
                      <span className={`inline-block text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${item.stockStatus === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}>
                        {item.stockStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 4-Eyes Control Explanation Modal Popup */}
      {showFourEyesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-amber-800 font-extrabold text-lg">
                <span className="material-symbols-outlined text-2xl text-amber-600">visibility</span>
                <span>Quy Tắc Kiểm Soát 4-Mắt (Four-Eyes)</span>
              </div>
              <button
                onClick={() => setShowFourEyesModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="text-xs text-slate-700 space-y-3 leading-relaxed">
              <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200/80 text-amber-950 font-medium">
                💡 <strong>Nguyên tắc 4-Mắt (Four-Eyes Principle)</strong> là tiêu chuẩn kiểm soát rủi ro độc lập tối cao trong hệ thống quản trị kho bãi FMCG &amp; ERP doanh nghiệp (SAP/Oracle).
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-amber-600 text-base">group</span>
                  1. Nguyên lý 2 Người độc lập (Maker vs Checker):
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li><strong>Người Lập (Maker - Thủ kho / Nhân viên):</strong> Khởi tạo các giao dịch nhạy cảm (Đơn PO, Yêu cầu điều chỉnh tồn kho, Khóa/Huỷ hàng lỗi).</li>
                  <li><strong>Người Duyệt (Checker - Kế toán / Quản lý kho):</strong> Kiểm tra độc lập và bấm phê duyệt (Approve) hoặc từ chối (Reject).</li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-emerald-600 text-base">verified_user</span>
                  2. Chống Gian Lận &amp; Sai Sát Tuyệt Đối:
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li>Người tạo đơn <strong>KHÔNG ĐƯỢC PHÉP tự phê duyệt</strong> giao dịch của chính mình.</li>
                  <li>Mọi thao tác đều có dấu vết ghi log an toàn (Audit Log) theo tiêu chuẩn kiểm toán kho.</li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-indigo-600 text-base">fact_check</span>
                  3. Giao dịch cần duyệt 4-Mắt trong WMS:
                </h4>
                <div className="grid grid-cols-2 gap-2 font-medium text-[11px]">
                  <span className="p-2 bg-slate-100 rounded-xl text-slate-800 flex items-center gap-1">📄 Duyệt Đơn Mua Hàng PO</span>
                  <span className="p-2 bg-slate-100 rounded-xl text-slate-800 flex items-center gap-1">📦 Điều Chỉnh Tồn Kho</span>
                  <span className="p-2 bg-slate-100 rounded-xl text-slate-800 flex items-center gap-1">🚨 Khóa &amp; Huỷ Hàng Lỗi QC</span>
                  <span className="p-2 bg-slate-100 rounded-xl text-slate-800 flex items-center gap-1">🚚 Duyệt Xuất Kho Hàng Lớn</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowFourEyesModal(false)}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors shadow-md shadow-amber-200"
              >
                Đã Hiểu (Đóng)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
