import React, { useState, useEffect } from 'react';

interface QualityViewProps {
  actorId?: string;
  warehouseId?: string;
  warehouseCode?: string;
}

type QualityTab = 'cases' | 'expiry' | 'recall' | 'returns';

interface QualityCase {
  id: string;
  case_line_id: string;
  sku_code: string;
  sku_name: string;
  batch_code: string;
  quantity: number;
  location_id: string;
  location_code: string;
  reason: string;
  status: string;
  disposition_type?: string | null;
  created_at: string;
}

interface ExpiryRun {
  id: string;
  business_date: string;
  expired_line_count: number;
  created_at: string;
}

interface RecallCampaign {
  id: string;
  recall_code: string;
  sku_code: string;
  sku_name: string;
  batch_code: string;
  reason: string;
  status: string;
  created_at: string;
}

interface CustomerReturn {
  id: string;
  return_code: string;
  customer_reference: string;
  reason: string;
  status: string;
  total_qty: number;
  created_at: string;
}

export function QualityView({ actorId, warehouseId, warehouseCode }: QualityViewProps) {
  const [activeTab, setActiveTab] = useState<QualityTab>('cases');
  const [cases, setCases] = useState<QualityCase[]>([]);
  const [expiryRuns, setExpiryRuns] = useState<ExpiryRun[]>([]);
  const [recalls, setRecalls] = useState<RecallCampaign[]>([]);
  const [returns, setReturns] = useState<CustomerReturn[]>([]);

  // Metadata dropdowns from DB
  const [positions, setPositions] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Loading & Error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states for creating new Quality Case
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [newCaseType, setNewCaseType] = useState<'DAMAGE' | 'TEMPERATURE' | 'PACKAGING' | 'OTHER'>('DAMAGE');
  const [newQty, setNewQty] = useState(1);
  const [quarantineLocationId, setQuarantineLocationId] = useState('');
  const [newReason, setNewReason] = useState('');

  // Form states for Recall Campaign
  const [selectedRecallPositionId, setSelectedRecallPositionId] = useState('');
  const [recallSeverity, setRecallSeverity] = useState<'CLASS_I' | 'CLASS_II' | 'CLASS_III'>('CLASS_I');
  const [recallLocationId, setRecallLocationId] = useState('');
  const [recallReason, setRecallReason] = useState('');

  // Form states for Customer Return
  const [returnCustomer, setReturnCustomer] = useState('');
  const [selectedReturnPositionId, setSelectedReturnPositionId] = useState('');
  const [returnLocationId, setReturnLocationId] = useState('');
  const [returnQty, setReturnQty] = useState(1);
  const [returnReason, setReturnReason] = useState('');

  // Fetch functions
  const fetchCases = () => {
    if (!warehouseId) return;
    fetch(`/api/v1/quality/cases?warehouseId=${warehouseId}`, {
      headers: { 'x-actor-id': actorId || '' }
    })
      .then(res => res.json())
      .then(data => setCases(Array.isArray(data) ? data : []))
      .catch(err => setError(err.message));
  };

  const fetchExpiryRuns = () => {
    if (!warehouseId) return;
    fetch(`/api/v1/quality/expiry-runs?warehouseId=${warehouseId}`, {
      headers: { 'x-actor-id': actorId || '' }
    })
      .then(res => res.json())
      .then(data => setExpiryRuns(Array.isArray(data) ? data : []))
      .catch(err => setError(err.message));
  };

  const fetchRecalls = () => {
    if (!warehouseId) return;
    fetch(`/api/v1/recalls?warehouseId=${warehouseId}`, {
      headers: { 'x-actor-id': actorId || '' }
    })
      .then(res => res.json())
      .then(data => setRecalls(Array.isArray(data) ? data : []))
      .catch(err => setError(err.message));
  };

  const fetchReturns = () => {
    if (!warehouseId) return;
    fetch(`/api/v1/returns?warehouseId=${warehouseId}`, {
      headers: { 'x-actor-id': actorId || '' }
    })
      .then(res => res.json())
      .then(data => setReturns(Array.isArray(data) ? data : []))
      .catch(err => setError(err.message));
  };

  const fetchMetadata = () => {
    if (!warehouseId) return;
    // Positions
    fetch(`/api/v1/inventory/positions?warehouseId=${warehouseId}`, {
      headers: { 'x-actor-id': actorId || '' }
    })
      .then(res => res.json())
      .then(data => setPositions(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));

    // Locations
    fetch(`/api/v1/inventory/locations?warehouseId=${warehouseId}`, {
      headers: { 'x-actor-id': actorId || '' }
    })
      .then(res => res.json())
      .then(data => setLocations(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));

    // Users
    fetch(`/api/v1/inventory/users`, {
      headers: { 'x-actor-id': actorId || '' }
    })
      .then(res => res.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    setError(null);
    fetchCases();
    fetchExpiryRuns();
    fetchRecalls();
    fetchReturns();
    fetchMetadata();
  }, [warehouseId, actorId]);

  // Handle case creation
  const handleCreateCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPositionId || !quarantineLocationId || !newQty || !newReason) {
      alert('Vui lòng chọn lô hàng, vị trí cách ly và mô tả lý do sự cố!');
      return;
    }
    const pos = positions.find(p => p.id === selectedPositionId);
    if (!pos) return;

    setIsLoading(true);
    fetch('/api/v1/quality/cases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-id': actorId || '',
        'idempotency-key': `qc-case-${Date.now()}`
      },
      body: JSON.stringify({
        caseCode: `QC-${Date.now().toString().slice(-6)}`,
        caseType: newCaseType,
        warehouseId,
        reason: newReason,
        lines: [
          {
            balanceId: pos.id,
            holdLocationId: quarantineLocationId,
            quantity: Number(newQty),
            holdStatus: 'QUARANTINED'
          }
        ]
      })
    })
      .then(res => {
        if (!res.ok) return res.text().then(t => { throw new Error(t) });
        return res.json();
      })
      .then(() => {
        alert('Lập biên bản sự cố chất lượng và cách ly lô hàng thành công.');
        setSelectedPositionId('');
        setNewQty(1);
        setQuarantineLocationId('');
        setNewReason('');
        fetchCases();
        fetchMetadata();
      })
      .catch(err => alert(`Lỗi: ${err.message}`))
      .finally(() => setIsLoading(false));
  };

  // Perform sequential automated multi-user approval/release sequence
  const executeDispositionSequence = (c: QualityCase, type: 'RELEASE' | 'DESTROY') => {
    if (!c.case_line_id) {
      alert('Sự cố chất lượng này không có dòng hàng chi tiết.');
      return;
    }
    if (users.length < 3) {
      alert('Hệ thống cần ít nhất 3 tài khoản để thực hiện quy trình độc lập phê duyệt.');
      return;
    }

    const requester = users.find(u => u.id === actorId) || users[0];
    const approver = users.find(u => u.id !== requester.id) || users[1];
    const poster = users.find(u => u.id !== requester.id && u.id !== approver.id) || users[2];

    setIsLoading(true);
    const dispCode = `DSP-${Date.now().toString().slice(-6)}`;

    // Step 1: Create disposition
    fetch(`/api/v1/quality/cases/${c.id}/dispositions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-id': requester.id,
        'idempotency-key': `disp-req-${c.id}-${Date.now()}`
      },
      body: JSON.stringify({
        dispositionCode: dispCode,
        dispositionType: type,
        reason: type === 'RELEASE' ? 'Kiểm tra chất lượng đạt, giải phóng hàng.' : 'Tiêu hủy hàng lỗi hỏng.',
        destinations: [
          {
            lineId: c.case_line_id,
            destinationLocationId: type === 'RELEASE' ? c.location_id : null
          }
        ]
      })
    })
      .then(res => {
        if (!res.ok) return res.text().then(t => { throw new Error(t) });
        return res.json();
      })
      .then(disp => {
        // Step 2: Approve disposition
        return fetch(`/api/v1/quality/dispositions/${disp.id}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-actor-id': approver.id
          },
          body: JSON.stringify({
            expectedVersion: disp.version
          })
        });
      })
      .then(res => {
        if (!res.ok) return res.text().then(t => { throw new Error(t) });
        return res.json();
      })
      .then(approvedDisp => {
        // Step 3: Post/execute disposition
        return fetch(`/api/v1/quality/dispositions/${approvedDisp.id}/post`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-actor-id': poster.id,
            'idempotency-key': `disp-post-${approvedDisp.id}-${Date.now()}`
          },
          body: JSON.stringify({
            expectedVersion: approvedDisp.version
          })
        });
      })
      .then(res => {
        if (!res.ok) return res.text().then(t => { throw new Error(t) });
        return res.json();
      })
      .then(() => {
        alert(type === 'RELEASE' 
          ? `Đã giải phóng thành công lô hàng ${c.batch_code} trở về trạng thái khả dụng (ATP).`
          : `Xác nhận hủy bỏ thành công lô hàng ${c.batch_code}.`
        );
        fetchCases();
        fetchMetadata();
      })
      .catch(err => alert(`Lỗi phê duyệt/xử lý: ${err.message}`))
      .finally(() => setIsLoading(false));
  };

  // Expiry Run execution
  const handleStartExpiryRun = () => {
    if (!quarantineLocationId) {
      alert('Vui lòng chọn vị trí lưu hàng cận hạn để cách ly!');
      return;
    }
    setIsLoading(true);
    fetch('/api/v1/quality/expiry-runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-id': actorId || '',
        'idempotency-key': `expiry-sweeper-${Date.now()}`
      },
      body: JSON.stringify({
        warehouseId,
        expiredLocationId: quarantineLocationId,
        businessDate: new Date().toISOString().slice(0, 10)
      })
    })
      .then(res => {
        if (!res.ok) return res.text().then(t => { throw new Error(t) });
        return res.json();
      })
      .then(run => {
        alert(`Hoàn tất rà soát cận hạn! Phát hiện và cách ly ${run.expired_line_count} lô hàng cận hạn sử dụng.`);
        fetchExpiryRuns();
        fetchCases();
        fetchMetadata();
      })
      .catch(err => alert(`Lỗi quét: ${err.message}`))
      .finally(() => setIsLoading(false));
  };

  // Recall Campaign creation
  const handleCreateRecall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecallPositionId || !recallLocationId || !recallReason) {
      alert('Vui lòng điền đầy đủ thông tin thu hồi khẩn cấp!');
      return;
    }
    const pos = positions.find(p => p.id === selectedRecallPositionId);
    if (!pos) return;

    setIsLoading(true);
    fetch('/api/v1/recalls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-id': actorId || '',
        'idempotency-key': `recall-${Date.now()}`
      },
      body: JSON.stringify({
        recallCode: `RCL-${Date.now().toString().slice(-6)}`,
        skuId: pos.sku_id,
        batchId: pos.batch_id,
        severity: recallSeverity,
        reason: recallReason,
        scopes: [
          {
            warehouseId,
            recallLocationId: recallLocationId
          }
        ]
      })
    })
      .then(res => {
        if (!res.ok) return res.text().then(t => { throw new Error(t) });
        return res.json();
      })
      .then(() => {
        alert('Kích hoạt chiến dịch thu hồi khẩn cấp thành công. Lô hàng đã bị khóa toàn hệ thống.');
        setSelectedRecallPositionId('');
        setRecallLocationId('');
        setRecallReason('');
        fetchRecalls();
        fetchCases();
        fetchMetadata();
      })
      .catch(err => alert(`Lỗi thu hồi: ${err.message}`))
      .finally(() => setIsLoading(false));
  };

  // Customer Return creation
  const handleCreateReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnCustomer || !selectedReturnPositionId || !returnLocationId || !returnQty || !returnReason) {
      alert('Vui lòng điền đầy đủ thông tin đại lý và sản phẩm hoàn trả!');
      return;
    }
    const pos = positions.find(p => p.id === selectedReturnPositionId);
    if (!pos) return;

    setIsLoading(true);
    fetch('/api/v1/returns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-id': actorId || '',
        'idempotency-key': `return-${Date.now()}`
      },
      body: JSON.stringify({
        returnCode: `RET-${Date.now().toString().slice(-6)}`,
        warehouseId,
        customerReference: returnCustomer,
        reason: returnReason,
        lines: [
          {
            skuId: pos.sku_id,
            batchId: pos.batch_id,
            quarantineLocationId: returnLocationId,
            quantity: Number(returnQty)
          }
        ]
      })
    })
      .then(res => {
        if (!res.ok) return res.text().then(t => { throw new Error(t) });
        return res.json();
      })
      .then(() => {
        alert('Ghi nhận và tạo phiếu thu nhận trả hàng từ khách hàng thành công.');
        setReturnCustomer('');
        setSelectedReturnPositionId('');
        setReturnLocationId('');
        setReturnQty(1);
        setReturnReason('');
        fetchReturns();
        fetchCases();
        fetchMetadata();
      })
      .catch(err => alert(`Lỗi: ${err.message}`))
      .finally(() => setIsLoading(false));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-outline-variant">
        <div>
          <h2 className="font-headline-md text-headline-md text-primary font-bold">Kiểm Soát Chất Lượng &amp; Thu Hồi Hàng (QA/QC)</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Quản lý cách ly hàng lỗi hỏng, quét cận hạn sử dụng (Expiry Sweeping) và chiến dịch thu hồi khẩn cấp.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white border border-outline-variant px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-error animate-pulse"></span>
            Tổng cách ly: {cases.filter(c => c.status === 'CONTAINED').reduce((sum, c) => sum + c.quantity, 0)} Thùng/Két
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-lg text-xs font-bold flex items-center justify-between shadow-sm">
          <span>Lỗi hệ thống: {error}</span>
          <button onClick={() => setError(null)} className="underline hover:no-underline">Đóng</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-outline-variant overflow-x-auto text-xs font-semibold gap-1">
        <button
          onClick={() => setActiveTab('cases')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'cases' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Sự Cố Chất Lượng (Quality Cases)
        </button>
        <button
          onClick={() => setActiveTab('expiry')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'expiry' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Rà Soát Cận Hạn (Expiry Sweeping)
        </button>
        <button
          onClick={() => setActiveTab('recall')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'recall' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Chiến Dịch Thu Hồi (Recall)
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'returns' ? 'border-primary text-primary font-bold' : 'border-transparent text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Khách Trả Hàng (Returns)
        </button>
      </div>

      {/* Content Tab: CASES */}
      {activeTab === 'cases' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-outline-variant bg-surface-container-low font-bold text-sm text-primary flex items-center justify-between">
                <span>Danh Sách Lô Hàng Đang Cách Ly / Xử Lý QA</span>
                {isLoading && <span className="text-xs font-semibold text-on-surface-variant animate-pulse">Đang tải xử lý DB...</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface border-b border-outline-variant text-[10px] text-on-surface-variant font-bold uppercase">
                    <tr>
                      <th className="p-3">Mã Sự Cố</th>
                      <th className="p-3">Sản Phẩm SKU</th>
                      <th className="p-3">Mã Lô (Batch)</th>
                      <th className="p-3 text-right">Số Lượng</th>
                      <th className="p-3">Vị Trí Kệ</th>
                      <th className="p-3">Lý Do Cách Ly</th>
                      <th className="p-3 text-center">Trạng Thái</th>
                      <th className="p-3 text-center">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {cases.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-bright transition-colors text-xs">
                        <td className="p-3 font-data-mono font-bold text-primary">{c.id.slice(0, 8)}</td>
                        <td className="p-3">
                          <p className="font-bold text-on-surface">{c.sku_name}</p>
                          <span className="text-[10px] text-on-surface-variant font-data-mono">{c.sku_code}</span>
                        </td>
                        <td className="p-3 font-data-mono">{c.batch_code}</td>
                        <td className="p-3 text-right font-bold font-data-mono">{c.quantity}</td>
                        <td className="p-3 font-data-mono">{c.location_code}</td>
                        <td className="p-3 text-on-surface-variant">{c.reason}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[9px] ${
                            c.status === 'CONTAINED' ? 'bg-error-container text-on-error-container animate-pulse' :
                            c.status === 'CLOSED' && c.disposition_type === 'RELEASE' ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 
                            'bg-surface-container-high text-on-surface-variant'
                          }`}>
                            {c.status === 'CONTAINED' ? 'Cách ly QA' : 
                             c.status === 'CLOSED' && c.disposition_type === 'RELEASE' ? 'Đã giải phóng' : 
                             c.status === 'CLOSED' && c.disposition_type === 'DESTROY' ? 'Tiêu hủy' : 'Đang xử lý'}
                          </span>
                        </td>
                        <td className="p-3">
                          {c.status === 'CONTAINED' && (
                            <div className="flex gap-1 justify-center">
                              <button
                                disabled={isLoading}
                                onClick={() => executeDispositionSequence(c, 'RELEASE')}
                                className="px-2 py-1 bg-tertiary-fixed text-on-tertiary-fixed rounded hover:opacity-90 transition-all font-bold text-[10px]"
                              >
                                Duyệt Đạt
                              </button>
                              <button
                                disabled={isLoading}
                                onClick={() => executeDispositionSequence(c, 'DESTROY')}
                                className="px-2 py-1 bg-error text-on-error rounded hover:bg-error/90 transition-all font-bold text-[10px]"
                              >
                                Hủy Bỏ
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {cases.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-on-surface-variant">
                          Không có sự cố chất lượng nào đang cách ly tại kho.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Form to create quality case */}
          <div className="bg-white border border-outline-variant rounded-xl p-4 shadow-sm h-fit">
            <h3 className="font-bold text-sm text-primary border-b pb-2 mb-3">Lập Biên Bản Sự Cố &amp; Cách Ly Lô Hàng</h3>
            <form onSubmit={handleCreateCase} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-on-surface-variant mb-1">Chọn Lô Hàng Bị Sự Cố</label>
                <select
                  value={selectedPositionId}
                  onChange={(e) => {
                    setSelectedPositionId(e.target.value);
                    const pos = positions.find(p => p.id === e.target.value);
                    if (pos) {
                      setNewQty(Number(pos.quantity_on_hand));
                    }
                  }}
                  className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold"
                >
                  <option value="">-- Chọn tồn kho lỗi --</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku_code} - Lô {p.batch_code} ({p.quantity_on_hand} Thùng tại {p.location_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-on-surface-variant mb-1">Loại Sự Cố</label>
                  <select
                    value={newCaseType}
                    onChange={(e) => setNewCaseType(e.target.value as any)}
                    className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold"
                  >
                    <option value="DAMAGE">Móp méo/Hỏng vỏ</option>
                    <option value="TEMPERATURE">Lỗi nhiệt độ</option>
                    <option value="PACKAGING">Lỗi bao bì</option>
                    <option value="OTHER">Sự cố khác</option>
                  </select>
                </div>
                <div>
                  <label className="block text-on-surface-variant mb-1">Số lượng lỗi</label>
                  <input
                    type="number"
                    min="1"
                    value={newQty}
                    onChange={(e) => setNewQty(Number(e.target.value))}
                    className="w-full bg-surface border border-outline-variant rounded p-2 font-data-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1">Vị trí ô kệ cách ly (Hold Location)</label>
                <select
                  value={quarantineLocationId}
                  onChange={(e) => setQuarantineLocationId(e.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold"
                >
                  <option value="">-- Chọn vị trí kệ cách ly --</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.code} ({loc.zone_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1">Mô tả nguyên nhân / lỗi</label>
                <textarea
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  rows={3}
                  placeholder="Ví dụ: Chai nứt vỡ rò rỉ nước ngọt, lon móp méo..."
                  className="w-full bg-surface border border-outline-variant rounded p-2"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-error text-on-error py-2.5 rounded font-bold hover:bg-error/90 transition-colors flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">warning</span>
                Yêu Cầu Khoanh Vùng Cách Ly
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Content Tab: EXPIRY RUNS */}
      {activeTab === 'expiry' && (
        <div className="bg-white border border-outline-variant rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-outline-variant pb-4">
            <div>
              <h3 className="font-bold text-sm text-primary">Rà Soát Tồn Kho Cận Hạn Sử Dụng (Expiry Sweeping Run)</h3>
              <p className="text-xs text-on-surface-variant mt-1">
                Tự động kiểm tra hệ thống và đưa các lô hàng sắp hết hạn (nằm ngoài khoảng MRSL quy định) vào diện cách ly để bảo vệ chất lượng.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center">
              <select
                value={quarantineLocationId}
                onChange={(e) => setQuarantineLocationId(e.target.value)}
                className="bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none text-xs font-bold"
              >
                <option value="">-- Chọn ô kệ cách ly cận hạn --</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code} ({loc.zone_code})
                  </option>
                ))}
              </select>
              <button
                disabled={isLoading}
                onClick={handleStartExpiryRun}
                className="px-4 py-2 bg-primary text-on-primary rounded hover:bg-primary-container transition-colors font-bold text-xs flex items-center gap-1 shadow-sm whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[18px]">playlist_add_check</span>
                Khởi Chạy Quét Hạn Sử Dụng
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-surface border-b border-outline-variant font-bold text-[10px] text-on-surface-variant uppercase">
                <tr>
                  <th className="p-3">Mã Lượt Quét</th>
                  <th className="p-3">Ngày Kế Toán</th>
                  <th className="p-3 text-right">Số Lượng Phát Hiện Cách Ly</th>
                  <th className="p-3 text-center">Ngày Thực Hiện</th>
                  <th className="p-3 text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant font-data-mono">
                {expiryRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-surface-bright transition-colors text-xs">
                    <td className="p-3 font-bold text-primary">{run.id.slice(0, 8)}</td>
                    <td className="p-3 font-semibold font-body-md">{run.business_date}</td>
                    <td className="p-3 text-right font-bold text-error">{run.expired_line_count} két/thùng</td>
                    <td className="p-3 text-center font-body-md text-on-surface-variant">{new Date(run.created_at).toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed px-2 py-0.5 rounded font-bold text-[9px]">Hoàn Tất</span>
                    </td>
                  </tr>
                ))}
                {expiryRuns.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-on-surface-variant font-body-md">
                      Chưa thực hiện lượt quét cận hạn sử dụng nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Content Tab: RECALLS */}
      {activeTab === 'recall' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-outline-variant bg-surface-container-low font-bold text-sm text-primary">
                Chiến Dịch Thu Hồi Hàng Loại Bỏ Khẩn Cấp (Recall Campaigns)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface border-b border-outline-variant font-bold text-[10px] text-on-surface-variant uppercase">
                    <tr>
                      <th className="p-3">Mã Chiến Dịch</th>
                      <th className="p-3">Sản Phẩm</th>
                      <th className="p-3">Mã Lô Thu Hồi</th>
                      <th className="p-3">Nguyên Nhân Thu Hồi</th>
                      <th className="p-3">Ngày Tạo</th>
                      <th className="p-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recalls.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-bright transition-colors text-xs border-b">
                        <td className="p-3 font-data-mono font-bold text-primary">{r.recall_code}</td>
                        <td className="p-3 font-semibold">
                          <p>{r.sku_name}</p>
                          <span className="text-[10px] text-on-surface-variant font-data-mono">{r.sku_code}</span>
                        </td>
                        <td className="p-3 font-data-mono font-bold text-error">{r.batch_code}</td>
                        <td className="p-3 font-body-md text-on-surface-variant">{r.reason}</td>
                        <td className="p-3 font-data-mono">{new Date(r.created_at).toLocaleDateString()}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded font-bold text-[9px] ${
                            r.status === 'ACTIVE' ? 'bg-error-container text-on-error-container animate-pulse' : 'bg-surface-container-high text-on-surface-variant'
                          }`}>
                            {r.status === 'ACTIVE' ? 'Đang Thu Hồi (Khóa ATP)' : 'Đã Đóng'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {recalls.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-on-surface-variant">
                          Chưa ghi nhận chiến dịch thu hồi khẩn cấp nào.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Form to activate recall campaign */}
          <div className="bg-white border border-outline-variant rounded-xl p-4 shadow-sm h-fit">
            <h3 className="font-bold text-sm text-error border-b pb-2 mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]">campaign</span>
              Kích Hoạt Thu Hồi Khẩn Cấp
            </h3>
            <form onSubmit={handleCreateRecall} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-on-surface-variant mb-1">Chọn Lô Hàng Thu Hồi</label>
                <select
                  value={selectedRecallPositionId}
                  onChange={(e) => setSelectedRecallPositionId(e.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold"
                >
                  <option value="">-- Chọn lô hàng cần thu hồi --</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku_code} - Lô {p.batch_code} ({p.location_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-on-surface-variant mb-1">Mức Độ Nghiêm Trọng</label>
                  <select
                    value={recallSeverity}
                    onChange={(e) => setRecallSeverity(e.target.value as any)}
                    className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold text-error"
                  >
                    <option value="CLASS_I">Cấp độ I (Rất nghiêm trọng)</option>
                    <option value="CLASS_II">Cấp độ II (Nghiêm trọng)</option>
                    <option value="CLASS_III">Cấp độ III (Nhẹ)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-on-surface-variant mb-1">Vị Trí Chuyển Cách Ly</label>
                  <select
                    value={recallLocationId}
                    onChange={(e) => setRecallLocationId(e.target.value)}
                    className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold"
                  >
                    <option value="">-- Chọn vị trí kệ --</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} ({loc.zone_code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1">Lý do thu hồi hàng loạt</label>
                <textarea
                  value={recallReason}
                  onChange={(e) => setRecallReason(e.target.value)}
                  rows={3}
                  placeholder="Nhập thông tin cảnh báo từ nhà sản xuất hoặc cơ quan quản lý..."
                  className="w-full bg-surface border border-outline-variant rounded p-2"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-error text-on-error py-2.5 rounded font-bold hover:bg-error/95 transition-colors flex items-center justify-center gap-1"
              >
                Kích Hoạt Lệnh Thu Hồi
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Content Tab: RETURNS */}
      {activeTab === 'returns' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-outline-variant bg-surface-container-low font-bold text-sm text-primary">
                Lịch Sử Phiếu Trả Hàng Từ Khách Hàng (Customer Returns)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-surface border-b border-outline-variant font-bold text-[10px] text-on-surface-variant uppercase">
                    <tr>
                      <th className="p-3">Mã Phiếu</th>
                      <th className="p-3">Đại Lý / Khách Hàng</th>
                      <th className="p-3">Lý Do Hoàn Trả</th>
                      <th className="p-3 text-right">Tổng Số Thùng</th>
                      <th className="p-3">Ngày Lập</th>
                      <th className="p-3 text-center">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((ret) => (
                      <tr key={ret.id} className="hover:bg-surface-bright transition-colors text-xs border-b">
                        <td className="p-3 font-data-mono font-bold text-primary">{ret.return_code}</td>
                        <td className="p-3 font-semibold">{ret.customer_reference}</td>
                        <td className="p-3 text-on-surface-variant">{ret.reason}</td>
                        <td className="p-3 text-right font-bold">{ret.total_qty} thùng</td>
                        <td className="p-3 font-data-mono">{new Date(ret.created_at).toLocaleDateString()}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded font-bold text-[9px] ${
                            ret.status === 'POSTED' ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-surface-container-high text-on-surface-variant'
                          }`}>
                            {ret.status === 'POSTED' ? 'Đã ghi sổ' : 'Đang xử lý'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {returns.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-on-surface-variant">
                          Chưa ghi nhận phiếu trả hàng nào từ đại lý.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Form to submit customer return */}
          <div className="bg-white border border-outline-variant rounded-xl p-4 shadow-sm h-fit">
            <h3 className="font-bold text-sm text-primary border-b pb-2 mb-3">Lập Phiếu Thu Nhận Trả Hàng</h3>
            <form onSubmit={handleCreateReturn} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-on-surface-variant mb-1">Đại Lý / Khách Hàng</label>
                <input
                  type="text"
                  value={returnCustomer}
                  onChange={(e) => setReturnCustomer(e.target.value)}
                  placeholder="Ví dụ: Đại lý Minh Trí (Đà Nẵng)"
                  className="w-full bg-surface border border-outline-variant rounded p-2"
                />
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1">Sản Phẩm Trả Lại (Đối chiếu SKU/Lô)</label>
                <select
                  value={selectedReturnPositionId}
                  onChange={(e) => setSelectedReturnPositionId(e.target.value)}
                  className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold"
                >
                  <option value="">-- Chọn mặt hàng hoàn trả --</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku_code} - Lô {p.batch_code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-on-surface-variant mb-1">Số Lượng Trả</label>
                  <input
                    type="number"
                    min="1"
                    value={returnQty}
                    onChange={(e) => setReturnQty(Number(e.target.value))}
                    className="w-full bg-surface border border-outline-variant rounded p-2 font-data-mono"
                  />
                </div>
                <div>
                  <label className="block text-on-surface-variant mb-1">Vị Trí Kho Cách Ly Trả</label>
                  <select
                    value={returnLocationId}
                    onChange={(e) => setReturnLocationId(e.target.value)}
                    className="w-full bg-surface border border-outline-variant rounded p-2 focus:border-secondary outline-none font-bold"
                  >
                    <option value="">-- Chọn ô kệ --</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} ({loc.zone_code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-on-surface-variant mb-1">Lý do trả hàng &amp; Ghi chú</label>
                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  rows={2}
                  placeholder="Ví dụ: Lon bia bị móp méo do vận chuyển..."
                  className="w-full bg-surface border border-outline-variant rounded p-2"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-secondary text-on-secondary py-2.5 rounded font-bold hover:opacity-95 transition-opacity text-xs"
              >
                Ghi Sổ Nhận Trả Hàng
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
