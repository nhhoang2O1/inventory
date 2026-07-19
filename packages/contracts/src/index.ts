export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STATE_CONFLICT'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'WHOLESALE_QUANTITY_REQUIRED'
  | 'MINIMUM_QUANTITY_NOT_MET'
  | 'INVENTORY_ATP_INSUFFICIENT'
  | 'FEFO_OVERRIDE_REQUIRED'
  | 'MRSL_NOT_MET'
  | 'PICK_CONFLICT'
  | 'INTERNAL_ERROR';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: ErrorCode;
  correlationId: string;
  errors?: Array<{
    field?: string;
    code: string;
    message: string;
  }>;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: {
    correlationId: string;
    timestamp: string;
  };
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  timestamp: string;
}

export interface CommandContext {
  correlationId: string;
  idempotencyKey: string;
  actorId: string;
  warehouseId?: string;
}

export type WholeCaseQuantity = number & { readonly __brand: 'WholeCaseQuantity' };

export function wholeCaseQuantity(value: number): WholeCaseQuantity {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Quantity must be a positive integer of cases/crates/kegs.');
  }
  return value as WholeCaseQuantity;
}

export type AccessDenialCode =
  | 'ACTOR_INACTIVE'
  | 'PERMISSION_DENIED'
  | 'WAREHOUSE_SCOPE_DENIED';

export interface ActorAccess {
  userId: string;
  effectiveRoleId: string;
  active: boolean;
  permissions: readonly string[];
  warehouseIds: readonly string[];
}

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; code: AccessDenialCode };

export function authorizeWarehouseAction(
  actor: ActorAccess,
  requiredPermission: string,
  warehouseId: string
): AccessDecision {
  if (!actor.active) return { allowed: false, code: 'ACTOR_INACTIVE' };
  if (!actor.permissions.includes(requiredPermission)) {
    return { allowed: false, code: 'PERMISSION_DENIED' };
  }
  if (!actor.warehouseIds.includes(warehouseId)) {
    return { allowed: false, code: 'WAREHOUSE_SCOPE_DENIED' };
  }
  return { allowed: true };
}

export type ApprovalDenialCode =
  | 'REQUEST_NOT_PENDING'
  | 'FOUR_EYES_VIOLATION'
  | 'APPROVAL_LEVEL_MISMATCH'
  | 'APPROVAL_PERMISSION_DENIED';

export interface ApprovalCheck {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  creatorId: string;
  actorId: string;
  fourEyesRequired: boolean;
  currentLevel: number;
  decisionLevel: number;
  requiredPermission: string;
  actorPermissions: readonly string[];
}

export type ApprovalDecision =
  | { allowed: true }
  | { allowed: false; code: ApprovalDenialCode };

export function canDecideApproval(input: ApprovalCheck): ApprovalDecision {
  if (input.status !== 'PENDING') return { allowed: false, code: 'REQUEST_NOT_PENDING' };
  if (input.fourEyesRequired && input.creatorId === input.actorId) {
    return { allowed: false, code: 'FOUR_EYES_VIOLATION' };
  }
  if (input.currentLevel !== input.decisionLevel) {
    return { allowed: false, code: 'APPROVAL_LEVEL_MISMATCH' };
  }
  if (!input.actorPermissions.includes(input.requiredPermission)) {
    return { allowed: false, code: 'APPROVAL_PERMISSION_DENIED' };
  }
  return { allowed: true };
}

export type StockStatus = 'AVAILABLE' | 'BLOCKED' | 'QUARANTINED' | 'DAMAGED' | 'EXPIRED' | 'RECALLED' | 'IN_TRANSIT';
export interface AtpSnapshot { sellableOnHand: number; activeReservation: number; atp: number }
export function calculateAtp(sellableOnHand: number, activeReservation: number): AtpSnapshot {
  if (!Number.isSafeInteger(sellableOnHand) || !Number.isSafeInteger(activeReservation) || sellableOnHand < 0 || activeReservation < 0 || activeReservation > sellableOnHand) {
    throw new Error('Invalid whole-case ATP inputs.');
  }
  return { sellableOnHand, activeReservation, atp: sellableOnHand - activeReservation };
}

export interface InventoryPostingLine {
  skuId: string; batchId: string; quantity: WholeCaseQuantity;
  source?: { warehouseId: string; locationId: string; status: StockStatus };
  destination?: { warehouseId: string; locationId: string; status: StockStatus };
}
export interface InventoryPostingCommand {
  documentType: string; documentId: string; idempotencyKey: string; actorId: string;
  correlationId: string; reason?: string; lines: readonly InventoryPostingLine[];
}

export type IssueRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'ALLOCATED'
  | 'PICKING'
  | 'POSTED'
  | 'CANCELLED';

export interface FefoAllocationExplanation {
  batchId: string;
  locationId: string;
  expirationDate: string;
  firstReceivedDate?: string;
  quantity: WholeCaseQuantity;
  fefoRank: number;
  overrideUsed: boolean;
  overrideReason?: string;
}

export interface GoodsIssuePostingResult {
  id: string;
  goodsIssueCode: string;
  status: 'POSTED';
  movementIds: readonly string[];
  replayed: boolean;
}
