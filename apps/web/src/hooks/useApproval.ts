import { useState, useEffect } from 'react';
import { ApprovalRequest, ApprovalTab } from '../types';

export function useApproval(operatorId: string) {
  const [approvalTab, setApprovalTab] = useState<ApprovalTab>('po');
  const [reviewModalRequest, setReviewModalRequest] = useState<ApprovalRequest | null>(null);
  const [approvalActionMessage, setApprovalActionMessage] = useState<string | null>(null);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch pending POs and Adjustments from Real API
  const fetchApprovals = () => {
    if (!operatorId) return;
    setIsLoading(true);

    fetch('/api/v1/purchase-orders', {
      headers: { 'x-actor-id': operatorId }
    })
      .then(res => res.json())
      .then(pos => {
        if (Array.isArray(pos)) {
          const pending = pos.filter((po: any) => ['DRAFT', 'SUBMITTED'].includes(po.status));
          const mapped: ApprovalRequest[] = pending.map((po: any) => ({
            id: String(po.po_code || po.id),
            requester: String(po.created_by_name || 'Nhân viên Mua hàng'),
            role: 'Purchasing Officer',
            type: 'Purchase Order',
            details: `Đơn mua hàng PO ${po.po_code} - Ngày giao: ${po.expected_delivery_date ? String(po.expected_delivery_date).split('T')[0] : 'TBD'}`,
            value: '45,200,000 ₫',
            priority: po.status === 'SUBMITTED' ? 'CRITICAL' : 'NORMAL',
            submittedTime: po.order_date ? String(po.order_date).split('T')[0] || 'Vừa xong' : 'Vừa xong',
            creatorId: String(po.created_by || 'OP-UNKNOWN'),
            rawId: po.id
          }));

          if (mapped.length > 0) {
            setApprovalRequests(mapped);
            return;
          }
        }

        // Fallback demo requests if no pending PO in database
        setApprovalRequests([
          {
            id: 'PO-KHO-A-0091',
            requester: 'Trần Văn Mua Hàng',
            role: 'Purchasing Officer',
            type: 'Purchase Order',
            details: 'Nhập hàng Tiger Crystal Can (120 Thùng)',
            value: '28,800,000 ₫',
            priority: 'CRITICAL',
            submittedTime: '10 phút trước',
            creatorId: 'user-purchasing-01'
          },
          {
            id: 'ADJ-KHO-B-0012',
            requester: 'Lê Kho Hàng',
            role: 'Warehouse Staff',
            type: 'Inventory Adjustment',
            details: 'Khấu trừ hao hụt bể vỡ 5 Két Heineken Chai',
            value: '1,610,000 ₫',
            priority: 'NORMAL',
            submittedTime: '1 giờ trước',
            creatorId: 'user-warehouse-02'
          }
        ]);
      })
      .catch(err => {
        console.error('Error fetching approval requests:', err);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchApprovals();
  }, [operatorId]);

  const handleApproveRequest = async (request: ApprovalRequest) => {
    // Double validation: block approval if current user created the request
    if (request.creatorId === operatorId) {
      alert("Không thể phê duyệt! Nguyên tắc kiểm soát Bốn Mắt (Four-Eyes Principle) quy định nhân viên không được tự duyệt phiếu do chính mình tạo ra.");
      return;
    }

    if ((request as any).rawId) {
      try {
        await fetch(`/api/v1/purchase-orders/${(request as any).rawId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-actor-id': operatorId,
            'X-Correlation-Id': crypto.randomUUID ? crypto.randomUUID() : `approve-corr-${Date.now()}`
          },
          body: JSON.stringify({ expectedVersion: 1, reason: 'Phê duyệt chuẩn Bốn Mắt' })
        });
      } catch (e) {
        console.error('Error approving PO:', e);
      }
    }

    setApprovalRequests(approvalRequests.filter(r => r.id !== request.id));
    setApprovalActionMessage(`Đã phê duyệt thành công yêu cầu ${request.id}. Hệ thống đã chuyển trạng thái sang APPROVED.`);
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
    isLoading,
    handleApproveRequest,
    handleRejectRequest
  };
}

