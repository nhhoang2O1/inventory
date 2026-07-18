# Phase 3 WP01 evidence: IAM and Warehouse Scope

- Status: implementation complete; peer review pending
- Branch: `feature/phase-3-master-data`
- Date: 2026-07-17

## Delivered

- `iam.role`, `iam.permission`, `iam.role_permission`.
- `iam.app_user` with one effective role, normalized identity fields, status and optimistic version.
- `iam.user_warehouse_scope` with effective dates, revocation history and real warehouse foreign keys.
- Minimal `warehouse.warehouse` identity/status aggregate; Zone/Location/Capacity remain in WP06.
- Public `ActorAccess`, `AccessDecision` and `authorizeWarehouseAction` contract.
- NestJS `IamModule` and exported `AccessPolicyService` skeleton.
- ADR 0004 documenting the effective-role decision and migration path if concurrent roles are later approved.

## Automated evidence

- `npm run build`: PASS for contracts, database, API, worker and web.
- `npm test`: PASS, 14/14 tests.
- IAM authorization paths covered:
  - authorized permission and warehouse;
  - inactive actor denied;
  - missing permission denied;
  - warehouse outside scope denied.
- Migration invariants confirm role/permission mapping, warehouse foreign keys, deactivation constraints and no Inventory Core tables.

## Database evidence

- `0001_phase2_foundation.sql`: applied.
- `0002_phase3_iam.sql`: applied.
- Second migration run: no-op/pass.
- Runtime objects verified: `iam.app_user`, `iam.role_permission`, `iam.user_warehouse_scope`, `warehouse.warehouse`.
- Negative smoke tests: lowercase role code rejected; scope for a nonexistent warehouse rejected by FK.

## Review boundary

This evidence is technical gate output, not stakeholder approval. Person B should review warehouse consumer impact; Person C should review RBAC/security negative paths before the Phase 3 gate is marked approved.
