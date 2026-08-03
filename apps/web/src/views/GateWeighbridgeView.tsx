import React, { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../apiClient';

interface TruckEntry {
  id: string;
  entry_code: string;
  license_plate: string;
  driver_name: string;
  driver_id_card?: string;
  carrier_name?: string;
  po_do_code?: string;
  sku_name?: string;
  expected_qty_cases?: number;
  entry_type: 'QR_SCAN' | 'MANUAL';
  purpose: 'INBOUND' | 'OUTBOUND';
  status: 'CHECKED_IN' | 'WEIGHED_IN' | 'LOADING' | 'DOCK_RECEIVED' | 'WEIGHED_OUT' | 'COMPLETED' | 'REJECTED';
  dock_location_id?: string;
  dock_code?: string;
  storekeeper_confirmed?: boolean;
  storekeeper_confirmed_at?: string;
  storekeeper_confirmed_by?: string;
  storekeeper_notes?: string;
  confirmed_qty_cases?: number;
  po_sku_lines?: any[];
  weight_in?: number;
  weight_out?: number;
  net_weight?: number;
  expected_weight?: number;
  diff_percentage?: number;
  verification_status?: 'PENDING' | 'VALID' | 'EXCEEDED_TOLERANCE' | 'OVERRIDDEN';
  created_at: string;
}

interface DockLocation {
  id: string;
  code: string;
  name: string;
  status: 'AVAILABLE' | 'BUSY';
}

export function GateWeighbridgeView({ actorId, warehouseId, userRole }: { actorId?: string; warehouseId?: string; userRole?: string }) {
  const [activeTab, setActiveTab] = useState<'checkin' | 'dock' | 'scaleout' | 'history'>('checkin');
  const [entries, setEntries] = useState<TruckEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check-in Form state
  const [entryType, setEntryType] = useState<'QR_SCAN' | 'MANUAL'>('MANUAL');
  const [licensePlate, setLicensePlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverIdCard, setDriverIdCard] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [poDoCode, setPoDoCode] = useState('PO-20260728-08');
  const [skuName, setSkuName] = useState('Bia 333 Lon 330ml');
  const [purpose, setPurpose] = useState<'INBOUND' | 'OUTBOUND' | 'INTERNAL_TRANSFER'>('INBOUND');
  const [weightIn, setWeightIn] = useState<number>(15450);

  // Dock assignment state
  const [selectedEntryForDock, setSelectedEntryForDock] = useState<string>('');
  const [selectedDockCode, setSelectedDockCode] = useState<string>('DOCK-01');
  const [confirmDockModal, setConfirmDockModal] = useState<{
    isOpen: boolean;
    truckEntry: TruckEntry | null;
    dock: DockLocation | null;
  }>({ isOpen: false, truckEntry: null, dock: null });

  // Scale Out state
  const [selectedEntryForScaleOut, setSelectedEntryForScaleOut] = useState<string>('');
  const [weightOut, setWeightOut] = useState<number>(9820);
  const [expectedQtyCases, setExpectedQtyCases] = useState<number>(400); // 400 thùng
  const [stdWeightPerCase, setStdWeightPerCase] = useState<number>(8.5); // 8.5 kg/thùng
  const toleranceThresholdPercent = 1.5; // Cố định 1.5% theo chính sách CSDL
  const [scaleOutNotes, setScaleOutNotes] = useState('');

  // Camera & Google Drive Photo evidence state
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [photoW1, setPhotoW1] = useState<string | null>(null);
  const [photoW2, setPhotoW2] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // Managing Camera Lifecycle cleanly based on activeTab
  useEffect(() => {
    let currentStream: MediaStream | null = null;
    let isCancelled = false;

    // Only activate webcam if activeTab requires camera ('checkin' for W1 or 'checkout' for W2)
    if (activeTab === 'checkin' || activeTab === 'scaleout') {
      navigator.mediaDevices?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
        .then(stream => {
          if (isCancelled) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }
          currentStream = stream;
          setWebcamStream(stream);
          setWebcamActive(true);
        })
        .catch(err => console.warn('Auto webcam start warning:', err));
    } else {
      setWebcamActive(false);
      setWebcamStream(null);
    }

    // Cleanup function: Turn OFF camera immediately when switching tabs or unmounting!
    return () => {
      isCancelled = true;
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
      setWebcamActive(false);
      setWebcamStream(null);
    };
  }, [activeTab]);

  useEffect(() => {
    if (webcamActive && webcamStream && videoRef.current) {
      videoRef.current.srcObject = webcamStream;
      videoRef.current.play().catch(err => console.error("Error playing video stream:", err));
    }
  }, [webcamActive, webcamStream]);

  const capturePhotoAndUploadDrive = async (target: 'W1' | 'W2', plateStr?: string, weightVal?: number) => {
    let dataUrl = '';
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 1280;
      canvas.height = videoRef.current.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        // Draw Top Horizontal Audit Banner (Thanh Ngang Phía Trên Cùng Ảnh)
        const bannerHeight = 60;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(0, 0, canvas.width, bannerHeight);

        // Accent line below banner
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(0, bannerHeight - 3, canvas.width, 3);

        // Line 1: Header + Vehicle + PO + Weight
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 15px sans-serif';
        const timestamp = new Date().toLocaleString('vi-VN');
        const plate = plateStr || (target === 'W1' ? licensePlate : activeScaleOutEntry?.license_plate) || '51C-738.92';
        const po = (target === 'W1' ? poDoCode : activeScaleOutEntry?.po_do_code) || 'PO-20260728-08';
        const wKg = weightVal || (target === 'W1' ? weightIn : weightOut) || 0;
        const line1 = `🔴 CÂN MINH CHỨNG [${target}] | BIỂN XE: ${plate} | ĐƠN HÀNG: ${po} | SỐ CÂN ${target}: ${wKg.toLocaleString()} KG`;
        ctx.fillText(line1, 15, 24);

        // Line 2: Driver Name, CCCD, Carrier, Security Guard Operator, Timestamp
        ctx.fillStyle = '#ffffff';
        ctx.font = '13px sans-serif';
        const dName = (target === 'W1' ? driverName : activeScaleOutEntry?.driver_name) || 'Lê Hoàng Nam';
        const dId = (target === 'W1' ? driverIdCard : activeScaleOutEntry?.driver_id_card) || '040091003412';
        const cName = (target === 'W1' ? carrierName : activeScaleOutEntry?.carrier_name) || 'Phương Trang Logistics';
        const guardStr = userRole ? `Bảo Vệ (${userRole})` : 'Bảo Vệ Trạm Cân';
        const line2 = `👤 TÀI XẾ: ${dName} | CCCD: ${dId} | NHÀ XE: ${cName} | NGƯỜI DUYỆT CHỤP: ${guardStr} | ${timestamp}`;
        ctx.fillText(line2, 15, 48);

        dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (target === 'W1') setPhotoW1(dataUrl);
        else setPhotoW2(dataUrl);
      }
    }

    if (dataUrl) {
      const cleanPlate = (plateStr || (target === 'W1' ? licensePlate : activeScaleOutEntry?.license_plate) || 'XE-TAI').replace(/[^a-zA-Z0-9]/g, '');
      const poStr = (target === 'W1' ? poDoCode : activeScaleOutEntry?.po_do_code) || 'PO-2026';
      const dateTag = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
      const fileName = `${target}_${cleanPlate}_${poStr}_${dateTag}.jpg`;

      try {
        await apiPost('/gate/upload-drive', {
          imageBase64: dataUrl,
          targetFolder: target,
          fileName
        });
      } catch (err) {
        console.error(`Error auto-uploading photo to Drive ${target}:`, err);
      }
    }
  };

interface ApprovedOrder {
  id: string;
  order_code: string;
  purpose: 'INBOUND' | 'OUTBOUND';
  partner_name?: string;
  sku_name?: string;
  total_skus?: number;
  total_qty?: number;
  expected_weight_kg?: number;
  expected_qty?: number;
  type: 'PO' | 'DO';
}

  const [docks, setDocks] = useState<DockLocation[]>([]);
  const [approvedOrders, setApprovedOrders] = useState<ApprovedOrder[]>([]);

  const fetchDocks = async () => {
    try {
      const data = await apiGet<DockLocation[]>('/gate/docks');
      setDocks(data || []);
    } catch (err: any) {
      console.error('Lỗi lấy danh sách Cửa Dock:', err);
      setDocks([]);
    }
  };

  const fetchApprovedOrders = async () => {
    try {
      const data = await apiGet<ApprovedOrder[]>('/gate/approved-orders');
      setApprovedOrders(data || []);
    } catch (err: any) {
      console.error('Lỗi lấy danh sách đơn hàng PO/DO từ API:', err);
      setApprovedOrders([]);
    }
  };

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<TruckEntry[]>('/gate/entries');
      setEntries(data || []);
    } catch (err: any) {
      console.error('Lỗi lấy danh sách chuyến xe:', err);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDockReceipt = async (truckEntryId: string, notes?: string) => {
    const roleNorm = (userRole || '').toUpperCase();
    const isGatekeeperOnly = roleNorm.includes('GATE') || roleNorm.includes('BẢO VỆ');

    if (isGatekeeperOnly) {
      setAlertMessage({
        type: 'error',
        text: '⛔ RÀNG BUỘC PHÂN QUYỀN: Tài khoản Bảo Vệ (Gatekeeper) không có quyền bấm nút này! Vui lòng nhờ Thủ Kho (Storekeeper) tại Dock xác nhận bốc hạ đủ hàng.'
      });
      return;
    }

    setIsLoading(true);
    try {
      await apiPost('/gate/confirm-dock-receipt', { truckEntryId, notes });
      setAlertMessage({
        type: 'success',
        text: '🟢 THỦ KHO XÁC NHẬN BỐC HẠ ĐỦ HÀNG TẠI DOCK THÀNH CÔNG! Xe đã sẵn sàng tiến về Cổng Ra để Cân Lần 2 (W2).'
      });
      fetchEntries();
    } catch (err: any) {
      setAlertMessage({
        type: 'error',
        text: err.message || 'Lỗi khi Thủ kho xác nhận nhận hàng tại Dock'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    fetchDocks();
    fetchApprovedOrders();
  }, []);

  useEffect(() => {
    if (entries.length > 0) {
      const pending = entries.find(e => e.status === 'WEIGHED_IN' || e.status === 'LOADING');
      if (pending && (!selectedEntryForDock || !entries.some(e => e.id === selectedEntryForDock))) {
        setSelectedEntryForDock(pending.id);
      }
    }
  }, [entries, selectedEntryForDock]);

  const handleSimulateQRScan = () => {
    setEntryType('QR_SCAN');
    setLicensePlate('51C-738.92');
    setDriverName('Lê Hoàng Nam');
    setDriverIdCard('040091003412');
    setCarrierName('Nhà Xe Phương Trang Logistics');
    setPurpose('INBOUND');
    setAlertMessage({ type: 'success', text: 'Đã quét thành công mã QR Chuyến hàng đã duyệt!' });
  };

  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licensePlate || !driverName) {
      setAlertMessage({ type: 'error', text: 'Vui lòng nhập Biển số xe và Tên tài xế' });
      return;
    }

    try {
      const created = await apiPost<TruckEntry>('/gate/check-in', {
        licensePlate,
        driverName,
        driverIdCard,
        carrierName,
        entryType,
        purpose,
        poDoCode: poDoCode || 'PO-20260728-08'
      });

      // Weigh in W1
      await apiPost('/gate/weigh-in', {
        truckEntryId: created.id,
        weightIn
      });

      // Mandatory Auto-Snap & Upload to Google Drive Kho/W1
      await capturePhotoAndUploadDrive('W1', licensePlate, weightIn);

      setAlertMessage({ type: 'success', text: `Check-in & Cân Lần 1 thành công cho xe ${licensePlate}! Mã: ${created.entry_code} (Đã tự động chụp minh chứng & đẩy Google Drive Kho/W1)` });
      setLicensePlate('');
      setDriverName('');
      setDriverIdCard('');
      setCarrierName('');
      fetchEntries();
    } catch (err: any) {
      setAlertMessage({ type: 'error', text: err.message || 'Lỗi khi tạo check-in' });
    }
  };

  const handleAssignDockSubmit = async (entryId: string, dockCode: string) => {
    try {
      await apiPost('/gate/assign-dock', {
        truckEntryId: entryId,
        dockLocationId: dockCode
      });
      setAlertMessage({ type: 'success', text: `Đã điều phối xe vào ${dockCode}` });
      fetchEntries();
    } catch (err: any) {
      setAlertMessage({ type: 'error', text: err.message || 'Lỗi điều phối Dock' });
    }
  };

  const handleWeighOutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryForScaleOut) {
      setAlertMessage({ type: 'error', text: 'Vui lòng chọn xe để Cân Lần 2' });
      return;
    }

    const expectedWeightTotal = expectedQtyCases * stdWeightPerCase;

    try {
      // Mandatory Auto-Snap & Upload to Google Drive Kho/W2
      await capturePhotoAndUploadDrive('W2', activeScaleOutEntry?.license_plate, weightOut);

      const res = await apiPost<any>('/gate/weigh-out', {
        truckEntryId: selectedEntryForScaleOut,
        weightOut,
        expectedWeight: expectedWeightTotal,
        tolerancePercentage: 1.5,
        notes: scaleOutNotes
      });

      const isPass = res.verification_status === 'VALID';
      if (isPass) {
        setAlertMessage({ type: 'success', text: `Đã lưu số cân W2 thành công! Net weight = ${res.net_weight?.toLocaleString()} kg. Xe VẪN ĐANG NẰM TRONG KHO (Đứng ở trạm cân cổng ra). Nhấn "Cho Xe Xuất Cổng" để mở Ba-ri-e cho xe rời kho!` });
      } else {
        setAlertMessage({ type: 'error', text: `CẢNH BÁO: Trọng lượng lệch ${res.diff_percentage}% (Vượt quá dung sai 1.5%). Khóa Barrier!` });
      }
      fetchEntries();
    } catch (err: any) {
      setAlertMessage({ type: 'error', text: err.message || 'Lỗi Cân Lần 2' });
    }
  };

  const handleCheckOutSubmit = async (entryId: string) => {
    try {
      await apiPost('/gate/check-out', { truckEntryId: entryId });
      setAlertMessage({ type: 'success', text: 'Ba-ri-e đã mở! Xe đã xuất cổng thành công và chính thức rời khỏi kho.' });
      setSelectedEntryForScaleOut('');
      fetchEntries();
    } catch (err: any) {
      setAlertMessage({ type: 'error', text: err.message || 'Lỗi xuất cổng' });
    }
  };

  // Selected entry calculations for Scale Out tab
  const activeScaleOutEntry = entries.find(e => e.id === selectedEntryForScaleOut);

  // Auto-sync expectedQtyCases and stdWeightPerCase when active scale out entry changes
  React.useEffect(() => {
    if (activeScaleOutEntry) {
      const confirmedQty = Number(activeScaleOutEntry.confirmed_qty_cases || 0);
      const skuLines: any[] = Array.isArray(activeScaleOutEntry.po_sku_lines) ? activeScaleOutEntry.po_sku_lines : [];
      const specWeight = skuLines[0]?.unitWeightKg ? Number(skuLines[0].unitWeightKg) : 8.5;

      if (confirmedQty > 0) {
        setExpectedQtyCases(confirmedQty);
      } else {
        const poCode = activeScaleOutEntry.po_do_code;
        const samePoList = entries.filter(x => poCode && x.po_do_code === poCode);
        const poTotalCases = skuLines.length > 0
          ? skuLines.reduce((sum: number, l: any) => sum + Number(l.orderedQty || 0), 0)
          : 400;
        setExpectedQtyCases(samePoList.length > 1 ? Math.round(poTotalCases / samePoList.length) : poTotalCases);
      }

      if (specWeight > 0) {
        setStdWeightPerCase(specWeight);
      }
    }
  }, [selectedEntryForScaleOut, activeScaleOutEntry?.id, activeScaleOutEntry?.confirmed_qty_cases]);

  const netWeightCalc = activeScaleOutEntry?.weight_in ? Math.abs(activeScaleOutEntry.weight_in - weightOut) : 1700;
  const currentTruckCases = expectedQtyCases > 0 ? expectedQtyCases : (activeScaleOutEntry?.confirmed_qty_cases || 200);
  const expectedWeightCalc = currentTruckCases * (stdWeightPerCase || 8.5);
  const weightDiffCalc = Math.abs(netWeightCalc - expectedWeightCalc);
  const diffPctCalc = expectedWeightCalc > 0 ? (weightDiffCalc / expectedWeightCalc) * 100 : 0;
  const isStrictPass = diffPctCalc <= toleranceThresholdPercent; // <= 1.5%
  const isWarningPass = !isStrictPass && diffPctCalc <= (toleranceThresholdPercent * 2); // 1.5% -> 3.0%
  const isTolerancePass = isStrictPass || isWarningPass;

  const handleResetTestData = async () => {
    if (!window.confirm('⚠️ Bạn có chắc chắn muốn XÓA SẠCH toàn bộ dữ liệu xe & phiếu cân test để kiểm thử lại từ đầu không?')) {
      return;
    }
    setIsLoading(true);
    try {
      await apiPost('/gate/reset-data', {});
      setAlertMessage({
        type: 'success',
        text: '🧹 ĐÃ XÓA SẠCH DỮ LIỆU XE & CÂN TRẠM TEST THÀNH CÔNG! Dữ liệu đã sạch sẽ, bạn có thể Check-in xe mới để test lại từ đầu.'
      });
      setSelectedEntryForDock('');
      setSelectedEntryForScaleOut('');
      fetchEntries();
    } catch (err: any) {
      setAlertMessage({
        type: 'error',
        text: err.message || 'Lỗi khi reset dữ liệu test'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-lg border border-indigo-900/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-400 text-3xl">local_shipping</span>
              <h1 className="text-2xl font-bold font-headline-sm tracking-tight">Quản Lý Xe Vào/Ra &amp; Trạm Cân (Gate &amp; Weighbridge)</h1>
            </div>
            <p className="text-slate-300 text-sm mt-1">
              Kiểm soát an ninh cổng, Cân xe 2 lần ($W_1, W_2$), Tự động điều phối Dock &amp; Đối soát dung sai khối lượng thực tế.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetTestData}
              className="bg-rose-600/90 hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-rose-400/40 shadow-sm active:scale-95"
              title="Xóa sạch toàn bộ xe test để test lại từ đầu"
            >
              <span className="material-symbols-outlined text-base">restart_alt</span>
              🧹 Reset Data Test Cân
            </button>
            <button
              onClick={fetchEntries}
              className="bg-indigo-600/80 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border border-indigo-400/30 active:scale-95"
            >
              <span className={`material-symbols-outlined text-base ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
              Làm Mới
            </button>
          </div>
        </div>

        {/* Global Stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-indigo-900/60">
          <div className="bg-white/5 backdrop-blur-sm p-3 rounded-xl border border-white/10">
            <div className="text-xs text-slate-400">Tổng Xe Đang Ở Trong Kho</div>
            <div className="text-2xl font-bold text-amber-300 font-data-mono">
              {entries.filter(e => e.status !== 'COMPLETED' && e.status !== 'REJECTED').length} <span className="text-xs font-normal">xe</span>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm p-3 rounded-xl border border-white/10">
            <div className="text-xs text-slate-400">Đã Cân Vào ($W_1$)</div>
            <div className="text-2xl font-bold text-emerald-400 font-data-mono">
              {entries.filter(e => e.status === 'WEIGHED_IN' || e.status === 'LOADING').length} <span className="text-xs font-normal">xe</span>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm p-3 rounded-xl border border-white/10">
            <div className="text-xs text-slate-400">Đang Bốc / Hạ Hàng (Dock)</div>
            <div className="text-2xl font-bold text-cyan-300 font-data-mono">
              {entries.filter(e => e.status === 'LOADING').length} <span className="text-xs font-normal">chuyến</span>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm p-3 rounded-xl border border-white/10">
            <div className="text-xs text-slate-400">Đã Hoàn Thành Trong Ngày</div>
            <div className="text-2xl font-bold text-blue-300 font-data-mono">
              {entries.filter(e => e.status === 'COMPLETED').length} <span className="text-xs font-normal">xe</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alert banner */}
      {alertMessage && (
        <div className={`p-4 rounded-xl flex items-center justify-between ${
          alertMessage.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <div className="flex items-center gap-3 font-medium text-sm">
            <span className="material-symbols-outlined">
              {alertMessage.type === 'success' ? 'check_circle' : 'warning'}
            </span>
            <span>{alertMessage.text}</span>
          </div>
          <button onClick={() => setAlertMessage(null)} className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 shadow-sm">
        <button
          onClick={() => setActiveTab('checkin')}
          className={`py-3 px-5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'checkin'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="material-symbols-outlined">login</span>
          1. Cổng Vào &amp; Cân Lần 1 ($W_1$)
        </button>
        <button
          onClick={() => setActiveTab('dock')}
          className={`py-3 px-5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'dock'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="material-symbols-outlined">warehouse</span>
          2. Điều Phối Dock / Zone
        </button>
        <button
          onClick={() => setActiveTab('scaleout')}
          className={`py-3 px-5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'scaleout'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="material-symbols-outlined">scale</span>
          3. Cân Lần 2 ($W_2$) &amp; Đối Soát
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`py-3 px-5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="material-symbols-outlined">list_alt</span>
          4. Nhật Ký Xe Ra/Vào ({entries.length})
        </button>
      </div>

      {/* TAB 1: CHECK-IN & WEIGH IN W1 */}
      {activeTab === 'checkin' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-600">badge</span>
                Tiếp Nhận Thông Tin Xe Tại Cổng
              </h2>
              <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEntryType('MANUAL')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    entryType === 'MANUAL' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Cách 1: Khai Báo Thủ Công
                </button>
                <button
                  type="button"
                  onClick={handleSimulateQRScan}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    entryType === 'QR_SCAN' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Cách 2: Quét Mã QR Tự Động
                </button>
              </div>
            </div>

            <form onSubmit={handleCheckInSubmit} className="space-y-4">
              {/* PO / DO Order Selection Block */}
              <div className="bg-indigo-50/80 p-4 rounded-xl border border-indigo-200 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-bold text-indigo-900">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-indigo-600">receipt_long</span>
                    Chọn Đơn Hàng PO/DO Phê Duyệt (Tự Động Điền Mặt Hàng &amp; Quy Chuẩn)
                  </span>
                  <span className="bg-indigo-200 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">
                    WMS Auto-Fill
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <select
                      value={poDoCode}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPoDoCode(val);
                        const match = approvedOrders.find(o => o.order_code === val);
                        if (match) {
                          setPurpose(match.purpose);
                          if (match.partner_name) setCarrierName(match.partner_name);
                          if (match.expected_weight_kg) setSkuName(`${match.expected_weight_kg.toLocaleString('vi-VN')} kg (Tải trọng ${match.total_qty || 500} thùng)`);
                        }
                      }}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-data-mono font-bold text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500"
                    >
                      {approvedOrders.map(o => (
                        <option key={o.order_code} value={o.order_code}>
                          [{o.order_code}] - {o.purpose === 'INBOUND' ? 'Nhập' : 'Xuất'} {o.total_qty || o.expected_qty || 500} thùng/két ({o.total_skus || 1} SKU) - {o.partner_name || ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input
                      type="text"
                      readOnly
                      placeholder="Cân nặng dự kiến"
                      value={
                        approvedOrders.find(o => o.order_code === poDoCode)?.expected_weight_kg
                          ? `${(approvedOrders.find(o => o.order_code === poDoCode)?.expected_weight_kg || 0).toLocaleString('vi-VN')} kg (Dự kiến ${approvedOrders.find(o => o.order_code === poDoCode)?.total_qty || 0} thùng)`
                          : skuName || 'Cân nặng dự kiến: 9,600 kg'
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-indigo-200 text-xs font-bold text-indigo-900 bg-indigo-100/50 shadow-inner"
                      title="Tổng cân nặng dự kiến của toàn bộ đơn hàng PO/DO"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Biển Số Xe (*)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 51C-738.92"
                    value={licensePlate}
                    onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-data-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Họ &amp; Tên Tài Xế (*)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Lê Hoàng Nam"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Số CCCD Tài Xế</label>
                  <input
                    type="text"
                    placeholder="VD: 040091003412"
                    value={driverIdCard}
                    onChange={(e) => setDriverIdCard(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-data-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nhà Xe / Đơn Vị Vận Tải</label>
                  <input
                    type="text"
                    placeholder="VD: Phương Trang Logistics"
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mục Đích Chuyến</label>
                  <select
                    value={purpose}
                    onChange={(e: any) => setPurpose(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="INBOUND">Nhập Hàng Vào Kho (Inbound)</option>
                    <option value="OUTBOUND">Xuất Hàng Khỏi Kho (Outbound)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Trọng Lượng Cân Lần 1 ($W_1$ - kg)</label>
                  <input
                    type="number"
                    required
                    value={weightIn}
                    onChange={(e) => setWeightIn(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-data-mono font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Compact Automatic Live Camera Monitor Section for W1 */}
              <div className="bg-slate-900 p-4 rounded-2xl text-white space-y-3 border border-slate-800 shadow-inner">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-amber-400">
                    <span className="material-symbols-outlined text-[18px]">videocam</span>
                    CAMERA GIÁM SÁT AN NINH CỔNG (TỰ ĐỘNG CHỤP &amp; ĐẨY GOOGLE DRIVE W1 KHI BẤM DUYỆT)
                  </span>
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></div> AUTO LIVE STREAM
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-700 shadow-md">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video>
                    <div className="absolute top-2 left-2 bg-red-600/90 text-white text-[9px] font-extrabold px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                      <div className="w-1.5 h-1.5 rounded-full bg-white"></div> AN NINH TỰ ĐỘNG W1
                    </div>
                  </div>

                  <div className="space-y-2">
                    {photoW1 ? (
                      <div className="bg-slate-800/90 p-2.5 rounded-xl border border-emerald-500/60 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">task_alt</span>
                            Ảnh Minh Chứng W1 Đã Chụp &amp; Đẩy Drive
                          </div>
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ url: photoW1, title: `MINH CHỨNG CÂN LẦN 1 (W1) - XE ${licensePlate || '51C-738.92'}` })}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 transition-all shadow-sm active:scale-95"
                            title="Bấm để xem ảnh phóng to màn hình"
                          >
                            <span className="material-symbols-outlined text-[14px]">visibility</span>
                            👁️ Xem Phóng To
                          </button>
                        </div>
                        <div
                          onClick={() => setPreviewImage({ url: photoW1, title: `MINH CHỨNG CÂN LẦN 1 (W1) - XE ${licensePlate || '51C-738.92'}` })}
                          className="cursor-pointer group relative rounded-lg overflow-hidden border border-slate-700 shadow-sm"
                        >
                          <img src={photoW1} alt="W1 Proof Preview" className="w-full h-24 object-cover group-hover:scale-105 transition-transform duration-300" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                            <span className="material-symbols-outlined text-sm">zoom_in</span> Xem Phóng To
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/60 text-center space-y-1">
                        <span className="material-symbols-outlined text-amber-400 text-2xl">security</span>
                        <p className="text-xs font-bold text-slate-200">Chế Độ Giám Sát Chống Gian Lận</p>
                        <p className="text-[10px] text-slate-400">Khi bấm nút <strong>"Duyệt Xe Vào &amp; Ghi Nhận Cân W1"</strong> bên dưới, hệ thống sẽ tự động chụp ảnh &amp; đẩy lên Google Drive Kho/W1.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined">check_circle</span>
                  Duyệt Xe Vào &amp; Ghi Nhận Cân W1
                </button>
              </div>
            </form>
          </div>

          {/* Scale Indicator Simulation Widget */}
          <div className="bg-slate-900 p-6 rounded-2xl text-white flex flex-col justify-between shadow-md border border-slate-800">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                <span className="font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Trạm Cân Cổng Vào (Live Scale)
                </span>
                <span>ID: SCALE-01</span>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center my-4">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Tổng Trọng Lượng Vào ($W_1$)</div>
                <div className="text-5xl font-extrabold font-data-mono text-amber-400 tracking-tight">
                  {weightIn.toLocaleString()} <span className="text-lg font-normal text-slate-400">KG</span>
                </div>
              </div>
              <div className="text-xs text-slate-400 space-y-2 mt-4">
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span>Trạng Thái Cân:</span>
                  <span className="text-emerald-400 font-bold">STABLE (CÂN ỔN ĐỊNH)</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span>Dung Sai Tiêu Chuẩn:</span>
                  <span className="text-white font-data-mono">± 1.5%</span>
                </div>
                <div className="flex justify-between">
                  <span>Quy Tắc Đếm:</span>
                  <span className="text-amber-300 font-medium">Nguyên thùng/két/keg</span>
                </div>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 text-center text-xs text-slate-500">
              Tích hợp sẵn bộ điều khiển cổng barrier &amp; camera ANPR nhận diện tự động.
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DOCK ALLOCATION */}
      {activeTab === 'dock' && (
        <div className="space-y-6">
          <div className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-100 flex items-center justify-between text-xs text-indigo-900">
            <span className="font-semibold flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-indigo-600">touch_app</span>
              Mẹo thao tác nhanh: Bạn có thể click chọn 1 dòng xe trong bảng &rarr; rồi click trực tiếp vào bất kỳ thẻ Cửa Dock nào ở sơ đồ bên trên để điều phối xe cực nhanh!
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {docks.map(d => {
              const dockTrucks = entries.filter(e => {
                if (e.status !== 'LOADING' && e.status !== 'WEIGHED_IN') return false;
                const resolved = e.dock_code || docks.find(s => s.id === e.dock_location_id || s.code === e.dock_location_id)?.code || e.dock_location_id;
                return resolved === d.code;
              });
              const activeTruck = dockTrucks.find(e => e.status === 'LOADING') || dockTrucks[0];
              const queuedTrucks = dockTrucks.filter(e => e.id !== activeTruck?.id);
              const isBusy = !!activeTruck;
              const candidateTruck = entries.find(e => e.id === selectedEntryForDock) || entries.find(e => e.status === 'WEIGHED_IN') || entries.find(e => e.status === 'LOADING');

              return (
                <div
                  key={d.id}
                  onClick={() => {
                    if (candidateTruck) {
                      setConfirmDockModal({
                        isOpen: true,
                        truckEntry: candidateTruck,
                        dock: d
                      });
                    } else {
                      setAlertMessage({ type: 'error', text: 'Không có xe nào trong danh sách để điều phối vào Dock!' });
                    }
                  }}
                  title={!isBusy ? `Click để mở xác nhận gán xe vào ${d.code}` : undefined}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md hover:scale-[1.01] flex flex-col justify-between ${
                    !isBusy
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950 hover:border-emerald-400'
                      : 'bg-amber-50/60 border-amber-200 text-amber-950 shadow-sm ring-2 ring-amber-300'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="font-bold text-lg font-data-mono">{d.code}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        !isBusy ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
                      }`}>
                        {!isBusy ? 'SẴN SÀNG' : 'ĐANG BỐC HẠ'}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-slate-700 line-clamp-1">{d.name}</div>
                  </div>

                  <div className="space-y-1.5 mt-3">
                    {/* Active Truck directly at Dock Leveler */}
                    {activeTruck && (
                      <div className="text-xs font-data-mono font-bold text-amber-900 bg-amber-100/90 px-2 py-1 rounded-lg flex items-center justify-between border border-amber-300 shadow-sm">
                        <span className="flex items-center gap-1 truncate">
                          <span className="material-symbols-outlined text-[13px] text-amber-700 animate-pulse">local_shipping</span>
                          <span className="truncate">Tại Dock: {activeTruck.license_plate}</span>
                        </span>
                        <span className="text-[9px] text-amber-800 font-normal shrink-0 ml-1">{activeTruck.entry_code}</span>
                      </div>
                    )}

                    {/* Queued Trucks Compact Badge */}
                    {queuedTrucks.length > 0 && (
                      <div className="text-[10px] font-bold text-indigo-950 bg-indigo-100/90 px-2 py-1 rounded-md flex items-center justify-between border border-indigo-300" title={`Các xe xếp hàng chờ đỗ vào ${d.code}: ${queuedTrucks.map(q => q.license_plate).join(', ')}`}>
                        <span className="flex items-center gap-1 text-indigo-700 shrink-0">
                          <span className="material-symbols-outlined text-[12px]">schedule</span>
                          Chờ tiếp (+{queuedTrucks.length}):
                        </span>
                        <span className="font-data-mono font-bold text-indigo-900 truncate ml-1 max-w-[100px]">
                          {queuedTrucks.map(q => q.license_plate).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-600">move_location</span>
              Danh Sách Xe Chờ Điều Phối Dock / Zone
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                  <tr>
                    <th className="p-3">Mã Chuyến</th>
                    <th className="p-3">Biển Số Xe</th>
                    <th className="p-3">Tài Xế</th>
                    <th className="p-3">Trọng Lượng Vào ($W_1$)</th>
                    <th className="p-3">Trạng Thái</th>
                    <th className="p-3">Chỉ Định Dock</th>
                    <th className="p-3 text-right">Thao Tác Gán Dock</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.filter(e => e.status === 'WEIGHED_IN' || e.status === 'LOADING' || e.status === 'DOCK_RECEIVED').map(e => {
                    const isSelected = selectedEntryForDock === e.id;
                    const displayDock = e.dock_code || docks.find(d => d.id === e.dock_location_id || d.code === e.dock_location_id)?.code || e.dock_location_id;
                    const sameDockEntries = entries.filter(x => (x.status === 'LOADING' || x.status === 'WEIGHED_IN') && displayDock && (x.dock_code === displayDock || x.dock_location_id === displayDock));
                    const isFirstAtDock = sameDockEntries.length > 0 && sameDockEntries[0]?.id === e.id;
                    const isQueued = displayDock && !isFirstAtDock && e.status !== 'WEIGHED_OUT';

                    return (
                      <tr
                        key={e.id}
                        onClick={() => setSelectedEntryForDock(e.id)}
                        className={`transition-colors cursor-pointer ${
                          isSelected ? 'bg-indigo-50/90 border-l-4 border-l-indigo-600 shadow-sm' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-3 font-data-mono font-bold text-indigo-700">
                          {e.entry_code}
                          {isSelected && (
                            <span className="text-[10px] bg-indigo-600 text-white font-bold px-1.5 py-0.5 rounded ml-2 font-body-md">
                              ĐANG CHỌN
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-data-mono font-bold text-slate-900">{e.license_plate}</td>
                        <td className="p-3">{e.driver_name}</td>
                        <td className="p-3 font-data-mono">{e.weight_in ? `${e.weight_in.toLocaleString()} kg` : '-'}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap inline-block ${
                            e.status === 'WEIGHED_OUT'
                              ? 'bg-purple-100 text-purple-900 border border-purple-300'
                              : e.storekeeper_confirmed || e.status === 'DOCK_RECEIVED'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : isQueued
                              ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                              : e.status === 'LOADING'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {e.status === 'WEIGHED_OUT'
                              ? '🏁 Đã Cân W2 (Chờ Xuất Cổng)'
                              : e.storekeeper_confirmed || e.status === 'DOCK_RECEIVED'
                              ? '🟢 Thủ kho đã nhận đủ'
                              : isQueued
                              ? '⏳ Xếp hàng chờ'
                              : e.status === 'LOADING'
                              ? 'Đang hạ hàng'
                              : 'Đã cân W1'}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="font-data-mono font-bold text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 inline-flex items-center gap-1">
                            {displayDock || 'Chưa điều phối'}
                            {isQueued && <span className="text-[10px] text-indigo-700 bg-indigo-200/80 px-1.5 py-0.5 rounded font-sans font-extrabold">Hàng chờ</span>}
                          </span>
                        </td>
                        <td className="p-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex justify-end items-center gap-2">
                            {e.status === 'WEIGHED_OUT' ? (
                              <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-200 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">lock</span>
                                🔒 Đã xong Dock (Chờ xuất cổng)
                              </span>
                            ) : (
                              <>
                                <select
                                  id={`dock-select-${e.id}`}
                                  defaultValue={displayDock || 'DOCK-A01'}
                                  className="bg-slate-50 border border-slate-300 font-data-mono font-semibold text-slate-800 text-xs rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                  {docks.map(d => {
                                    const count = entries.filter(x => (x.status === 'LOADING' || x.status === 'WEIGHED_IN') && (x.dock_code === d.code || x.dock_location_id === d.code)).length;
                                    let label = `${d.code} - ${d.name}`;
                                    if (count > 0) {
                                      label += ` (${count === 1 ? 'Đang bốc 1 xe' : `Đang bốc 1 xe • +${count - 1} xe chờ`})`;
                                    } else {
                                      label += ` (Sẵn sàng)`;
                                    }
                                    return (
                                      <option key={d.code} value={d.code}>
                                        {label}
                                      </option>
                                    );
                                  })}
                                </select>
                                <button
                                  onClick={() => {
                                    const sel = document.getElementById(`dock-select-${e.id}`) as HTMLSelectElement;
                                    const selectedDockCode = sel ? sel.value : 'DOCK-A01';
                                    const dockObj = docks.find(x => x.code === selectedDockCode) || { id: selectedDockCode, code: selectedDockCode, name: selectedDockCode, status: 'AVAILABLE' };
                                    setConfirmDockModal({
                                      isOpen: true,
                                      truckEntry: e,
                                      dock: dockObj
                                    });
                                  }}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-[14px]">check</span>
                                  Gán Dock
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {entries.filter(e => e.status === 'WEIGHED_IN' || e.status === 'LOADING').length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">Không có xe nào đang chờ điều phối Dock</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SCALE OUT W2 & RECONCILIATION */}
      {activeTab === 'scaleout' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4 pb-3 border-b flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-600">published_with_changes</span>
              Cân Lần 2 (Xe Ra) &amp; Tự Động Đối Soát Trọng Lượng
            </h2>

            <form onSubmit={handleWeighOutSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Chọn Xe Cân Lần 2 (*)</label>
                <select
                  value={selectedEntryForScaleOut}
                  onChange={(e) => setSelectedEntryForScaleOut(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Chọn xe đang trong kho --</option>
                  {entries.filter(e => e.status === 'LOADING' || e.status === 'WEIGHED_IN' || e.status === 'DOCK_RECEIVED' || e.status === 'WEIGHED_OUT').map(e => {
                    const samePoList = entries.filter(x => (x.po_do_code && e.po_do_code && x.po_do_code === e.po_do_code) || (!x.po_do_code && !e.po_do_code));
                    const truckIdx = samePoList.findIndex(x => x.id === e.id) + 1;
                    const truckTotalCount = samePoList.length || 1;
                    const poLabel = e.po_do_code ? `[${e.po_do_code}]` : '[PO-20260728-08]';
                    const idxLabel = samePoList.length > 1 ? ` (Xe ${truckIdx}/${truckTotalCount})` : '';
                    const confirmedTag = e.storekeeper_confirmed || e.status === 'DOCK_RECEIVED' ? ' [🟢 Thủ Kho Đã Nhận Đủ]' : '';

                    return (
                      <option key={e.id} value={e.id}>
                        {poLabel} {e.license_plate} - {e.driver_name}{idxLabel} (W1: {e.weight_in?.toLocaleString()} kg){confirmedTag} {e.status === 'WEIGHED_OUT' ? '[🏁 Đã Cân W2 - Chờ Mở Cổng]' : ''} - Mã: {e.entry_code}
                      </option>
                    );
                  })}
                </select>
              </div>

              {activeScaleOutEntry && (
                <div className="space-y-3.5">
                  {/* Storekeeper Confirmation Banner */}
                  {activeScaleOutEntry.storekeeper_confirmed || activeScaleOutEntry.status === 'DOCK_RECEIVED' ? (
                    <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between text-xs text-emerald-950 shadow-sm animate-fade-in">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-600">verified</span>
                        <div>
                          <span className="font-bold">ĐỐI SOÁT DOCK: </span>
                          <span>Thủ kho đã kiểm đếm và xác nhận hạ <strong>đủ hàng</strong> xuống kho. Sẵn sàng cho Bảo vệ cân ra &amp; mở cổng!</span>
                        </div>
                      </div>
                      <span className="bg-emerald-600 text-white font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase shrink-0">🟢 ĐÃ XÁC NHẬN HÀNG</span>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center justify-between text-xs text-amber-950 shadow-sm animate-fade-in">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-600">pending_actions</span>
                        <div>
                          <span className="font-bold">CHỜ THỦ KHO XÁC NHẬN TẠI DOCK: </span>
                          <span>Xe đang hạ hàng. Thủ kho cần kiểm đếm và bấm xác nhận nhận đủ hàng.</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleConfirmDockReceipt(activeScaleOutEntry.id)}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 shadow-sm shrink-0"
                      >
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        Xác Nhận Nhanh (Thủ Kho)
                      </button>
                    </div>
                  )}

                  <div className="bg-indigo-50/80 p-3.5 rounded-xl border border-indigo-200 flex items-center justify-between text-xs text-indigo-950 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-indigo-600">receipt_long</span>
                      <div>
                        <span className="font-bold text-slate-700">Đơn Hàng Khai Báo WMS: </span>
                        <span className="font-data-mono font-bold text-indigo-700">{activeScaleOutEntry.po_do_code || 'PO-20260728-08'}</span>
                        <span className="mx-2 text-slate-300">|</span>
                        <span>Mặt Hàng: <strong className="text-slate-900">{activeScaleOutEntry.sku_name || 'Bia 333 Lon 330ml'}</strong></span>
                        <span className="mx-2 text-slate-300">|</span>
                        <span>Số Lượng Hạ Kho Xe Này: <strong className="text-slate-900 font-data-mono">{activeScaleOutEntry.confirmed_qty_cases || expectedQtyCases || 200} thùng</strong></span>
                      </div>
                    </div>
                    <span className="bg-indigo-200 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider shrink-0">
                      Tự Động Đánh Giá
                    </span>
                  </div>
                </div>
              )}

              {/* 4 Cards Grid: 3 Read-Only CSDL Specs + 1 Manual Scale Input W2 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                {/* Card 1: PO & SKU Spec Info */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px] text-indigo-600">inventory_2</span>
                    Đơn PO &amp; Mặt Hàng SKU
                  </span>
                  <div className="font-data-mono font-extrabold text-sm text-indigo-950 truncate">
                    {activeScaleOutEntry?.po_do_code || poDoCode}
                  </div>
                  <span className="text-[11px] text-slate-600 font-medium block truncate">
                    {activeScaleOutEntry?.sku_name || (Array.isArray(activeScaleOutEntry?.po_sku_lines) && activeScaleOutEntry.po_sku_lines.length > 0 ? `${activeScaleOutEntry.po_sku_lines.length} SKU quy chuẩn` : 'Mirinda Cam')}
                  </span>
                </div>

                {/* Card 2: Confirmed Cases */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px] text-emerald-600">numbers</span>
                    Số Lượng Xe Này Hạ Kho
                  </span>
                  <div className="font-data-mono font-extrabold text-sm text-emerald-900">
                    {currentTruckCases.toLocaleString()} thùng
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium block">
                    {activeScaleOutEntry?.storekeeper_confirmed || activeScaleOutEntry?.status === 'DOCK_RECEIVED' ? '🟢 Thủ kho đã đếm &amp; xác nhận' : '⏳ Chờ đếm tại Dock'}
                  </span>
                </div>

                {/* Card 3: Expected Spec Weight */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-slate-500 font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px] text-amber-600">scale</span>
                    Tải Trọng Dự Kiến (CSDL Spec)
                  </span>
                  <div className="font-data-mono font-extrabold text-sm text-amber-900">
                    {expectedWeightCalc.toLocaleString()} kg ({(expectedWeightCalc / 1000).toFixed(2)} Tấn)
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium block">
                    {stdWeightPerCase} kg/thùng (Master Data Spec)
                  </span>
                </div>

                {/* Card 4: ONLY EDITABLE FIELD — Scale Out W2 Weight Input */}
                <div className="bg-indigo-50/90 p-2.5 rounded-xl border-2 border-indigo-500 shadow-sm space-y-1">
                  <label className="block text-xs font-extrabold text-indigo-950 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] text-rose-600 animate-pulse">speed</span>
                    🔴 Nhập Trọng Lượng Cân Lần 2 ($W_2$ - kg) (*)
                  </label>
                  <input
                    type="number"
                    value={weightOut}
                    onChange={(e) => setWeightOut(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-white rounded-lg border border-indigo-400 font-data-mono font-extrabold text-base text-indigo-950 shadow-inner focus:ring-2 focus:ring-indigo-600"
                    placeholder="Nhập số kg trên đồng hồ cân..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Ghi Chú Kiểm Đếm / Lý Do Lệch (Nếu có)</label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú khi có bất thường..."
                  value={scaleOutNotes}
                  onChange={(e) => setScaleOutNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              {/* Compact Automatic Live Camera Monitor Section for W2 */}
              <div className="bg-slate-900 p-4 rounded-2xl text-white space-y-3 border border-slate-800 shadow-inner">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-amber-400">
                    <span className="material-symbols-outlined text-[18px]">videocam</span>
                    CAMERA GIÁM SÁT AN NINH CỔNG (TỰ ĐỘNG CHỤP &amp; ĐẨY GOOGLE DRIVE W2 KHI BẤM DUYỆT)
                  </span>
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></div> AUTO LIVE STREAM
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-700 shadow-md">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video>
                    <div className="absolute top-2 left-2 bg-red-600/90 text-white text-[9px] font-extrabold px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                      <div className="w-1.5 h-1.5 rounded-full bg-white"></div> AN NINH TỰ ĐỘNG W2
                    </div>
                  </div>

                  <div className="space-y-2">
                    {photoW2 ? (
                      <div className="bg-slate-800/90 p-2.5 rounded-xl border border-emerald-500/60 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">task_alt</span>
                            Ảnh Minh Chứng W2 Đã Chụp &amp; Đẩy Drive
                          </div>
                          <button
                            type="button"
                            onClick={() => setPreviewImage({ url: photoW2, title: `MINH CHỨNG CÂN LẦN 2 (W2) - XE ${activeScaleOutEntry?.license_plate || 'XE'}` })}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 transition-all shadow-sm active:scale-95"
                            title="Bấm để xem ảnh phóng to màn hình"
                          >
                            <span className="material-symbols-outlined text-[14px]">visibility</span>
                            👁️ Xem Phóng To
                          </button>
                        </div>
                        <div
                          onClick={() => setPreviewImage({ url: photoW2, title: `MINH CHỨNG CÂN LẦN 2 (W2) - XE ${activeScaleOutEntry?.license_plate || 'XE'}` })}
                          className="cursor-pointer group relative rounded-lg overflow-hidden border border-slate-700 shadow-sm"
                        >
                          <img src={photoW2} alt="W2 Proof Preview" className="w-full h-24 object-cover group-hover:scale-105 transition-transform duration-300" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                            <span className="material-symbols-outlined text-sm">zoom_in</span> Xem Phóng To
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/60 text-center space-y-1">
                        <span className="material-symbols-outlined text-amber-400 text-2xl">security</span>
                        <p className="text-xs font-bold text-slate-200">Chế Độ Giám Sát Chống Gian Lận W2</p>
                        <p className="text-[10px] text-slate-400">Khi bấm nút <strong>"Xác Nhận Cân Lần 2"</strong> bên dưới, hệ thống sẽ tự động chụp ảnh &amp; đẩy lên Google Drive Kho/W2.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dynamic PO Multi-Truck Cumulative Progress Panel */}
              {activeScaleOutEntry && (() => {
                const poCode = activeScaleOutEntry.po_do_code || 'PO-20260728-08';
                const poObj = approvedOrders.find(o => o.order_code === poCode);

                const poSkuLines: any[] = Array.isArray((activeScaleOutEntry as any).po_sku_lines) ? (activeScaleOutEntry as any).po_sku_lines : [];
                const calculatedPoWeightFromSkuSpec = poSkuLines.reduce((sum: number, l: any) => sum + Number(l.lineWeightKg || 0), 0);

                const poTotalWeight = calculatedPoWeightFromSkuSpec > 0
                  ? calculatedPoWeightFromSkuSpec
                  : (poObj?.expected_weight_kg || (expectedQtyCases * (stdWeightPerCase || 8.5)) || 3400);

                const poTotalCases = poSkuLines.length > 0
                  ? poSkuLines.reduce((sum: number, l: any) => sum + Number(l.orderedQty || 0), 0)
                  : (poObj?.total_qty || expectedQtyCases || 400);

                // Strict filtering for trucks belonging ONLY to this specific poCode
                const samePoTrucks = entries.filter(e => e.po_do_code === poCode || (poObj?.order_code && e.po_do_code === poObj.order_code));
                const prevTrucks = samePoTrucks.filter(e => e.id !== activeScaleOutEntry.id && (e.status === 'WEIGHED_OUT' || e.status === 'COMPLETED'));
                const prevWeightSum = prevTrucks.reduce((sum, e) => {
                  if (e.net_weight && Number(e.net_weight) > 0) return sum + Number(e.net_weight);
                  if (e.weight_in && e.weight_out && e.weight_in > e.weight_out) return sum + (e.weight_in - e.weight_out);
                  return sum;
                }, 0);
                const unitWeightRef = (stdWeightPerCase && stdWeightPerCase > 0) ? stdWeightPerCase : 8.5;
                const prevCasesSum = Math.round(prevWeightSum / unitWeightRef);

                const currentTruckCases = Math.round(netWeightCalc / unitWeightRef);
                const cumulativeWeight = prevWeightSum + netWeightCalc;
                const cumulativeCases = prevCasesSum + currentTruckCases;

                const rawProgressPct = poTotalWeight > 0 ? Math.round((cumulativeWeight / poTotalWeight) * 100) : 100;
                const isOverDelivered = cumulativeWeight > (poTotalWeight * 1.025); // Over 102.5% is Surplus / Over-delivery
                const isComplete = rawProgressPct >= 98 && !isOverDelivered;

                const totalRegisteredTrucks = samePoTrucks.length || 1;
                const completedTrucksCount = prevTrucks.length + (activeScaleOutEntry.status === 'WEIGHED_OUT' || activeScaleOutEntry.status === 'COMPLETED' ? 1 : 0);
                const isAllTrucksWeighedOut = completedTrucksCount >= totalRegisteredTrucks;

                return (
                  <div className="bg-indigo-50/90 border border-indigo-200 p-4 rounded-2xl space-y-3 text-xs text-indigo-950 shadow-sm mb-4">
                    <div className="flex justify-between items-center font-bold text-sm text-indigo-900 border-b border-indigo-200/80 pb-2">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-indigo-600">analytics</span>
                        Bảng Tự Động Đối Soát Cộng Dồn Nhiều Chuyến Xe — Đơn PO [{poCode}]
                      </span>
                      <span className="bg-indigo-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        ĐÃ CÂN {completedTrucksCount}/{totalRegisteredTrucks} XE
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-data-mono">
                      <div className="bg-white p-2.5 rounded-xl border border-indigo-100">
                        <span className="text-slate-500 block text-[10px] font-semibold font-sans">Tổng PO Khai Báo:</span>
                        <strong className="text-slate-900 text-sm">{poTotalWeight.toLocaleString()} kg ({poTotalCases.toLocaleString()} thùng)</strong>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-indigo-100">
                        <span className="text-slate-500 block text-[10px] font-semibold font-sans">Các Xe Trước Của PO [{poCode}]:</span>
                        <strong className="text-emerald-700 text-sm">{prevWeightSum.toLocaleString()} kg ({prevCasesSum.toLocaleString()} thùng)</strong>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-indigo-100">
                        <span className="text-slate-500 block text-[10px] font-semibold font-sans">Xe Hiện Tại ({activeScaleOutEntry.license_plate}):</span>
                        <strong className="text-indigo-700 text-sm">{netWeightCalc.toLocaleString()} kg ({currentTruckCases.toLocaleString()} thùng)</strong>
                      </div>
                      <div className={`p-2.5 rounded-xl border ${
                        isOverDelivered
                          ? 'bg-rose-100/90 border-rose-300 animate-pulse'
                          : isComplete
                          ? 'bg-emerald-100/90 border-emerald-300'
                          : isAllTrucksWeighedOut
                          ? 'bg-amber-100/90 border-amber-300'
                          : 'bg-blue-100/90 border-blue-300'
                      }`}>
                        <span className={`block text-[10px] font-extrabold font-sans ${
                          isOverDelivered ? 'text-rose-800' : isComplete ? 'text-emerald-800' : isAllTrucksWeighedOut ? 'text-amber-800' : 'text-blue-800'
                        }`}>Tiến Độ Lũy Kế Tích Lũy:</span>
                        <strong className={`text-sm font-extrabold ${
                          isOverDelivered ? 'text-rose-900' : isComplete ? 'text-emerald-900' : isAllTrucksWeighedOut ? 'text-amber-900' : 'text-blue-900'
                        }`}>
                          {cumulativeWeight.toLocaleString()} / {poTotalWeight.toLocaleString()} kg ({rawProgressPct}%) {isOverDelivered ? '🚨' : isComplete ? '✅' : '⏳'}
                        </strong>
                      </div>
                    </div>

                    <div className={`text-[11px] font-semibold p-2.5 rounded-lg flex items-center gap-2 border ${
                      isOverDelivered
                        ? 'bg-rose-100/90 text-rose-950 border-rose-300'
                        : isComplete
                        ? 'bg-emerald-100/80 text-emerald-900 border-emerald-300'
                        : isAllTrucksWeighedOut
                        ? 'bg-amber-100/90 text-amber-950 border-amber-300'
                        : 'bg-blue-100/80 text-blue-950 border-blue-200'
                    }`}>
                      <span className={`material-symbols-outlined text-[18px] ${
                        isOverDelivered ? 'text-rose-600 animate-pulse' : isComplete ? 'text-emerald-600' : isAllTrucksWeighedOut ? 'text-amber-600' : 'text-blue-600'
                      }`}>
                        {isOverDelivered ? 'warning' : isComplete ? 'verified' : isAllTrucksWeighedOut ? 'report_problem' : 'pending_actions'}
                      </span>
                      <span>
                        {isOverDelivered
                          ? `🚨 CẢNH BÁO GIAO DƯ / QUÁ TẢI HÀNG KHO: Tổng thực nhận (${cumulativeWeight.toLocaleString()} kg) VƯỢT DƯ ${(cumulativeWeight - poTotalWeight).toLocaleString()} kg (+${rawProgressPct - 100}%) so với Đơn PO [${poCode}] đăng ký (${poTotalWeight.toLocaleString()} kg). Khóa Quyết Toán Tự Động! Từ chối nhận lượng hàng rác/hàng dư thừa ngoài hợp đồng.`
                          : isComplete
                          ? `🎉 Tất cả ${totalRegisteredTrucks} xe của Đơn PO [${poCode}] đã giao đủ ${rawProgressPct}% (${cumulativeWeight.toLocaleString()} / ${poTotalWeight.toLocaleString()} kg)! Quyết toán phiếu nhập kho GRN.`
                          : isAllTrucksWeighedOut
                          ? `⚠️ ĐÃ CÂN XONG TOÀN BỘ ${completedTrucksCount}/${totalRegisteredTrucks} XE CỦA ĐƠN PO [${poCode}]. Tổng thực nhận đạt ${cumulativeWeight.toLocaleString()} / ${poTotalWeight.toLocaleString()} kg (${rawProgressPct}%). Không còn xe nào khác đăng ký! Tự động chốt Biên Bản Giao Thiếu (Shortage Receipt: thiếu ${Math.max(0, poTotalWeight - cumulativeWeight).toLocaleString()} kg) & cho phép các xe xuất cổng.`
                          : `ℹ️ Đã giao ${rawProgressPct}% của Đơn PO [${poCode}] (${cumulativeWeight.toLocaleString()} / ${poTotalWeight.toLocaleString()} kg) qua ${completedTrucksCount}/${totalRegisteredTrucks} xe. Còn thiếu ${Math.max(0, poTotalWeight - cumulativeWeight).toLocaleString()} kg — Chờ xe tiếp theo.`}
                      </span>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => window.open(`/api/v1/gate/reports/po/${poCode}/pdf`, '_blank')}
                        className="bg-indigo-700 hover:bg-indigo-800 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-colors active:scale-95"
                        title="Tải xuống hoặc xem trực tiếp Biên bản quyết toán PO dạng PDF"
                      >
                        <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                        📄 Xuất Báo Cáo PDF Quyết Toán PO [{poCode}]
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Automatic Calculation & Verification Box for THIS Truck */}
              {activeScaleOutEntry && (
                <div className={`p-5 rounded-2xl border transition-all ${
                  isStrictPass
                    ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                    : isWarningPass
                    ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                    : 'bg-rose-50 border-rose-300 text-rose-950 animate-pulse'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 font-bold text-base">
                      <span className={`material-symbols-outlined text-2xl ${
                        isStrictPass ? 'text-emerald-700' : isWarningPass ? 'text-amber-700' : 'text-rose-700'
                      }`}>
                        {isStrictPass ? 'fact_check' : isWarningPass ? 'report_problem' : 'warning'}
                      </span>
                      <span>KẾT QUẢ ĐỐI SOÁT TRẠM CÂN — XE [{activeScaleOutEntry.license_plate}]</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide ${
                      isStrictPass ? 'bg-emerald-700 text-white' : isWarningPass ? 'bg-amber-600 text-white' : 'bg-rose-600 text-white'
                    }`}>
                      {isStrictPass
                        ? `🟢 XÁC NHẬN: CHUẨN KHỚP TRỌNG LƯỢNG (${netWeightCalc.toLocaleString()} KG)`
                        : isWarningPass
                        ? `🟡 BÁO VÀNG: TRONG NGƯỠNG DUNG SAI MỞ RỘNG (${diffPctCalc.toFixed(2)}%)`
                        : `🔴 RED - CẢNH BÁO BẤT THƯỜNG (> ${(toleranceThresholdPercent * 2).toFixed(1)}%)`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pt-2 border-t border-slate-200/80">
                    <div>
                      <div className="text-xs text-slate-500 font-medium">Net Weight Hạ Kho ($W_1 - W_2$):</div>
                      <div className="font-data-mono font-extrabold text-lg text-indigo-950">{netWeightCalc.toLocaleString()} kg</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 font-medium">Tải Trọng Quy Đổi Dự Kiến ({currentTruckCases} thùng):</div>
                      <div className="font-data-mono font-bold text-lg text-slate-800">{expectedWeightCalc.toLocaleString()} kg</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 font-medium">Chênh Lệch Thực Nhận:</div>
                      <div className="font-data-mono font-bold text-lg text-slate-800">{weightDiffCalc.toLocaleString()} kg</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 font-medium">Tỷ Lệ Dung Sai (Cài Đặt: {toleranceThresholdPercent}%):</div>
                      <div className={`font-data-mono font-extrabold text-lg ${
                        isStrictPass ? 'text-emerald-700' : isWarningPass ? 'text-amber-700' : 'text-rose-700'
                      }`}>
                        {diffPctCalc.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  <div className={`mt-3 text-xs p-2.5 rounded-xl border flex items-center justify-between ${
                    isStrictPass ? 'bg-white/80 border-emerald-200 text-slate-700' : isWarningPass ? 'bg-amber-100/90 border-amber-300 text-amber-950 font-medium' : 'bg-rose-100/90 border-rose-300 text-rose-950 font-bold'
                  }`}>
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className={`material-symbols-outlined text-[16px] ${
                        isStrictPass ? 'text-emerald-600' : isWarningPass ? 'text-amber-600' : 'text-rose-600'
                      }`}>
                        {isStrictPass ? 'info' : isWarningPass ? 'help_outline' : 'warning'}
                      </span>
                      {isStrictPass
                        ? `Trạm cân ghi nhận xe ${activeScaleOutEntry.license_plate} trút xuống kho ${netWeightCalc.toLocaleString()} kg (~${currentTruckCases} thùng). Khớp chuẩn trong dung sai mặc định (${toleranceThresholdPercent}%).`
                        : isWarningPass
                        ? `ℹ️ NẰM TRONG VÙNG DUNG SAI MỞ RỘNG: Lệch ${weightDiffCalc.toLocaleString()} kg (${diffPctCalc.toFixed(2)}%). Cho phép Bảo vệ mở barrier nếu có ghi chú giải trình lý do (nhiên liệu / pallet bẩn).`
                        : `🚨 CẢNH BÁO BẤT THƯỜNG: Xe ${activeScaleOutEntry.license_plate} trút ${netWeightCalc.toLocaleString()} kg, LỆCH ${weightDiffCalc.toLocaleString()} kg (${diffPctCalc.toFixed(2)}%) VƯỢT QUÁ DUNG SAI CHO PHÉP (${toleranceThresholdPercent}%) so với ${currentTruckCases} thùng (${expectedWeightCalc.toLocaleString()} kg)!`}
                    </span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[11px] shrink-0 ${
                      isStrictPass ? 'text-slate-900 bg-emerald-100' : isWarningPass ? 'text-amber-900 bg-amber-200' : 'text-rose-900 bg-rose-200'
                    }`}>
                      {isStrictPass ? 'Bảo vệ kiểm tra trước khi mở barrier' : isWarningPass ? 'Cho phép xuất xe + Ghi chú giải trình' : '⛔ YÊU CẦU KIỂM TRA THÙNG XE KHÔNG CHO XUẤT CỔNG'}
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined">scale</span>
                  Xác Nhận Cân W2 &amp; Lưu Vết Đối Soát
                </button>
                {activeScaleOutEntry && (
                  <button
                    type="button"
                    onClick={() => handleCheckOutSubmit(activeScaleOutEntry.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl shadow-md transition-all flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined">output</span>
                    Cho Xe Xuất Cổng
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-slate-900 p-6 rounded-2xl text-white flex flex-col justify-between shadow-md border border-slate-800">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                <span className="font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                  Trạm Cân Cổng Ra (Live Scale Indicator)
                </span>
                <span>ID: SCALE-02</span>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center my-4">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Trọng Lượng Ra ($W_2$)</div>
                <div className="text-5xl font-extrabold font-data-mono text-cyan-300 tracking-tight">
                  {weightOut.toLocaleString()} <span className="text-lg font-normal text-slate-400">KG</span>
                </div>
              </div>

              {/* Quick Test Simulation Presets for User */}
              <div className="my-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setWeightOut(1000)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[10px] font-bold py-1.5 px-2 rounded-lg border border-slate-700 transition-colors"
                >
                  ⚡ Test Cân Ra 1,000 kg (Khớp)
                </button>
                <button
                  type="button"
                  onClick={() => setWeightOut(2120)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-rose-300 text-[10px] font-bold py-1.5 px-2 rounded-lg border border-slate-700 transition-colors"
                >
                  ⚡ Test Cân Ra 2,120 kg (Lệch)
                </button>
              </div>

              <div className="text-xs text-slate-400 space-y-2 mt-4">
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span>Khối Lượng Hàng Thực Tế:</span>
                  <span className="text-amber-300 font-bold font-data-mono">{netWeightCalc.toLocaleString()} kg</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span>Dung Sai Tiêu Chuẩn FMCG:</span>
                  <span className="text-white font-data-mono">2.5%</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span>Trạng Thái Cảnh Báo:</span>
                  <span className={`font-bold font-data-mono ${isTolerancePass ? 'text-emerald-400' : 'text-rose-400 animate-pulse'}`}>
                    {isTolerancePass ? 'HỢP LỆ (VALID) ✅' : `🚨 CẢNH BÁO LỆCH (${diffPctCalc.toFixed(1)}%)`}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span>Điều Khiển Barrier Cổng:</span>
                  <span className={`font-bold ${isTolerancePass ? 'text-cyan-400' : 'text-rose-500 font-extrabold'}`}>
                    {isTolerancePass ? '🟢 SẴN SÀNG MỞ CỔNG' : '🛑 KHÓA BARRIER CỔNG RA'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 text-center text-xs text-slate-500">
              Thiết bị mô phỏng Đầu Cân Điện Tử Live Terminal kết nối trực tiếp bộ cảm biến bàn cân cổng ra RS-232 / Modbus.
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: HISTORY & AUDIT TRAIL */}
      {activeTab === 'history' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-600">history</span>
            Nhật Ký Quản Lý Xe Vào/Ra &amp; Lịch Sử Cân (Audit Trail)
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                <tr>
                  <th className="p-3">Mã Chuyến</th>
                  <th className="p-3">Biển Số Xe</th>
                  <th className="p-3">Tài Xế</th>
                  <th className="p-3">Loại Check-in</th>
                  <th className="p-3">Cân Vào ($W_1$)</th>
                  <th className="p-3">Cân Ra ($W_2$)</th>
                  <th className="p-3">Net Weight</th>
                  <th className="p-3">Độ Lệch (%)</th>
                  <th className="p-3">Trạng Thái</th>
                  <th className="p-3 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="p-3 font-data-mono font-bold text-indigo-700">{e.entry_code}</td>
                    <td className="p-3 font-data-mono font-bold text-slate-900">{e.license_plate}</td>
                    <td className="p-3">{e.driver_name}</td>
                    <td className="p-3 text-xs">
                      <span className={`px-2 py-0.5 rounded font-semibold ${
                        e.entry_type === 'QR_SCAN' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {e.entry_type === 'QR_SCAN' ? 'Quét QR' : 'Khai báo'}
                      </span>
                    </td>
                    <td className="p-3 font-data-mono">{e.weight_in ? `${e.weight_in.toLocaleString()} kg` : '-'}</td>
                    <td className="p-3 font-data-mono">{e.weight_out ? `${e.weight_out.toLocaleString()} kg` : '-'}</td>
                    <td className="p-3 font-data-mono font-bold text-amber-700">{e.net_weight ? `${e.net_weight.toLocaleString()} kg` : '-'}</td>
                    <td className="p-3 font-data-mono">{e.diff_percentage !== undefined ? `${e.diff_percentage}%` : '-'}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        e.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                        e.status === 'WEIGHED_OUT' ? 'bg-blue-100 text-blue-800' :
                        e.status === 'LOADING' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {e.status !== 'COMPLETED' && (
                        <button
                          onClick={() => handleCheckOutSubmit(e.id)}
                          className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold px-3 py-1 rounded-lg text-xs"
                        >
                          Xuất Cổng
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmDockModal.isOpen && confirmDockModal.truckEntry && confirmDockModal.dock && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scale-up">
            <div className="flex items-center gap-3 text-indigo-600 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-indigo-600 text-2xl">move_location</span>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Xác Nhận Điều Phối Xe Vào Dock</h3>
                <p className="text-xs text-slate-500">Vui lòng kiểm tra kỹ thông tin trước khi gán Dock</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl space-y-2.5 text-xs text-slate-700 font-medium border border-slate-200/80">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">Biển Số Xe:</span>
                <span className="font-bold text-sm font-data-mono text-indigo-700">{confirmDockModal.truckEntry.license_plate}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">Tài Xế:</span>
                <span className="font-bold text-slate-900">{confirmDockModal.truckEntry.driver_name}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-slate-500">Mã Chuyến Xe:</span>
                <span className="font-data-mono font-bold text-slate-800">{confirmDockModal.truckEntry.entry_code}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-500">Cửa Dock Chỉ Định:</span>
                <span className="font-bold text-sm font-data-mono text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-300">
                  {confirmDockModal.dock.code}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-normal pt-1 text-right italic">
                ({confirmDockModal.dock.name})
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDockModal({ isOpen: false, truckEntry: null, dock: null })}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 text-xs transition-colors"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirmDockModal.truckEntry && confirmDockModal.dock) {
                    const entryId = confirmDockModal.truckEntry.id;
                    const dockCode = confirmDockModal.dock.code;
                    setConfirmDockModal({ isOpen: false, truckEntry: null, dock: null });
                    await handleAssignDockSubmit(entryId, dockCode);
                  }
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Xác Nhận Gán Xe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Image Preview Modal Popup */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="relative max-w-5xl w-full bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl space-y-0">
            {/* Modal Header */}
            <div className="bg-slate-800/90 px-6 py-4 border-b border-slate-700 flex justify-between items-center text-white">
              <div className="flex items-center gap-2 font-bold text-base text-amber-400">
                <span className="material-symbols-outlined text-2xl">visibility</span>
                <span>{previewImage.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="w-9 h-9 rounded-full bg-slate-700 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center transition-colors text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Image Container */}
            <div className="p-4 bg-black flex justify-center items-center max-h-[75vh] overflow-auto">
              <img src={previewImage.url} alt="Fullscreen Proof" className="max-h-[70vh] w-auto object-contain rounded-xl border border-slate-800 shadow-2xl" />
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-800/90 px-6 py-3 border-t border-slate-700 flex justify-between items-center text-xs text-slate-300">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
                <span className="material-symbols-outlined text-base">cloud_done</span>
                Ảnh gốc đính kèm Watermark tự động đồng bộ Google Drive Kho/W1 &amp; Kho/W2
              </span>
              <div className="flex gap-3">
                <a
                  href={previewImage.url}
                  download="MINH_CHUNG_TRUAM_CAN.jpg"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">download</span>
                  Tải Ảnh Về Máy
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-xl transition-all"
                >
                  Đóng (Esc)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
