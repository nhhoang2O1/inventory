import React from 'react';

interface LoginViewProps {
  selectedWarehouse: string;
  setSelectedWarehouse: (warehouse: string) => void;
  username: string;
  setUsername: (username: string) => void;
  password: string;
  setPassword: (password: string) => void;
  loginError: string | null;
  isLoading: boolean;
  onLoginSubmit: (e: React.FormEvent) => void;
}

export function LoginView({
  selectedWarehouse,
  setSelectedWarehouse,
  username,
  setUsername,
  password,
  setPassword,
  loginError,
  isLoading,
  onLoginSubmit
}: LoginViewProps) {
  return (
    <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-24 py-16 relative">
      {/* Background decorative grid */}
      <div
        className="absolute inset-0 pointer-events-none z-[-1]"
        style={{
          backgroundSize: '32px 32px',
          backgroundImage: 'radial-gradient(circle, #c4c6cf 1px, transparent 1px)',
          opacity: 0.15
        }}
      ></div>

      {/* Left Widget: Secure Login form */}
      <div className="w-full max-w-md bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-8 flex flex-col gap-6 shrink-0 relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-secondary rounded-t-xl"></div>
        <div className="flex flex-col gap-1.5">
          <h1 className="font-headline-md text-headline-md text-primary font-bold">Xác Thực Truy Cập</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Vui lòng nhập tên đăng nhập và mật khẩu được cấp để vào hệ thống kho.</p>
        </div>

        {/* Error Alert Box */}
        {loginError && (
          <div className="bg-error-container text-on-error-container rounded-lg p-3.5 flex items-start gap-2.5 border border-error border-opacity-20 animate-fade-in">
            <span className="material-symbols-outlined shrink-0 text-[20px] text-error">error</span>
            <span className="font-body-md text-[13px]">{loginError}</span>
          </div>
        )}

        <form onSubmit={onLoginSubmit} className="flex flex-col gap-5">
          {/* Warehouse Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps text-on-surface-variant ml-1">KHO VẬN HÀNH</label>
            <div className="relative">
              <select
                className="w-full bg-surface-container-lowest border border-outline-variant rounded p-3 pl-10 pr-10 font-body-lg text-body-lg text-on-surface appearance-none focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none transition-colors"
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                disabled={isLoading}
              >
                <option value="Warehouse Alpha">Kho Alpha (Chi nhánh Hà Nội)</option>
                <option value="Warehouse Beta">Kho Beta (Chi nhánh TP. HCM)</option>
                <option value="Depot Gamma">Kho Tổng Gamma</option>
              </select>
              <span className="material-symbols-outlined absolute left-3 top-3 text-on-surface-variant pointer-events-none">warehouse</span>
              <span className="material-symbols-outlined absolute right-3 top-3 text-on-surface-variant pointer-events-none">arrow_drop_down</span>
            </div>
          </div>

          {/* Username */}
          <div className="flex flex-col gap-1.5">
            <label className="font-label-caps text-label-caps text-on-surface-variant ml-1">TÊN ĐĂNG NHẬP (USERNAME)</label>
            <div className="relative">
              <input
                className="w-full bg-surface-container-lowest border border-outline-variant rounded p-3 pl-10 font-data-mono text-data-mono text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none transition-colors"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tên đăng nhập (ví dụ: storekeeper, manager)"
                required
                disabled={isLoading}
              />
              <span className="material-symbols-outlined absolute left-3 top-3 text-on-surface-variant pointer-events-none">person</span>
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center ml-1">
              <label className="font-label-caps text-label-caps text-on-surface-variant">MẬT KHẨU (PASSWORD)</label>
              <a href="#" className="font-label-caps text-[11px] text-secondary hover:underline">Quên mật khẩu?</a>
            </div>
            <div className="relative">
              <input
                className="w-full bg-surface-container-lowest border border-outline-variant rounded p-3 pl-10 pr-10 font-data-mono text-data-mono text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none transition-colors"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isLoading}
              />
              <span className="material-symbols-outlined absolute left-3 top-3 text-on-surface-variant pointer-events-none">lock</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-4 w-full bg-secondary text-on-secondary font-headline-sm text-headline-sm rounded py-3 hover:bg-secondary-container hover:text-on-secondary-container transition-colors active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <span>Đang xác thực...</span>
                <span className="animate-spin h-5 w-5 border-2 border-on-secondary border-t-transparent rounded-full"></span>
              </>
            ) : (
              <>
                <span>Xác Thực Đăng Nhập</span>
                <span className="material-symbols-outlined">login</span>
              </>
            )}
          </button>
        </form>

        {/* Demo Helper Block */}
        <div className="mt-2 bg-surface-container rounded-lg p-3 text-[12px] text-on-surface-variant flex flex-col gap-1 border border-outline-variant border-dashed">
          <span className="font-bold text-secondary flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">info</span>
            Tài khoản dùng thử (Mật khẩu: 123456)
          </span>
          <div className="flex flex-col gap-1.5 mt-1">
            <div><span className="font-semibold text-primary">• Quản lý Tổng:</span> <code className="font-data-mono bg-surface-bright px-1 py-0.5 rounded text-[11px]">manager</code></div>
            <div className="border-t border-outline-variant pt-1 text-[11px]">
              <span className="font-semibold text-secondary">• Kho Alpha (KHO-A):</span> <code className="font-data-mono bg-surface-bright px-1 py-0.5 rounded">storekeeper_a</code> / <code className="font-data-mono bg-surface-bright px-1 py-0.5 rounded">accountant_a</code> / <code className="font-data-mono bg-surface-bright px-1 py-0.5 rounded">sales_a</code>
            </div>
            <div className="border-t border-outline-variant pt-1 text-[11px]">
              <span className="font-semibold text-secondary">• Kho Beta (KHO-B):</span> <code className="font-data-mono bg-surface-bright px-1 py-0.5 rounded">storekeeper_b</code> / <code className="font-data-mono bg-surface-bright px-1 py-0.5 rounded">accountant_b</code> / <code className="font-data-mono bg-surface-bright px-1 py-0.5 rounded">sales_b</code>
            </div>
            <div className="border-t border-outline-variant pt-1 text-[11px]">
              <span className="font-semibold text-secondary">• Kho Gamma (KHO-C):</span> <code className="font-data-mono bg-surface-bright px-1 py-0.5 rounded">storekeeper_c</code> / <code className="font-data-mono bg-surface-bright px-1 py-0.5 rounded">accountant_c</code> / <code className="font-data-mono bg-surface-bright px-1 py-0.5 rounded">sales_c</code>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Technical Bulletins & Status Grid */}
      <div className="w-full max-w-lg flex flex-col gap-6">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-outline-variant">
            <span className="material-symbols-outlined text-secondary">rss_feed</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Bảng Tin Kỹ Thuật Kho</h2>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex gap-4 items-start">
              <div className="shrink-0 w-8 h-8 rounded bg-surface-container-high flex items-center justify-center text-on-surface-variant mt-1">
                <span className="material-symbols-outlined text-[18px]">update</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">Lịch Bảo Trì DB Sync</span>
                  <span className="font-data-mono text-data-mono text-outline text-[11px]">23:00 Hôm Nay</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface">Tiến hành đồng bộ cụm máy chủ khu vực miền Nam. Hệ thống sẽ ở chế độ chỉ đọc trong vòng 15 phút.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start pt-4 border-t border-outline-variant border-dashed">
              <div className="shrink-0 w-8 h-8 rounded bg-error-container text-on-error-container flex items-center justify-center mt-1">
                <span className="material-symbols-outlined text-[18px]">warning</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">Cảnh Báo Hạn Dùng (FEFO)</span>
                  <span className="font-data-mono text-data-mono text-outline text-[11px]">Hôm Qua</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface">Đã ghi nhận 3 SKU tại Khu A cận hạn dưới 30 ngày. Vui lòng ưu tiên lấy hàng theo phiếu pick FEFO.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col gap-2 shadow-sm">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Nhân viên trực ca</span>
            <div className="flex items-baseline gap-2">
              <span className="font-display-lg text-display-lg text-primary font-bold">14</span>
              <span className="font-body-md text-body-md text-tertiary flex items-center">Active</span>
            </div>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex flex-col gap-2 shadow-sm">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Số xe Inbound chờ</span>
            <div className="flex items-baseline gap-2">
              <span className="font-display-lg text-display-lg text-primary font-bold">8</span>
              <span className="font-body-md text-body-md text-on-surface-variant">xe tải</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
