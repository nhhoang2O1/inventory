import React from 'react';
import { UserRole } from '../types';

interface HeaderProps {
  warehouses: Array<{ id: string; name: string; code: string }>;
  selectedWarehouseId: string;
  onWarehouseChange: (id: string) => void;
  operatorId: string;
  userRole: UserRole;
  onQuickSwitchRole?: (role: UserRole) => void;
}

export function Header({ warehouses, selectedWarehouseId, onWarehouseChange, operatorId, userRole, onQuickSwitchRole }: HeaderProps) {
  return (
    <header className="h-16 px-6 bg-surface-container-lowest border-b border-outline-variant flex justify-between items-center shrink-0 z-40 fixed top-0 right-0 w-full md:w-[calc(100%-240px)]">
      <div className="flex items-center gap-4">
        <div className="font-headline-md text-headline-md font-bold text-primary">
          FMCG Logistics WMS
        </div>

        {/* Telemetry info */}
        <div className="hidden lg:flex items-center gap-3 pl-4 border-l border-outline-variant text-[11px] font-data-mono text-on-surface-variant">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-tertiary-container shadow-[0_0_8px_rgba(75,178,120,0.5)]"></span>
            API: Healthy
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-tertiary-container shadow-[0_0_8px_rgba(75,178,120,0.5)]"></span>
            DB Sync: Live
          </span>
        </div>
      </div>

      {/* DEV Quick Switch Role Bar */}
      {onQuickSwitchRole && (
        <div className="hidden xl:flex items-center gap-1 bg-slate-900 text-white px-2.5 py-1 rounded-xl border border-slate-700 shadow-md text-xs">
          <span className="font-bold text-[10px] text-amber-400 uppercase tracking-wider flex items-center gap-1 pr-1">
            <span className="material-symbols-outlined text-[13px]">bolt</span> DEV ROLE:
          </span>
          <button
            type="button"
            onClick={() => onQuickSwitchRole('Gatekeeper')}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${userRole === 'Gatekeeper' ? 'bg-amber-500 text-slate-950 font-extrabold shadow' : 'hover:bg-slate-800 text-slate-200'}`}
          >
            🛡️ Bảo Vệ
          </button>
          <button
            type="button"
            onClick={() => onQuickSwitchRole('Warehouse Staff')}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${userRole === 'Warehouse Staff' ? 'bg-amber-500 text-slate-950 font-extrabold shadow' : 'hover:bg-slate-800 text-slate-200'}`}
          >
            📦 Thủ Kho
          </button>
          <button
            type="button"
            onClick={() => onQuickSwitchRole('Sales')}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${userRole === 'Sales' ? 'bg-amber-500 text-slate-950 font-extrabold shadow' : 'hover:bg-slate-800 text-slate-200'}`}
          >
            💼 Sales
          </button>
          <button
            type="button"
            onClick={() => onQuickSwitchRole('Accountant')}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${userRole === 'Accountant' ? 'bg-amber-500 text-slate-950 font-extrabold shadow' : 'hover:bg-slate-800 text-slate-200'}`}
          >
            💵 Kế Toán
          </button>
          <button
            type="button"
            onClick={() => onQuickSwitchRole('Manager')}
            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${userRole === 'Manager' ? 'bg-amber-500 text-slate-950 font-extrabold shadow' : 'hover:bg-slate-800 text-slate-200'}`}
          >
            👔 Manager
          </button>
          <div className="h-4 w-px bg-slate-700 mx-1"></div>
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('🧹 XÓA SẠCH TOÀN BỘ XE TEST & PHIẾU CÂN CỔNG?')) {
                try {
                  const res = await fetch('/api/v1/gate/reset-data', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                  if (res.ok) {
                    alert('🧹 Đã xóa sạch dữ liệu test chuyến xe & cân trạm thành công!');
                    window.location.reload();
                  }
                } catch (e) {
                  console.error(e);
                }
              }
            }}
            className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-xs flex items-center gap-1"
            title="Xóa sạch dữ liệu xe & cân test"
          >
            <span className="material-symbols-outlined text-[12px]">restart_alt</span>
            Reset Test Data
          </button>
        </div>
      )}

      {/* Warehouse Selector & User Profile */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-indigo-50 text-indigo-900 px-3 py-1.5 rounded-lg border border-indigo-200">
          <span className="material-symbols-outlined text-[18px] text-indigo-700">domain</span>
          <span className="text-xs font-bold font-data-mono">
            {warehouses.find(w => w.id === selectedWarehouseId)?.name || 'Bãi Kho Tập Trung CITARES'}
          </span>
        </div>

        {/* MFA Active Pill */}
        <div className="hidden sm:flex items-center gap-1 bg-tertiary-container/10 text-on-tertiary-container px-2 py-1 rounded text-[11px] font-semibold border border-tertiary-container/30">
          <span className="material-symbols-outlined text-[14px]">lock</span>
          MFA Active
        </div>

        {/* Operator identifier */}
        <div className="text-right hidden sm:block">
          <p className="text-xs font-semibold text-primary">{operatorId}</p>
          <p className="text-[10px] text-on-surface-variant uppercase font-label-caps">{userRole}</p>
        </div>

        <div className="h-8 w-8 rounded-full overflow-hidden border border-outline-variant bg-surface-container">
          <img
            alt="Profile Avatar"
            className="w-full h-full object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAog1UdTphHer9WSBmB-tfZz2V8d7xhbxb9wRGW7fxqK2woQqCQHNxyBXEuvbryeSkdMrE7TNIshoDTCHXyzj1YJKgqWlJtHXtLZHIM9hYIHLurr3lzK6QTq4eYFppUSE8ApVTfjKeDibpm9TbddfmfhpJe4F67LMkJol05b2zT3MfO0se7ZOIC29eYguCW_c1GZGRlIDsn27xi2I62gHSGQ2ONSanp36v-ZHynoQBQx2StLmERp5be"
          />
        </div>
      </div>
    </header>
  );
}
