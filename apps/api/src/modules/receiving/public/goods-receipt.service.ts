import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ReceivingDatabaseService } from './receiving-database.service.js';

export interface GoodsReceiptLineInput {
  poLineId: string;
  skuId: string;
  batchId: string;
  quantity: number;
  uomId: string;
  locationId: string;
  stockStatus: string;
}

export interface CreateGoodsReceiptInput {
  grCode: string;
  poId: string;
  receivedDate?: string;
  idempotencyKey: string;
  lines: GoodsReceiptLineInput[];
}

@Injectable()
export class GoodsReceiptService {
  constructor(private readonly db: ReceivingDatabaseService) {}

  async create(actorId: string, input: CreateGoodsReceiptInput) {
    const grCodeNormalized = input.grCode.trim().toUpperCase();
    if (!grCodeNormalized) {
      throw new ConflictException('GR Code is required');
    }
    if (!input.idempotencyKey) {
      throw new ConflictException('Idempotency key is required');
    }
    if (!input.lines || input.lines.length === 0) {
      throw new ConflictException('Goods receipt must have at least one line item');
    }

    // Check PO
    const poRows = await this.db.query<{ status: string }>(
      'SELECT status FROM purchasing.purchase_order WHERE id = $1',
      [input.poId]
    );
    const po = poRows[0];
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }
    if (po.status !== 'APPROVED' && po.status !== 'SENT' && po.status !== 'PARTIALLY_RECEIVED') {
      throw new ConflictException(`Cannot receive goods for PO in ${po.status} status`);
    }

    const receivedDateVal = input.receivedDate ? new Date(input.receivedDate) : new Date();

    try {
      return await this.db.transaction(async (client) => {
        // Insert Header
        const grResult = await client.query<{ id: string }>(
          `INSERT INTO receiving.goods_receipt (gr_code, po_id, status, received_date, received_by, idempotency_key)
           VALUES ($1, $2, 'DRAFT', $3, $4, $5)
           RETURNING id`,
          [grCodeNormalized, input.poId, receivedDateVal, actorId, input.idempotencyKey]
        );
        const grId = grResult.rows[0]?.id;
        if (!grId) {
          throw new Error('Failed to create goods receipt header');
        }

        // Insert Lines
        for (const line of input.lines) {
          if (line.quantity <= 0) {
            throw new ConflictException('Received quantity must be greater than 0');
          }

          // Validate SKU and UOM exists
          const skuCheck = await client.query('SELECT 1 FROM catalog.sku WHERE id = $1', [line.skuId]);
          if (skuCheck.rowCount === 0) {
            throw new NotFoundException(`SKU with ID ${line.skuId} not found`);
          }

          const uomCheck = await client.query('SELECT 1 FROM catalog.unit_of_measure WHERE id = $1', [line.uomId]);
          if (uomCheck.rowCount === 0) {
            throw new NotFoundException(`Unit of Measure with ID ${line.uomId} not found`);
          }

          // Validate batch
          const batchRows = await client.query<{ manufacturing_date: string; expiration_date: string }>(
            'SELECT manufacturing_date, expiration_date FROM inventory.batch WHERE id = $1',
            [line.batchId]
          );
          const batch = batchRows.rows[0];
          if (!batch) {
            throw new NotFoundException(`Batch with ID ${line.batchId} not found`);
          }

          const mfg = new Date(batch.manufacturing_date);
          const exp = new Date(batch.expiration_date);
          if (mfg >= exp) {
            throw new ConflictException('MFG_DATE must be before EXP_DATE');
          }

          // Validate location
          const locCheck = await client.query('SELECT 1 FROM warehouse.location WHERE id = $1', [line.locationId]);
          if (locCheck.rowCount === 0) {
            throw new NotFoundException(`Location with ID ${line.locationId} not found`);
          }

          // Validate PO Line matches
          const poLineRows = await client.query<{ sku_id: string; ordered_qty: string; received_qty: string }>(
            'SELECT sku_id, ordered_qty, received_qty FROM purchasing.purchase_order_line WHERE id = $1 AND po_id = $2',
            [line.poLineId, input.poId]
          );
          const poLine = poLineRows.rows[0];
          if (!poLine) {
            throw new ConflictException(`PO line with ID ${line.poLineId} does not match PO ${input.poId}`);
          }
          if (poLine.sku_id !== line.skuId) {
            throw new ConflictException(`SKU ID on receipt line (${line.skuId}) does not match PO line SKU (${poLine.sku_id})`);
          }

          await client.query(
            `INSERT INTO receiving.goods_receipt_line (gr_id, po_line_id, sku_id, batch_id, quantity, uom_id, location_id, stock_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              grId,
              line.poLineId,
              line.skuId,
              line.batchId,
              line.quantity,
              line.uomId,
              line.locationId,
              line.stockStatus
            ]
          );
        }

        return { id: grId, grCode: grCodeNormalized };
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('unique constraint')) {
        throw new ConflictException('Goods receipt code or idempotency key already exists');
      }
      throw error;
    }
  }

  async findOne(id: string) {
    const grRows = await this.db.query<{
      id: string;
      gr_code: string;
      po_id: string;
      status: string;
      received_date: string;
      received_by: string;
      idempotency_key: string;
    }>(
      `SELECT id, gr_code, po_id, status, received_date, received_by, idempotency_key
       FROM receiving.goods_receipt
       WHERE id = $1`,
      [id]
    );

    const gr = grRows[0];
    if (!gr) {
      throw new NotFoundException('Goods receipt not found');
    }

    const lineRows = await this.db.query<{
      id: string;
      po_line_id: string;
      sku_id: string;
      batch_id: string;
      quantity: string;
      uom_id: string;
      location_id: string;
      stock_status: string;
    }>(
      `SELECT id, po_line_id, sku_id, batch_id, quantity, uom_id, location_id, stock_status
       FROM receiving.goods_receipt_line
       WHERE gr_id = $1`,
      [id]
    );

    return {
      ...gr,
      lines: lineRows.map((row) => ({
        id: row.id,
        poLineId: row.po_line_id,
        skuId: row.sku_id,
        batchId: row.batch_id,
        quantity: Number(row.quantity),
        uomId: row.uom_id,
        locationId: row.location_id,
        stockStatus: row.stock_status
      }))
    };
  }

  async post(actorId: string, id: string, correlationId: string, reason?: string) {
    const grRows = await this.db.query<{
      status: string;
      po_id: string;
      received_date: string;
    }>(
      'SELECT status, po_id, received_date FROM receiving.goods_receipt WHERE id = $1',
      [id]
    );
    const gr = grRows[0];
    if (!gr) {
      throw new NotFoundException('Goods receipt not found');
    }

    if (gr.status === 'POSTED') {
      throw new ConflictException('Goods receipt is already posted');
    }
    if (gr.status === 'CANCELLED') {
      throw new ConflictException('Cannot post a cancelled goods receipt');
    }

    const lines = await this.db.query<{
      id: string;
      po_line_id: string;
      sku_id: string;
      batch_id: string;
      quantity: string;
      uom_id: string;
      location_id: string;
      stock_status: string;
    }>(
      `SELECT id, po_line_id, sku_id, batch_id, quantity, uom_id, location_id, stock_status
       FROM receiving.goods_receipt_line
       WHERE gr_id = $1`,
      [id]
    );

    if (lines.length === 0) {
      throw new ConflictException('Cannot post an empty goods receipt');
    }

    return this.db.transaction(async (client) => {
      const movementIds: string[] = [];

      for (const line of lines) {
        const qty = Number(line.quantity);

        // 1. Retrieve the batch and verify Dates
        const batchRows = await client.query<{ expiration_date: string }>(
          'SELECT expiration_date FROM inventory.batch WHERE id = $1',
          [line.batch_id]
        );
        const batch = batchRows.rows[0];
        if (!batch) {
          throw new NotFoundException(`Batch with ID ${line.batch_id} not found`);
        }

        // 2. MRSL Policy Validation
        const expirationDate = new Date(batch.expiration_date);
        const receivedDate = new Date(gr.received_date);
        const remainingDays = Math.floor((expirationDate.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24));

        const policyRows = await client.query<{ min_remaining_days: number; exception_mode: string }>(
          `SELECT min_remaining_days, exception_mode
           FROM receiving.mrsl_policy
           WHERE sku_id = $1 AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())
           ORDER BY valid_from DESC LIMIT 1`,
          [line.sku_id]
        );

        let finalStockStatus = line.stock_status;
        const policy = policyRows.rows[0];
        if (policy && remainingDays < policy.min_remaining_days) {
          if (policy.exception_mode === 'REJECT') {
            throw new ConflictException(
              `MRSL validation failed for SKU ${line.sku_id}: remaining shelf life is ${remainingDays} days, minimum required is ${policy.min_remaining_days} days.`
            );
          } else if (policy.exception_mode === 'QUARANTINE') {
            finalStockStatus = 'QUARANTINED';
          } else if (policy.exception_mode === 'ALLOW_WITH_APPROVAL') {
            // Require explicit override or raise error. For MVP, we raise exception since there is no approved request.
            throw new ConflictException(
              `MRSL validation failed for SKU ${line.sku_id}: remaining shelf life is ${remainingDays} days. Requires supervisor approval to allow.`
            );
          }
        }

        // 3. Update PO line quantities & check tolerance
        const poLineRows = await client.query<{ ordered_qty: string; received_qty: string }>(
          'SELECT ordered_qty, received_qty FROM purchasing.purchase_order_line WHERE id = $1',
          [line.po_line_id]
        );
        const poLine = poLineRows.rows[0];
        if (!poLine) {
          throw new ConflictException(`Matching PO line not found for receipt line ${line.id}`);
        }

        const newReceivedQty = Number(poLine.received_qty) + qty;
        const orderedQty = Number(poLine.ordered_qty);

        if (newReceivedQty > orderedQty * 1.10) {
          throw new ConflictException(
            `Received quantity exceeds ordered quantity plus tolerance (10%): ordered ${orderedQty}, received ${newReceivedQty}`
          );
        }

        await client.query(
          'UPDATE purchasing.purchase_order_line SET received_qty = $1 WHERE id = $2',
          [newReceivedQty, line.po_line_id]
        );

        // 4. Retrieve destination warehouse_id from location
        const locRows = await client.query<{ warehouse_id: string }>(
          `SELECT z.warehouse_id
           FROM warehouse.location l
           JOIN warehouse.zone z ON l.zone_id = z.id
           WHERE l.id = $1`,
          [line.location_id]
        );
        const destWarehouseId = locRows.rows[0]?.warehouse_id;
        if (!destWarehouseId) {
          throw new NotFoundException(`Warehouse not found for location ID ${line.location_id}`);
        }

        // 5. Call Inventory Core post_movement function
        const commandKey = `${id}:${line.id}`;
        const postResult = await client.query<{ id: string }>(
          `SELECT inventory.post_movement(
            'RECEIPT',
            'GOODS_RECEIPT',
            $1,
            $2,
            $3,
            $4,
            $5,
            NULL, NULL, NULL, -- source: NULL
            $6,
            $7,
            $8,
            $9,
            $10,
            $11
          ) id`,
          [
            id,
            commandKey,
            line.sku_id,
            line.batch_id,
            qty,
            destWarehouseId,
            line.location_id,
            finalStockStatus,
            actorId,
            correlationId,
            reason ?? null
          ]
        );

        const movementId = postResult.rows[0]?.id;
        if (!movementId) {
          throw new Error('Failed to post movement to inventory ledger');
        }
        movementIds.push(movementId);

        // FEFO tie-break uses the earliest physical receipt date after expiration date.
        await client.query(
          `UPDATE inventory.batch
           SET first_received_date = least(
             coalesce(first_received_date, $2::date),
             $2::date
           )
           WHERE id = $1`,
          [line.batch_id, gr.received_date]
        );
      }

      // 6. Update PO status
      const allPoLinesRows = await client.query<{ ordered_qty: string; received_qty: string }>(
        'SELECT ordered_qty, received_qty FROM purchasing.purchase_order_line WHERE po_id = $1',
        [gr.po_id]
      );
      let allFullyReceived = true;
      let anyReceived = false;
      for (const row of allPoLinesRows.rows) {
        const oQty = Number(row.ordered_qty);
        const rQty = Number(row.received_qty);
        if (rQty < oQty) {
          allFullyReceived = false;
        }
        if (rQty > 0) {
          anyReceived = true;
        }
      }

      let newPoStatus = 'APPROVED';
      if (allFullyReceived) {
        newPoStatus = 'RECEIVED';
      } else if (anyReceived) {
        newPoStatus = 'PARTIALLY_RECEIVED';
      }

      await client.query(
        'UPDATE purchasing.purchase_order SET status = $1, updated_at = now() WHERE id = $2',
        [newPoStatus, gr.po_id]
      );

      // 7. Update Goods Receipt status
      await client.query(
        `UPDATE receiving.goods_receipt
         SET status = 'POSTED', updated_at = now()
         WHERE id = $1`,
         [id]
      );

      return { documentId: id, status: 'POSTED', movementIds };
    });
  }
}
