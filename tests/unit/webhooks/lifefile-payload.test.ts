/**
 * Lifefile webhook payload helpers - unit tests
 * Enterprise: full coverage of extraction, lookup build, status enum, edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  extractLifefileOrderIdentifiers,
  buildOrderLookupWhere,
  mapToShippingStatusEnum,
  sanitizeEventType,
  MAX_WEBHOOK_BODY_BYTES,
} from '@/lib/webhooks/lifefile-payload';

describe('lifefile-payload', () => {
  describe('extractLifefileOrderIdentifiers', () => {
    it('returns both ids from top-level camelCase', () => {
      const payload = { orderId: 'LF-123', referenceId: 'REF-456' };
      expect(extractLifefileOrderIdentifiers(payload)).toEqual({
        orderId: 'LF-123',
        referenceId: 'REF-456',
      });
    });

    it('returns both ids from top-level snake_case', () => {
      const payload = { order_id: 'LF-789', reference_id: 'REF-ABC' };
      expect(extractLifefileOrderIdentifiers(payload)).toEqual({
        orderId: 'LF-789',
        referenceId: 'REF-ABC',
      });
    });

    it('returns ids from nested payload.order', () => {
      const payload = {
        type: 'order_status',
        order: { orderId: 'LF-NESTED', referenceId: 'REF-NESTED' },
      };
      expect(extractLifefileOrderIdentifiers(payload)).toEqual({
        orderId: 'LF-NESTED',
        referenceId: 'REF-NESTED',
      });
    });

    it('returns ids from nested payload.data', () => {
      const payload = { data: { id: 'LF-DATA', referenceId: 'R-DATA' } };
      expect(extractLifefileOrderIdentifiers(payload)).toEqual({
        orderId: 'LF-DATA',
        referenceId: 'R-DATA',
      });
    });

    it('returns ids from nested payload.prescription', () => {
      const payload = {
        prescription: { orderId: 'LF-RX', reference_id: 'REF-RX' },
      };
      expect(extractLifefileOrderIdentifiers(payload)).toEqual({
        orderId: 'LF-RX',
        referenceId: 'REF-RX',
      });
    });

    it('prefers top-level over nested when both present', () => {
      const payload = {
        orderId: 'TOP',
        order: { orderId: 'NESTED', referenceId: 'RN' },
      };
      expect(extractLifefileOrderIdentifiers(payload)).toEqual({
        orderId: 'TOP',
        referenceId: 'RN',
      });
    });

    it('trims whitespace', () => {
      expect(extractLifefileOrderIdentifiers({ orderId: '  LF-1  ', referenceId: '  R1  ' })).toEqual({
        orderId: 'LF-1',
        referenceId: 'R1',
      });
    });

    it('accepts numeric orderId and converts to string', () => {
      expect(extractLifefileOrderIdentifiers({ orderId: 12345, referenceId: 67890 })).toEqual({
        orderId: '12345',
        referenceId: '67890',
      });
    });

    it('returns nulls for null payload', () => {
      expect(extractLifefileOrderIdentifiers(null)).toEqual({
        orderId: null,
        referenceId: null,
      });
    });

    it('returns nulls for undefined payload', () => {
      expect(extractLifefileOrderIdentifiers(undefined)).toEqual({
        orderId: null,
        referenceId: null,
      });
    });

    it('returns nulls for array payload', () => {
      expect(extractLifefileOrderIdentifiers([{ orderId: 'x' }])).toEqual({
        orderId: null,
        referenceId: null,
      });
    });

    it('returns nulls for empty string ids', () => {
      expect(extractLifefileOrderIdentifiers({ orderId: '', referenceId: '   ' })).toEqual({
        orderId: null,
        referenceId: null,
      });
    });

    it('rejects id longer than MAX (255)', () => {
      const long = 'x'.repeat(256);
      expect(extractLifefileOrderIdentifiers({ orderId: long })).toEqual({
        orderId: null,
        referenceId: null,
      });
    });

    it('accepts id at exactly 255 chars', () => {
      const ok = 'x'.repeat(255);
      expect(extractLifefileOrderIdentifiers({ orderId: ok }).orderId).toBe(ok);
    });

    it('ignores nested array (e.g. order as array)', () => {
      const payload = { order: [{ orderId: 'LF' }] };
      expect(extractLifefileOrderIdentifiers(payload)).toEqual({
        orderId: null,
        referenceId: null,
      });
    });
  });

  describe('buildOrderLookupWhere', () => {
    it('returns null when both ids are null', () => {
      expect(buildOrderLookupWhere(1, null, null)).toBeNull();
    });

    it('returns single condition for orderId only', () => {
      expect(buildOrderLookupWhere(1, 'LF-1', null)).toEqual({
        clinicId: 1,
        OR: [{ lifefileOrderId: 'LF-1' }],
      });
    });

    it('returns single condition for referenceId only', () => {
      expect(buildOrderLookupWhere(2, null, 'REF-2')).toEqual({
        clinicId: 2,
        OR: [{ referenceId: 'REF-2' }],
      });
    });

    it('returns both conditions when both ids present', () => {
      const where = buildOrderLookupWhere(3, 'LF-3', 'REF-3');
      expect(where).not.toBeNull();
      expect(where!.clinicId).toBe(3);
      expect(where!.OR).toHaveLength(2);
      expect(where!.OR).toContainEqual({ lifefileOrderId: 'LF-3' });
      expect(where!.OR).toContainEqual({ referenceId: 'REF-3' });
    });
  });

  describe('mapToShippingStatusEnum', () => {
    it('returns SHIPPED for null/undefined', () => {
      expect(mapToShippingStatusEnum(null)).toBe('SHIPPED');
      expect(mapToShippingStatusEnum(undefined)).toBe('SHIPPED');
    });

    it('maps known statuses', () => {
      expect(mapToShippingStatusEnum('shipped')).toBe('SHIPPED');
      expect(mapToShippingStatusEnum('in_transit')).toBe('IN_TRANSIT');
      expect(mapToShippingStatusEnum('delivered')).toBe('DELIVERED');
      expect(mapToShippingStatusEnum('pending')).toBe('PENDING');
      expect(mapToShippingStatusEnum('exception')).toBe('EXCEPTION');
      expect(mapToShippingStatusEnum('cancelled')).toBe('CANCELLED');
    });

    it('normalizes dashes and spaces', () => {
      expect(mapToShippingStatusEnum('out-for-delivery')).toBe('OUT_FOR_DELIVERY');
      expect(mapToShippingStatusEnum('label created')).toBe('LABEL_CREATED');
    });

    it('returns SHIPPED for unknown status', () => {
      expect(mapToShippingStatusEnum('unknown_status')).toBe('SHIPPED');
      expect(mapToShippingStatusEnum('')).toBe('SHIPPED');
    });

    it('handles non-string (returns SHIPPED)', () => {
      expect(mapToShippingStatusEnum(123 as unknown as string)).toBe('SHIPPED');
    });
  });

  describe('sanitizeEventType', () => {
    it('returns "update" for null/undefined', () => {
      expect(sanitizeEventType(null)).toBe('update');
      expect(sanitizeEventType(undefined)).toBe('update');
    });
    it('returns "update" for non-string', () => {
      expect(sanitizeEventType(123 as unknown as string)).toBe('update');
    });
    it('trims and allows alphanumeric, underscore, hyphen', () => {
      expect(sanitizeEventType('  prescription_shipped  ')).toBe('prescription_shipped');
      expect(sanitizeEventType('order-status')).toBe('order-status');
    });
    it('returns "update" for invalid chars (injection attempt)', () => {
      expect(sanitizeEventType('prescription_<script>')).toBe('update');
      expect(sanitizeEventType('x; DROP TABLE orders')).toBe('update');
    });
    it('truncates to 128 chars', () => {
      const long = 'a'.repeat(200);
      expect(sanitizeEventType(long).length).toBe(128);
    });
  });

  describe('constants', () => {
    it('MAX_WEBHOOK_BODY_BYTES is 512KB', () => {
      expect(MAX_WEBHOOK_BODY_BYTES).toBe(512 * 1024);
    });
  });
});
