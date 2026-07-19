import { useEffect, useState } from 'react';

type HealthState = 'loading' | 'online' | 'offline';
type JsonRecord = Record<string, unknown>;

function commandId(): string {
  return crypto.randomUUID();
}

export function App() {
  const [health, setHealth] = useState<HealthState>('loading');
  const [busy, setBusy] = useState(false);
  const [actorId, setActorId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [issueCode, setIssueCode] = useState(`IR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-001`);
  const [salesChannel, setSalesChannel] = useState('WHOLESALE');
  const [skuId, setSkuId] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [allowPartial, setAllowPartial] = useState(true);
  const [issueRequestId, setIssueRequestId] = useState('');
  const [issueVersion, setIssueVersion] = useState(1);
  const [pickTaskId, setPickTaskId] = useState('');
  const [pickTaskVersion, setPickTaskVersion] = useState(1);
  const [allocationId, setAllocationId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [pickQuantity, setPickQuantity] = useState(1);
  const [phase7Path, setPhase7Path] = useState('/transfers');
  const [phase7Body, setPhase7Body] = useState('{\n  "expectedVersion": 1\n}');
  const [result, setResult] = useState('Chưa có thao tác.');

  useEffect(() => {
    fetch('/api/v1/health')
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable');
        setHealth('online');
      })
      .catch(() => setHealth('offline'));
  }, []);

  async function callApi(path: string, body?: JsonRecord, method: 'GET' | 'POST' = 'POST'): Promise<JsonRecord> {
    if (!actorId.trim()) throw new Error('Nhập Actor ID trước khi thao tác.');
    setBusy(true);
    try {
      const response = await fetch(`/api/v1${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Id': actorId.trim(),
          'X-Correlation-Id': commandId(),
          ...(method === 'POST' ? { 'Idempotency-Key': commandId() } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const payload = await response.json() as JsonRecord;
      setResult(JSON.stringify(payload, null, 2));
      if (!response.ok) throw new Error(String(payload.message ?? `HTTP ${response.status}`));
      return payload;
    } finally {
      setBusy(false);
    }
  }

  async function perform(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Thao tác thất bại.');
    }
  }

  function updateIssueVersion(payload: JsonRecord): void {
    const nextVersion = payload.issueRequestVersion ?? payload.version;
    if (typeof nextVersion === 'number') setIssueVersion(nextVersion);
  }

  async function createIssueRequest(): Promise<void> {
    if (!warehouseId.trim() || !skuId.trim()) throw new Error('Warehouse ID và SKU ID là bắt buộc.');
    const payload = await callApi('/outbound/issue-requests', {
      issueCode,
      warehouseId: warehouseId.trim(),
      salesChannel,
      allowPartial,
      lines: [{ skuId: skuId.trim(), quantity }]
    });
    if (typeof payload.id === 'string') setIssueRequestId(payload.id);
    updateIssueVersion(payload);
  }

  async function transition(name: 'submit' | 'approve' | 'allocate'): Promise<void> {
    if (!issueRequestId.trim()) throw new Error('Nhập Issue Request ID.');
    const payload = await callApi(`/outbound/issue-requests/${issueRequestId.trim()}/${name}`, {
      expectedVersion: issueVersion
    });
    updateIssueVersion(payload);
    const allocations = payload.allocations;
    if (Array.isArray(allocations)) {
      const first = allocations[0] as JsonRecord | undefined;
      if (typeof first?.id === 'string') setAllocationId(first.id);
    }
  }

  async function createPickTask(): Promise<void> {
    if (!issueRequestId.trim()) throw new Error('Nhập Issue Request ID.');
    const payload = await callApi(`/outbound/issue-requests/${issueRequestId.trim()}/pick-tasks`, {
      expectedVersion: issueVersion
    });
    if (typeof payload.id === 'string') setPickTaskId(payload.id);
    if (typeof payload.version === 'number') setPickTaskVersion(payload.version);
    updateIssueVersion(payload);
  }

  async function scanPick(): Promise<void> {
    if (!pickTaskId.trim() || !allocationId.trim() || !barcode.trim()) {
      throw new Error('Pick Task ID, Allocation ID và barcode là bắt buộc.');
    }
    const payload = await callApi(`/outbound/pick-tasks/${pickTaskId.trim()}/scan`, {
      allocationId: allocationId.trim(),
      barcode: barcode.trim(),
      quantity: pickQuantity,
      expectedVersion: pickTaskVersion
    });
    if (typeof payload.version === 'number') setPickTaskVersion(payload.version);
  }

  async function postGoodsIssue(): Promise<void> {
    if (!issueRequestId.trim()) throw new Error('Nhập Issue Request ID.');
    const payload = await callApi(`/outbound/issue-requests/${issueRequestId.trim()}/post`, {
      expectedVersion: issueVersion
    });
    updateIssueVersion(payload);
  }

  async function loadIssue(): Promise<void> {
    if (!issueRequestId.trim()) throw new Error('Nhập Issue Request ID.');
    const payload = await callApi(`/outbound/issue-requests/${issueRequestId.trim()}`, undefined, 'GET');
    updateIssueVersion(payload);
  }

  async function callPhase7(method: 'GET' | 'POST'): Promise<void> {
    if (!['/transfers', '/stocktakes', '/reversals', '/quality', '/returns', '/recalls']
      .some((prefix) => phase7Path.startsWith(prefix))) {
      throw new Error('Endpoint phải thuộc Phase 7 hoặc Phase 8.');
    }
    let body: JsonRecord | undefined;
    if (method === 'POST') {
      const parsed: unknown = JSON.parse(phase7Body);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Body phải là JSON object.');
      body = parsed as JsonRecord;
    }
    await callApi(phase7Path.trim(), body, method);
  }

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">PHASE 6 · OUTBOUND & FEFO</p>
          <h1>Điều phối xuất kho nguyên kiện</h1>
          <p>Giữ ATP, cấp phát FEFO, quét picking và ghi sổ Goods Issue qua Inventory Core.</p>
        </div>
        <div className={`status ${health}`}>API: {health}</div>
      </header>

      <section className="panel setup" aria-labelledby="setup-title">
        <div>
          <p className="step">Thiết lập phiên</p>
          <h2 id="setup-title">Actor và phạm vi kho</h2>
        </div>
        <label>Actor ID<input value={actorId} onChange={(event) => setActorId(event.target.value)} placeholder="UUID người thao tác" /></label>
        <label>Warehouse ID<input value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} placeholder="UUID kho" /></label>
      </section>

      <div className="workflow">
        <section className="panel" aria-labelledby="request-title">
          <p className="step">01 · Yêu cầu xuất</p>
          <h2 id="request-title">Tạo phiếu nguyên kiện</h2>
          <label>Mã phiếu<input value={issueCode} onChange={(event) => setIssueCode(event.target.value)} /></label>
          <label>Kênh bán<input value={salesChannel} onChange={(event) => setSalesChannel(event.target.value.toUpperCase())} /></label>
          <label>SKU ID<input value={skuId} onChange={(event) => setSkuId(event.target.value)} placeholder="UUID SKU" /></label>
          <label>Số lượng<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
          <label className="check"><input type="checkbox" checked={allowPartial} onChange={(event) => setAllowPartial(event.target.checked)} /> Cho phép partial pick/backorder</label>
          <button disabled={busy} onClick={() => void perform(createIssueRequest)}>Tạo Issue Request</button>
        </section>

        <section className="panel" aria-labelledby="allocation-title">
          <p className="step">02 · Duyệt và FEFO</p>
          <h2 id="allocation-title">Giữ ATP và cấp phát</h2>
          <label>Issue Request ID<input value={issueRequestId} onChange={(event) => setIssueRequestId(event.target.value)} placeholder="UUID phiếu xuất" /></label>
          <label>Version<input type="number" min="1" value={issueVersion} onChange={(event) => setIssueVersion(Number(event.target.value))} /></label>
          <div className="actions">
            <button className="secondary" disabled={busy} onClick={() => void perform(() => transition('submit'))}>Submit</button>
            <button className="secondary" disabled={busy} onClick={() => void perform(() => transition('approve'))}>Approve</button>
            <button disabled={busy} onClick={() => void perform(() => transition('allocate'))}>Allocate FEFO</button>
            <button className="ghost" disabled={busy} onClick={() => void perform(loadIssue)}>Tải chi tiết</button>
          </div>
        </section>

        <section className="panel" aria-labelledby="pick-title">
          <p className="step">03 · Picking</p>
          <h2 id="pick-title">Quét barcode tại vị trí</h2>
          <button disabled={busy} onClick={() => void perform(createPickTask)}>Tạo Pick Task</button>
          <label>Pick Task ID<input value={pickTaskId} onChange={(event) => setPickTaskId(event.target.value)} placeholder="UUID pick task" /></label>
          <label>Task version<input type="number" min="1" value={pickTaskVersion} onChange={(event) => setPickTaskVersion(Number(event.target.value))} /></label>
          <label>Allocation ID<input value={allocationId} onChange={(event) => setAllocationId(event.target.value)} placeholder="UUID allocation" /></label>
          <label>Barcode<input autoFocus value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Quét barcode SKU" /></label>
          <label>Số lượng pick<input type="number" min="1" step="1" value={pickQuantity} onChange={(event) => setPickQuantity(Number(event.target.value))} /></label>
          <button disabled={busy} onClick={() => void perform(scanPick)}>Xác nhận scan</button>
        </section>

        <section className="panel post" aria-labelledby="post-title">
          <p className="step">04 · Ghi sổ</p>
          <h2 id="post-title">POSTED Goods Issue</h2>
          <p>Chỉ bước này mới giảm On-hand và fulfillment reservation trong cùng transaction.</p>
          <button className="danger" disabled={busy} onClick={() => void perform(postGoodsIssue)}>Post Goods Issue</button>
        </section>
      </div>

      <section className="panel phase7-console" aria-labelledby="phase7-title">
        <div>
          <p className="step">PHASE 7–8 · OPERATIONS, QUALITY & RECALL</p>
          <h2 id="phase7-title">Bảng điều khiển nghiệp vụ Phase 7–8</h2>
          <p>Dùng Actor ID ở trên. POST tự tạo Idempotency-Key và Correlation ID mới.</p>
        </div>
        <label>Endpoint
          <input value={phase7Path} onChange={(event) => setPhase7Path(event.target.value)} placeholder="/transfers, /quality/cases hoặc /recalls" />
        </label>
        <label>JSON body
          <textarea value={phase7Body} onChange={(event) => setPhase7Body(event.target.value)} rows={9} spellCheck={false} />
        </label>
        <div className="actions">
          <button className="ghost" disabled={busy} onClick={() => void perform(() => callPhase7('GET'))}>GET chi tiết</button>
          <button disabled={busy} onClick={() => void perform(() => callPhase7('POST'))}>POST lệnh</button>
        </div>
        <p className="endpoint-help">
          Luồng chính: <code>/transfers</code> → approve → start-picking → pick → dispatch → receipts → close;{' '}
          <code>/stocktakes</code> → start → counts → complete-round → request-approval → approve → post-adjustment;{' '}
          <code>/reversals</code> → submit → approve → post.
          {' '}Phase 8: <code>/quality/cases</code>, <code>/quality/expiry-runs</code>, <code>/returns</code> và <code>/recalls</code>.
        </p>
      </section>

      <section className="result" aria-live="polite">
        <div><p className="step">Kết quả API</p><h2>Phản hồi gần nhất</h2></div>
        <pre>{result}</pre>
      </section>
    </main>
  );
}
