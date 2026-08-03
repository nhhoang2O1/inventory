import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { GateDatabaseService } from './gate-database.service.js';
import { PoPdfReportService, PoReportData } from './po-pdf-report.service.js';

export interface CreateCheckInDto {
  licensePlate: string;
  driverName: string;
  driverIdCard?: string;
  carrierName?: string;
  entryType?: 'QR_SCAN' | 'MANUAL';
  purpose?: 'INBOUND' | 'OUTBOUND' | 'INTERNAL_TRANSFER';
  poId?: string;
  soId?: string;
  dockLocationId?: string;
}

export interface WeighInDto {
  truckEntryId: string;
  weightIn: number;
}

export interface AssignDockDto {
  truckEntryId: string;
  dockLocationId: string;
}

export interface WeighOutDto {
  truckEntryId: string;
  weightOut: number;
  expectedWeight?: number;
  tolerancePercentage?: number; // Defaults to 1.5%
  notes?: string;
}

export interface ConfirmDockReceiptDto {
  truckEntryId: string;
  confirmedQtyCases?: number;
  notes?: string;
}

@Injectable()
export class GateService {
  constructor(
    private readonly db: GateDatabaseService,
    private readonly pdfReport: PoPdfReportService
  ) {}

  private generateEntryCode(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
    return `GATE-${dateStr}-${randomSuffix}`;
  }

  private async resolveDockLocationId(input?: string): Promise<string | null> {
    if (!input || !input.trim()) return null;
    const trimmed = input.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
    if (isUuid) return trimmed;

    const rows = await this.db.query(
      `SELECT id FROM warehouse.location WHERE upper(code) = upper($1) OR upper(barcode) = upper($1) LIMIT 1`,
      [trimmed]
    );
    const first = rows[0] as { id: string } | undefined;
    return first?.id ?? null;
  }

  async createCheckIn(dto: CreateCheckInDto, createdByUserId?: string) {
    if (!dto.licensePlate?.trim()) {
      throw new BadRequestException('Biển số xe không được để trống');
    }
    if (!dto.driverName?.trim()) {
      throw new BadRequestException('Tên tài xế không được để trống');
    }

    const entryCode = this.generateEntryCode();
    const dockLocationId = await this.resolveDockLocationId(dto.dockLocationId);
    const poDoCode = (dto as any).poDoCode || (dto as any).po_do_code || 'PO-20260728-08';

    const rows = await this.db.query(
      `INSERT INTO gate.truck_entry (
        entry_code, license_plate, driver_name, driver_id_card, carrier_name,
        entry_type, purpose, po_id, so_id, dock_location_id, status, po_do_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CHECKED_IN', $11)
      RETURNING *`,
      [
        entryCode,
        dto.licensePlate.trim().toUpperCase(),
        dto.driverName.trim(),
        dto.driverIdCard?.trim() || null,
        dto.carrierName?.trim() || null,
        dto.entryType || 'MANUAL',
        dto.purpose || 'INBOUND',
        dto.poId || null,
        dto.soId || null,
        dockLocationId,
        poDoCode
      ]
    );

    return rows[0];
  }

  async weighIn(dto: WeighInDto, actorId?: string) {
    if (dto.weightIn < 0) {
      throw new BadRequestException('Trọng lượng vào không hợp lệ');
    }

    const entries = await this.db.query(`SELECT * FROM gate.truck_entry WHERE id = $1`, [dto.truckEntryId]);
    if (entries.length === 0) {
      throw new NotFoundException('Không tìm thấy thông tin chuyến xe');
    }

    return await this.db.transaction(async (client) => {
      // Upsert ticket or insert ticket
      const existingTickets = await client.query(
        `SELECT * FROM gate.weighbridge_ticket WHERE truck_entry_id = $1`,
        [dto.truckEntryId]
      );

      let ticket;
      if (existingTickets.rows.length > 0) {
        const updated = await client.query(
          `UPDATE gate.weighbridge_ticket
           SET weight_in = $1, weighed_in_at = now(), weighed_in_by = $2, updated_at = now()
           WHERE id = $3 RETURNING *`,
          [dto.weightIn, actorId || null, existingTickets.rows[0].id]
        );
        ticket = updated.rows[0];
      } else {
        const inserted = await client.query(
          `INSERT INTO gate.weighbridge_ticket (truck_entry_id, weight_in, weighed_in_at, weighed_in_by)
           VALUES ($1, $2, now(), $3) RETURNING *`,
          [dto.truckEntryId, dto.weightIn, actorId || null]
        );
        ticket = inserted.rows[0];
      }

      await client.query(
        `UPDATE gate.truck_entry SET status = 'WEIGHED_IN', updated_at = now() WHERE id = $1`,
        [dto.truckEntryId]
      );

      return ticket;
    });
  }

  async assignDock(dto: AssignDockDto) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dto.truckEntryId);
    if (!isUuid) {
      throw new NotFoundException('Không tìm thấy thông tin chuyến xe (Mã ID không hợp lệ)');
    }

    const entries = await this.db.query(`SELECT * FROM gate.truck_entry WHERE id = $1`, [dto.truckEntryId]);
    if (entries.length === 0) {
      throw new NotFoundException('Không tìm thấy thông tin chuyến xe');
    }

    const dockLocationId = await this.resolveDockLocationId(dto.dockLocationId);

    const updated = await this.db.query(
      `UPDATE gate.truck_entry
       SET dock_location_id = $1, status = 'LOADING', updated_at = now()
       WHERE id = $2 RETURNING *`,
      [dockLocationId, dto.truckEntryId]
    );

    return updated[0];
  }

  async weighOut(dto: WeighOutDto, actorId?: string) {
    if (dto.weightOut < 0) {
      throw new BadRequestException('Trọng lượng ra không hợp lệ');
    }

    const tickets = await this.db.query(
      `SELECT * FROM gate.weighbridge_ticket WHERE truck_entry_id = $1`,
      [dto.truckEntryId]
    );

    const ticket = tickets[0];
    if (!ticket) {
      throw new BadRequestException('Chuyến xe chưa thực hiện Cân Lần 1 (Vào)');
    }

    const weightIn = Number(ticket.weight_in);
    const weightOut = Number(dto.weightOut);
    const netWeight = Math.abs(weightIn - weightOut);
    const expectedWeight = dto.expectedWeight ? Number(dto.expectedWeight) : netWeight;

    const tolerance = dto.tolerancePercentage ?? 1.5; // default 1.5%
    const weightDiff = Math.abs(netWeight - expectedWeight);
    const diffPercentage = expectedWeight > 0 ? (weightDiff / expectedWeight) * 100 : 0;
    const isWithinTolerance = diffPercentage <= tolerance;
    const verificationStatus = isWithinTolerance ? 'VALID' : 'EXCEEDED_TOLERANCE';

    return await this.db.transaction(async (client) => {
      const updatedTicket = await client.query(
        `UPDATE gate.weighbridge_ticket
         SET weight_out = $1, weighed_out_at = now(), weighed_out_by = $2,
             net_weight = $3, expected_weight = $4, weight_diff = $5,
             diff_percentage = $6, verification_status = $7, notes = $8, updated_at = now()
         WHERE id = $9 RETURNING *`,
        [
          weightOut,
          actorId || null,
          netWeight,
          expectedWeight,
          weightDiff,
          diffPercentage.toFixed(2),
          verificationStatus,
          dto.notes || null,
          ticket.id
        ]
      );

      await client.query(
        `UPDATE gate.truck_entry SET status = 'WEIGHED_OUT', updated_at = now() WHERE id = $1`,
        [dto.truckEntryId]
      );

      // Auto-complete PO when cumulative delivered weight reaches expected PO weight or all registered trucks finish
      const truckEntries = await client.query(`SELECT po_do_code, po_id FROM gate.truck_entry WHERE id = $1`, [dto.truckEntryId]);
      const entry = truckEntries.rows[0];
      const poCode = entry?.po_do_code;
      if (poCode) {
        try {
          const weightCheck = await client.query(
            `SELECT COALESCE(SUM(t.net_weight), 0) as total_net
             FROM gate.truck_entry e
             JOIN gate.weighbridge_ticket t ON t.truck_entry_id = e.id
             WHERE (e.po_do_code = $1 OR e.po_id::text = $1) AND e.status IN ('WEIGHED_OUT', 'COMPLETED')`,
            [poCode]
          );
          const poWeightRes = await client.query(
            `SELECT COALESCE(SUM(pol.ordered_qty * COALESCE(ps.gross_weight_kg, 8.5)), 0) as expected_total
             FROM purchasing.purchase_order po
             JOIN purchasing.purchase_order_line pol ON pol.po_id = po.id
             LEFT JOIN catalog.packaging_specification ps ON ps.sku_id = pol.sku_id AND ps.valid_until IS NULL
             WHERE po.po_code = $1 OR po.id::text = $1
             GROUP BY po.id`,
            [poCode]
          );
          const netSum = Number(weightCheck.rows[0]?.total_net || 0);
          const expSum = Number(poWeightRes.rows[0]?.expected_total || 0);

          if (expSum > 0 && netSum >= (expSum * 0.95)) {
            await client.query(
              `UPDATE purchasing.purchase_order SET status = 'COMPLETED', updated_at = now() WHERE po_code = $1 OR id::text = $1`,
              [poCode]
            );
            setTimeout(() => {
              this.generatePoPdfReport(poCode).catch(e => console.error('Error generating auto PDF:', e));
            }, 1000);
          }
        } catch (poErr) {
          console.error('Error auto-completing PO:', poErr);
        }
      }

      return updatedTicket.rows[0];
    });
  }

  async confirmDockReceipt(dto: ConfirmDockReceiptDto, actorId?: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dto.truckEntryId);
    if (!isUuid) {
      throw new NotFoundException('Không tìm thấy thông tin chuyến xe (Mã ID không hợp lệ)');
    }

    const entries = await this.db.query(`SELECT * FROM gate.truck_entry WHERE id = $1`, [dto.truckEntryId]);
    if (entries.length === 0) {
      throw new NotFoundException('Không tìm thấy thông tin chuyến xe');
    }

    const noteStr = dto.confirmedQtyCases
      ? `Thủ kho kiểm đếm hạ ${dto.confirmedQtyCases} thùng xe này. ${dto.notes || ''}`.trim()
      : (dto.notes || null);

    const updated = await this.db.query(
      `UPDATE gate.truck_entry
       SET status = 'DOCK_RECEIVED',
           storekeeper_confirmed = true,
           storekeeper_confirmed_at = now(),
           storekeeper_confirmed_by = $2,
           storekeeper_notes = $3,
           confirmed_qty_cases = $4,
           updated_at = now()
       WHERE id = $1 RETURNING *`,
      [dto.truckEntryId, actorId || null, noteStr, dto.confirmedQtyCases || null]
    );

    return updated[0];
  }

  async checkOut(truckEntryId: string) {
    const entries = await this.db.query(`SELECT * FROM gate.truck_entry WHERE id = $1`, [truckEntryId]);
    if (entries.length === 0) {
      throw new NotFoundException('Không tìm thấy thông tin chuyến xe');
    }

    const updated = await this.db.query(
      `UPDATE gate.truck_entry
       SET status = 'COMPLETED', updated_at = now()
       WHERE id = $1 RETURNING *`,
      [truckEntryId]
    );

    return updated[0];
  }

  async listEntries(status?: string) {
    let sql = `
      SELECT e.*,
             t.weight_in, t.weight_out, t.net_weight, t.expected_weight, t.diff_percentage, t.verification_status,
             COALESCE(l.code, e.dock_location_id::text) as dock_code,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'skuCode', k.code,
                 'skuName', k.name,
                 'orderedQty', pol.ordered_qty,
                 'unitWeightKg', COALESCE(ps.gross_weight_kg, 8.5),
                 'lineWeightKg', (pol.ordered_qty * COALESCE(ps.gross_weight_kg, 8.5))
               ))
               FROM purchasing.purchase_order po
               JOIN purchasing.purchase_order_line pol ON pol.po_id = po.id
               JOIN catalog.sku k ON k.id = pol.sku_id
               LEFT JOIN catalog.packaging_specification ps ON ps.sku_id = k.id AND ps.valid_until IS NULL
               WHERE po.po_code = e.po_do_code OR po.id = e.po_id
             ), '[]'::json) AS po_sku_lines
      FROM gate.truck_entry e
      LEFT JOIN gate.weighbridge_ticket t ON t.truck_entry_id = e.id
      LEFT JOIN warehouse.location l ON l.id = e.dock_location_id
    `;
    const params: unknown[] = [];

    if (status && status !== 'ALL') {
      sql += ` WHERE e.status = $1`;
      params.push(status);
    }

    sql += ` ORDER BY e.created_at DESC LIMIT 100`;

    return await this.db.query(sql, params);
  }

  async getEntryById(id: string) {
    const rows = await this.db.query(
      `SELECT e.*,
              t.weight_in, t.weighed_in_at, t.weight_out, t.weighed_out_at, t.net_weight, t.expected_weight, t.diff_percentage, t.verification_status, t.notes,
              COALESCE(l.code, e.dock_location_id::text) as dock_code,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'skuCode', k.code,
                  'skuName', k.name,
                  'orderedQty', pol.ordered_qty,
                  'unitWeightKg', COALESCE(ps.gross_weight_kg, 8.5),
                  'lineWeightKg', (pol.ordered_qty * COALESCE(ps.gross_weight_kg, 8.5))
                ))
                FROM purchasing.purchase_order po
                JOIN purchasing.purchase_order_line pol ON pol.po_id = po.id
                JOIN catalog.sku k ON k.id = pol.sku_id
                LEFT JOIN catalog.packaging_specification ps ON ps.sku_id = k.id AND ps.valid_until IS NULL
                WHERE po.po_code = e.po_do_code OR po.id = e.po_id
              ), '[]'::json) AS po_sku_lines
       FROM gate.truck_entry e
       LEFT JOIN gate.weighbridge_ticket t ON t.truck_entry_id = e.id
       LEFT JOIN warehouse.location l ON l.id = e.dock_location_id
       WHERE e.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      throw new NotFoundException('Không tìm thấy thông tin chuyến xe');
    }

    return rows[0];
  }

  async listDocks() {
    const sql = `
      SELECT l.id, l.code, CONCAT('Cửa ', CASE WHEN l.code LIKE '%01' THEN 'Nhập Hàng' ELSE 'Xuất Hàng' END, ' - ', z.name) as name, l.status, z.name as zone_name, z.code as zone_code
      FROM warehouse.location l
      JOIN warehouse.zone z ON z.id = l.zone_id
      JOIN warehouse.warehouse w ON w.id = z.warehouse_id
      WHERE l.code LIKE 'DOCK-%' AND w.code = 'KHO-CITARES'
      ORDER BY l.code ASC
    `;
    const rows = await this.db.query(sql);
    if (rows.length === 0) {
      return await this.db.query(`
        SELECT l.id, l.code, l.code as name, l.status, z.name as zone_name, z.code as zone_code
        FROM warehouse.location l
        JOIN warehouse.zone z ON z.id = l.zone_id
        WHERE l.code LIKE 'DOCK-%'
        ORDER BY l.code ASC
      `);
    }
    return rows;
  }

  async listApprovedOrders() {
    let pos: any[] = [];
    let dos: any[] = [];

    try {
      pos = await this.db.query(`
        SELECT po.id,
               po.po_code as order_code,
               'INBOUND' as purpose,
               COALESCE(s.name, s.code, 'Nhà Cung Cấp Đồ Uống') as partner_name,
               COUNT(pol.id)::int as total_skus,
               COALESCE(SUM(pol.ordered_qty), 0)::int as total_qty,
               COALESCE(ROUND(SUM(pol.ordered_qty * 12.0)), 0)::int as expected_weight_kg,
               'PO' as type
        FROM purchasing.purchase_order po
        LEFT JOIN purchasing.supplier s ON s.id = po.supplier_id
        LEFT JOIN purchasing.purchase_order_line pol ON pol.po_id = po.id
        WHERE po.status = 'APPROVED' AND (s.status = 'ACTIVE' OR s.status IS NULL)
        GROUP BY po.id, po.po_code, po.created_at, s.name, s.code
        ORDER BY po.created_at DESC
        LIMIT 20
      `);
    } catch (e) {
      console.error('Error fetching approved POs for Gate:', e);
      pos = [];
    }

    try {
      dos = await this.db.query(`
        SELECT o.id,
               o.order_number as order_code,
               'OUTBOUND' as purpose,
               COALESCE(c.name, 'Đại Lý Phương Trang') as partner_name,
               COUNT(ol.id)::int as total_skus,
               COALESCE(SUM(ol.requested_qty), 0)::int as total_qty,
               COALESCE(ROUND(SUM(ol.requested_qty * 12.0)), 0)::int as expected_weight_kg,
               'DO' as type
        FROM outbound.outbound_order o
        LEFT JOIN outbound.customer c ON c.id = o.customer_id
        LEFT JOIN outbound.outbound_order_line ol ON ol.outbound_order_id = o.id
        GROUP BY o.id, o.order_number, o.created_at, c.name
        ORDER BY o.created_at DESC
        LIMIT 20
      `);
    } catch (e) {
      dos = [];
    }

    return [...pos, ...dos];
  }

  async resetData() {
    await this.db.query(`DELETE FROM gate.weighbridge_ticket`);
    await this.db.query(`DELETE FROM gate.truck_entry`);
    return { success: true, message: 'Đã xóa toàn bộ dữ liệu xe & cân trạm test thành công!' };
  }

  async generatePoPdfReport(poCode: string) {
    const poRes = await this.db.query(`
      SELECT po.id, po.po_code, po.status, to_char(po.order_date, 'YYYY-MM-DD') as order_date,
             COALESCE(s.name, s.code, 'Suntory PepsiCo Việt Nam') as supplier_name
      FROM purchasing.purchase_order po
      LEFT JOIN purchasing.supplier s ON s.id = po.supplier_id
      WHERE po.po_code = $1 OR po.id::text = $1
    `, [poCode]);

    const po = poRes[0];
    if (!po) {
      throw new NotFoundException(`Không tìm thấy đơn PO [${poCode}]`);
    }

    const skuLinesRes = await this.db.query(`
      SELECT k.code as sku_code, k.name as sku_name, pol.ordered_qty,
             COALESCE(ps.gross_weight_kg, 8.5) as unit_weight_kg,
             (pol.ordered_qty * COALESCE(ps.gross_weight_kg, 8.5)) as line_weight_kg
      FROM purchasing.purchase_order_line pol
      JOIN catalog.sku k ON k.id = pol.sku_id
      LEFT JOIN catalog.packaging_specification ps ON ps.sku_id = k.id AND ps.valid_until IS NULL
      WHERE pol.po_id = $1
    `, [po.id]);

    const trucksRes = await this.db.query(`
      SELECT e.entry_code, e.license_plate, e.driver_name, e.status, e.confirmed_qty_cases,
             COALESCE(l.code, e.dock_location_id::text, 'DOCK-A01') as dock_code,
             COALESCE(t.weight_in, 0) as weight_in,
             COALESCE(t.weight_out, 0) as weight_out,
             COALESCE(t.net_weight, 0) as net_weight,
             COALESCE(t.verification_status, 'VALID') as verification_status
      FROM gate.truck_entry e
      LEFT JOIN gate.weighbridge_ticket t ON t.truck_entry_id = e.id
      LEFT JOIN warehouse.location l ON l.id = e.dock_location_id
      WHERE e.po_do_code = $1 OR e.po_id::text = $1
      ORDER BY e.created_at ASC
    `, [poCode]);

    const skuLines = skuLinesRes.map((r: any) => ({
      skuCode: r.sku_code,
      skuName: r.sku_name,
      orderedQty: Number(r.ordered_qty),
      unitWeightKg: Number(r.unit_weight_kg),
      lineWeightKg: Number(r.line_weight_kg)
    }));

    const totalExpectedWeightKg = skuLines.reduce((sum: number, l: any) => sum + l.lineWeightKg, 0);
    const totalExpectedCases = skuLines.reduce((sum: number, l: any) => sum + l.orderedQty, 0);

    const truckEntries = trucksRes.map((r: any) => ({
      entryCode: r.entry_code,
      licensePlate: r.license_plate,
      driverName: r.driver_name,
      dockCode: r.dock_code,
      weightIn: Number(r.weight_in),
      weightOut: Number(r.weight_out),
      netWeight: Number(r.net_weight),
      confirmedQtyCases: r.confirmed_qty_cases ? Number(r.confirmed_qty_cases) : undefined,
      verificationStatus: r.verification_status
    }));

    const reportData: PoReportData = {
      poCode: po.po_code,
      supplierName: po.supplier_name,
      status: po.status,
      orderDate: po.order_date,
      totalExpectedWeightKg,
      totalExpectedCases,
      skuLines,
      truckEntries
    };

    const pdfPath = await this.pdfReport.generatePoReportPdf(reportData);
    return {
      success: true,
      poCode: po.po_code,
      pdfPath,
      message: `Đã sinh thành công báo cáo PDF quyết toán đơn PO [${po.po_code}] tại ${pdfPath}`
    };
  }
}
