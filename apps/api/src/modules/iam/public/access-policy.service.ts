import { Injectable } from '@nestjs/common';
import {
  authorizeWarehouseAction,
  type AccessDecision,
  type ActorAccess
} from '@wms/contracts';

@Injectable()
export class AccessPolicyService {
  authorize(
    actor: ActorAccess,
    requiredPermission: string,
    warehouseId: string
  ): AccessDecision {
    return authorizeWarehouseAction(actor, requiredPermission, warehouseId);
  }
}
