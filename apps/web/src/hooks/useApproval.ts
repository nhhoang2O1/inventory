import { useCallback, useEffect, useState } from 'react';
import { ApprovalRequest, ApprovalTab } from '../types';
import { apiCommand, apiGet, ApiError } from '../apiClient';

interface PurchaseOrder {
  id: string;
  po_code: string;
  status: string;
  version: number;
  created_by: string;
  supplier_name: string;
  order_date: string;
}

export function useApproval(operatorId: string, warehouseId: string) {
  const [approvalTab, setApprovalTab] = useState<ApprovalTab>('po');
  const [reviewModalRequest, setReviewModalRequest] = useState<ApprovalRequest | null>(null);
  const [approvalActionMessage, setApprovalActionMessage] = useState<string | null>(null);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);

  const load = useCallback(async () => {
    if (!operatorId || !warehouseId) return;
    const data = await apiGet<PurchaseOrder[]>(
      `/purchase-orders?warehouseId=${encodeURIComponent(warehouseId)}`,
      { actorId: operatorId }
    );
    setApprovalRequests(data.filter((po) => po.status === 'PENDING_APPROVAL').map((po) => ({
      id: po.po_code,
      requester: po.created_by,
      role: 'Purchase order creator',
      type: 'Purchase Order',
      details: `${po.supplier_name} · ngày đặt ${po.order_date}`,
      value: 'Theo chi tiết PO',
      priority: 'NORMAL',
      submittedTime: po.order_date,
      creatorId: po.created_by,
      resourceType: 'PURCHASE_ORDER',
      resourceVersion: po.version
    })));
  }, [operatorId, warehouseId]);

  useEffect(() => {
    void load().catch((error) => setApprovalActionMessage(
      error instanceof ApiError ? error.message : 'Không tải được hàng đợi duyệt'
    ));
  }, [load]);

  const resolvePo = useCallback(async (request: ApprovalRequest) => {
    const data = await apiGet<PurchaseOrder[]>(
      `/purchase-orders?warehouseId=${encodeURIComponent(warehouseId)}`,
      { actorId: operatorId }
    );
    const po = data.find((item) => item.po_code === request.id);
    if (!po) throw new Error('Không tìm thấy PO trong API');
    return po;
  }, [operatorId, warehouseId]);

  const handleApproveRequest = async (request: ApprovalRequest) => {
    if (request.creatorId === operatorId) {
      setApprovalActionMessage('Four-eyes: người tạo không được tự duyệt phiếu.');
      return;
    }
    try {
      const po = await resolvePo(request);
      await apiCommand(`/purchase-orders/${po.id}/approve`, 'POST', { expectedVersion: po.version }, operatorId);
      setApprovalActionMessage(`Đã phê duyệt ${request.id} qua API.`);
      setReviewModalRequest(null);
      await load();
    } catch (error) {
      setApprovalActionMessage(error instanceof ApiError ? error.message : 'Không thể phê duyệt PO');
    }
  };

  const handleRejectRequest = async (request: ApprovalRequest) => {
    setApprovalActionMessage(`Backend chưa có endpoint từ chối PO ${request.id}; phiếu vẫn được giữ trong hàng đợi.`);
    setReviewModalRequest(null);
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
    handleRejectRequest,
    reload: load
  };
}
