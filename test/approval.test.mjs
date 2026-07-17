import assert from 'node:assert/strict';
import test from 'node:test';
import { canDecideApproval } from '../shared/contracts/dist/index.js';

const base = {
  status: 'PENDING', creatorId: 'maker', actorId: 'checker', fourEyesRequired: true,
  currentLevel: 1, decisionLevel: 1, requiredPermission: 'PO.APPROVE_L1',
  actorPermissions: ['PO.APPROVE_L1']
};

test('allows a different authorized actor at the current level', () => {
  assert.deepEqual(canDecideApproval(base), { allowed: true });
});
test('prevents creator self-approval under four-eyes policy', () => {
  assert.deepEqual(canDecideApproval({ ...base, actorId: 'maker' }), { allowed: false, code: 'FOUR_EYES_VIOLATION' });
});
test('prevents approval at the wrong level', () => {
  assert.deepEqual(canDecideApproval({ ...base, decisionLevel: 2 }), { allowed: false, code: 'APPROVAL_LEVEL_MISMATCH' });
});
test('requires the level-specific permission', () => {
  assert.deepEqual(canDecideApproval({ ...base, actorPermissions: [] }), { allowed: false, code: 'APPROVAL_PERMISSION_DENIED' });
});
test('prevents decisions on a completed request', () => {
  assert.deepEqual(canDecideApproval({ ...base, status: 'APPROVED' }), { allowed: false, code: 'REQUEST_NOT_PENDING' });
});
