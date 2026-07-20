import { useCallback, useEffect, useState } from 'react';
import { apiCommand, apiGet, ApiError } from '../apiClient';
import { InboundItem } from '../types';

interface PurchaseOrder {
  id: string;
  po_code: string;
  supplier_id: string;
  supplier_name?: string;
  status: string;
  order_date: string;
  expected_delivery_date: string;
  version: number;
  lines?: Array<{ id: string; skuId: string; orderedQty: number; receivedQty: number; uomId: string }>;
}
interface Location { id: string; code: string; zone_code: string; }
interface SKU { id: string; code: string; name: string; uom_code: string; ratio: number; }

const today = () => new Date().toISOString().slice(0, 10);

export function useInbound(actorId: string, warehouseId: string, warehouseCode: string) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [locationsList, setLocationsList] = useState<Location[]>([]);
  const [skusList, setSkusList] = useState<SKU[]>([]);
  const [inboundItems, setInboundItems] = useState<InboundItem[]>([]);
  const [returnedCrateQty, setReturnedCrateQty] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [inboundSuccessMessage, setInboundSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetadata = useCallback(async () => {
    if (!actorId || !warehouseId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [pos, locations, skus] = await Promise.all([
        apiGet<PurchaseOrder[]>(`/api/v1/purchase-orders?warehouseId=${encodeURIComponent(warehouseId)}`, actorId),
        apiGet<Location[]>(`/api/v1/inventory/locations?warehouseId=${encodeURIComponent(warehouseId)}`, actorId),
        apiGet<SKU[]>('/api/v1/inventory/skus', actorId)
      ]);
      const eligible = (pos || []).filter((po) => ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'DRAFT'].includes(po.status));
      setPurchaseOrders(eligible);
      setLocationsList(locations || []);
      setSkusList(skus || []);
      setSelectedPoId((current) => eligible.some((po) => po.id === current) ? current : eligible[0]?.id || '');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Không thể tải dữ liệu nhập kho');
    } finally { setIsLoading(false); }
  }, [actorId, warehouseId]);

  useEffect(() => { void loadMetadata(); }, [loadMetadata]);

  useEffect(() => {
    if (!selectedPoId || !actorId) {
      setInboundItems([]);
      return;
    }
    void apiGet<PurchaseOrder>(`/api/v1/purchase-orders/${selectedPoId}`, actorId)
      .then((po) => {
        const defaultLocationId = locationsList.find((location) => location.zone_code === 'RECEIVING')?.id || locationsList[0]?.id || '';
        const items = (po.lines || []).filter((line) => line.orderedQty > line.receivedQty).map((line) => {
          const sku = skusList.find((item) => item.id === line.skuId);
          return {
            sku: sku?.code || 'SKU-UNKNOWN',
            name: sku?.name || 'Sản phẩm không rõ',
            unit: sku?.uom_code || 'CASE',
            ratio: sku?.ratio || 1,
            qty: Math.max(0, line.orderedQty - line.receivedQty),
            batch: '',
            mfg: '',
            exp: '',
            skuId: line.skuId,
            poLineId: line.id,
            locationId: defaultLocationId,
            uomId: line.uomId
          } satisfies InboundItem;
        });
        setInboundItems(items);
        setReturnedCrateQty(items.reduce((sum, item) => sum + item.qty, 0));
      })
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Không thể tải chi tiết PO'));
  }, [selectedPoId, actorId, locationsList, skusList]);

  const handleInboundQtyChange = (index: number, value: string) => {
    const quantity = value === '' ? 0 : Number(value);
    if (!Number.isSafeInteger(quantity) || quantity < 0) return;
    setInboundItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, qty: quantity } : item));
  };

  const handleInboundAddLine = () => {
    setError('Chỉ được nhập các dòng thuộc PO; không thể tự thêm SKU ngoài contract Goods Receipt.');
  };

  const handleInboundRemoveLine = (index: number) => {
    setInboundItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleConfirmReceipt = async () => {
    if (!selectedPoId || !inboundItems.length) return;
    const invalid = inboundItems.find((item) => item.qty > 0 && (!item.poLineId || !item.batch || !item.mfg || !item.exp || !item.locationId));
    if (invalid) {
      setError('Mỗi dòng nhập phải có số lượng, batch, NSX, HSD và vị trí lưu trữ.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const lines = [];
      for (const item of inboundItems.filter((line) => line.qty > 0)) {
        const batch = await apiCommand<{ id: string }>(
          '/api/v1/inventory/batches',
          'POST',
          { warehouseId, skuId: item.skuId, batchCode: item.batch, manufacturingDate: item.mfg, expirationDate: item.exp },
          actorId
        );
        lines.push({ poLineId: item.poLineId, skuId: item.skuId, batchId: batch.id, quantity: item.qty, uomId: item.uomId, locationId: item.locationId, stockStatus: 'AVAILABLE' });
      }
      if (!lines.length) throw new Error('Số lượng nhập kho phải lớn hơn 0.');
      const gr = await apiCommand<{ id: string; version: number }>(
        '/api/v1/goods-receipts',
        'POST',
        { grCode: `GR-${warehouseCode}-${Date.now().toString().slice(-6)}`, poId: selectedPoId, warehouseId, receivedDate: new Date().toISOString(), lines },
        actorId
      );
      const confirmed = await apiCommand<{ version: number }>(`/api/v1/goods-receipts/${gr.id}/confirm`, 'POST', { expectedVersion: gr.version }, actorId);
      await apiCommand(`/api/v1/goods-receipts/${gr.id}/post`, 'POST', { expectedVersion: confirmed.version, reason: 'Warehouse UI confirmed receipt' }, actorId);
      setInboundSuccessMessage('Đã confirm và post goods receipt thành công.');
      await loadMetadata();
      window.setTimeout(() => setInboundSuccessMessage(null), 5000);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : 'Không thể xác nhận phiếu nhập');
    } finally { setIsLoading(false); }
  };

  return {
    purchaseOrders, selectedPoId, setSelectedPoId, locationsList, inboundItems, setInboundItems,
    returnedCrateQty, setReturnedCrateQty, uploadedFiles, setUploadedFiles,
    inboundSuccessMessage, isLoading, error, handleInboundQtyChange, handleInboundAddLine,
    handleInboundRemoveLine, handleConfirmReceipt
  };
}
