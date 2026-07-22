import { Injectable, NotFoundException } from '@nestjs/common';
import { InventoryDatabaseService } from './inventory-database.service.js';

export interface LayoutNode {
  id: string;
  type: 'RACK' | 'DOOR' | 'AISLE' | 'ZONE' | 'TEXT';
  code: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zoneId?: string;
  rackCode?: string;
  color?: string;
  totalBins?: number;
}

export interface SaveLayoutInput {
  name?: string;
  gridWidth?: number;
  gridHeight?: number;
  gridSize?: number;
  nodes: LayoutNode[];
}

export interface LayoutConfigRow {
  id: string;
  warehouse_id: string;
  version: number;
  name: string;
  grid_width: number;
  grid_height: number;
  layout_data: { nodes: LayoutNode[]; gridSize: number };
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class WarehouseLayoutService {
  constructor(private readonly db: InventoryDatabaseService) {}

  async getLayout(warehouseId: string) {
    const layouts = await this.db.query<LayoutConfigRow>(`
      SELECT * FROM warehouse.layout_config
      WHERE warehouse_id = $1
      ORDER BY CASE WHEN status = 'PUBLISHED' THEN 1 WHEN status = 'DRAFT' THEN 2 ELSE 3 END, version DESC
      LIMIT 1`, [warehouseId]);

    // Fetch rack & location occupancy stats from reporting.inventory_position
    const occupancyStats = await this.db.query<{
      location_code: string;
      rack_code: string | null;
      sellable_units: number;
    }>(`
      SELECT 
        l.code AS location_code,
        l.rack AS rack_code,
        coalesce(sum(p.quantity_on_hand), 0)::int AS sellable_units
      FROM warehouse.location l
      JOIN warehouse.zone z ON z.id = l.zone_id
      LEFT JOIN reporting.inventory_position p ON p.location_id = l.id AND p.warehouse_id = z.warehouse_id
      WHERE z.warehouse_id = $1
      GROUP BY l.code, l.rack`, [warehouseId]);

    const occupancyMap: Record<string, { totalLocations: number; sellableUnits: number; reservedUnits: number; atpUnits: number }> = {};
    for (const stat of occupancyStats) {
      const units = Number(stat.sellable_units);
      const entry = { totalLocations: 1, sellableUnits: units, reservedUnits: 0, atpUnits: units };
      occupancyMap[stat.location_code] = entry;

      if (stat.rack_code) {
        if (!occupancyMap[stat.rack_code]) {
          occupancyMap[stat.rack_code] = { totalLocations: 0, sellableUnits: 0, reservedUnits: 0, atpUnits: 0 };
        }
        occupancyMap[stat.rack_code]!.sellableUnits += units;
        occupancyMap[stat.rack_code]!.atpUnits += units;
        occupancyMap[stat.rack_code]!.totalLocations += 1;
      }
    }

    const currentLayout = layouts[0] ?? null;

    return {
      layout: currentLayout ? {
        id: currentLayout.id,
        warehouseId: currentLayout.warehouse_id,
        version: currentLayout.version,
        name: currentLayout.name,
        gridWidth: currentLayout.grid_width,
        gridHeight: currentLayout.grid_height,
        gridSize: currentLayout.layout_data?.gridSize ?? 20,
        nodes: currentLayout.layout_data?.nodes ?? [],
        status: currentLayout.status,
        updatedAt: currentLayout.updated_at
      } : null,
      occupancyMap
    };
  }

  async saveLayout(actorId: string, warehouseId: string, input: SaveLayoutInput) {
    const gridWidth = input.gridWidth ?? 2000;
    const gridHeight = input.gridHeight ?? 1200;
    const gridSize = input.gridSize ?? 20;
    const nodes = input.nodes ?? [];

    const existing = await this.db.query<LayoutConfigRow>(`
      SELECT * FROM warehouse.layout_config
      WHERE warehouse_id = $1 AND status = 'DRAFT'
      ORDER BY version DESC LIMIT 1`, [warehouseId]);

    const layoutData = JSON.stringify({ nodes, gridSize });

    if (existing[0]) {
      const updated = await this.db.query<LayoutConfigRow>(`
        UPDATE warehouse.layout_config
        SET layout_data = $1::jsonb, grid_width = $2, grid_height = $3, name = coalesce($4, name), updated_at = now()
        WHERE id = $5 RETURNING *`, [layoutData, gridWidth, gridHeight, input.name ?? null, existing[0].id]);
      return this.formatLayout(updated[0]!);
    } else {
      const latestVersion = await this.db.query<{ max_ver: number }>(`
        SELECT coalesce(max(version), 0) AS max_ver FROM warehouse.layout_config WHERE warehouse_id = $1`, [warehouseId]);
      const nextVer = (latestVersion[0]?.max_ver ?? 0) + 1;

      const inserted = await this.db.query<LayoutConfigRow>(`
        INSERT INTO warehouse.layout_config (warehouse_id, version, name, grid_width, grid_height, layout_data, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'DRAFT', $7)
        RETURNING *`, [warehouseId, nextVer, input.name ?? 'Sơ đồ mặt bằng kho', gridWidth, gridHeight, layoutData, actorId]);
      return this.formatLayout(inserted[0]!);
    }
  }

  async publishLayout(actorId: string, warehouseId: string, layoutId: string) {
    return this.db.transaction(async (client) => {
      await client.query(`
        UPDATE warehouse.layout_config SET status = 'ARCHIVED', updated_at = now()
        WHERE warehouse_id = $1 AND status = 'PUBLISHED'`, [warehouseId]);

      const published = await client.query<LayoutConfigRow>(`
        UPDATE warehouse.layout_config SET status = 'PUBLISHED', updated_at = now()
        WHERE id = $2 AND warehouse_id = $1 RETURNING *`, [warehouseId, layoutId]);

      if (!published.rows[0]) throw new NotFoundException('Layout configuration not found');
      return this.formatLayout(published.rows[0]);
    });
  }

  private formatLayout(row: LayoutConfigRow) {
    return {
      id: row.id,
      warehouseId: row.warehouse_id,
      version: row.version,
      name: row.name,
      gridWidth: row.grid_width,
      gridHeight: row.grid_height,
      gridSize: row.layout_data?.gridSize ?? 20,
      nodes: row.layout_data?.nodes ?? [],
      status: row.status,
      updatedAt: row.updated_at
    };
  }
}
