import { useState, useEffect } from 'react';
import { InboundItem } from '../types';

interface PurchaseOrder {
  id: string;
  po_code: string;
  supplier_id: string;
  status: string;
  order_date: string;
  expected_delivery_date: string;
}

interface Location {
  id: string;
  code: string;
  zone_code: string;
}

interface SKU {
  id: string;
  code: string;
  name: string;
  uom_code: string;
  ratio: number;
}

export function useInbound(actorId: string, warehouseId: string, warehouseCode: string) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [locationsList, setLocationsList] = useState<Location[]>([]);
  const [skusList, setSkusList] = useState<SKU[]>([]);

  const [inboundItems, setInboundItems] = useState<InboundItem[]>([]);
  const [returnedCrateQty, setReturnedCrateQty] = useState<number>(0);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>(['delivery_note_signed.pdf']);
  const [inboundSuccessMessage, setInboundSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch metadata on load or when warehouse changes
  useEffect(() => {
    if (!actorId || !warehouseId) return;
    setIsLoading(true);
    setError(null);

    Promise.all([
      // Fetch POs
      fetch('/api/v1/purchase-orders', {
        headers: { 'x-actor-id': actorId }
      }).then(res => res.json()).catch(() => []),

      // Fetch Locations
      fetch(`/api/v1/inventory/locations?warehouseId=${warehouseId}`, {
        headers: { 'x-actor-id': actorId }
      }).then(res => res.json()).catch(() => []),

      // Fetch SKUs
      fetch('/api/v1/inventory/skus', {
        headers: { 'x-actor-id': actorId }
      }).then(res => res.json()).catch(() => [])
    ])
      .then(([posData, locsData, skusData]) => {
        const posList = Array.isArray(posData) ? posData : [];
        const locsList = Array.isArray(locsData) ? locsData : [];
        const rawSkus = Array.isArray(skusData) ? skusData : [];

        // Filter clean active SKUs only
        const skusList = rawSkus.filter((sku: any) => {
          if (!sku || typeof sku !== 'object') return false;
          const code = sku.code || '';
          const name = sku.name || '';
          const isTest = code.includes('_') || name.includes('Phase') || name.includes('test') || code.startsWith('SP');
          const isActive = sku.status ? sku.status === 'ACTIVE' : true;
          return isActive && !isTest;
        });

        // Filter POs by warehouse code matching or warehouse_id, and active status
        const filteredPos = posList.filter((po: any) => {
          if (!po || typeof po !== 'object') return false;
          const poCode = po.po_code || '';
          const belongsToWarehouse = !warehouseCode || poCode.includes(`PO-${warehouseCode}-`) || poCode.includes(warehouseCode) || po.warehouse_id === warehouseId;
          const isEligible = ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'DRAFT', 'SUBMITTED'].includes(po.status);
          return belongsToWarehouse && isEligible;
        });

        // Fallback: If no filtered POs match warehouse code, use any active POs
        const finalPos = filteredPos.length > 0 ? filteredPos : posList.filter((po: any) => po && ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'DRAFT', 'SUBMITTED'].includes(po.status));

        setPurchaseOrders(finalPos);
        setLocationsList(locsList);
        setSkusList(skusList);

        if (finalPos.length > 0) {
          setSelectedPoId(finalPos[0].id);
        } else {
          setSelectedPoId('');
          setInboundItems([]);
        }
        setError(null);
      })
      .catch(err => {
        console.error('Failed to load inbound data:', err);
        setError('Không thể kết nối đến Database Core Sync.');
      })
      .finally(() => setIsLoading(false));
  }, [actorId, warehouseId, warehouseCode]);

  // 2. Fetch PO lines when selectedPoId changes
  useEffect(() => {
    if (!selectedPoId || !actorId) {
      setInboundItems([]);
      return;
    }

    fetch(`/api/v1/purchase-orders/${selectedPoId}`, {
      headers: { 'x-actor-id': actorId }
    })
      .then(res => res.json())
      .then(po => {
        if (!po || !po.lines) return;

        const defaultLocationId = locationsList.find(loc => loc.zone_code === 'RECEIVING')?.id || locationsList[0]?.id || '';

        const items: InboundItem[] = po.lines.map((line: any) => {
          const skuMeta = skusList.find(s => s.id === line.skuId);
          return {
            sku: skuMeta?.code || 'SKU-UNKNOWN',
            name: skuMeta?.name || 'Sản phẩm không rõ',
            unit: skuMeta?.uom_code || 'CASE',
            ratio: skuMeta?.ratio || 24,
            qty: line.orderedQty - line.receivedQty,
            batch: `B-${warehouseCode}-${Date.now().toString().slice(-4)}`,
            mfg: new Date().toISOString().split('T')[0] || '',
            exp: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] || '',
            skuId: line.skuId,
            poLineId: line.id,
            locationId: defaultLocationId,
            uomId: line.uomId
          };
        });

        setInboundItems(items);
        // Default returned crate quantity
        const totalCases = items.reduce((sum, item) => sum + item.qty, 0);
        setReturnedCrateQty(totalCases);
      })
      .catch(err => {
        console.error('Error fetching PO lines:', err);
      });
  }, [selectedPoId, actorId, locationsList, skusList, warehouseCode]);

  const handleInboundQtyChange = (index: number, val: string) => {
    const intVal = val === '' ? 0 : parseInt(val, 10);
    if (!isNaN(intVal)) {
      const updated = [...inboundItems];
      const item = updated[index];
      if (item) {
        item.qty = Math.max(0, Math.floor(intVal));
      }
      setInboundItems(updated);
    }
  };

  const handleInboundAddLine = () => {
    if (skusList.length === 0) return;
    const defaultSku = skusList[0];
    if (!defaultSku) return;
    const defaultLocationId = locationsList.find(loc => loc.zone_code === 'RECEIVING')?.id || locationsList[0]?.id || '';

    setInboundItems([
      ...inboundItems,
      {
        sku: defaultSku.code,
        name: defaultSku.name,
        unit: defaultSku.uom_code,
        ratio: defaultSku.ratio,
        qty: 0,
        batch: `B-${warehouseCode}-${Date.now().toString().slice(-4)}`,
        mfg: new Date().toISOString().split('T')[0] || '',
        exp: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] || '',
        skuId: defaultSku.id,
        poLineId: '',
        locationId: defaultLocationId,
        uomId: '5503225a-7e1d-40c9-b2b5-59a471963acb' // CASE
      }
    ]);
  };

  const handleInboundRemoveLine = (index: number) => {
    setInboundItems(inboundItems.filter((_, i) => i !== index));
  };

  const handleConfirmReceipt = async () => {
    if (inboundItems.length === 0 || !selectedPoId) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. For each item, find or create the batch
      const grLines = [];

      for (const item of inboundItems) {
        if (item.qty <= 0) continue;

        // Create the batch via backend endpoint
        const batchRes = await fetch('/api/v1/inventory/batches', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-actor-id': actorId
          },
          body: JSON.stringify({
            skuId: item.skuId,
            batchCode: item.batch,
            manufacturingDate: item.mfg,
            expirationDate: item.exp
          })
        });

        if (!batchRes.ok) {
          const errorData = await batchRes.json();
          throw new Error(`Tạo lô ${item.batch} thất bại: ${errorData.message}`);
        }

        const batch = await batchRes.json();

        grLines.push({
          poLineId: item.poLineId,
          skuId: item.skuId,
          batchId: batch.id,
          quantity: item.qty,
          uomId: item.uomId,
          locationId: item.locationId,
          stockStatus: 'AVAILABLE'
        });
      }

      if (grLines.length === 0) {
        throw new Error('Số lượng nhập kho phải lớn hơn 0.');
      }

      // 2. Create the Goods Receipt
      const grCode = `GR-${warehouseCode}-${Date.now().toString().slice(-6)}`;
      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `gr-key-${Date.now()}`;

      const grRes = await fetch('/api/v1/goods-receipts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-actor-id': actorId
        },
        body: JSON.stringify({
          grCode,
          poId: selectedPoId,
          receivedDate: new Date().toISOString(),
          idempotencyKey,
          lines: grLines
        })
      });

      if (!grRes.ok) {
        const errorData = await grRes.json();
        throw new Error(`Tạo phiếu nhập kho thất bại: ${errorData.message}`);
      }

      const gr = await grRes.json();

      // 3. Post/Confirm the Goods Receipt
      const postRes = await fetch(`/api/v1/goods-receipts/${gr.id}/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-actor-id': actorId,
          'X-Correlation-Id': crypto.randomUUID ? crypto.randomUUID() : `corr-${Date.now()}`
        }
      });

      if (!postRes.ok) {
        const errorData = await postRes.json();
        throw new Error(`Đăng ký nhập kho (Post) thất bại: ${errorData.message}`);
      }

      setInboundSuccessMessage(`Xác nhận nhập kho thành công! Đã ghi nhận phiếu ${grCode} và cập nhật tồn kho Available.`);
      // Refresh POs list
      fetch('/api/v1/purchase-orders', {
        headers: { 'x-actor-id': actorId }
      })
        .then(res => res.json())
        .then(posData => {
          const filteredPos = (posData || []).filter((po: any) => {
            const belongsToWarehouse = po.po_code.includes(`PO-${warehouseCode}-`) || po.po_code.includes(warehouseCode);
            const isEligible = ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'DRAFT'].includes(po.status);
            return belongsToWarehouse && isEligible;
          });
          setPurchaseOrders(filteredPos);
          if (filteredPos.length > 0) {
            setSelectedPoId(filteredPos[0].id);
          } else {
            setSelectedPoId('');
            setInboundItems([]);
          }
        });

      setTimeout(() => setInboundSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('Error confirming receipt:', err);
      setError(err.message || 'Lỗi hệ thống khi xác nhận nhập kho.');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    purchaseOrders,
    selectedPoId,
    setSelectedPoId,
    locationsList,
    skusList,
    inboundItems,
    setInboundItems,
    returnedCrateQty,
    setReturnedCrateQty,
    uploadedFiles,
    setUploadedFiles,
    inboundSuccessMessage,
    isLoading,
    error,
    handleInboundQtyChange,
    handleInboundAddLine,
    handleInboundRemoveLine,
    handleConfirmReceipt
  };
}
