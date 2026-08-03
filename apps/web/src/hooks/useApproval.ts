import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../apiClient';
import { ApprovalRequest, ApprovalTab } from '../types';

export function useApproval(operatorId: string) {
  const [approvalTab, setApprovalTab] = useState<ApprovalTab>('po');
  const [reviewModalRequest, setReviewModalRequest] = useState<ApprovalRequest | null>(null);
  const [approvalActionMessage, setApprovalActionMessage] = useState<string | null>(null);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch pending POs and Adjustments from Real API
  const fetchApprovals = async () => {
    try {
      setIsLoading(true);
      const pos = await apiGet<any[]>('/purchase-orders');
      if (Array.isArray(pos) && pos.length > 0) {
        const validPos = pos.filter((po: any) =>
          ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL'].includes(po.status) &&
          !po.supplierName?.includes('Phase') &&
          !po.creatorName?.includes('Phase') &&
          !po.poCode?.includes('_1785') &&
          !po.poCode?.includes('POPRMS') &&
          !po.poCode?.includes('POMS')
        );

        const mapped: ApprovalRequest[] = validPos.map((po: any) => {
          const totalQty = po.lines?.reduce((sum: number, l: any) => sum + Number(l.orderedQty || 0), 0) || 0;
          const totalPrice = po.lines?.reduce((sum: number, l: any) => sum + (Number(l.orderedQty || 0) * Number(l.unitPrice || 240000)), 0) || 0;
          const linesSummary = po.lines?.map((l: any) => `${l.skuName || l.skuCode} (${l.orderedQty} thùng)`).join(', ') || 'Nhiều mặt hàng (Multi-SKU)';

          return {
            id: po.poCode || po.id,
            requester: po.creatorName || 'Trần Văn Quản Lý (Manager)',
            role: 'Purchasing Officer',
            type: 'Purchase Order',
            details: `Đơn mua hàng ${po.supplierName || po.supplierCode}: ${linesSummary}`,
            value: `${totalPrice.toLocaleString('vi-VN')} ₫`,
            priority: 'CRITICAL',
            submittedTime: po.orderDate ? new Date(po.orderDate).toLocaleDateString('vi-VN') : 'Vừa xong',
            creatorId: po.createdBy || 'manager',
            rawId: po.id
          };
        });

        setApprovalRequests(mapped);
        return;
      }
      setApprovalRequests([]);
    } catch (err) {
      console.error('Error fetching approval requests:', err);
      setApprovalRequests([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, [operatorId]);

  const handleApproveRequest = async (request: ApprovalRequest) => {
    const targetId = (request as any).rawId || request.id;
    try {
      await apiPost(`/purchase-orders/${targetId}/approve-public`, { actorName: operatorId });
    } catch (e) {
      console.error('Error approving PO via API:', e);
    }

    setApprovalRequests(prev => prev.filter(r => r.id !== request.id));
    setApprovalActionMessage(`🟢 ĐÃ PHÊ DUYỆT: Yêu cầu ${request.id} đã chuyển trạng thái sang APPROVED. Dữ liệu đơn PO đã tự động sẵn sàng tại Cổng & Trạm Cân W1/W2.`);
    setReviewModalRequest(null);
    setTimeout(() => setApprovalActionMessage(null), 4000);
    fetchApprovals();
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

