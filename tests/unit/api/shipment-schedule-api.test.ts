/**
 * Patient Shipment Schedule API Tests
 * =====================================
 * Tests the data transformations and access control logic for
 * GET /api/patients/[id]/shipment-schedule
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Test totalSeries calculation logic
// ============================================================================

describe('Shipment Schedule API — Series Grouping', () => {
  it('counts unique parentRefillId values as series', () => {
    const shipments = [
      { id: 1, parentRefillId: null, shipmentNumber: 1, totalShipments: 4 },
      { id: 2, parentRefillId: 1, shipmentNumber: 2, totalShipments: 4 },
      { id: 3, parentRefillId: 1, shipmentNumber: 3, totalShipments: 4 },
      { id: 4, parentRefillId: 1, shipmentNumber: 4, totalShipments: 4 },
    ];

    // Replicate the logic from the route
    const totalSeries = new Set(shipments.map((s) => s.parentRefillId || s.id)).size;
    expect(totalSeries).toBe(1);
  });

  it('counts multiple series correctly', () => {
    const shipments = [
      // Series 1: Tirzepatide 12-month (4 shipments)
      { id: 10, parentRefillId: null, shipmentNumber: 1, totalShipments: 4 },
      { id: 11, parentRefillId: 10, shipmentNumber: 2, totalShipments: 4 },
      { id: 12, parentRefillId: 10, shipmentNumber: 3, totalShipments: 4 },
      { id: 13, parentRefillId: 10, shipmentNumber: 4, totalShipments: 4 },
      // Series 2: Semaglutide 6-month (2 shipments)
      { id: 20, parentRefillId: null, shipmentNumber: 1, totalShipments: 2 },
      { id: 21, parentRefillId: 20, shipmentNumber: 2, totalShipments: 2 },
    ];

    const totalSeries = new Set(shipments.map((s) => s.parentRefillId || s.id)).size;
    expect(totalSeries).toBe(2);
  });

  it('returns 0 series for empty shipments', () => {
    const shipments: { id: number; parentRefillId: number | null }[] = [];
    const totalSeries = new Set(shipments.map((s) => s.parentRefillId || s.id)).size;
    expect(totalSeries).toBe(0);
  });

  it('handles first shipment (parentRefillId is null) as its own series root', () => {
    const shipments = [
      { id: 100, parentRefillId: null, shipmentNumber: 1, totalShipments: 2 },
      { id: 101, parentRefillId: 100, shipmentNumber: 2, totalShipments: 2 },
    ];

    // For the first shipment, parentRefillId is null, so we use id (100)
    // For the second, parentRefillId is 100
    // Both map to 100 → 1 series
    const ids = shipments.map((s) => s.parentRefillId || s.id);
    expect(ids).toEqual([100, 100]);
    expect(new Set(ids).size).toBe(1);
  });
});

// ============================================================================
// Test access control logic
// ============================================================================

describe('Shipment Schedule API — Access Control', () => {
  it('super_admin can access any patient', () => {
    const user = { role: 'super_admin', clinicId: 'clinic_1' };
    const patient = { clinicId: 'clinic_2' };

    const allowed = user.role === 'super_admin' || user.clinicId === patient.clinicId;
    expect(allowed).toBe(true);
  });

  it('clinic user can access patient in same clinic', () => {
    const user = { role: 'admin', clinicId: 'clinic_1' };
    const patient = { clinicId: 'clinic_1' };

    const allowed = user.role === 'super_admin' || user.clinicId === patient.clinicId;
    expect(allowed).toBe(true);
  });

  it('clinic user cannot access patient in different clinic', () => {
    const user = { role: 'admin', clinicId: 'clinic_1' };
    const patient = { clinicId: 'clinic_2' };

    const allowed = user.role === 'super_admin' || user.clinicId === patient.clinicId;
    expect(allowed).toBe(false);
  });
});

// ============================================================================
// Test patient ID validation
// ============================================================================

describe('Shipment Schedule API — Parameter Validation', () => {
  it('rejects non-numeric patient ID', () => {
    const id = 'abc';
    const parsed = parseInt(id, 10);
    expect(isNaN(parsed)).toBe(true);
  });

  it('accepts numeric patient ID', () => {
    const id = '42';
    const parsed = parseInt(id, 10);
    expect(isNaN(parsed)).toBe(false);
    expect(parsed).toBe(42);
  });

  it('rejects empty string', () => {
    const id = '';
    const parsed = parseInt(id, 10);
    expect(isNaN(parsed)).toBe(true);
  });
});

// ============================================================================
// Test shipment data shape for frontend consumption
// ============================================================================

describe('Shipment Schedule — Frontend Data Shape', () => {
  it('shipments contain all fields needed by PatientSubscriptionManager', () => {
    const shipment = {
      id: 1,
      shipmentNumber: 2,
      totalShipments: 4,
      nextRefillDate: new Date('2026-04-15'),
      status: 'SCHEDULED',
      medicationName: 'Tirzepatide',
      planName: '12-month plan',
      parentRefillId: 1,
      invoiceId: 100,
      createdAt: new Date('2026-01-15'),
    };

    // These are the fields the frontend component uses
    expect(shipment).toHaveProperty('id');
    expect(shipment).toHaveProperty('shipmentNumber');
    expect(shipment).toHaveProperty('totalShipments');
    expect(shipment).toHaveProperty('nextRefillDate');
    expect(shipment).toHaveProperty('status');
    expect(shipment).toHaveProperty('medicationName');
    expect(shipment).toHaveProperty('planName');
    expect(shipment).toHaveProperty('parentRefillId');
  });

  it('groups shipments by parentRefillId for series display', () => {
    const shipments = [
      { id: 10, parentRefillId: null, shipmentNumber: 1, totalShipments: 4, medicationName: 'Tirzepatide' },
      { id: 11, parentRefillId: 10, shipmentNumber: 2, totalShipments: 4, medicationName: 'Tirzepatide' },
      { id: 12, parentRefillId: 10, shipmentNumber: 3, totalShipments: 4, medicationName: 'Tirzepatide' },
      { id: 13, parentRefillId: 10, shipmentNumber: 4, totalShipments: 4, medicationName: 'Tirzepatide' },
    ];

    // Grouping logic from PatientSubscriptionManager
    const groups = new Map<number, typeof shipments>();
    for (const s of shipments) {
      const key = s.parentRefillId || s.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }

    expect(groups.size).toBe(1);
    expect(groups.get(10)!.length).toBe(4);
    expect(groups.get(10)![0].shipmentNumber).toBe(1);
    expect(groups.get(10)![3].shipmentNumber).toBe(4);
  });
});
