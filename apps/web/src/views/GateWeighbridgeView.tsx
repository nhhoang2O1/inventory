import React, { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../apiClient';

interface TruckEntry {
  id: string;
  entry_code: string;
  license_plate: string;
  driver_name: string;
  driver_id_card?: string;
  carrier_name?: string;
  entry_type: 'QR_SCAN' | 'MANUAL';
  purpose: 'INBOUND' | 'OUTBOUND' | 'INTERNAL_TRANSFER';
  status: 'CHECKED_IN' | 'WEIGHED_IN' | 'LOADING' | 'WEIGHED_OUT' | 'COMPLETED' | 'REJECTED';
  dock_location_id?: string;
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

export function GateWeighbridgeView({ actorId, warehouseId }: { actorId?: string; warehouseId?: string }) {
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
  const [purpose, setPurpose] = useState<'INBOUND' | 'OUTBOUND' | 'INTERNAL_TRANSFER'>('INBOUND');
  const [weightIn, setWeightIn] = useState<number>(15450);

  // Dock assignment state
  const [selectedEntryForDock, setSelectedEntryForDock] = useState<string>('');
  const [selectedDockCode, setSelectedDockCode] = useState<string>('DOCK-01');

  // Scale Out state
  const [selectedEntryForScaleOut, setSelectedEntryForScaleOut] = useState<string>('');
  const [weightOut, setWeightOut] = useState<number>(9820);
  const [expectedQtyCases, setExpectedQtyCases] = useState<number>(500); // 500 thùng
  const [stdWeightPerCase, setStdWeightPerCase] = useState<number>(11.2); // 11.2 kg/thùng
  const [scaleOutNotes, setScaleOutNotes] = useState('');

  const sampleDocks: DockLocation[] = [
    { id: 'dock-1', code: 'DOCK-01', name: 'Cửa Nhập hàng 01 (Khu A)', status: 'AVAILABLE' },
    { id: 'dock-2', code: 'DOCK-02', name: 'Cửa Nhập hàng 02 (Khu A)', status: 'BUSY' },
    { id: 'dock-3', code: 'DOCK-03', name: 'Cửa Xuất hàng 03 (Khu B)', status: 'AVAILABLE' },
    { id: 'dock-4', code: 'DOCK-04', name: 'Cửa Xuất hàng 04 (Khu B)', status: 'BUSY' },
  ];

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<TruckEntry[]>('/gate/entries');
      setEntries(data || []);
    } catch (err: any) {
      console.warn('API Error, using fallback mock data:', err);
      // Fallback mock entries if database is not seeded
      setEntries([
        {
          id: '1',
          entry_code: 'GATE-20260727-8821',
          license_plate: '29H-847.21',
          driver_name: 'Nguyễn Văn Hùng',
          driver_id_card: '001092004812',
          carrier_name: 'Vận tải Hùng Phát',
          entry_type: 'QR_SCAN',
          purpose: 'INBOUND',
          status: 'WEIGHED_IN',
          weight_in: 16200,
          created_at: new Date().toISOString()
        },
        {
          id: '2',
          entry_code: 'GATE-20260727-4109',
          license_plate: '51D-921.45',
          driver_name: 'Trần Đình Trọng',
          driver_id_card: '079093012984',
          carrier_name: 'Nội bộ Sabeco',
          entry_type: 'MANUAL',
          purpose: 'INBOUND',
          status: 'LOADING',
          dock_location_id: 'DOCK-01',
          weight_in: 15450,
          created_at: new Date(Date.now() - 3600000).toISOString()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

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
        purpose
      });

      // Weigh in W1
      await apiPost('/gate/weigh-in', {
        truckEntryId: created.id,
        weightIn
      });

      setAlertMessage({ type: 'success', text: `Check-in & Cân Lần 1 thành công cho xe ${licensePlate}! Mã: ${created.entry_code}` });
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
      const res = await apiPost<any>('/gate/weigh-out', {
        truckEntryId: selectedEntryForScaleOut,
        weightOut,
        expectedWeight: expectedWeightTotal,
        tolerancePercentage: 1.5,
        notes: scaleOutNotes
      });

      const isPass = res.verification_status === 'VALID';
      if (isPass) {
        setAlertMessage({ type: 'success', text: `Cân Lần 2 HỢP LỆ! Net weight = ${res.net_weight} kg. Độ lệch: ${res.diff_percentage}%` });
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
      setAlertMessage({ type: 'success', text: 'Xe đã xuất cổng thành công. Đóng chuyến!' });
      fetchEntries();
    } catch (err: any) {
      setAlertMessage({ type: 'error', text: err.message || 'Lỗi xuất cổng' });
    }
  };

  // Selected entry calculations for Scale Out tab
  const activeScaleOutEntry = entries.find(e => e.id === selectedEntryForScaleOut);
  const netWeightCalc = activeScaleOutEntry?.weight_in ? Math.abs(activeScaleOutEntry.weight_in - weightOut) : 0;
  const expectedWeightCalc = expectedQtyCases * stdWeightPerCase;
  const weightDiffCalc = Math.abs(netWeightCalc - expectedWeightCalc);
  const diffPctCalc = expectedWeightCalc > 0 ? (weightDiffCalc / expectedWeightCalc) * 100 : 0;
  const isTolerancePass = diffPctCalc <= 1.5;

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
          <div className="flex items-center gap-3">
            <button
              onClick={fetchEntries}
              className="bg-indigo-600/80 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 border border-indigo-400/30"
            >
              <span className={`material-symbols-outlined text-lg ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
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
                    <option value="INTERNAL_TRANSFER">Chuyển Kho Nội Bộ</option>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {sampleDocks.map(d => (
              <div
                key={d.id}
                className={`p-5 rounded-2xl border transition-all ${
                  d.status === 'AVAILABLE'
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50/60 border-amber-200 text-amber-950'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-lg font-data-mono">{d.code}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    d.status === 'AVAILABLE' ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
                  }`}>
                    {d.status === 'AVAILABLE' ? 'SẴN SÀNG' : 'ĐANG BỐC HẠ'}
                  </span>
                </div>
                <div className="text-sm font-medium text-slate-700">{d.name}</div>
              </div>
            ))}
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
                    <th className="p-3 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.filter(e => e.status === 'WEIGHED_IN' || e.status === 'LOADING').map(e => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="p-3 font-data-mono font-bold text-indigo-700">{e.entry_code}</td>
                      <td className="p-3 font-data-mono font-bold text-slate-900">{e.license_plate}</td>
                      <td className="p-3">{e.driver_name}</td>
                      <td className="p-3 font-data-mono">{e.weight_in ? `${e.weight_in.toLocaleString()} kg` : '-'}</td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          e.status === 'LOADING' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {e.status === 'LOADING' ? 'Đang hạ hàng' : 'Đã cân W1'}
                        </span>
                      </td>
                      <td className="p-3 font-data-mono font-bold text-slate-800">{e.dock_location_id || 'Chưa điều phối'}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleAssignDockSubmit(e.id, 'DOCK-01')}
                            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
                          >
                            Gán DOCK-01
                          </button>
                          <button
                            onClick={() => handleAssignDockSubmit(e.id, 'DOCK-02')}
                            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
                          >
                            Gán DOCK-02
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
                  {entries.filter(e => e.status === 'LOADING' || e.status === 'WEIGHED_IN').map(e => (
                    <option key={e.id} value={e.id}>
                      {e.license_plate} - {e.driver_name} (W1: {e.weight_in?.toLocaleString()} kg) - Mã: {e.entry_code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Số Lượng Đếm Thực Tế (Thùng/Két)</label>
                  <input
                    type="number"
                    value={expectedQtyCases}
                    onChange={(e) => setExpectedQtyCases(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-data-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Trọng Lượng Chuẩn SKU (kg/thùng)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={stdWeightPerCase}
                    onChange={(e) => setStdWeightPerCase(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-data-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Trọng Lượng Cân Lần 2 ($W_2$ - kg)</label>
                  <input
                    type="number"
                    value={weightOut}
                    onChange={(e) => setWeightOut(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-data-mono font-bold text-indigo-900"
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

              {/* Automatic Calculation & Verification Box */}
              {activeScaleOutEntry && (
                <div className={`p-5 rounded-2xl border transition-all ${
                  isTolerancePass 
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950' 
                    : 'bg-rose-50 border-rose-300 text-rose-950 animate-pulse'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 font-bold text-base">
                      <span className="material-symbols-outlined text-2xl">
                        {isTolerancePass ? 'check_circle' : 'warning'}
                      </span>
                      <span>KẾT QUẢ ĐỐI SOÁT TRỌNG LƯỢNG KHO</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide ${
                      isTolerancePass ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                    }`}>
                      {isTolerancePass ? 'GREEN - HỢP LỆ' : 'RED - CẢNH BÁO LỆCH'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pt-2 border-t border-slate-200">
                    <div>
                      <div className="text-xs text-slate-500">Net Weight Thực Cân:</div>
                      <div className="font-data-mono font-bold text-lg">{netWeightCalc.toLocaleString()} kg</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Trọng Lượng Chuẩn:</div>
                      <div className="font-data-mono font-bold text-lg">{expectedWeightCalc.toLocaleString()} kg</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Chênh Lệch Thực Tế:</div>
                      <div className="font-data-mono font-bold text-lg">{weightDiffCalc.toLocaleString()} kg</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">% Sai Lệch Dung Sai:</div>
                      <div className="font-data-mono font-extrabold text-lg">{diffPctCalc.toFixed(2)}%</div>
                    </div>
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
                  Trạm Cân Cổng Ra (Live Scale)
                </span>
                <span>ID: SCALE-02</span>
              </div>
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center my-4">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Trọng Lượng Ra ($W_2$)</div>
                <div className="text-5xl font-extrabold font-data-mono text-cyan-300 tracking-tight">
                  {weightOut.toLocaleString()} <span className="text-lg font-normal text-slate-400">KG</span>
                </div>
              </div>
              <div className="text-xs text-slate-400 space-y-2 mt-4">
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span>Khối Lượng Hàng Thực Tế:</span>
                  <span className="text-amber-300 font-bold font-data-mono">{netWeightCalc.toLocaleString()} kg</span>
                </div>
                <div className="flex justify-between border-b border-slate-800 pb-1">
                  <span>Ngưỡng Dung Sai Cho Phép:</span>
                  <span className="text-white font-data-mono">1.5%</span>
                </div>
                <div className="flex justify-between">
                  <span>Trạng Thái Cảnh Báo:</span>
                  <span className={`font-bold ${isTolerancePass ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isTolerancePass ? 'HỢP LỆ' : 'VƯỢT DUNG SAI'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 text-center text-xs text-slate-500">
              Chỉ barrier cổng ra tự động nâng lên khi trạng thái đối soát báo VALID.
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
    </div>
  );
}
