import { useCallback, useEffect, useState } from 'react';
import { ApprovalRequest, ApprovalTab } from '../types';

interface PurchaseOrder {
  id: string;
  po_code: string;
  status: string;
  version: number;
  created_by: string;
  supplier_name: string;
  order_date: string;
}

const correlation = () => crypto.randomUUID();
const idempotency = () => `${crypto.randomUUID()}-${Date.now()}`;

export function useApproval(operatorId: string, warehouseId: string) {
  const [approvalTab, setApprovalTab] = useState<ApprovalTab>('po');
  const [reviewModalRequest, setReviewModalRequest] = useState<ApprovalRequest | null>(null);
  const [approvalActionMessage, setApprovalActionMessage] = useState<string | null>(null);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);

  const load = useCallback(async () => {
    if (!operatorId || !warehouseId) return;
    const response = await fetch(`/api/v1/purchase-orders?warehouseId=${encodeURIComponent(warehouseId)}`, {
      credentials: 'include',
      headers: { 'X-Correlation-Id': correlation() }
    });
    const data: PurchaseOrder[] = await response.json();
    if (!response.ok) throw new Error((data as unknown as { message?: string }).message || 'Không tải được hàng đợi duyệt');
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

  useEffect(() => { void load().catch((error) => setApprovalActionMessage(error instanceof Error ? error.message : 'Không tải được hàng đợi duyệt')); }, [load]);

  const resolvePoId = useCallback(async (request: ApprovalRequest) => {
    const response = await fetch(`/api/v1/purchase-orders?warehouseId=${encodeURIComponent(warehouseId)}`, {
      credentials: 'include',
      headers: { 'X-Correlation-Id': correlation() }
    });
    const data: PurchaseOrder[] = await response.json();
    const po = data.find((item) => item.po_code === request.id);
    if (!po) throw new Error('Không tìm thấy PO trong API');
    return po;
  }, [warehouseId]);

  const handleApproveRequest = async (request: ApprovalRequest) => {
    if (request.creatorId === operatorId) {
      setApprovalActionMessage('Four-eyes: người tạo không được tự duyệt phiếu.');
      return;
    }
    try {
      const po = await resolvePoId(request);
      const response = await fetch(`/api/v1/purchase-orders/${po.id}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotency(), 'X-Correlation-Id': correlation() },
        body: JSON.stringify({ expectedVersion: po.version })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Không thể phê duyệt PO');
      setApprovalActionMessage(`Đã phê duyệt ${request.id} qua API.`);
      setReviewModalRequest(null);
      await load();
    } catch (error) {
      setApprovalActionMessage(error instanceof Error ? error.message : 'Không thể phê duyệt PO');
    }
  };

  const handleRejectRequest = async (request: ApprovalRequest) => {
    setApprovalActionMessage(`API hiện chưa có endpoint từ chối PO ${request.id}; không xoá giả khỏi hàng đợi.`);
    setReviewModalRequest(null);
  };

  return {
    approvalTab, setApprovalTab, reviewModalRequest, setReviewModalRequest,
    approvalActionMessage, setApprovalActionMessage, approvalRequests,
    handleApproveRequest, handleRejectRequest, reload: load
  };
}
