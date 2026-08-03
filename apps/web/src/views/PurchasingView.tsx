import React, { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../apiClient';

interface Supplier {
  id: string;
  code: string;
  name: string;
  phone?: string;
  standardLeadTimeDays: number;
  status: string;
  products?: {
    id: string;
    productId: string;
    productCode: string;
    productName: string;
    leadTimeDays: number;
    unitPrice: number;
  }[];
}

interface POLine {
  skuId: string;
  skuCode?: string;
  skuName?: string;
  orderedQty: number;
  unitPrice: number;
}

interface PurchaseOrder {
  id: string;
  poCode: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate: string;
  supplierName: string;
  supplierCode: string;
  leadTimeDays: number;
  creatorName?: string;
  createdBy?: string;
  lines?: {
    id: string;
    skuId: string;
    skuCode: string;
    skuName: string;
    orderedQty: number;
    unitPrice: number;
  }[];
}

interface ProductCatalogItem {
  id: string;
  code: string;
  name: string;
}

interface PurchasingViewProps {
  userRole?: string;
}

export function PurchasingView({ userRole }: PurchasingViewProps) {
  const normRole = (userRole || '').toUpperCase();
  const isManager = !userRole || normRole.includes('MANAGER') || normRole.includes('QUẢN LÝ');
  const isAccountant = normRole.includes('ACCOUNTANT') || normRole.includes('KẾ TOÁN');
  const canApprovePO = isManager || isAccountant;
  const [activeTab, setActiveTab] = useState<'polist' | 'createpo' | 'suppliers' | 'calendar'>('polist');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [productsCatalog, setProductsCatalog] = useState<ProductCatalogItem[]>([]);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create PO Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [deliverySlot, setDeliverySlot] = useState<string>('08:00 - 10:00');
  const [poLines, setPoLines] = useState<POLine[]>([
    { skuId: '', orderedQty: 500, unitPrice: 240000 }
  ]);

  // Modal Supplier Form State
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [selectedPoForModal, setSelectedPoForModal] = useState<PurchaseOrder | null>(null);
  const [newSupplierCode, setNewSupplierCode] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierLeadTime, setNewSupplierLeadTime] = useState<number>(2);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const fetchSuppliers = async () => {
    try {
      const data = await apiGet<Supplier[]>('/suppliers');
      setSuppliers(data || []);
      if (data && data.length > 0 && !selectedSupplierId && data[0]?.id) {
        setSelectedSupplierId(data[0].id);
      }
    } catch (err: any) {
      console.error('Lỗi lấy danh sách NCC:', err);
    }
  };

  const fetchOrders = async () => {
    try {
      const data = await apiGet<PurchaseOrder[]>('/purchase-orders');
      setOrders(data || []);
    } catch (err: any) {
      console.error('Lỗi lấy danh sách PO:', err);
    }
  };

  const fetchProductsCatalog = async () => {
    try {
      // Mock catalog list if endpoint not exists
      setProductsCatalog([
        { id: 'p1', code: 'SKU-BIA-333', name: 'Bia 333 Lon 330ml (Khay 24 lon)' },
        { id: 'p2', code: 'SKU-SAIGON-SPECIAL', name: 'Bia Saigon Special Chai (Két 24 chai)' },
        { id: 'p3', code: 'SKU-HEINEKEN-CAN', name: 'Bia Heineken Lon 330ml (Khay 24 lon)' },
        { id: 'p4', code: 'SKU-TIGER-CAN', name: 'Bia Tiger Lon 330ml (Khay 24 lon)' },
        { id: 'p5', code: 'SKU-MIRINDA-CAN', name: 'Nước Ngọt Mirinda Cam (Khay 24 lon)' },
        { id: 'p6', code: 'SKU-PEPSI-CAN', name: 'Nước Ngọt Pepsi Cola (Khay 24 lon)' }
      ]);
    } catch (err) {
      console.error('Lỗi catalog:', err);
    }
  };

  useEffect(() => {
    fetchSuppliers();
    fetchOrders();
    fetchProductsCatalog();
  }, []);

  const handleApprovePO = async (orderId: string) => {
    // 1. Update React state immediately for instant UI feedback
    setOrders(prev => prev.map(o => (o.id === orderId || o.poCode === orderId) ? { ...o, status: 'APPROVED' } : o));
    if (selectedPoForModal && (selectedPoForModal.id === orderId || selectedPoForModal.poCode === orderId)) {
      setSelectedPoForModal({ ...selectedPoForModal, status: 'APPROVED' });
    }
    setAlertMessage({ type: 'success', text: `🟢 ĐÃ PHÊ DUYỆT THÀNH CÔNG: Đơn PO ${orderId} đã chuyển trạng thái sang APPROVED (AVAILABLE AT GATE).` });

    // 2. Persist to PostgreSQL database via API
    try {
      await apiPost(`/purchase-orders/${orderId}/approve-public`, { actorName: userRole });
      fetchOrders();
    } catch (err: any) {
      console.error('API Approve Error:', err);
    }
  };

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

  const handleAddLine = () => {
    setPoLines([...poLines, { skuId: '', orderedQty: 200, unitPrice: 240000 }]);
  };

  const handleRemoveLine = (index: number) => {
    if (poLines.length > 1) {
      setPoLines(poLines.filter((_, i) => i !== index));
    }
  };

  const handleLineChange = (index: number, field: keyof POLine, value: any) => {
    const cur = poLines[index];
    if (!cur) return;
    const updatedLine: POLine = {
      skuId: cur.skuId,
      orderedQty: cur.orderedQty,
      unitPrice: cur.unitPrice,
      [field]: value
    };
    const updated = [...poLines];
    updated[index] = updatedLine;
    setPoLines(updated);
  };

  const handleCreatePOSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      setAlertMessage({ type: 'error', text: 'Vui lòng chọn Nhà Cung Cấp' });
      return;
    }

    const validLines = poLines.filter(l => l.orderedQty > 0);
    if (validLines.length === 0) {
      setAlertMessage({ type: 'error', text: 'Vui lòng chọn ít nhất 1 dòng sản phẩm' });
      return;
    }

    try {
      const defaultSkuId = productsCatalog[0]?.id || 'p1';
      const res = await apiPost<any>('/purchase-orders/create-public', {
        supplierId: selectedSupplierId,
        deliverySlot,
        lines: validLines.map(l => ({
          skuId: l.skuId || defaultSkuId,
          orderedQty: Number(l.orderedQty),
          unitPrice: Number(l.unitPrice)
        }))
      });

      setAlertMessage({ type: 'success', text: `Tạo thành công Đơn PO [${res.poCode}]! Đã phê duyệt và chuyển dữ liệu sang Cổng & Trạm Cân.` });
      fetchOrders();
      setActiveTab('polist');
    } catch (err: any) {
      setAlertMessage({ type: 'error', text: err.message || 'Lỗi tạo đơn PO' });
    }
  };

  const handleCreateSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName || !newSupplierCode) {
      setAlertMessage({ type: 'error', text: 'Vui lòng nhập Mã và Tên Nhà Cung Cấp' });
      return;
    }

    try {
      await apiPost('/suppliers', {
        code: newSupplierCode,
        name: newSupplierName,
        phone: newSupplierPhone,
        standardLeadTimeDays: newSupplierLeadTime,
        productIds: selectedProductIds
      });

      setAlertMessage({ type: 'success', text: `Đã thêm thành công Nhà Cung Cấp [${newSupplierName}]` });
      setIsSupplierModalOpen(false);
      setNewSupplierCode('');
      setNewSupplierName('');
      setNewSupplierPhone('');
      setSelectedProductIds([]);
      fetchSuppliers();
    } catch (err: any) {
      setAlertMessage({ type: 'error', text: err.message || 'Lỗi thêm NCC' });
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa Nhà Cung Cấp này không?')) {
      try {
        await apiPost(`/suppliers/${id}/delete`, {});
        setAlertMessage({ type: 'success', text: 'Đã xóa Nhà Cung Cấp' });
        fetchSuppliers();
      } catch (err: any) {
        setAlertMessage({ type: 'error', text: err.message || 'Lỗi xóa NCC' });
      }
    }
  };

  const calculatedDeliveryDate = () => {
    const days = selectedSupplier?.standardLeadTimeDays || 2;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('vi-VN');
  };

  const totalCases = poLines.reduce((acc, curr) => acc + Number(curr.orderedQty || 0), 0);

  const handleCompletePO = async (poId: string) => {
    if (!window.confirm('🔒 Bạn có chắc chắn muốn chốt HOÀN THÀNH ĐƠN PO NÀY? Đơn PO sẽ đổi trạng thái thành COMPLETED và tự động ẨN khỏi Trạm Cân Cổng.')) {
      return;
    }
    try {
      await apiPost(`/purchase-orders/${poId}/complete`, {});
      setAlertMessage({
        type: 'success',
        text: '🔒 ĐÃ HOÀN THÀNH ĐƠN PO THÀNH CÔNG! Đơn đã được đóng và tự động ẩn khỏi danh sách chọn xe tại Cổng Trạm Cân.'
      });
      fetchOrders();
    } catch (err: any) {
      setAlertMessage({
        type: 'error',
        text: err.message || 'Lỗi khi chốt hoàn thành đơn PO'
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-lg border border-indigo-900/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-400 text-3xl">shopping_cart</span>
              <h1 className="text-2xl font-bold tracking-tight">Quản Lý Đơn Đặt Hàng Mua (PO) &amp; Nhà Cung Cấp</h1>
            </div>
            <p className="text-slate-300 text-sm mt-1">
              Lập đơn mua hàng nguyên thùng/két, tự động tính Lead Time giao hàng, đăng ký Slot xe giao &amp; khớp dữ liệu Trạm Cân Cổng.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSupplierModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2.5 rounded-xl shadow transition-all flex items-center gap-1.5 text-sm"
            >
              <span className="material-symbols-outlined text-lg">add_business</span>
              + Thêm Nhà Cung Cấp Mới
            </button>
            <button
              onClick={() => setActiveTab('createpo')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl shadow transition-all flex items-center gap-1.5 text-sm"
            >
              <span className="material-symbols-outlined text-lg">add_shopping_cart</span>
              + Lập Đơn PO Mới
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mt-6 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('polist')}
            className={`px-4 py-2 text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'polist' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-lg">list_alt</span>
            1. Danh Sách Đơn PO ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('createpo')}
            className={`px-4 py-2 text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'createpo' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-lg">edit_document</span>
            2. Lập Đơn PO Mới (Multi-SKU)
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`px-4 py-2 text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'suppliers' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-lg">storefront</span>
            3. Quản Lý Nhà Cung Cấp ({suppliers.length})
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2 text-sm font-bold rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'calendar' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-lg">calendar_month</span>
            4. Lịch Giao Hàng Bãi Kho
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {alertMessage && (
        <div className={`p-4 rounded-xl flex items-center justify-between border ${
          alertMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="material-symbols-outlined">
              {alertMessage.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{alertMessage.text}</span>
          </div>
          <button onClick={() => setAlertMessage(null)} className="text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* TAB 1: PO LIST */}
      {activeTab === 'polist' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b pb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-600">receipt_long</span>
              Danh Sách Đơn Đặt Hàng Mua (Purchase Orders)
            </h2>
            <span className="text-xs text-slate-500 font-semibold">
              Tự động truyền dữ liệu sang Cổng &amp; Trạm Cân W1/W2
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                <tr>
                  <th className="p-3">Mã Đơn PO</th>
                  <th className="p-3">Nhà Cung Cấp</th>
                  <th className="p-3">Người Lập Đơn</th>
                  <th className="p-3">Lead Time</th>
                  <th className="p-3">Ngày Đặt</th>
                  <th className="p-3">Ngày Giao Dự Kiến</th>
                  <th className="p-3">Trạng Thái</th>
                  <th className="p-3 text-right">Chi Tiết Mặt Hàng (Multi-SKU)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium text-slate-800">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      Chưa có đơn PO nào. Hãy bấm <strong>"+ Lập Đơn PO Mới"</strong> để khởi tạo.
                    </td>
                  </tr>
                ) : (
                  orders.map(order => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="p-3 font-data-mono font-bold text-indigo-700">{order.poCode}</td>
                      <td className="p-3 font-semibold text-slate-900">{order.supplierName || order.supplierCode}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <span className="material-symbols-outlined text-slate-400 text-base">person</span>
                          <span>{order.creatorName || 'Trần Văn Quản Lý (Manager)'}</span>
                        </div>
                      </td>
                      <td className="p-3 font-data-mono text-amber-700">{order.leadTimeDays || 2} ngày</td>
                      <td className="p-3 font-data-mono text-slate-600">{new Date(order.orderDate).toLocaleDateString('vi-VN')}</td>
                      <td className="p-3 font-data-mono font-bold text-emerald-700">{new Date(order.expectedDeliveryDate).toLocaleDateString('vi-VN')}</td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          order.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          order.status === 'COMPLETED' ? 'bg-blue-100 text-blue-900 border border-blue-300' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {order.status === 'APPROVED' ? '🟢 ĐÃ PHÊ DUYỆT (AVAILABLE AT GATE)' :
                           order.status === 'COMPLETED' ? '🏁 ĐÃ HOÀN THÀNH (ĐÃ ẨN KHỎI CỔNG)' : '🟡 CHỜ DUYỆT'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canApprovePO && order.status !== 'APPROVED' && order.status !== 'COMPLETED' && (
                            <button
                              onClick={() => handleApprovePO(order.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl transition-all text-xs inline-flex items-center gap-1 shadow-sm active:scale-95"
                              title="Phê duyệt đơn PO này để cho phép xe vào Cổng & Trạm Cân"
                            >
                              <span className="material-symbols-outlined text-base">check_circle</span>
                              <span>Phê Duyệt PO</span>
                            </button>
                          )}
                          {order.status === 'APPROVED' && (
                            <button
                              onClick={() => handleCompletePO(order.id)}
                              className="bg-slate-700 hover:bg-slate-800 text-white font-bold px-2.5 py-1.5 rounded-xl transition-all text-xs inline-flex items-center gap-1 shadow-sm active:scale-95"
                              title="Chốt hoàn thành đơn PO để tự động ẩn khỏi Trạm Cân Cổng"
                            >
                              <span className="material-symbols-outlined text-sm">lock</span>
                              <span>Chốt Hoàn Thành PO</span>
                            </button>
                          )}
                          <button
                            onClick={() => window.open(`/api/v1/gate/reports/po/${order.poCode}/pdf`, '_blank')}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1.5 rounded-xl transition-all text-xs inline-flex items-center gap-1 border border-indigo-200 shadow-2xs active:scale-95"
                            title="Tải/Xem Báo Cáo PDF Quyết Toán Đơn PO"
                          >
                            <span className="material-symbols-outlined text-sm text-rose-600">picture_as_pdf</span>
                            <span>Báo Cáo PDF</span>
                          </button>
                          <button
                            onClick={() => setSelectedPoForModal(order)}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 font-bold px-3 py-1.5 rounded-xl transition-all text-xs inline-flex items-center gap-1.5 shadow-sm active:scale-95"
                            title="Xem chi tiết các mặt hàng SKU đặt mua"
                          >
                            <span className="material-symbols-outlined text-base text-indigo-600">visibility</span>
                            <span>Xem Chi Tiết ({order.lines?.length || 0} SKU)</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CREATE PO FORM */}
      {activeTab === 'createpo' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 pb-3 border-b flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-600">post_add</span>
            Lập Đơn Đặt Hàng Mua Mới (Multi-SKU Purchase Order)
          </h2>

          <form onSubmit={handleCreatePOSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chọn Nhà Cung Cấp (*)</label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Code: {s.code} - Lead Time: {s.standardLeadTimeDays} ngày)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tự Động Tính Ngày Hàng Về (Lead Time)</label>
                <div className="px-3.5 py-2 rounded-xl bg-white border border-indigo-200 font-data-mono font-bold text-indigo-900 text-sm flex items-center justify-between">
                  <span>{calculatedDeliveryDate()}</span>
                  <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded font-extrabold">
                    +{selectedSupplier?.standardLeadTimeDays || 2} ngày Lead Time
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Đăng Ký Khung Giờ Xe Giao (Delivery Slot)</label>
                <select
                  value={deliverySlot}
                  onChange={(e) => setDeliverySlot(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="08:00 - 10:00">Khung 1: 08:00 - 10:00 (Buổi Sáng)</option>
                  <option value="10:00 - 12:00">Khung 2: 10:00 - 12:00 (Buổi Sáng)</option>
                  <option value="13:30 - 15:30">Khung 3: 13:30 - 15:30 (Buổi Chiều)</option>
                  <option value="15:30 - 17:30">Khung 4: 15:30 - 17:30 (Buổi Chiều)</option>
                </select>
              </div>
            </div>

            {/* PO Line Items (Multi-SKU) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-indigo-600">inventory_2</span>
                  Danh Sách Dòng Mặt Hàng (Multi-SKU Lines)
                </h3>
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1 border border-indigo-200"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  + Thêm Dòng SKU
                </button>
              </div>

              <div className="space-y-3">
                {poLines.map((line, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-slate-50/70 p-3 rounded-xl border border-slate-200">
                    <div className="md:col-span-6">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Mặt Hàng SKU (*)</label>
                      <select
                        value={line.skuId}
                        onChange={(e) => handleLineChange(index, 'skuId', e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800"
                      >
                        <option value="">-- Chọn mặt hàng từ danh mục NCC --</option>
                        {productsCatalog.map(p => (
                          <option key={p.id} value={p.id}>
                            [{p.code}] {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Số Lượng Đặt (Nguyên Thùng/Két)</label>
                      <input
                        type="number"
                        min="1"
                        value={line.orderedQty}
                        onChange={(e) => handleLineChange(index, 'orderedQty', Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 font-data-mono font-bold text-slate-900 text-xs"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Đơn Giá Mua (VNĐ)</label>
                      <input
                        type="number"
                        step="1000"
                        value={line.unitPrice}
                        onChange={(e) => handleLineChange(index, 'unitPrice', Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 font-data-mono text-slate-800 text-xs"
                      />
                    </div>

                    <div className="md:col-span-1 text-right pt-4">
                      {poLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(index)}
                          className="text-rose-600 hover:text-rose-800 p-1 rounded-lg hover:bg-rose-50"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Summary Box */}
            <div className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-200 flex items-center justify-between">
              <div className="text-xs text-slate-600 font-semibold">
                Tổng số kiện đặt: <span className="font-data-mono font-bold text-indigo-900 text-base">{totalCases.toLocaleString()}</span> thùng/két/keg.
              </div>
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl shadow-md transition-all flex items-center gap-2 text-sm"
              >
                <span className="material-symbols-outlined">send</span>
                Tạo &amp; Phê Duyệt Đơn PO (Chuyển Sang Cổng)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: SUPPLIERS MANAGEMENT */}
      {activeTab === 'suppliers' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-600">storefront</span>
                Danh Danh Mục Nhà Cung Cấp &amp; Lead Time Định Mức
              </h2>
              <p className="text-xs text-slate-500 mt-1">Quản lý danh sách các Tập đoàn &amp; Nhà cung cấp đồ uống bãi kho CITARES.</p>
            </div>

            <button
              onClick={() => setIsSupplierModalOpen(true)}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-xl shadow transition-all flex items-center gap-1.5 text-xs"
            >
              <span className="material-symbols-outlined text-base">add_business</span>
              + Thêm Nhà Cung Cấp Mới
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {suppliers.map(sup => (
              <div key={sup.id} className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3 hover:border-indigo-300 transition-all shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="bg-indigo-100 text-indigo-800 font-data-mono font-extrabold text-[10px] px-2 py-0.5 rounded uppercase">
                      {sup.code}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base mt-1">{sup.name}</h3>
                  </div>
                  <button
                    onClick={() => handleDeleteSupplier(sup.id)}
                    className="text-slate-400 hover:text-rose-600 p-1"
                    title="Xóa Nhà Cung Cấp"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div><strong className="text-slate-700">Điện thoại:</strong> {sup.phone || 'N/A'}</div>
                  <div><strong className="text-slate-700">Lead Time Tiêu Chuẩn:</strong> <span className="font-data-mono font-bold text-amber-700">{sup.standardLeadTimeDays} Ngày</span></div>
                </div>

                <div className="pt-2 border-t border-slate-200 text-xs">
                  <div className="font-bold text-slate-800 mb-1">Mặt Hàng Cung Cấp:</div>
                  <div className="flex flex-wrap gap-1">
                    {sup.products && sup.products.length > 0 ? (
                      sup.products.map(p => (
                        <span key={p.id} className="bg-white border border-slate-200 text-slate-800 text-[10px] font-semibold px-2 py-0.5 rounded">
                          {p.productName}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">Tất cả sản phẩm theo hợp đồng</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: CALENDAR */}
      {activeTab === 'calendar' && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-600">calendar_month</span>
            Sơ Đồ Tải Lịch Giao Hàng Bãi Kho (Delivery Calendar Visualizer)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
            {['08:00 - 10:00', '10:00 - 12:00', '13:30 - 15:30', '15:30 - 17:30'].map((slot, i) => (
              <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="font-bold text-indigo-900 text-xs flex items-center justify-between">
                  <span>{slot}</span>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                    Còn Trống
                  </span>
                </div>
                <div className="text-xs text-slate-500">Khả năng tiếp nhận: Max 5 xe cùng lúc tại Cửa Dock.</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL FORM: ADD NEW SUPPLIER */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-lg">
                <span className="material-symbols-outlined text-indigo-600">add_business</span>
                <span>Thêm Nhà Cung Cấp Mới</span>
              </div>
              <button onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateSupplierSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã NCC (*)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: SUP-HEINEKEN"
                    value={newSupplierCode}
                    onChange={(e) => setNewSupplierCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-data-mono font-bold text-xs uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Lead Time (Số Ngày Giao)</label>
                  <input
                    type="number"
                    min="1"
                    value={newSupplierLeadTime}
                    onChange={(e) => setNewSupplierLeadTime(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-data-mono font-bold text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên Nhà Cung Cấp (*)</label>
                <input
                  type="text"
                  required
                  placeholder="VD: Tập Đoàn Heineken Việt Nam"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số Điện Thoại Liên Hệ</label>
                <input
                  type="text"
                  placeholder="VD: 02838240200"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chọn Danh Mục Mặt Hàng Cung Cấp</label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  {productsCatalog.map(p => (
                    <label key={p.id} className="flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedProductIds.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProductIds([...selectedProductIds, p.id]);
                          } else {
                            setSelectedProductIds(selectedProductIds.filter(id => id !== p.id));
                          }
                        }}
                        className="rounded text-indigo-600"
                      />
                      <span>{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2 rounded-xl shadow transition-all flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">save</span>
                  Lưu Nhà Cung Cấp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VIEW PO DETAILS (EYE ICON CLICK) */}
      {selectedPoForModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-400 text-2xl">receipt_long</span>
                <div>
                  <h3 className="font-bold text-lg leading-tight">Chi Tiết Đơn Đặt Hàng Mua</h3>
                  <p className="text-xs text-indigo-200 font-data-mono">{selectedPoForModal.poCode}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPoForModal(null)}
                className="text-slate-400 hover:text-white bg-slate-800/60 p-1.5 rounded-full transition-all"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              {/* General Order Info Grid */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 font-medium block">Nhà Cung Cấp:</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedPoForModal.supplierName || selectedPoForModal.supplierCode}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Người Lập Đơn Hàng:</span>
                  <span className="font-bold text-indigo-900 text-sm flex items-center gap-1 mt-0.5">
                    <span className="material-symbols-outlined text-indigo-600 text-base">account_circle</span>
                    {selectedPoForModal.creatorName || 'Trần Văn Quản Lý (Manager)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Trạng Thái:</span>
                  <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    selectedPoForModal.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedPoForModal.status === 'APPROVED' ? 'ĐÃ PHÊ DUYỆT (AVAILABLE AT GATE)' : 'CHỜ DUYỆT'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Ngày Đặt Hàng:</span>
                  <span className="font-data-mono font-bold text-slate-800">{new Date(selectedPoForModal.orderDate).toLocaleDateString('vi-VN')}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Ngày Giao Dự Kiến (Lead Time {selectedPoForModal.leadTimeDays || 2} ngày):</span>
                  <span className="font-data-mono font-bold text-emerald-700">{new Date(selectedPoForModal.expectedDeliveryDate).toLocaleDateString('vi-VN')}</span>
                </div>
              </div>

              {/* Multi-SKU Items Table */}
              <div>
                <h4 className="font-bold text-sm text-slate-800 mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-indigo-600 text-base">inventory_2</span>
                  Danh Sách Các Mặt Hàng Đặt Mua (Multi-SKU Lines)
                </h4>
                <div className="border rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-indigo-50/70 text-indigo-950 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-3 w-12 text-center">STT</th>
                        <th className="p-3">Mã SKU</th>
                        <th className="p-3">Tên Mặt Hàng SKU</th>
                        <th className="p-3 text-right">Số Lượng Đặt</th>
                        <th className="p-3 text-right">Đơn Giá Dự Kiến</th>
                        <th className="p-3 text-right">Thành Tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {selectedPoForModal.lines && selectedPoForModal.lines.map((line, idx) => {
                        const qty = Number(line.orderedQty || 0);
                        const price = Number(line.unitPrice || 240000);
                        const total = qty * price;
                        return (
                          <tr key={line.id || idx} className="hover:bg-slate-50">
                            <td className="p-3 text-center text-slate-500 font-data-mono">{idx + 1}</td>
                            <td className="p-3 font-data-mono font-bold text-indigo-700">{line.skuCode || 'SKU-BEV'}</td>
                            <td className="p-3 font-semibold text-slate-900">{line.skuName || line.skuCode}</td>
                            <td className="p-3 text-right font-data-mono font-bold text-indigo-900">{qty.toLocaleString('vi-VN')} thùng</td>
                            <td className="p-3 text-right font-data-mono text-slate-600">{price.toLocaleString('vi-VN')} đ</td>
                            <td className="p-3 text-right font-data-mono font-bold text-emerald-700">{total.toLocaleString('vi-VN')} đ</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold text-slate-900 border-t">
                      <tr>
                        <td colSpan={3} className="p-3 text-right">TỔNG CỘNG:</td>
                        <td className="p-3 text-right font-data-mono text-indigo-900">
                          {selectedPoForModal.lines?.reduce((acc, curr) => acc + Number(curr.orderedQty || 0), 0).toLocaleString('vi-VN')} thùng
                        </td>
                        <td colSpan={2} className="p-3 text-right font-data-mono text-emerald-700 text-sm">
                          {selectedPoForModal.lines?.reduce((acc, curr) => acc + (Number(curr.orderedQty || 0) * Number(curr.unitPrice || 240000)), 0).toLocaleString('vi-VN')} VNĐ
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 p-4 border-t flex justify-end gap-3">
              {canApprovePO && selectedPoForModal.status !== 'APPROVED' && (
                <button
                  type="button"
                  onClick={() => handleApprovePO(selectedPoForModal.id)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-xl shadow transition-all text-xs flex items-center gap-1.5 active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  Phê Duyệt Đơn PO Này
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedPoForModal(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2 rounded-xl shadow transition-all text-xs flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">check</span>
                Đóng Hộp Thoại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
