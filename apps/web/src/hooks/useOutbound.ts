import { useCallback, useEffect, useState } from 'react';
import { OutboundItem, ViewType } from '../types';
import { apiCommand, apiGet, ApiError } from '../apiClient';

export interface IssueRequest {
  id: string;
  issue_code: string;
  status: string;
  version: number;
  requested_by: string;
  created_at: string;
  recipient_reference?: string | null;
}

export interface IssueRequestDetail extends IssueRequest {
  lines: Array<Record<string, unknown>>;
  allocations: Array<Record<string, unknown>>;
  pickTasks: Array<{ id: string; task_code: string; status: string; version: number }>;
  goodsIssues: Array<Record<string, unknown>>;
}

export interface SkuOption {
  id: string;
  code?: string;
  sku_code?: string;
  name?: string;
  sku_name?: string;
}

export function useOutbound(actorId: string, warehouseId: string, setView: (view: ViewType) => void) {
  const [requests, setRequests] = useState<IssueRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IssueRequestDetail | null>(null);
  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [scanQuantity, setScanQuantity] = useState(1);
  const [pickAlert, setPickAlert] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newIssueCode, setNewIssueCode] = useState('');
  const [newRecipient, setNewRecipient] = useState('');
  const [newSkuId, setNewSkuId] = useState('');
  const [newQuantity, setNewQuantity] = useState(1);

  const load = useCallback(async () => {
    if (!actorId || !warehouseId) return;
    setIsLoading(true);
    try {
      const [requestData, skuData] = await Promise.all([
        apiGet<IssueRequest[]>(`/outbound/issue-requests?warehouseId=${encodeURIComponent(warehouseId)}&limit=50`, { actorId }),
        apiGet<SkuOption[]>('/inventory/skus', { actorId })
      ]);
      setRequests(Array.isArray(requestData) ? requestData : []);
      setSkuOptions(Array.isArray(skuData) ? skuData : []);
    } catch (error) {
      setPickAlert(error instanceof ApiError ? error.message : 'Không tải được phiếu xuất kho');
    } finally {
      setIsLoading(false);
    }
  }, [actorId, warehouseId]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const data = await apiGet<IssueRequestDetail>(`/outbound/issue-requests/${id}`, { actorId });
      setDetail(data);
      return data;
    } catch (error) {
      setPickAlert(error instanceof ApiError ? error.message : 'Không tải được chi tiết phiếu xuất');
      return null;
    }
  }, [actorId]);

  useEffect(() => { void load(); }, [load]);

  const command = useCallback(async (id: string, action: string, version: number, body: Record<string, unknown> = {}) => {
    const data = await apiCommand<any>(
      `/outbound/issue-requests/${id}/${action}`,
      'POST',
      { expectedVersion: version, ...body },
      actorId
    );
    await load();
    await loadDetail(id);
    return data;
  }, [actorId, load, loadDetail]);

  const createIssueRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newIssueCode.trim() || !newSkuId || !Number.isSafeInteger(newQuantity) || newQuantity <= 0) {
      setPickAlert('Nhập issue code, SKU và số lượng nguyên dương.');
      return;
    }
    try {
      await apiCommand('/outbound/issue-requests', {
        issueCode: newIssueCode.trim(),
        warehouseId,
        recipientReference: newRecipient.trim() || undefined,
        salesChannel: 'WAREHOUSE',
        lines: [{ skuId: newSkuId, quantity: newQuantity }]
      }, { actorId });
      setPickAlert('Đã tạo issue request ở trạng thái DRAFT.');
      setNewIssueCode('');
      setNewRecipient('');
      setNewSkuId('');
      setNewQuantity(1);
      await load();
    } catch (error) {
      setPickAlert(error instanceof ApiError ? error.message : 'Không tạo được issue request');
    }
  };

  const handlePickRowClick = (id: string) => {
    setSelectedId(id);
    void loadDetail(id);
  };

  const handleScanSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedId || !detail || detail.status !== 'PICKING') {
      setPickAlert('Chọn phiếu ở trạng thái PICKING trước khi quét.');
      return;
    }
    const task = detail.pickTasks.find((item) => ['READY', 'IN_PROGRESS'].includes(item.status));
    const allocation = detail.allocations.find((item) => Number(item.quantity ?? 0) > Number(item.picked_quantity ?? 0));
    if (!task || !allocation) {
      setPickAlert('Phiếu chưa có task/allocation còn thiếu để quét.');
      return;
    }
    try {
      await apiCommand(`/outbound/pick-tasks/${task.id}/scan`, 'POST', {
        allocationId: allocation.id,
        barcode: scanInput.trim(),
        quantity: scanQuantity,
        expectedVersion: task.version
      }, actorId);
      setPickAlert('Đã ghi nhận scan vào API.');
      setScanInput('');
      setScanQuantity(1);
      await load();
      await loadDetail(selectedId);
    } catch (error) {
      setPickAlert(error instanceof ApiError ? error.message : 'Quét không thành công');
    }
  };

  const onCompletePick = async () => {
    const request = requests.find((item) => item.id === selectedId);
    if (!request) return;
    try {
      await command(request.id, 'post', request.version);
      setPickAlert('Đã post goods issue qua API.');
      setView('dashboard');
    } catch (error) {
      setPickAlert(error instanceof ApiError ? error.message : 'Không thể post goods issue');
    }
  };

  const onCancelPick = async () => {
    const request = requests.find((item) => item.id === selectedId);
    if (!request) return;
    try {
      await command(request.id, 'cancel', request.version, { reason: 'Cancelled by operator from outbound workbench' });
      setPickAlert('Đã hủy phiếu qua API.');
    } catch (error) {
      setPickAlert(error instanceof ApiError ? error.message : 'Không thể hủy phiếu');
    }
  };

  const transition = async (request: IssueRequest, action: string) => {
    try {
      await command(request.id, action, request.version);
      setPickAlert(`Đã thực hiện ${action} cho ${request.issue_code}.`);
    } catch (error) {
      setPickAlert(error instanceof ApiError ? error.message : `Không thể ${action}`);
    }
  };

  const allocateAutomatically = async (requestId = selectedId) => {
    const request = requests.find((item) => item.id === requestId);
    if (!request || request.status !== 'APPROVED') return;
    try {
      await command(request.id, 'allocate', request.version);
      setPickAlert('Đã yêu cầu allocation FEFO tự động từ backend.');
    } catch (error) {
      setPickAlert(error instanceof ApiError ? error.message : 'Không thể allocate FEFO');
    }
  };

  const createPickTask = async (requestId = selectedId) => {
    const request = requests.find((item) => item.id === requestId);
    if (!request || request.status !== 'ALLOCATED') return;
    try {
      await command(request.id, 'pick-tasks', request.version);
      setPickAlert('Đã tạo pick task qua API.');
    } catch (error) {
      setPickAlert(error instanceof ApiError ? error.message : 'Không thể tạo pick task');
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
    outboundItems, requests, selectedId, detail, skuOptions,
    scanInput, setScanInput, scanQuantity, setScanQuantity,
    pickAlert, isLoading,
    newIssueCode, setNewIssueCode, newRecipient, setNewRecipient,
    newSkuId, setNewSkuId, newQuantity, setNewQuantity,
    createIssueRequest, handleScanSubmit, handlePickRowClick,
    onCompletePick, onCancelPick, transition, allocateAutomatically,
    createPickTask
  };
}
