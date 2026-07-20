import React from 'react';
import { ApprovalRequest, ApprovalTab } from '../types';

interface ApprovalViewProps {
  approvalRequests: ApprovalRequest[];
  approvalTab: ApprovalTab;
  setApprovalTab: (tab: ApprovalTab) => void;
  approvalActionMessage: string | null;
  reviewModalRequest: ApprovalRequest | null;
  setReviewModalRequest: (request: ApprovalRequest | null) => void;
  operatorId: string;
  handleApproveRequest: (request: ApprovalRequest) => void;
  handleRejectRequest: (request: ApprovalRequest) => void;
}

export function ApprovalView({
  approvalRequests,
  approvalTab,
  setApprovalTab,
  approvalActionMessage,
  reviewModalRequest,
  setReviewModalRequest,
  operatorId,
  handleApproveRequest,
  handleRejectRequest
}: ApprovalViewProps) {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-md text-headline-md text-on-surface font-bold">Trung Tâm Phê Duyệt Tập Trung</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Phê duyệt đơn đặt hàng ROP, phiếu điều chỉnh tồn kho, và các ngoại lệ FEFO cận hạn.</p>
        </div>

        {approvalActionMessage && (
          <div className="bg-tertiary-container/20 text-on-tertiary-container p-2 rounded border border-tertiary-container/30 text-xs font-semibold">
            {approvalActionMessage}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-outline-variant text-xs font-semibold gap-1">
        <button
          onClick={() => setApprovalTab('po')}
          className={`px-6 py-3 border-b-2 transition-colors ${
            approvalTab === 'po' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Đơn Mua Hàng (PO) <span className="ml-2 bg-error-container text-on-error-container text-[10px] px-2 py-0.5 rounded-full font-bold">
            {approvalRequests.filter(r => r.type === 'Purchase Order').length}
          </span>
        </button>
        <button
          onClick={() => setApprovalTab('adjustment')}
          className={`px-6 py-3 border-b-2 transition-colors ${
            approvalTab === 'adjustment' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Điều Chỉnh Tồn Kho <span className="ml-2 bg-surface-container-highest text-on-surface text-[10px] px-2 py-0.5 rounded-full font-bold">
            {approvalRequests.filter(r => r.type === 'Inventory Adjustment').length}
          </span>
        </button>
        <button
          onClick={() => setApprovalTab('exception')}
          className={`px-6 py-3 border-b-2 transition-colors ${
            approvalTab === 'exception' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Ngoại Lệ FEFO &amp; HSD <span className="ml-2 bg-error-container text-on-error-container text-[10px] px-2 py-0.5 rounded-full font-bold">
            {approvalRequests.filter(r => r.type === 'MRSL & FEFO Exception').length}
          </span>
        </button>
      </div>

      {/* Approval Data Grid */}
      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-surface-container-low border-b border-outline-variant font-bold text-on-surface-variant">
              <tr>
                <th className="p-3">Mã Yêu Cầu</th>
                <th className="p-3">Người Đề Xuất (Creator)</th>
                <th className="p-3">Nội Dung Yêu Cầu</th>
                <th className="p-3 text-right">Giá Trị Quy Đổi</th>
                <th className="p-3 text-center">Độ Ưu Tiên</th>
                <th className="p-3 text-center">Hành Động</th>
              </tr>
            </thead>
            <tbody className="font-data-mono text-xs">
              {approvalRequests
                .filter(r => {
                  if (approvalTab === 'po') return r.type === 'Purchase Order';
                  if (approvalTab === 'adjustment') return r.type === 'Inventory Adjustment';
                  return r.type === 'MRSL & FEFO Exception';
                })
                .map(request => (
                  <tr key={request.id} className="border-b hover:bg-surface-bright transition-colors">
                    <td className="p-3 font-bold text-primary">{request.id}</td>
                    <td className="p-3 font-body-md">
                      <p className="font-bold text-on-surface">{request.requester}</p>
                      <span className="text-[10px] text-on-surface-variant">{request.role} (ID: {request.creatorId})</span>
                    </td>
                    <td className="p-3 font-body-md text-on-surface">{request.details}</td>
                    <td className="p-3 text-right font-bold text-secondary">{request.value}</td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        request.priority === 'CRITICAL' ? 'bg-error text-on-error' : request.priority === 'HIGH' ? 'bg-error-container text-on-error-container' : 'bg-surface-container-highest text-on-surface'
                      }`}>
                        {request.priority}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setReviewModalRequest(request)}
                        className="px-3 py-1 bg-surface border border-outline rounded hover:border-secondary text-secondary transition-colors text-[11px] font-bold"
                      >
                        Xem Xét &amp; Duyệt
                      </button>
                    </td>
                  </tr>
                ))
              }
              {approvalRequests.filter(r => {
                if (approvalTab === 'po') return r.type === 'Purchase Order';
                if (approvalTab === 'adjustment') return r.type === 'Inventory Adjustment';
                return r.type === 'MRSL & FEFO Exception';
              }).length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-on-surface-variant font-body-md font-semibold">
                    Không có yêu cầu phê duyệt nào đang chờ xử lý trong mục này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal Dialog - Demonstrates the Four-Eyes Principle constraint */}
      {reviewModalRequest && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-outline-variant shadow-lg max-w-md w-full overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-secondary"></div>
            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-sm text-primary">Chi Tiết Đơn Phê Duyệt {reviewModalRequest.id}</h3>
                <button
                  onClick={() => setReviewModalRequest(null)}
                  className="text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <div className="space-y-3 text-xs mb-6">
                <div>
                  <span className="text-[10px] text-outline font-bold uppercase block">Loại Yêu Cầu</span>
                  <span className="font-bold text-on-surface text-sm">{reviewModalRequest.type}</span>
                </div>
                <div>
                  <span className="text-[10px] text-outline font-bold uppercase block">Người Đề Xuất</span>
                  <span className="font-bold text-on-surface">{reviewModalRequest.requester} (ID: {reviewModalRequest.creatorId})</span>
                </div>
                <div>
                  <span className="text-[10px] text-outline font-bold uppercase block">Chi Tiết Mô Tả</span>
                  <p className="text-on-surface bg-surface p-2.5 rounded font-body-md text-xs">{reviewModalRequest.details}</p>
                </div>
                <div>
                  <span className="text-[10px] text-outline font-bold uppercase block">Giá Trị Tài Chính Quy Đổi</span>
                  <span className="font-bold text-secondary font-data-mono text-sm">{reviewModalRequest.value}</span>
                </div>
              </div>

              {/* Four-Eyes principle validation alert */}
              {reviewModalRequest.creatorId === operatorId ? (
                <div className="bg-error-container/20 border border-error/30 text-error p-3 rounded text-[11px] font-semibold mb-6 flex gap-2">
                  <span className="material-symbols-outlined text-[16px] shrink-0">warning</span>
                  <span>
                    <strong>Khóa hành động!</strong> Bạn là người tạo ra yêu cầu này ({reviewModalRequest.creatorId}). Theo nguyên tắc kiểm soát 4 mắt (Four-Eyes), bạn không được phép tự phê duyệt phiếu của chính mình.
                  </span>
                </div>
              ) : (
                <div className="bg-tertiary-container/10 border border-tertiary-container/30 text-on-tertiary-container p-3 rounded text-[11px] font-semibold mb-6 flex gap-2">
                  <span className="material-symbols-outlined text-[16px] shrink-0">check</span>
                  <span>Đủ điều kiện phê duyệt. Người duyệt ({operatorId}) khác với người tạo đề xuất ({reviewModalRequest.creatorId}).</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setReviewModalRequest(null)}
                  className="px-4 py-2 border border-outline text-on-surface-variant rounded text-xs font-bold hover:bg-surface-container-low"
                >
                  Hủy Bỏ
                </button>
                <button
                  onClick={() => handleRejectRequest(reviewModalRequest)}
                  className="px-4 py-2 bg-error-container text-on-error-container rounded text-xs font-bold hover:opacity-90"
                >
                  Từ Chối
                </button>
                <button
                  disabled={reviewModalRequest.creatorId === operatorId}
                  onClick={() => handleApproveRequest(reviewModalRequest)}
                  className={`px-4 py-2 rounded text-xs font-bold ${
                    reviewModalRequest.creatorId === operatorId
                      ? 'bg-outline-variant text-outline cursor-not-allowed'
                      : 'bg-primary text-on-primary hover:bg-primary-container'
                  }`}
                >
                  Phê Duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
