# ADR 0004: One effective role and effective-dated warehouse scope

- Status: Accepted for Phase 3 baseline
- Date: 2026-07-17

## Context

The requirement defines User, Role, Permission and UserWarehouseScope, requires separation of duties, and records the effective role in audit. It does not require simultaneous multi-role assignment.

Allowing a user to union permissions from several roles would make least privilege and creator/approver separation harder to reason about. Warehouse grants must support multiple warehouses and preserve their history.

## Decision

- Each active account has exactly one effective `role_id`.
- A role receives many permissions through `iam.role_permission`.
- An account receives zero or more effective-dated warehouse grants through `iam.user_warehouse_scope`.
- Authorization is evaluated server-side in this order: active actor, required permission, warehouse scope, then the command's business policy.
- `warehouse.warehouse` is introduced with identity/status fields in WP01 solely to enforce scope foreign keys. WP06 extends it with Zone, Location and policy topology.
- IAM does not own or mutate document or Inventory Core data.

## Consequences

- Permission calculation is deterministic and auditable.
- A job requiring a different responsibility uses a separately approved role change instead of hidden permission union.
- If stakeholders later require concurrent roles, a new ADR and forward-only migration can add assignments without rewriting this migration.
