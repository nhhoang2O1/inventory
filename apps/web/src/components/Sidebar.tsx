import React from 'react';
import { ViewType, UserRole } from '../types';

interface SidebarProps {
  currentView: ViewType;
  setView: (view: ViewType) => void;
  userRole: UserRole;
  onLogout: () => void;
}

const items: Array<[ViewType, string, string]> = [
  ['dashboard', 'Dashboard tổng quan', 'dashboard'],
  ['inbound', 'Nhập kho', 'login'],
  ['outbound', 'Xuất kho & pick', 'conveyor_belt'],
  ['inventory', 'Tra cứu tồn kho', 'inventory_2'],
  ['financial', 'Tài chính & vận hành', 'analytics'],
  ['approval', 'Trung tâm duyệt', 'rule'],
  ['quality', 'Kiểm soát chất lượng', 'gavel']
];

export function Sidebar({ currentView, setView, userRole, onLogout }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 h-full w-[240px] z-50 bg-surface border-r border-outline-variant hidden md:flex flex-col">
      <div className="p-6 border-b border-outline-variant flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary-container text-on-primary-container flex items-center justify-center text-[22px] font-black">W</div>
        <div className="overflow-hidden">
          <h2 className="font-headline-sm font-bold text-on-surface truncate">WMS Admin</h2>
          <span className="text-[11px] text-on-surface-variant font-data-mono">{userRole}</span>
        </div>
      </div>
      <nav className="flex-1 py-4 px-2 flex flex-col gap-1">
        {items.map(([view, label, icon]) => (
          <button key={view} onClick={() => setView(view)} className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all ${currentView === view ? 'bg-secondary-container text-on-secondary-container font-bold border-l-4 border-secondary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
            <span className={`material-symbols-outlined ${currentView === view ? 'fill' : ''}`}>{icon}</span>
            <span className="font-label-caps text-label-caps">{label}</span>
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-outline-variant">
        <div className="px-3 py-2 text-[11px] text-on-surface-variant">Vận hành bởi <strong>Antigravity AI</strong></div>
        <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-error hover:bg-error-container/20 rounded-lg">
          <span className="material-symbols-outlined">logout</span> Đăng xuất
        </button>
      </div>
    </aside>
  );
}
