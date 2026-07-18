import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PurchasingDatabaseService } from './purchasing-database.service.js';

@Injectable()
export class SupplierService {
  constructor(private readonly db: PurchasingDatabaseService) {}

  async create(data: { code: string; name: string; phone?: string; standardLeadTimeDays: number }) {
    const codeNormalized = data.code.trim().toUpperCase();
    const nameNormalized = data.name.trim();

    if (!codeNormalized) {
      throw new ConflictException('Supplier code cannot be blank');
    }
    if (!nameNormalized) {
      throw new ConflictException('Supplier name cannot be blank');
    }
    if (data.standardLeadTimeDays < 0) {
      throw new ConflictException('Standard lead time days must be non-negative');
    }

    try {
      const rows = await this.db.query<{ id: string }>(
        `INSERT INTO purchasing.supplier (code, name, phone, standard_lead_time_days)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [codeNormalized, nameNormalized, data.phone ?? null, data.standardLeadTimeDays]
      );
      return { id: rows[0]?.id };
    } catch (error) {
      if (error instanceof Error && error.message.includes('unique constraint')) {
        throw new ConflictException('Supplier code already exists');
      }
      throw error;
    }
  }

  async findAll() {
    return this.db.query(
      `SELECT id, code, name, phone, standard_lead_time_days, status, created_at
       FROM purchasing.supplier
       ORDER BY code`
    );
  }

  async findOne(id: string) {
    const rows = await this.db.query(
      `SELECT id, code, name, phone, standard_lead_time_days, status, created_at
       FROM purchasing.supplier
       WHERE id = $1`,
      [id]
    );
    const supplier = rows[0];
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return supplier;
  }
}
