import React from 'react';
import { ViewType, UserRole } from '../types';

interface SidebarProps {
  currentView: ViewType;
  setView: (view: ViewType) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  onLogout: () => void;
}

export function getAllowedViewsForRole(role?: string): ViewType[] {
  const normalized = (role || '').toUpperCase();

  // GATEKEEPER / Bảo vệ: Chỉ thao tác Cổng & Trạm Cân và Xem Sơ Đồ Kho 2D
  if (normalized.includes('GATE') || normalized.includes('BẢO VỆ')) {
    return ['gate', 'layout'];
  }

  // STOREKEEPER / Thủ kho / Warehouse Staff: Nhập Kho, Xuất Kho, Tra Cứu Tồn Kho, Đơn PO (Lập PO nháp), Sơ Đồ Kho, Chất Lượng
  if (normalized.includes('STAFF') || normalized.includes('STORE') || normalized.includes('THỦ KHO')) {
    return ['inbound', 'outbound', 'inventory', 'purchasing', 'layout', 'quality'];
  }

  if (normalized.includes('SALE') || normalized.includes('BÁN HÀNG')) {
    return ['inventory', 'outbound', 'purchasing'];
  }

  if (normalized.includes('ACCOUNTANT') || normalized.includes('KẾ TOÁN')) {
    return ['financial', 'inventory', 'approval', 'dashboard'];
  }

  return ['dashboard', 'inbound', 'outbound', 'inventory', 'financial', 'approval', 'quality', 'layout', 'gate', 'purchasing'];
}

export function Sidebar({ currentView, setView, userRole, setUserRole, onLogout }: SidebarProps) {
  const allowedViews = getAllowedViewsForRole(userRole);

  return (
    <aside className="fixed left-0 top-0 h-full w-[240px] z-50 bg-surface border-r border-outline-variant flex flex-col justify-between hidden md:flex">
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Brand Logo & Avatar Header */}
        <div className="p-6 border-b border-outline-variant flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary-container text-on-primary-container flex items-center justify-center font-display-lg text-[22px] font-black shrink-0">
            W
          </div>
          <div className="overflow-hidden">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface truncate">WMS Admin</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <select
                className="bg-transparent border-none p-0 text-[11px] font-bold text-indigo-900 font-data-mono focus:ring-0 cursor-pointer"
                value={userRole}
                onChange={(e) => setUserRole(e.target.value as UserRole)}
              >
                <option value="Gatekeeper">🛡️ Gatekeeper (Bảo vệ)</option>
                <option value="Warehouse Staff">📦 Storekeeper (Thủ kho)</option>
                <option value="Sales">💼 Sales (Bán hàng)</option>
                <option value="Accountant">💵 Accountant (Kế toán)</option>
                <option value="Manager">👔 Manager (Quản lý)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Quick Action Button */}
        <div className="p-4">
          <button
            onClick={() => {
              if (allowedViews.includes('inbound')) setView('inbound');
              else if (allowedViews.includes('gate')) setView('gate');
              else if (allowedViews.includes('inventory')) setView('inventory');
              else setView(allowedViews[0] || 'dashboard');
            }}
            className="w-full bg-primary text-on-primary py-2.5 px-4 rounded-lg font-label-caps text-label-caps hover:bg-primary-container hover:text-on-primary-container transition-colors duration-200 flex items-center justify-center gap-2 active:scale-95 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Lập Phiếu Mới
          </button>
        </div>

        {/* Navigation Menu Links */}
        <nav className="flex-1 py-2 px-2 flex flex-col gap-1">
          {allowedViews.includes('dashboard') && (
            <button
              onClick={() => setView('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 active:scale-95 ${
                currentView === 'dashboard'
                  ? 'bg-secondary-container text-on-secondary-container font-bold border-l-4 border-secondary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === 'dashboard' ? 'fill' : ''}`}>dashboard</span>
              <span className="font-label-caps text-label-caps">Dashboard Tổng Quan</span>
            </button>
          )}

          {allowedViews.includes('inbound') && (
            <button
              onClick={() => setView('inbound')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 active:scale-95 ${
                currentView === 'inbound'
                  ? 'bg-secondary-container text-on-secondary-container font-bold border-l-4 border-secondary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === 'inbound' ? 'fill' : ''}`}>login</span>
              <span className="font-label-caps text-label-caps">Nhập Kho (Inbound)</span>
            </button>
          )}

          {allowedViews.includes('outbound') && (
            <button
              onClick={() => setView('outbound')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 active:scale-95 ${
                currentView === 'outbound'
                  ? 'bg-secondary-container text-on-secondary-container font-bold border-l-4 border-secondary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === 'outbound' ? 'fill' : ''}`}>conveyor_belt</span>
              <span className="font-label-caps text-label-caps">Xuất Kho &amp; Pick Hàng</span>
            </button>
          )}

          {allowedViews.includes('inventory') && (
            <button
              onClick={() => setView('inventory')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 active:scale-95 ${
                currentView === 'inventory'
                  ? 'bg-secondary-container text-on-secondary-container font-bold border-l-4 border-secondary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === 'inventory' ? 'fill' : ''}`}>inventory_2</span>
              <span className="font-label-caps text-label-caps">Tra Cứu Tồn Kho (ATP)</span>
            </button>
          )}

          {allowedViews.includes('financial') && (
            <button
              onClick={() => setView('financial')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 active:scale-95 ${
                currentView === 'financial'
                  ? 'bg-secondary-container text-on-secondary-container font-bold border-l-4 border-secondary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === 'financial' ? 'fill' : ''}`}>analytics</span>
              <span className="font-label-caps text-label-caps">Báo Cáo Tài Chính</span>
            </button>
          )}

          {allowedViews.includes('approval') && (
            <button
              onClick={() => setView('approval')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 active:scale-95 ${
                currentView === 'approval'
                  ? 'bg-secondary-container text-on-secondary-container font-bold border-l-4 border-secondary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === 'approval' ? 'fill' : ''}`}>rule</span>
              <span className="font-label-caps text-label-caps">Trung Tâm Duyệt Phiếu</span>
            </button>
          )}

          {allowedViews.includes('quality') && (
            <button
              onClick={() => setView('quality')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 active:scale-95 ${
                currentView === 'quality'
                  ? 'bg-secondary-container text-on-secondary-container font-bold border-l-4 border-secondary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === 'quality' ? 'fill' : ''}`}>gavel</span>
              <span className="font-label-caps text-label-caps">Kiểm Soát Chất Lượng</span>
            </button>
          )}

          {allowedViews.includes('layout') && (
            <button
              onClick={() => setView('layout')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 active:scale-95 ${
                currentView === 'layout'
                  ? 'bg-secondary-container text-on-secondary-container font-bold border-l-4 border-secondary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === 'layout' ? 'fill' : ''}`}>map</span>
              <span className="font-label-caps text-label-caps">Sơ Đồ Kho 2D</span>
            </button>
          )}

          {allowedViews.includes('gate') && (
            <button
              onClick={() => setView('gate')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 active:scale-95 ${
                currentView === 'gate'
                  ? 'bg-secondary-container text-on-secondary-container font-bold border-l-4 border-secondary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === 'gate' ? 'fill' : ''}`}>local_shipping</span>
              <span className="font-label-caps text-label-caps">Cổng &amp; Trạm Cân</span>
            </button>
          )}

          {allowedViews.includes('purchasing') && (
            <button
              onClick={() => setView('purchasing')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 active:scale-95 ${
                currentView === 'purchasing'
                  ? 'bg-secondary-container text-on-secondary-container font-bold border-l-4 border-secondary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className={`material-symbols-outlined ${currentView === 'purchasing' ? 'fill' : ''}`}>shopping_cart</span>
              <span className="font-label-caps text-label-caps">Đơn Mua Hàng &amp; NCC (PO)</span>
            </button>
          )}
        </nav>

        {/* Support / System Footer info */}
        <div className="p-2 border-t border-outline-variant flex flex-col gap-1">
          <div className="px-4 py-2 text-[11px] text-on-surface-variant">
            <span>Vận hành bởi <strong>Antigravity AI</strong></span>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-error hover:bg-error-container/20 rounded-lg transition-colors active:scale-95 font-body-md text-body-md"
          >
            <span className="material-symbols-outlined">logout</span>
            Đăng Xuất
          </button>
        </div>
      </div>
    </aside>
  );
}
