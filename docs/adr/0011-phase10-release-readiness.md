# ADR 0011: Phase 10 release readiness and session boundary

## Status

Accepted.

## Context

The Phase 10 release gate must combine technical regression evidence, migration rehearsals, operational reconciliation, security checks and stakeholder UAT. The merged Phase 5 UI also introduced local login, but an actor header by itself is not an acceptable production authentication boundary.

## Decision

- Production API requests require a short-lived opaque session. Only a SHA-256 token digest is stored.
- Local passwords use salted PBKDF2-SHA512 and constant-time comparison. Failed attempts are append-only and throttled.
- Development and automated tests may continue using `X-Actor-Id`; production, or `REQUIRE_SESSION_AUTH=true`, rejects header-only authentication.
- Release evidence is stored in the append-only `platform.release_gate_run` table with actor, correlation ID, request hash and idempotency key.
- `/health` remains a liveness endpoint. `/health/ready` checks the migration head and operational blocker snapshot.
- Production promotion requires two successful clean migration dry runs plus the latest successful regression, performance, security, backup/restore, UAT, reconciliation, smoke and go/no-go gates.
- Demo users are explicit development/UAT seed data and are never part of forward migrations.

## Consequences

The release decision is reproducible and auditable, and invalid sessions cannot spoof an actor header in production. A release can be technically ready while still awaiting business UAT or go/no-go evidence. Authentication is suitable for the current local-provider scope; enterprise SSO and centralized secret/session storage remain future deployment concerns.
