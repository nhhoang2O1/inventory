import React from 'react';

interface LoginViewProps {
  username: string;
  setUsername: (username: string) => void;
  password: string;
  setPassword: (password: string) => void;
  loginError: string | null;
  isLoading: boolean;
  onLoginSubmit: (e: React.FormEvent) => void;
}

export function LoginView({
  username,
  setUsername,
  password,
  setPassword,
  loginError,
  isLoading,
  onLoginSubmit
}: LoginViewProps) {
  return (
    <div className="min-h-screen max-w-6xl mx-auto flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-8 flex flex-col gap-6">
        <div className="h-1 -mx-8 -mt-8 bg-secondary rounded-t-xl" />
        <div>
          <h1 className="font-headline-md text-primary font-bold">Xác thực truy cập</h1>
          <p className="font-body-md text-on-surface-variant mt-2">
            Đăng nhập bằng tài khoản được cấp. Kho và phạm vi dữ liệu được lấy từ quyền phiên đăng nhập.
          </p>
        </div>

        {loginError && (
          <div className="bg-error-container text-on-error-container rounded-lg p-3.5 flex items-start gap-2.5 border border-error/20">
            <span className="material-symbols-outlined text-error">error</span>
            <span className="font-body-md text-[13px]">{loginError}</span>
          </div>
        )}

        <form onSubmit={onLoginSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="font-label-caps text-on-surface-variant ml-1">Tên đăng nhập</span>
            <input
              className="w-full bg-surface-container-lowest border border-outline-variant rounded p-3 font-data-mono text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              disabled={isLoading}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-label-caps text-on-surface-variant ml-1">Mật khẩu</span>
            <input
              className="w-full bg-surface-container-lowest border border-outline-variant rounded p-3 font-data-mono text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={isLoading}
            />
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-secondary text-on-secondary font-headline-sm rounded py-3 hover:bg-secondary-container hover:text-on-secondary-container transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Đang xác thực…' : 'Đăng nhập'}
          </button>
        </form>

        {import.meta.env.DEV && (
          <p className="text-xs text-on-surface-variant border border-dashed border-outline-variant rounded p-3">
            Dev/UAT seed: tài khoản mẫu dùng mật khẩu <code>WmsDemo2026!</code>. Không hiển thị khối này trong production.
          </p>
        )}
      </div>
    </div>
  );
}
