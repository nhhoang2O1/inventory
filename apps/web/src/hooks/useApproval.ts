import { useState } from 'react';
import { ApprovalRequest, ApprovalTab } from '../types';

export function useApproval(operatorId: string) {
  const [approvalTab, setApprovalTab] = useState<ApprovalTab>('po');
  const [reviewModalRequest, setReviewModalRequest] = useState<ApprovalRequest | null>(null);
  const [approvalActionMessage, setApprovalActionMessage] = useState<string | null>(null);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([
    {
      id: 'PO-2026-0001',
      requester: 'J. Smith',
      role: 'Purchasing Officer',
      type: 'Purchase Order',
      details: 'Tiger Crystal Restock (120 Thùng)',
      value: '45,200,000 ₫',
      priority: 'CRITICAL',
      submittedTime: '2 giờ trước',
      creatorId: 'OP-8492' // Created by OP-8492
    },
    {
      id: 'ADJ-2026-0012',
      requester: 'M. Lee',
      role: 'Warehouse Staff',
      type: 'Inventory Adjustment',
      details: 'Khấu trừ hao hụt bể vỡ: 10 Thùng Tiger Bạc do rơi đổ kệ',
      value: '3,450,000 ₫',
      priority: 'NORMAL',
      submittedTime: '5 giờ trước',
      creatorId: 'OP-1234'
    },
    {
      id: 'EXP-2026-0045',
      requester: 'A. Rahman',
      role: 'QC Inspector',
      type: 'MRSL & FEFO Exception',
      details: 'Xuất hàng cận hạn (Aquafina Hạn dùng 10/11/2023) theo yêu cầu đặc biệt của đại lý',
      value: '12,800,000 ₫',
      priority: 'HIGH',
      submittedTime: '1 ngày trước',
      creatorId: 'OP-5678'
    }
  ]);

  const handleApproveRequest = (request: ApprovalRequest) => {
    // Double validation: block approval if current user created the request
    if (request.creatorId === operatorId) {
      alert("Không thể phê duyệt! Nguyên tắc kiểm soát Bốn Mắt (Four-Eyes Principle) quy định nhân viên không được tự duyệt phiếu do mình tạo ra.");
      return;
    }

    setApprovalRequests(approvalRequests.filter(r => r.id !== request.id));
    setApprovalActionMessage(`Đã phê duyệt thành công yêu cầu ${request.id}.`);
    setReviewModalRequest(null);
    setTimeout(() => setApprovalActionMessage(null), 4000);
  };

  const handleRejectRequest = (request: ApprovalRequest) => {
    setApprovalRequests(approvalRequests.filter(r => r.id !== request.id));
    setApprovalActionMessage(`Đã từ chối yêu cầu ${request.id}.`);
    setReviewModalRequest(null);
    setTimeout(() => setApprovalActionMessage(null), 4000);
  };

  return {
    approvalTab,
    setApprovalTab,
    reviewModalRequest,
    setReviewModalRequest,
    approvalActionMessage,
    setApprovalActionMessage,
    approvalRequests,
    handleApproveRequest,
    handleRejectRequest
  };
}
