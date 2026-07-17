import assert from 'node:assert/strict';import test from 'node:test';import {calculateAtp} from '../shared/contracts/dist/index.js';
test('ATP equals sellable on-hand minus active reservation',()=>assert.deepEqual(calculateAtp(100,30),{sellableOnHand:100,activeReservation:30,atp:70}));
test('ATP cannot become negative',()=>assert.throws(()=>calculateAtp(100,101),/Invalid whole-case ATP/));
test('ATP inputs must be whole cases',()=>assert.throws(()=>calculateAtp(10.5,1),/Invalid whole-case ATP/));
