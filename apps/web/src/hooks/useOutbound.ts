import { useState } from 'react';
import { OutboundItem } from '../types';

export function useOutbound(setView: (view: any) => void) {
  const [outboundItems, setOutboundItems] = useState<OutboundItem[]>([
    {
      id: '1',
      location: 'A1-R2-B04',
      name: 'Bia Heineken 330ml (Thùng 24 lon)',
      ratio: 24,
      lot: 'BATCH-HNK-992',
      exp: '2026-08-15',
      reqQty: 10,
      status: 'Picked'
    },
    {
      id: '2',
      location: 'A1-R2-B05',
      name: 'Nước ngọt Coca-Cola 320ml (Thùng 24 lon)',
      ratio: 24,
      lot: 'BATCH-CC-104',
      exp: '2026-09-01',
      reqQty: 25,
      status: 'Picked'
    },
    {
      id: '3',
      location: 'A2-R1-B12',
      name: 'Nước suối Aquafina 500ml (Thùng 24 chai)',
      ratio: 24,
      lot: 'BATCH-AQ-005',
      exp: '2026-07-28',
      reqQty: 50,
      status: 'Picking'
    },
    {
      id: '4',
      location: 'A2-R3-B01',
      name: 'Nước tăng lực Redbull 250ml (Thùng 24 lon)',
      ratio: 24,
      lot: 'BATCH-RB-772',
      exp: '2026-11-20',
      reqQty: 15,
      status: 'Pending'
    },
    {
      id: '5',
      location: 'C1-R1-B08',
      name: 'Bia Tiger Bạc 330ml (Thùng 24 lon)',
      ratio: 24,
      lot: 'BATCH-TIG-441',
      exp: '2027-02-05',
      reqQty: 100,
      status: 'Pending'
    }
  ]);
  const [scanInput, setScanInput] = useState('');
  const [pickAlert, setPickAlert] = useState<string | null>(null);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = scanInput.trim().toUpperCase();
    if (!barcode) return;

    const foundIndex = outboundItems.findIndex(
      item => item.location === barcode || item.lot === barcode
    );

    if (foundIndex !== -1) {
      const item = outboundItems[foundIndex];
      if (item) {
        if (item.status === 'Picked') {
          setPickAlert(`Mục tại vị trí ${item.location} đã được pick trước đó.`);
        } else {
          const updated = [...outboundItems];
          const updatedItem = updated[foundIndex];
          if (updatedItem) {
            updatedItem.status = 'Picked';
          }
          setOutboundItems(updated);
          setPickAlert(`Quét thành công! Đã xác nhận lấy hàng tại ô kệ ${item.location}.`);
        }
      }
    } else {
      setPickAlert(`Barcode "${barcode}" không khớp với vị trí ô kệ hoặc Mã lô hiện tại.`);
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

  const onCompletePick = () => {
    alert("Xác nhận bốc xếp hoàn tất! Phiếu xuất kho #PK-9824 chuyển sang trạng thái Xuất xưởng.");
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
    handleScanSubmit,
    handlePickRowClick,
    onCompletePick,
    onCancelPick
  };
}
