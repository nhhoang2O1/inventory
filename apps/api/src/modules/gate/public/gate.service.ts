import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { GateDatabaseService } from './gate-database.service.js';

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

@Injectable()
export class GateService {
  constructor(private readonly db: GateDatabaseService) {}

  private generateEntryCode(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
    return `GATE-${dateStr}-${randomSuffix}`;
  }

  async createCheckIn(dto: CreateCheckInDto, createdByUserId?: string) {
    if (!dto.licensePlate?.trim()) {
      throw new BadRequestException('Biển số xe không được để trống');
    }
    if (!dto.driverName?.trim()) {
      throw new BadRequestException('Tên tài xế không được để trống');
    }

    const entryCode = this.generateEntryCode();

    const rows = await this.db.query(
      `INSERT INTO gate.truck_entry (
        entry_code, license_plate, driver_name, driver_id_card, carrier_name,
        entry_type, purpose, po_id, so_id, dock_location_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CHECKED_IN')
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
        dto.dockLocationId || null
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
    const entries = await this.db.query(`SELECT * FROM gate.truck_entry WHERE id = $1`, [dto.truckEntryId]);
    if (entries.length === 0) {
      throw new NotFoundException('Không tìm thấy thông tin chuyến xe');
    }

    const updated = await this.db.query(
      `UPDATE gate.truck_entry 
       SET dock_location_id = $1, status = 'LOADING', updated_at = now() 
       WHERE id = $2 RETURNING *`,
      [dto.dockLocationId, dto.truckEntryId]
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

      return updatedTicket.rows[0];
    });
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
      SELECT e.*, t.weight_in, t.weight_out, t.net_weight, t.expected_weight, t.diff_percentage, t.verification_status
      FROM gate.truck_entry e
      LEFT JOIN gate.weighbridge_ticket t ON t.truck_entry_id = e.id
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
      `SELECT e.*, t.weight_in, t.weighed_in_at, t.weight_out, t.weighed_out_at, t.net_weight, t.expected_weight, t.diff_percentage, t.verification_status, t.notes
       FROM gate.truck_entry e
       LEFT JOIN gate.weighbridge_ticket t ON t.truck_entry_id = e.id
       WHERE e.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      throw new NotFoundException('Không tìm thấy thông tin chuyến xe');
    }

    return rows[0];
  }
}
