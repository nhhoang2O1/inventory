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
