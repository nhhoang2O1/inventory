import { useEffect, useState } from 'react';
import { apiCommand, apiGet, ApiError } from '../apiClient';

export interface TransferItem {
  id: string;
  transfer_code: string;
  source_warehouse_name: string;
  destination_warehouse_name: string;
  total_qty: number;
  status: string;
  version: number;
  created_at: string;
}

export interface StocktakeSession {
  id: string;
  session_code: string;
  status: string;
  blind_count: boolean;
  recount_threshold: number;
  current_round?: number;
  version: number;
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
  const [selectedTransfer, setSelectedTransfer] = useState<any | null>(null);
  const [selectedStocktake, setSelectedStocktake] = useState<any | null>(null);
  const [allWarehouses, setAllWarehouses] = useState<any[]>([]);
  const [allLocations, setAllLocations] = useState<any[]>([]);
  const [allZones, setAllZones] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [destWarehouseId, setDestWarehouseId] = useState('');
  const [selectedPosId, setSelectedPosId] = useState('');
  const [transQty, setTransQty] = useState(1);
  const [destLocationId, setDestLocationId] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');

  const fetchAllData = async () => {
    if (!actorId || !warehouseId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [posData, resData, trfData, stkData, whData, locData, zoneData] = await Promise.all([
        apiGet<InventoryPosition[]>(`/inventory/positions?warehouseId=${warehouseId}`, { actorId }),
        apiGet<any[]>(`/inventory/reservations?warehouseId=${warehouseId}`, { actorId }),
        apiGet<TransferItem[]>(`/transfers?warehouseId=${warehouseId}`, { actorId }),
        apiGet<StocktakeSession[]>(`/stocktakes?warehouseId=${warehouseId}`, { actorId }),
        apiGet<any[]>('/inventory/warehouses', { actorId }),
        apiGet<any[]>(`/inventory/locations?warehouseId=${warehouseId}`, { actorId }),
        apiGet<any[]>(`/inventory/zones?warehouseId=${warehouseId}`, { actorId })
      ]);
      setPositions(Array.isArray(posData) ? posData : []);
      setReservations(Array.isArray(resData) ? resData : []);
      setTransfers(Array.isArray(trfData) ? trfData : []);
      setStocktakes(Array.isArray(stkData) ? stkData : []);
      setAllWarehouses(Array.isArray(whData) ? whData : []);
      setAllLocations(Array.isArray(locData) ? locData : []);
      setAllZones(Array.isArray(zoneData) ? zoneData : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể kết nối đến Inventory API.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchAllData();
  }, [actorId, warehouseId]);

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const pos = positions.find((item) => item.id === selectedPosId);
    if (!destWarehouseId || !pos || !destLocationId || !Number.isSafeInteger(transQty) || transQty <= 0) {
      setError('Vui lòng chọn kho đến, lô hàng, vị trí nhận và số lượng nguyên dương.');
      return;
    }
    if (destWarehouseId !== warehouseId) {
      setError('Transfer liên kho cần transit warehouse/location theo contract backend; chưa gửi command thiếu dữ liệu.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const transfer = await apiCommand<any>('/transfers', {
        transferCode: `TRF-${Date.now().toString().slice(-6)}`,
        transferType: 'LOCATION',
        sourceWarehouseId: warehouseId,
        destinationWarehouseId: warehouseId,
        lines: [{
          skuId: pos.sku_id,
          batchId: pos.batch_id,
          sourceLocationId: pos.location_id,
          destinationLocationId: destLocationId,
          quantity: transQty
        }]
      }, { actorId });
      setSuccessMessage(`Đã lập transfer ${transfer.transferCode || transfer.transfer_code || transfer.id}.`);
      setDestWarehouseId('');
      setSelectedPosId('');
      setDestLocationId('');
      setTransQty(1);
      await fetchAllData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể lập yêu cầu chuyển kho.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateStocktake = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const session = await apiCommand<any>('/stocktakes', {
        sessionCode: `STK-${Date.now().toString().slice(-6)}`,
        warehouseId,
        ...(selectedZoneId ? { zoneId: selectedZoneId } : {}),
        blindCount: true
      }, { actorId });
      setSuccessMessage(`Đã khởi tạo phiên kiểm kê ${session.sessionCode || session.session_code || session.id}.`);
      setSelectedZoneId('');
      await fetchAllData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể khởi tạo phiên kiểm kê.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTransfer = async (id: string) => {
    try {
      const value = await apiGet<any>(`/transfers/${id}`, { actorId });
      setSelectedTransfer(value);
      return value;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được chi tiết transfer.');
      return null;
    }
  };

  const transferCommand = async (id: string, action: string, expectedVersion: number, body: Record<string, unknown> = {}) => {
    try {
      await apiCommand(`/transfers/${id}/${action}`, 'POST', { expectedVersion, ...body }, actorId);
      setSuccessMessage(`Đã thực hiện ${action} cho transfer.`);
      await fetchAllData();
      await loadTransfer(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Không thể ${action} transfer.`);
    }
  };

  const loadStocktake = async (id: string) => {
    try {
      const value = await apiGet<any>(`/stocktakes/${id}`, { actorId });
      setSelectedStocktake(value);
      return value;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được chi tiết stocktake.');
      return null;
    }
  };

  const stocktakeCommand = async (id: string, action: string, expectedVersion: number, body: Record<string, unknown> = {}) => {
    try {
      await apiCommand(`/stocktakes/${id}/${action}`, 'POST', { expectedVersion, ...body }, actorId);
      setSuccessMessage(`Đã thực hiện ${action} cho stocktake.`);
      await fetchAllData();
      await loadStocktake(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Không thể ${action} stocktake.`);
    }
  };

  return {
    positions,
    reservations,
    transfers,
    stocktakes,
    selectedTransfer,
    selectedStocktake,
    allWarehouses,
    allLocations,
    allZones,
    isLoading,
    error,
    successMessage,
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
    handleCreateStocktake,
    loadTransfer,
    transferCommand,
    loadStocktake,
    stocktakeCommand
  };
}
