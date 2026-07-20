import { useCallback, useEffect, useState } from 'react';
import { OutboundItem, ViewType } from '../types';

interface IssueRequest {
  id: string;
  issue_code: string;
  status: string;
  version: number;
  requested_by: string;
  created_at: string;
  recipient_reference?: string | null;
}

const correlation = () => crypto.randomUUID();
const idempotency = () => `${crypto.randomUUID()}-${Date.now()}`;

export function useOutbound(actorId: string, warehouseId: string, setView: (view: ViewType) => void) {
  const [requests, setRequests] = useState<IssueRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [pickAlert, setPickAlert] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!actorId || !warehouseId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/outbound/issue-requests?warehouseId=${encodeURIComponent(warehouseId)}&limit=50`, {
        credentials: 'include',
        headers: { 'X-Correlation-Id': correlation() }
      });
      if (!response.ok) throw new Error((await response.json()).message || 'Không tải được phiếu xuất kho');
      setRequests(await response.json());
    } catch (error) {
      setPickAlert(error instanceof Error ? error.message : 'Không tải được phiếu xuất kho');
    } finally {
      setIsLoading(false);
    }
  }, [actorId, warehouseId]);

  useEffect(() => { void load(); }, [load]);

  const command = useCallback(async (id: string, action: string, version: number, body: Record<string, unknown> = {}) => {
    const response = await fetch(`/api/v1/outbound/issue-requests/${id}/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotency(),
        'X-Correlation-Id': correlation()
      },
      body: JSON.stringify({ expectedVersion: version, ...body })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `Không thể ${action} phiếu xuất`);
    await load();
    return data;
  }, [load]);

  const handlePickRowClick = (id: string) => setSelectedId(id);

  const handleScanSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId) {
      setPickAlert('Chọn một phiếu xuất đang PICKING trước khi quét.');
      return;
    }
    const request = requests.find((item) => item.id === selectedId);
    if (!request || request.status !== 'PICKING') {
      setPickAlert('Phiếu được chọn chưa ở trạng thái PICKING.');
      return;
    }
    try {
      const detailResponse = await fetch(`/api/v1/outbound/issue-requests/${selectedId}`, {
        credentials: 'include',
        headers: { 'X-Correlation-Id': correlation() }
      });
      const detail = await detailResponse.json();
      const task = detail.pickTasks?.[0];
      const allocation = detail.allocations?.[0];
      if (!task || !allocation) throw new Error('Phiếu chưa có task hoặc allocation để quét');
      const response = await fetch(`/api/v1/outbound/pick-tasks/${task.id}/scan`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotency(), 'X-Correlation-Id': correlation() },
        body: JSON.stringify({
          allocationId: allocation.id,
          barcode: scanInput.trim(),
          quantity: 1,
          expectedVersion: task.version
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Quét không thành công');
      setPickAlert('Đã ghi nhận lần quét vào API.');
      setScanInput('');
      await load();
    } catch (error) {
      setPickAlert(error instanceof Error ? error.message : 'Quét không thành công');
    }
  };

  const onCompletePick = async () => {
    const request = requests.find((item) => item.id === selectedId);
    if (!request) return;
    try {
      await command(request.id, 'post', request.version, {});
      setPickAlert('Đã post goods issue thành công.');
      setView('dashboard');
    } catch (error) {
      setPickAlert(error instanceof Error ? error.message : 'Không thể post goods issue');
    }
  };

  const onCancelPick = async () => {
    const request = requests.find((item) => item.id === selectedId);
    if (!request) return;
    try {
      await command(request.id, 'cancel', request.version, { reason: 'Cancelled by operator from outbound workbench' });
      setPickAlert('Đã hủy phiếu qua API.');
    } catch (error) {
      setPickAlert(error instanceof Error ? error.message : 'Không thể hủy phiếu');
    }
  };

  const transition = async (request: IssueRequest, action: string) => {
    try {
      await command(request.id, action, request.version);
      setPickAlert(`Đã thực hiện ${action} cho ${request.issue_code}.`);
    } catch (error) {
      setPickAlert(error instanceof Error ? error.message : `Không thể ${action}`);
    }
  };

  const outboundItems: OutboundItem[] = requests.map((request) => ({
    id: request.id,
    location: request.issue_code,
    name: request.recipient_reference || 'Phiếu xuất kho',
    ratio: 1,
    lot: request.status,
    exp: request.created_at.slice(0, 10),
    reqQty: 0,
    status: request.status === 'PICKING' ? 'Picking' : request.status === 'POSTED' ? 'Picked' : 'Pending'
  }));

  return {
    outboundItems,
    requests,
    selectedId,
    scanInput,
    setScanInput,
    pickAlert,
    isLoading,
    handleScanSubmit,
    handlePickRowClick,
    onCompletePick,
    onCancelPick,
    transition
  };
}
