import React from 'react';

export function LoadingState({ label = 'Đang tải…' }: { label?: string }) {
  return <div className="p-8 text-center text-on-surface-variant flex items-center justify-center gap-2"><span className="animate-spin material-symbols-outlined text-[18px]">sync</span>{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="bg-error-container text-on-error-container border border-error/20 rounded p-3 text-sm flex items-center justify-between gap-3"><span>{message}</span>{onRetry && <button onClick={onRetry} className="underline font-bold">Thử lại</button>}</div>;
}

export function SuccessState({ message }: { message: string }) {
  return <div className="bg-tertiary-container/20 text-on-tertiary-container border border-tertiary-container/30 rounded p-3 text-sm">{message}</div>;
}

export function ConfirmDialog({ title, message, confirmLabel = 'Xác nhận', danger = false, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4" role="dialog" aria-modal="true">
    <div className="bg-white rounded-xl border border-outline-variant shadow-xl max-w-md w-full p-5 space-y-4">
      <h3 className="font-bold text-primary">{title}</h3>
      <p className="text-sm text-on-surface-variant">{message}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 border border-outline rounded text-sm">Hủy</button>
        <button onClick={onConfirm} className={`px-3 py-2 rounded text-sm font-bold ${danger ? 'bg-error text-on-error' : 'bg-primary text-on-primary'}`}>{confirmLabel}</button>
      </div>
    </div>
  </div>;
}
