-- Migration 0028: Clean all test truck entries and weighbridge tickets
DELETE FROM gate.weighbridge_ticket;
DELETE FROM gate.truck_entry;
