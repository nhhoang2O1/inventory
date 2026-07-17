import { Injectable } from '@nestjs/common';
import { calculateAtp, type AtpSnapshot } from '@wms/contracts';

@Injectable()
export class InventoryCoreService {
  calculateAtp(sellableOnHand: number, activeReservation: number): AtpSnapshot {
    return calculateAtp(sellableOnHand, activeReservation);
  }
}
