import { useState, useEffect } from 'react';
import { apiClient } from '../apiClient';

export interface TransferItem {
  id: string;
  transfer_code: string;
  source_warehouse_name: string;
  destination_warehouse_name: string;
  total_qty: number;
  status: string;
  created_at: string;
}

export interface StocktakeSession {
  id: string;
  session_code: string;
  status: string;
  blind_count: boolean;
  recount_threshold: number;
  created_at: string;
}

export interface InventoryPosition {
  id: string;
  sku_id: string;
  sku_code: string;
  sku_name: string;
  batch_id: string;
  batch_code: string;
  location_id: string;
  location_code: string;
  stock_status: string;
  quantity_on_hand: number;
  expiration_date: string;
  ratio?: number;
}

export function useInventory(actorId: string, warehouseId: string) {
  const [positions, setPositions] = useState<InventoryPosition[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [stocktakes, setStocktakes] = useState<StocktakeSession[]>([]);

  // Metadata dropdowns
  const [allWarehouses, setAllWarehouses] = useState<any[]>([]);
  const [allLocations, setAllLocations] = useState<any[]>([]);
  const [allZones, setAllZones] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for creating Transfer
  const [destWarehouseId, setDestWarehouseId] = useState('');
  const [selectedPosId, setSelectedPosId] = useState('');
  const [transQty, setTransQty] = useState(1);
  const [destLocationId, setDestLocationId] = useState('');

  // Form state for creating Stocktake
  const [selectedZoneId, setSelectedZoneId] = useState('');

  const fetchAllData = () => {
    if (!warehouseId) return;
    setIsLoading(true);
    setError(null);

    Promise.all([
      apiClient(`/inventory/positions`, { params: { warehouseId } }),
      apiClient(`/inventory/reservations`, { params: { warehouseId } }),
      apiClient(`/transfers`, { params: { warehouseId } }),
      apiClient(`/stocktakes`, { params: { warehouseId } }),
      apiClient(`/inventory/warehouses`),
      apiClient(`/inventory/locations`, { params: { warehouseId } }),
      apiClient(`/inventory/zones`, { params: { warehouseId } })
    ])
      .then(([posData, resData, trfData, stkData, whData, locData, zoneData]) => {
        setPositions(Array.isArray(posData) ? posData : []);
        setReservations(Array.isArray(resData) ? resData : []);
        setTransfers(Array.isArray(trfData) ? trfData : []);
        setStocktakes(Array.isArray(stkData) ? stkData : []);
        setAllWarehouses(Array.isArray(whData) ? whData : []);
        setAllLocations(Array.isArray(locData) ? locData : []);
        setAllZones(Array.isArray(zoneData) ? zoneData : []);
      })
      .catch(err => {
        console.error('Error fetching inventory data:', err);
        setError('Không thể kết nối đến Database Core Sync.');
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchAllData();
  }, [actorId, warehouseId]);

  const handleCreateTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destWarehouseId || !selectedPosId || !destLocationId || !transQty) {
      alert('Vui lòng chọn kho đến, lô hàng chuyển, vị trí nhận và số lượng!');
      return;
    }
    const pos = positions.find(p => p.id === selectedPosId);
    if (!pos) return;

    setIsLoading(true);
    apiClient('/transfers', {
      method: 'POST',
      headers: {
        'idempotency-key': `trf-${Date.now()}`
      },
      body: JSON.stringify({
        transferCode: `TRF-${Date.now().toString().slice(-6)}`,
        transferType: destWarehouseId === warehouseId ? 'LOCATION' : 'WAREHOUSE',
        sourceWarehouseId: warehouseId,
        destinationWarehouseId: destWarehouseId,
        lines: [
          {
            skuId: pos.sku_id,
            batchId: pos.batch_id,
            sourceLocationId: pos.location_id,
            destinationLocationId: destLocationId,
            quantity: Number(transQty)
          }
        ]
      })
    })
      .then(trf => {
        alert(`Đã lập yêu cầu chuyển kho thành công với mã ${trf.transfer_code || trf.id}.`);
        setDestWarehouseId('');
        setSelectedPosId('');
        setDestLocationId('');
        setTransQty(1);
        fetchAllData();
      })
      .catch(err => alert(`Lỗi chuyển kho: ${err.message}`))
      .finally(() => setIsLoading(false));
  };

  const handleCreateStocktake = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    apiClient('/stocktakes', {
      method: 'POST',
      headers: {
        'idempotency-key': `stk-${Date.now()}`
      },
      body: JSON.stringify({
        sessionCode: `STK-${Date.now().toString().slice(-6)}`,
        warehouseId,
        ...(selectedZoneId ? { zoneId: selectedZoneId } : {}),
        blindCount: true
      })
    })
      .then(stk => {
        alert(`Đã khởi tạo phiên kiểm kê thành công với mã ${stk.session_code || stk.id}. Khu vực kiểm kê đã được khóa cứng đề phòng biến động tồn kho.`);
        setSelectedZoneId('');
        fetchAllData();
      })
      .catch(err => alert(`Lỗi tạo phiên kiểm kê: ${err.message}`))
      .finally(() => setIsLoading(false));
  };

  return {
    positions,
    reservations,
    transfers,
    stocktakes,
    allWarehouses,
    allLocations,
    allZones,
    isLoading,
    error,
    destWarehouseId,
    setDestWarehouseId,
    selectedPosId,
    setSelectedPosId,
    transQty,
    setTransQty,
    destLocationId,
    setDestLocationId,
    selectedZoneId,
    setSelectedZoneId,
    fetchAllData,
    handleCreateTransfer,
    handleCreateStocktake
  };
}
