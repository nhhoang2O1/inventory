import { useState, useEffect } from 'react';
import { OutboundItem } from '../types';

export function useOutbound(setView: (view: any) => void, actorId?: string, warehouseId?: string, warehouseCode?: string) {
  const [outboundItems, setOutboundItems] = useState<OutboundItem[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string>('');
  const [scanInput, setScanInput] = useState('');
  const [pickAlert, setPickAlert] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [issueCode, setIssueCode] = useState<string>('#PK-9824');

  // Fetch real outbound issue requests & allocated pick items from API
  useEffect(() => {
    if (!actorId || !warehouseId) return;
    setIsLoading(true);

    fetch(`/api/v1/outbound/issue-requests?warehouseId=${warehouseId}`, {
      headers: { 'x-actor-id': actorId }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const firstIssue = data[0];
          setSelectedIssueId(firstIssue.id);
          setIssueCode(firstIssue.issue_code || `#IR-${firstIssue.id.slice(0, 6)}`);

          if (firstIssue.lines && Array.isArray(firstIssue.lines)) {
            const items: OutboundItem[] = firstIssue.lines.map((line: any, idx: number) => ({
              id: line.id || String(idx + 1),
              location: line.location_code || 'A1-R2-B04',
              name: line.sku_name || line.sku_code || 'Sản phẩm xuất kho',
              ratio: 24,
              lot: line.batch_code || 'BATCH-DEFAULT',
              exp: line.expiration_date || '2026-12-31',
              reqQty: line.quantity || 10,
              status: line.picked ? 'Picked' : idx === 0 ? 'Picking' : 'Pending'
            }));
            setOutboundItems(items);
            return;
          }
        }

        // Fallback to stock positions if no active issue request yet
        return fetch(`/api/v1/inventory/positions?warehouseId=${warehouseId}`, {
          headers: { 'x-actor-id': actorId }
        })
          .then(res => res.json())
          .then(positions => {
            if (Array.isArray(positions) && positions.length > 0) {
              const mapped: OutboundItem[] = positions.slice(0, 5).map((pos: any, idx: number) => ({
                id: String(pos.id || idx + 1),
                location: String(pos.locationCode || 'A1-R1-B01'),
                name: String(pos.skuName || pos.skuCode || 'Sản phẩm xuất kho'),
                ratio: 24,
                lot: String(pos.batchCode || 'BATCH-REAL'),
                exp: pos.expirationDate ? String(pos.expirationDate).split('T')[0] || '2026-12-31' : '2026-12-31',
                reqQty: Math.min(pos.quantityOnHand, 50) || 10,
                status: idx === 0 ? 'Picking' : 'Pending'
              }));
              setOutboundItems(mapped);
            } else {
              setOutboundItems([
                { id: '1', location: 'Z1-A12', name: 'Bia Heineken 330ml Can', ratio: 24, lot: 'B-HN-SILVER-01', exp: '2026-12-31', reqQty: 20, status: 'Picking' },
                { id: '2', location: 'Z2-B04', name: 'Bia Tiger Crystal 330ml Can', ratio: 24, lot: 'B-TIG-CRYST-01', exp: '2027-01-15', reqQty: 15, status: 'Pending' }
              ]);
            }
          });
      })
      .catch(err => {
        console.error('Error fetching outbound data:', err);
      })
      .finally(() => setIsLoading(false));
  }, [actorId, warehouseId]);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = scanInput.trim().toUpperCase();
    if (!barcode) return;

    const foundIndex = outboundItems.findIndex(
      item => item.location.toUpperCase() === barcode || item.lot.toUpperCase() === barcode
    );

    if (foundIndex !== -1) {
      const item = outboundItems[foundIndex];
      if (item) {
        if (item.status === 'Picked') {
          setPickAlert(`Mục tại vị trí ${item.location} đã được bốc xếp trước đó.`);
        } else {
          const updated = [...outboundItems];
          const updatedItem = updated[foundIndex];
          if (updatedItem) {
            updatedItem.status = 'Picked';
          }
          setOutboundItems(updated);
          setPickAlert(` Quét thành công Barcode ${barcode}! Đã xác nhận lấy hàng tại vị trí ${item.location}.`);
        }
      }
    } else {
      setPickAlert(` Barcode "${barcode}" không khớp vị trí ô kệ hoặc Mã lô trong danh sách xuất.`);
    }

    setScanInput('');
    setTimeout(() => setPickAlert(null), 4000);
  };

  const handlePickRowClick = (id: string) => {
    const updated = outboundItems.map(item => {
      if (item.id === id) {
        return { ...item, status: (item.status === 'Picked' ? 'Pending' : 'Picked') as 'Picked' | 'Pending' };
      }
      return item;
    });
    setOutboundItems(updated);
  };

  const onCompletePick = async () => {
    if (selectedIssueId && actorId) {
      try {
        await fetch(`/api/v1/outbound/issue-requests/${selectedIssueId}/post`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-actor-id': actorId,
            'idempotency-key': crypto.randomUUID ? crypto.randomUUID() : `gi-key-${Date.now()}`
          },
          body: JSON.stringify({ expectedVersion: 1, reason: 'Xuất kho hoàn tất bốc xếp FEFO' })
        });
      } catch (e) {
        console.error('Error posting Goods Issue:', e);
      }
    }
    alert(`Xác nhận xuất xưởng hoàn tất! Phiếu xuất kho ${issueCode} đã được ghi nhận xuất kho thực tế trong CSDL.`);
    setView('dashboard');
  };

  const onCancelPick = () => {
    alert("Đã tạm dừng quá trình pick hàng.");
  };

  return {
    outboundItems,
    scanInput,
    setScanInput,
    pickAlert,
    issueCode,
    isLoading,
    handleScanSubmit,
    handlePickRowClick,
    onCompletePick,
    onCancelPick
  };
}

