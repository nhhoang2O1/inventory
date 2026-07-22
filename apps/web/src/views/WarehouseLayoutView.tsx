import React, { useState, useEffect } from 'react';
import { WarehouseLayoutEditor, type LayoutNode, getDefaultLayoutNodes, computeMergedOccupancyMap } from '../components/WarehouseLayoutEditor';
import { useInventory } from '../hooks/useInventory';

interface Warehouse {
  id: string;
  code: string;
  name: string;
}

interface WarehouseLayoutViewProps {
  actorId: string;
  warehouseId?: string;
}

export const WarehouseLayoutView: React.FC<WarehouseLayoutViewProps> = ({ actorId, warehouseId: initialWarehouseId }) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(initialWarehouseId || '');
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<LayoutNode[]>([]);
  const [occupancyMap, setOccupancyMap] = useState<Record<string, any>>({});
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [selectedNode, setSelectedNode] = useState<LayoutNode | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { positions, allLocations } = useInventory(actorId, selectedWarehouseId);
  const mergedOccupancyMap = computeMergedOccupancyMap(occupancyMap, positions);

  // Sync initialWarehouseId when props change (Header warehouse dropdown)
  useEffect(() => {
    if (initialWarehouseId) {
      setSelectedWarehouseId(initialWarehouseId);
    }
  }, [initialWarehouseId]);

  // Load Warehouses
  useEffect(() => {
    fetch('/api/inventory/warehouses', { headers: { 'x-actor-id': actorId } })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setWarehouses(data);
          if (!selectedWarehouseId) {
            setSelectedWarehouseId(data[0].id);
          }
        }
      })
      .catch((err) => console.error('Failed to load warehouses', err));
  }, [actorId]);

  // Load Layout Data
  useEffect(() => {
    if (!selectedWarehouseId) return;
    setLoading(true);
    fetch(`/api/v1/warehouse-layout?warehouseId=${selectedWarehouseId}`, {
      headers: { 'x-actor-id': actorId }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.layout && data.layout.nodes?.length > 0) {
          setLayoutId(data.layout.id);
          setNodes(data.layout.nodes);
        } else {
          setLayoutId(null);
          setNodes(getDefaultLayoutNodes(allLocations, positions));
        }
        setOccupancyMap(data.occupancyMap || {});
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch layout', err);
        setLoading(false);
      });
  }, [actorId, selectedWarehouseId, allLocations, positions]);

  const handleAddNode = (type: LayoutNode['type']) => {
    const newId = `node-${Date.now()}`;
    const defaultNames: Record<string, string> = {
      RACK: `RACK-${nodes.filter((n) => n.type === 'RACK').length + 1}`,
      DOOR: 'Cửa Kho',
      AISLE: 'Lối Đi',
      ZONE: 'Khu Vực'
    };
    const newNode: LayoutNode = {
      id: newId,
      type,
      code: defaultNames[type] || 'NEW',
      name: defaultNames[type],
      x: 100,
      y: 100,
      width: type === 'RACK' ? 140 : type === 'AISLE' ? 240 : 160,
      height: type === 'RACK' ? 60 : 40,
      rotation: 0
    };
    setNodes([...nodes, newNode]);
    setSelectedNode(newNode);
  };

  const handleRotateNode = () => {
    if (!selectedNode) return;
    const currentRot = selectedNode.rotation || 0;
    const nextRot = (currentRot + 90) % 360;
    const updated = nodes.map((n) => (n.id === selectedNode.id ? { ...n, rotation: nextRot } : n));
    setNodes(updated);
    setSelectedNode({ ...selectedNode, rotation: nextRot });
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    const updated = nodes.filter((n) => n.id !== selectedNode.id);
    setNodes(updated);
    setSelectedNode(null);
  };

  const handleSaveLayout = async (): Promise<string | null> => {
    if (!selectedWarehouseId) {
      setMessage({ type: 'error', text: 'Vui lòng chọn Kho trước khi lưu.' });
      return null;
    }
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/warehouse-layout/save?warehouseId=${selectedWarehouseId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-actor-id': actorId
        },
        body: JSON.stringify({
          name: 'Sơ đồ mặt bằng kho chính',
          gridWidth: 2400,
          gridHeight: 1400,
          gridSize: 20,
          nodes
        })
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setLayoutId(data.id);
        setMessage({ type: 'success', text: '✅ Đã lưu cấu hình vị trí sơ đồ kho vào CSDL thành công!' });
        return data.id;
      } else {
        setMessage({ type: 'error', text: `❌ Lỗi lưu sơ đồ: ${data.message || 'Thao tác không thành công'}` });
        return null;
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `❌ Lỗi kết nối: ${err.message}` });
      return null;
    }
  };

  const handlePublishLayout = async () => {
    if (!selectedWarehouseId) return;
    let currentId = layoutId;

    // Automatically save draft first if not saved yet
    if (!currentId) {
      currentId = await handleSaveLayout();
    }

    if (!currentId) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/warehouse-layout/publish/${currentId}?warehouseId=${selectedWarehouseId}`, {
        method: 'POST',
        headers: { 'x-actor-id': actorId }
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: '🚀 Đã xuất bản (Publish) sơ đồ làm cấu hình kho chính thức!' });
        setIsEditMode(false);
      } else {
        setMessage({ type: 'error', text: `❌ Lỗi xuất bản: ${data.message}` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `❌ Lỗi kết nối: ${err.message}` });
    }
  };

  return (
    <div style={{ padding: '24px', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#f8fafc' }}>
            🗺️ Quản Lý Sơ Đồ Kho 2D (Visual Warehouse Map)
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', marginTop: '4px' }}>
            Kéo thả sắp xếp vị trí các Kệ, Cửa kho và Lối đi. Cấu hình được lưu trực tiếp vào CSDL dưới dạng JSONB.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Warehouse Selector */}
          <select
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            style={{ padding: '8px 12px', background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '8px', fontSize: '14px' }}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                🏢 {w.name} ({w.code})
              </option>
            ))}
          </select>

          {/* Toggle Edit Mode */}
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            style={{ padding: '8px 16px', background: isEditMode ? '#334155' : '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
          >
            {isEditMode ? '👁️ Xem Sơ Đồ' : '✏️ Chỉnh Sửa Bố Cục'}
          </button>

          {/* Save & Publish Action Buttons */}
          {isEditMode && (
            <>
              <button
                onClick={handleSaveLayout}
                style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
              >
                💾 Lưu Sơ Đồ
              </button>
              <button
                onClick={handlePublishLayout}
                style={{ padding: '8px 16px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
              >
                🚀 Áp Dụng (Publish)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notification banner */}
      {message && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '8px',
            background: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`,
            color: message.type === 'success' ? '#34d399' : '#f87171',
            fontSize: '14px'
          }}
        >
          {message.text}
        </div>
      )}

      {/* Main Grid Layout: Canvas & Properties Side Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: isEditMode ? '1fr 280px' : '1fr', gap: '20px' }}>
        {/* Left: 2D Layout Canvas */}
        <div>
          {loading ? (
            <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', borderRadius: '12px' }}>
              <span>Đang tải dữ liệu sơ đồ kho...</span>
            </div>
          ) : (
            <WarehouseLayoutEditor
              nodes={nodes}
              isEditMode={isEditMode}
              occupancyMap={mergedOccupancyMap}
              onNodesChange={setNodes}
              onSelectNode={setSelectedNode}
            />
          )}
        </div>

        {/* Right: Edit Controls Panel (Visible when editing) */}
        {isEditMode && (
          <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155', height: 'fit-content' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 16px 0', color: '#f8fafc' }}>
              🛠️ Thêm Vật Thể Kho
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '24px' }}>
              <button onClick={() => handleAddNode('RACK')} style={btnStyle('#0284c7')}>
                📦 + Kệ Hàng
              </button>
              <button onClick={() => handleAddNode('DOOR')} style={btnStyle('#f97316')}>
                🚪 + Cửa Kho
              </button>
              <button onClick={() => handleAddNode('AISLE')} style={btnStyle('#475569')}>
                🚜 + Lối Đi
              </button>
              <button onClick={() => handleAddNode('ZONE')} style={btnStyle('#8b5cf6')}>
                📍 + Khu Vực
              </button>
            </div>

            {/* Selected Node Properties */}
            {selectedNode ? (
              <div style={{ borderTop: '1px solid #334155', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 12px 0', color: '#38bdf8' }}>
                  ⚙️ Thuộc tính: {selectedNode.code}
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Mã Định Danh:
                    <input
                      type="text"
                      value={selectedNode.code}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNodes(nodes.map((n) => (n.id === selectedNode.id ? { ...n, code: val } : n)));
                        setSelectedNode({ ...selectedNode, code: val });
                      }}
                      style={inputStyle}
                    />
                  </label>

                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Tọa độ (X, Y):
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <input
                        type="number"
                        value={selectedNode.x}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setNodes(nodes.map((n) => (n.id === selectedNode.id ? { ...n, x: val } : n)));
                          setSelectedNode({ ...selectedNode, x: val });
                        }}
                        style={inputStyle}
                      />
                      <input
                        type="number"
                        value={selectedNode.y}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setNodes(nodes.map((n) => (n.id === selectedNode.id ? { ...n, y: val } : n)));
                          setSelectedNode({ ...selectedNode, y: val });
                        }}
                        style={inputStyle}
                      />
                    </div>
                  </label>

                  <label style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Kích thước (Dài x Rộng):
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <input
                        type="number"
                        value={selectedNode.width}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setNodes(nodes.map((n) => (n.id === selectedNode.id ? { ...n, width: val } : n)));
                          setSelectedNode({ ...selectedNode, width: val });
                        }}
                        style={inputStyle}
                      />
                      <input
                        type="number"
                        value={selectedNode.height}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setNodes(nodes.map((n) => (n.id === selectedNode.id ? { ...n, height: val } : n)));
                          setSelectedNode({ ...selectedNode, height: val });
                        }}
                        style={inputStyle}
                      />
                    </div>
                  </label>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button onClick={handleRotateNode} style={{ flex: 1, padding: '8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                      🔄 Xoay 90° ({selectedNode.rotation || 0}°)
                    </button>
                    <button onClick={handleDeleteNode} style={{ padding: '8px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                      🗑️ Xóa
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', textAlign: 'center', marginTop: '20px' }}>
                Click vào một kệ hoặc vật thể trên sơ đồ để chỉnh thuộc tính.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const btnStyle = (bg: string) => ({
  padding: '8px 12px',
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 600 as const,
  cursor: 'pointer'
});

const inputStyle = {
  width: '100%',
  padding: '6px 8px',
  background: '#0f172a',
  color: '#fff',
  border: '1px solid #334155',
  borderRadius: '4px',
  fontSize: '12px',
  marginTop: '4px'
};
