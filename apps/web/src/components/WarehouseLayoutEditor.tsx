import React, { useState, useRef } from 'react';

export interface LayoutNode {
  id: string;
  type: 'RACK' | 'DOOR' | 'AISLE' | 'ZONE' | 'TEXT';
  code: string;
  name?: string | undefined;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number | undefined;
  zoneId?: string | undefined;
  rackCode?: string | undefined;
  color?: string | undefined;
  totalBins?: number | undefined;
}

export interface OccupancyInfo {
  totalLocations: number;
  sellableUnits: number;
  reservedUnits: number;
  atpUnits: number;
  hasBlocked?: boolean | undefined;
  hasQuarantine?: boolean | undefined;
}

export const getDefaultLayoutNodes = (allLocations: any[] = [], positions: any[] = []): LayoutNode[] => {
  const locMap = new Set<string>();
  if (Array.isArray(allLocations)) {
    allLocations.forEach((loc) => { if (loc?.code) locMap.add(loc.code); });
  }
  if (Array.isArray(positions)) {
    positions.forEach((pos) => { if (pos?.location_code) locMap.add(pos.location_code); });
  }

  const priorityCodes = ['LOC-DAMG', 'LOC-QUAR', 'LOC-REC', 'Z1-A12', 'Z2-B04', 'Z3-C01'];
  const allCodes = Array.from(locMap);

  if (allCodes.length === 0) {
    allCodes.push(...priorityCodes);
  } else {
    priorityCodes.forEach((code) => {
      if (!allCodes.includes(code)) allCodes.push(code);
    });
  }

  allCodes.sort((a, b) => {
    const idxA = priorityCodes.indexOf(a);
    const idxB = priorityCodes.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const generatedNodes: LayoutNode[] = allCodes.map((code, idx) => ({
    id: `loc-node-${code}`,
    type: 'RACK',
    code: code,
    name: code,
    x: 60 + (idx % 4) * 170,
    y: 100 + Math.floor(idx / 4) * 90,
    width: 140,
    height: 60,
    rotation: 0
  }));

  generatedNodes.unshift(
    { id: 'door-in', type: 'DOOR', code: 'DOOR-IN', name: 'Cửa Nhập Kho', x: 60, y: 20, width: 160, height: 40, rotation: 0 },
    { id: 'door-out', type: 'DOOR', code: 'DOOR-OUT', name: 'Cửa Xuất Kho', x: 400, y: 20, width: 160, height: 40, rotation: 0 }
  );

  return generatedNodes;
};

export const computeMergedOccupancyMap = (baseMap: Record<string, any> = {}, positions: any[] = []): Record<string, OccupancyInfo> => {
  const merged: Record<string, OccupancyInfo> = { ...baseMap };
  if (Array.isArray(positions)) {
    positions.forEach((p) => {
      const locCode = p?.location_code;
      if (!locCode) return;
      const qty = Number(p.quantity_on_hand || 0);
      const existing = merged[locCode] || merged[locCode.toUpperCase()] || { totalLocations: 1, sellableUnits: 0, reservedUnits: 0, atpUnits: 0, hasBlocked: false, hasQuarantine: false };
      const isQuar = p.stock_status === 'QUARANTINED';
      const isBlock = p.stock_status === 'BLOCKED' || p.stock_status === 'DAMAGED';
      const updated: OccupancyInfo = {
        ...existing,
        sellableUnits: existing.sellableUnits + qty,
        atpUnits: existing.atpUnits + qty,
        hasQuarantine: existing.hasQuarantine || isQuar,
        hasBlocked: existing.hasBlocked || isBlock
      };
      merged[locCode] = updated;
      merged[locCode.toUpperCase()] = updated;
    });
  }
  return merged;
};

interface WarehouseLayoutEditorProps {
  nodes: LayoutNode[];
  isEditMode: boolean;
  gridSize?: number;
  occupancyMap?: Record<string, OccupancyInfo>;
  highlightRackCodes?: string[];
  onNodesChange?: (nodes: LayoutNode[]) => void;
  onSelectNode?: (node: LayoutNode | null) => void;
}

export const WarehouseLayoutEditor: React.FC<WarehouseLayoutEditorProps> = ({
  nodes,
  isEditMode,
  gridSize = 20,
  occupancyMap = {},
  highlightRackCodes = [],
  onNodesChange,
  onSelectNode
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState<{ mouseX: number; mouseY: number; initialW: number; initialH: number }>({
    mouseX: 0,
    mouseY: 0,
    initialW: 0,
    initialH: 0
  });

  // Pan & Zoom States
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);

  const snap = (val: number) => Math.round(val / gridSize) * gridSize;

  const handleNodeClick = (e: React.MouseEvent, node: LayoutNode) => {
    e.stopPropagation();
    setSelectedId(node.id);
    onSelectNode?.(node);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, node: LayoutNode) => {
    if (!isEditMode) return;
    e.stopPropagation();
    setSelectedId(node.id);
    onSelectNode?.(node);
    setDraggingId(node.id);

    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - pan.x) / zoom;
      const mouseY = (e.clientY - rect.top - pan.y) / zoom;
      setDragOffset({ x: mouseX - node.x, y: mouseY - node.y });
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent, node: LayoutNode) => {
    if (!isEditMode) return;
    e.stopPropagation();
    setSelectedId(node.id);
    onSelectNode?.(node);
    setResizingId(node.id);
    setResizeStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialW: node.width,
      initialH: node.height
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    setSelectedId(null);
    onSelectNode?.(null);
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (resizingId) {
      const deltaX = (e.clientX - resizeStart.mouseX) / zoom;
      const deltaY = (e.clientY - resizeStart.mouseY) / zoom;

      const newW = Math.max(40, snap(resizeStart.initialW + deltaX));
      const newH = Math.max(20, snap(resizeStart.initialH + deltaY));

      const updated = nodes.map((n) => (n.id === resizingId ? { ...n, width: newW, height: newH } : n));
      onNodesChange?.(updated);
      return;
    }

    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    if (!isEditMode || !draggingId || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseY = (e.clientY - rect.top - pan.y) / zoom;

    const rawX = mouseX - dragOffset.x;
    const rawY = mouseY - dragOffset.y;

    const newX = Math.max(0, snap(rawX));
    const newY = Math.max(0, snap(rawY));

    const updated = nodes.map((n) => (n.id === draggingId ? { ...n, x: newX, y: newY } : n));
    onNodesChange?.(updated);
  };

  const handleMouseUp = () => {
    setDraggingId(null);
    setResizingId(null);
    setIsPanning(false);
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const getOccupancyInfo = (code: string) => {
    if (occupancyMap[code]) return occupancyMap[code];
    const key = Object.keys(occupancyMap).find((k) => k.toLowerCase() === code.toLowerCase());
    return key ? occupancyMap[key] : undefined;
  };

  const getRackColor = (node: LayoutNode) => {
    if (node.type !== 'RACK') return node.color || '#3b82f6';
    const info = getOccupancyInfo(node.code);
    if (!info || info.sellableUnits === 0) return '#475569';
    if (node.code.toUpperCase().includes('DAMG') || node.code.toUpperCase().includes('REJECT') || info.hasBlocked) return '#ef4444';
    if (node.code.toUpperCase().includes('QUAR') || node.code.toUpperCase().includes('QC') || info.hasQuarantine) return '#f59e0b';
    return '#10b981';
  };

  return (
    <div className="layout-editor-container" style={{ position: 'relative', width: '100%', overflow: 'hidden', background: '#0f172a', borderRadius: '12px', border: '1px solid #334155' }}>
      {/* Toolbar Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>Mode:</span>
          <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: isEditMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)', color: isEditMode ? '#f87171' : '#34d399', border: `1px solid ${isEditMode ? '#ef4444' : '#10b981'}` }}>
            {isEditMode ? '✋ Chỉnh Sửa Layout (Edit Mode)' : '👁️ Xem Sơ Đồ & Tồn Kho (View Mode)'}
          </span>
          <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>
            💡 Nhấp giữ chuột trên nền để kéo di chuyển mặt bằng (Pan)
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} style={toolBtnStyle}>-</button>
          <span style={{ fontSize: '12px', color: '#cbd5e1', minWidth: '40px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))} style={toolBtnStyle}>+</button>
          <button onClick={handleReset} style={{ ...toolBtnStyle, color: '#94a3b8' }}>Reset</button>
        </div>
      </div>

      {/* Interactive SVG Canvas Viewport */}
      <div
        style={{ width: '100%', height: '480px', overflow: 'hidden', position: 'relative', cursor: resizingId ? 'nwse-resize' : isPanning ? 'grabbing' : isEditMode ? 'default' : 'grab' }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ background: '#090d16', display: 'block' }}
        >
          <defs>
            <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
              <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#1e293b" strokeWidth="0.8" />
            </pattern>
          </defs>

          {/* Scaled & Panned Scene Group */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Grid background */}
            <rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#grid)" />

            {/* Render Nodes */}
            {nodes.map((node) => {
              const isSelected = selectedId === node.id;
              const isHighlighted = highlightRackCodes.includes(node.code);
              const nodeColor = getRackColor(node);
              const rotation = node.rotation || 0;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y}) rotate(${rotation}, ${node.width / 2}, ${node.height / 2})`}
                  onMouseDown={(e) => handleNodeMouseDown(e, node)}
                  onClick={(e) => handleNodeClick(e, node)}
                  style={{ cursor: isEditMode ? 'move' : 'pointer' }}
                >
                  {/* Highlight Glow Effect for Search */}
                  {isHighlighted && (
                    <rect
                      x={-6}
                      y={-6}
                      width={node.width + 12}
                      height={node.height + 12}
                      rx={8}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      strokeDasharray="4 2"
                    />
                  )}

                  {/* RACK Shape */}
                  {node.type === 'RACK' && (
                    <>
                      <rect
                        width={node.width}
                        height={node.height}
                        rx={6}
                        fill={isHighlighted ? '#fbbf24' : nodeColor}
                        fillOpacity={isHighlighted ? 0.45 : 0.25}
                        stroke={isHighlighted ? '#f59e0b' : isSelected ? '#38bdf8' : nodeColor}
                        strokeWidth={isHighlighted ? 3 : isSelected ? 3 : 2}
                      />
                      <text
                        x={node.width / 2}
                        y={node.height / 2 - 4}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#ffffff"
                        fontSize={12}
                        fontWeight="bold"
                      >
                        {node.code}
                      </text>
                      {(() => {
                        const info = getOccupancyInfo(node.code);
                        const units = info?.sellableUnits ?? 0;
                        return (
                          <text
                            x={node.width / 2}
                            y={node.height / 2 + 12}
                            textAnchor="middle"
                            fill={isHighlighted ? '#fef3c7' : '#94a3b8'}
                            fontSize={10}
                            fontWeight={isHighlighted ? 'bold' : 'normal'}
                          >
                            {units > 0 ? `${units} thùng` : '0 thùng'}
                          </text>
                        );
                      })()}
                    </>
                  )}

                  {/* DOOR Shape */}
                  {node.type === 'DOOR' && (
                    <>
                      <rect
                        width={node.width}
                        height={node.height}
                        rx={4}
                        fill="#ffffff"
                        fillOpacity={0.12}
                        stroke={isSelected ? '#38bdf8' : '#ffffff'}
                        strokeWidth={2}
                        strokeDasharray="4 2"
                      />
                      <text
                        x={node.width / 2}
                        y={node.height / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#ffffff"
                        fontSize={11}
                        fontWeight="600"
                      >
                        🚪 {node.name || node.code}
                      </text>
                    </>
                  )}

                  {/* AISLE Shape */}
                  {node.type === 'AISLE' && (
                    <>
                      <rect
                        width={node.width}
                        height={node.height}
                        fill="#334155"
                        fillOpacity={0.2}
                        stroke="#475569"
                        strokeWidth={1}
                      />
                      <text
                        x={node.width / 2}
                        y={node.height / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#64748b"
                        fontSize={10}
                      >
                        🚜 {node.name || 'Lối đi'}
                      </text>
                    </>
                  )}

                  {/* ZONE Shape */}
                  {node.type === 'ZONE' && (
                    <>
                      <rect
                        width={node.width}
                        height={node.height}
                        rx={8}
                        fill="#8b5cf6"
                        fillOpacity={0.1}
                        stroke="#8b5cf6"
                        strokeWidth={1.5}
                        strokeDasharray="6 4"
                      />
                      <text
                        x={10}
                        y={16}
                        fill="#a78bfa"
                        fontSize={11}
                        fontWeight="bold"
                      >
                        📍 {node.name || node.code}
                      </text>
                    </>
                  )}

                  {/* Selection Highlight Ring */}
                  {isSelected && (
                    <rect
                      x={-4}
                      y={-4}
                      width={node.width + 8}
                      height={node.height + 8}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                    />
                  )}

                  {/* Mouse Resize Handle at Bottom-Right Corner */}
                  {isSelected && isEditMode && (
                    <g transform={`translate(${node.width - 6}, ${node.height - 6})`}>
                      <rect
                        width={12}
                        height={12}
                        rx={3}
                        fill="#38bdf8"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        style={{ cursor: 'nwse-resize' }}
                        onMouseDown={(e) => handleResizeMouseDown(e, node)}
                      />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Color Legend */}
      <div style={{ display: 'flex', gap: '16px', padding: '10px 16px', background: '#1e293b', borderTop: '1px solid #334155', fontSize: '12px', color: '#94a3b8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#10b981' }}></span>
          <span>Ô kệ có hàng (Available)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#f59e0b' }}></span>
          <span>Hàng Cách ly (QC Hold)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#ef4444' }}></span>
          <span>Hàng Khóa / Hỏng (Blocked)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#475569' }}></span>
          <span>Ô Trống (Empty)</span>
        </div>
        {highlightRackCodes.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', color: '#fbbf24', fontWeight: 'bold' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#fbbf24' }}></span>
            <span>Kệ khớp tìm kiếm ({highlightRackCodes.length} kệ)</span>
          </div>
        )}
      </div>
    </div>
  );
};

const toolBtnStyle = {
  padding: '4px 10px',
  background: '#334155',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};
