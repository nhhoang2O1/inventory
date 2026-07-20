import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PurchasingDatabaseService } from './purchasing-database.service.js';

export interface PurchaseOrderLineInput {
  skuId: string;
  orderedQty: number;
  uomId: string;
  unitPrice: number;
  vatRate?: number;
  exciseTaxRate?: number;
}

export interface CreatePurchaseOrderInput {
  poCode: string;
  supplierId: string;
  orderDate?: string;
  lines: PurchaseOrderLineInput[];
}

@Injectable()
export class PurchaseOrderService {
  constructor(private readonly db: PurchasingDatabaseService) {}

  async create(actorId: string, input: CreatePurchaseOrderInput) {
    const poCodeNormalized = input.poCode.trim().toUpperCase();
    if (!poCodeNormalized) {
      throw new ConflictException('PO Code is required');
    }
    if (!input.lines || input.lines.length === 0) {
      throw new ConflictException('Purchase order must have at least one line item');
    }

    // 1. Retrieve supplier standard lead time
    const supplierRows = await this.db.query<{ standard_lead_time_days: number; status: string }>(
      'SELECT standard_lead_time_days, status FROM purchasing.supplier WHERE id = $1',
      [input.supplierId]
    );
    const supplier = supplierRows[0];
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    if (supplier.status !== 'ACTIVE') {
      throw new ConflictException('Supplier is inactive');
    }

    // 2. Calculate expected delivery date
    const orderDateVal = input.orderDate ? new Date(input.orderDate) : new Date();
    const expectedDeliveryDate = new Date(orderDateVal);
    expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + supplier.standard_lead_time_days);

    try {
      return await this.db.transaction(async (client) => {
        // Insert PO header
        const poResult = await client.query<{ id: string }>(
          `INSERT INTO purchasing.purchase_order (po_code, supplier_id, status, order_date, expected_delivery_date, created_by)
           VALUES ($1, $2, 'DRAFT', $3, $4, $5)
           RETURNING id`,
          [poCodeNormalized, input.supplierId, orderDateVal.toISOString().split('T')[0], expectedDeliveryDate, actorId]
        );
        const poId = poResult.rows[0]?.id;
        if (!poId) {
          throw new Error('Failed to create purchase order header');
        }

        // Insert PO lines
        for (const line of input.lines) {
          if (line.orderedQty <= 0) {
            throw new ConflictException('Ordered quantity must be greater than 0');
          }
          if (line.unitPrice < 0) {
            throw new ConflictException('Unit price must be non-negative');
          }

          // Validate SKU and UOM exists in catalog
          const skuCheck = await client.query('SELECT 1 FROM catalog.sku WHERE id = $1', [line.skuId]);
          if (skuCheck.rowCount === 0) {
            throw new NotFoundException(`SKU with ID ${line.skuId} not found`);
          }

          const uomCheck = await client.query('SELECT 1 FROM catalog.unit_of_measure WHERE id = $1', [line.uomId]);
          if (uomCheck.rowCount === 0) {
            throw new NotFoundException(`Unit of Measure with ID ${line.uomId} not found`);
          }

          await client.query(
            `INSERT INTO purchasing.purchase_order_line (po_id, sku_id, ordered_qty, received_qty, uom_id, unit_price, vat_rate, excise_tax_rate)
             VALUES ($1, $2, $3, 0, $4, $5, $6, $7)`,
            [
              poId,
              line.skuId,
              line.orderedQty,
              line.uomId,
              line.unitPrice,
              line.vatRate ?? 10.00,
              line.exciseTaxRate ?? 0.00
            ]
          );
        }

        return { id: poId, poCode: poCodeNormalized, expectedDeliveryDate };
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('unique constraint')) {
        throw new ConflictException('Purchase order code already exists');
      }
      throw error;
    }
  }

  async findOne(id: string) {
    const poRows = await this.db.query<{
      id: string;
      po_code: string;
      supplier_id: string;
      status: string;
      order_date: string;
      expected_delivery_date: string;
      created_by: string;
    }>(
      `SELECT id, po_code, supplier_id, status, order_date, expected_delivery_date, created_by
       FROM purchasing.purchase_order
       WHERE id = $1`,
      [id]
    );

    const po = poRows[0];
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    const lineRows = await this.db.query<{
      id: string;
      sku_id: string;
      ordered_qty: string;
      received_qty: string;
      uom_id: string;
      unit_price: string;
      vat_rate: string;
      excise_tax_rate: string;
    }>(
      `SELECT id, sku_id, ordered_qty, received_qty, uom_id, unit_price, vat_rate, excise_tax_rate
       FROM purchasing.purchase_order_line
       WHERE po_id = $1`,
      [id]
    );

    return {
      ...po,
      lines: lineRows.map((row) => ({
        id: row.id,
        skuId: row.sku_id,
        orderedQty: Number(row.ordered_qty),
        receivedQty: Number(row.received_qty),
        uomId: row.uom_id,
        unitPrice: Number(row.unit_price),
        vatRate: Number(row.vat_rate),
        exciseTaxRate: Number(row.excise_tax_rate)
      }))
    };
  }

  async list() {
    return this.db.query<{
      id: string;
      po_code: string;
      supplier_id: string;
      status: string;
      order_date: string;
      expected_delivery_date: string;
      created_by: string;
    }>(
      `SELECT id, po_code, supplier_id, status, order_date, expected_delivery_date, created_by
       FROM purchasing.purchase_order
       ORDER BY created_at DESC`
    );
  }

  async approve(actorId: string, id: string) {
    const poRows = await this.db.query<{ status: string }>(
      'SELECT status FROM purchasing.purchase_order WHERE id = $1',
      [id]
    );
    const po = poRows[0];
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    if (po.status !== 'DRAFT' && po.status !== 'PENDING_APPROVAL') {
      throw new ConflictException(`Cannot approve PO in ${po.status} status`);
    }

    await this.db.query(
      `UPDATE purchasing.purchase_order
       SET status = 'APPROVED', updated_at = now()
       WHERE id = $1`,
      [id]
    );

    return { id, status: 'APPROVED' };
  }
}
