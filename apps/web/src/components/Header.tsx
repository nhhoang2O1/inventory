import React from 'react';
import { UserRole } from '../types';

interface HeaderProps {
  warehouses: Array<{ id: string; name: string; code: string }>;
  selectedWarehouseId: string;
  onWarehouseChange: (id: string) => void;
  operatorId: string;
  userRole: UserRole;
}

export function Header({ warehouses, selectedWarehouseId, onWarehouseChange, operatorId, userRole }: HeaderProps) {
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

      {/* Warehouse Selector & User Profile */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">warehouse</span>
          <select
            className="bg-surface-container-low border border-outline-variant rounded px-2.5 py-1 text-xs text-on-surface font-semibold focus:ring-1 focus:ring-secondary focus:outline-none"
            value={selectedWarehouseId}
            onChange={(e) => onWarehouseChange(e.target.value)}
          >
            {warehouses.length > 0 ? (
              warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))
            ) : (
              <option value="">Không có kho</option>
            )}
          </select>
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
