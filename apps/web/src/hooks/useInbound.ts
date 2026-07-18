import { useState } from 'react';
import { InboundItem } from '../types';

export function useInbound() {
  const [inboundItems, setInboundItems] = useState<InboundItem[]>([
    {
      sku: 'SKU-HN-330-CAN',
      name: 'Heineken Silver 330ml Can (T24)',
      unit: 'Carton',
      ratio: 24,
      qty: 150,
      batch: 'B-231024-A1',
      mfg: '2026-07-10',
      exp: '2027-07-10'
    },
    {
      sku: 'SKU-HN-330-BTL',
      name: 'Heineken Original 330ml Bottle (K20)',
      unit: 'Crate',
      ratio: 20,
      qty: 80,
      batch: 'B-231024-A2',
      mfg: '2026-07-12',
      exp: '2027-01-12'
    }
  ]);
  const [returnedCrateQty, setReturnedCrateQty] = useState<number>(80);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>(['delivery_note_signed.pdf']);
  const [inboundSuccessMessage, setInboundSuccessMessage] = useState<string | null>(null);

  const handleInboundQtyChange = (index: number, val: string) => {
    // Force integer input (Non-negotiable Rule #1: only full cases/crates)
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
    setInboundItems([
      ...inboundItems,
      {
        sku: `SKU-NEW-${Math.floor(100 + Math.random() * 900)}`,
        name: 'Tiger Crystal 330ml Can (T24)',
        unit: 'Carton',
        ratio: 24,
        qty: 0,
        batch: 'B-NEW-BATCH',
        mfg: '2026-07-18',
        exp: '2027-07-18'
      }
    ]);
  };

  const handleInboundRemoveLine = (index: number) => {
    setInboundItems(inboundItems.filter((_, i) => i !== index));
  };

  const handleConfirmReceipt = () => {
    setInboundSuccessMessage("Xác nhận nhập kho thành công! Đã ghi nhận công nợ vỏ chai và cập nhật tồn kho Available.");
    setTimeout(() => setInboundSuccessMessage(null), 5000);
  };

  return {
    inboundItems,
    setInboundItems,
    returnedCrateQty,
    setReturnedCrateQty,
    uploadedFiles,
    setUploadedFiles,
    inboundSuccessMessage,
    handleInboundQtyChange,
    handleInboundAddLine,
    handleInboundRemoveLine,
    handleConfirmReceipt
  };
}
