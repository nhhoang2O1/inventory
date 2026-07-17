import assert from 'node:assert/strict';
import test from 'node:test';
import { wholeCaseQuantity } from '../shared/contracts/dist/index.js';

test('accepts a positive integer whole-case quantity', () => {
  assert.equal(wholeCaseQuantity(20), 20);
});

test('rejects fractional case quantities', () => {
  assert.throws(() => wholeCaseQuantity(1.5), /positive integer/);
});

test('rejects zero and negative quantities', () => {
  assert.throws(() => wholeCaseQuantity(0), /positive integer/);
  assert.throws(() => wholeCaseQuantity(-1), /positive integer/);
});
