/**
 * WellMedR — Apply Shipping Address Tests
 * ========================================
 * Regression tests for the 2026-04-30 race-condition fix where the Airtable
 * Orders webhook detected a duplicate invoice (created seconds earlier by the
 * Stripe Connect `payment_intent.succeeded` handler with no shipping address)
 * and returned early, leaving patient.address1 / city / state / zip empty and
 * blocking the provider Rx queue with "Address Required".
 *
 * The fix runs `applyShippingAddressToPatient` on EVERY code path — including
 * duplicate-invoice early-returns. These tests lock in that behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPHI: vi.fn((v: string | null | undefined) => (v ? String(v) : null)),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { prisma } from '@/lib/db';
import {
  applyShippingAddressToPatient,
  findPatientByEmailForAddressUpdate,
  parseShippingAddressFromPayload,
  isPlaceholderAddressValue,
} from '@/lib/wellmedr/applyShippingAddress';

const mockedPatient = prisma.patient as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Pure parser ─────────────────────────────────────────────────────────────
describe('parseShippingAddressFromPayload', () => {
  it('parses combined `shipping_address` string with comma-separated parts', () => {
    const result = parseShippingAddressFromPayload({
      shipping_address: '3109 NE 118th Terrace, Kansas City, Missouri, 64156',
    });
    expect(result.address1).toBe('3109 NE 118th Terrace');
    expect(result.city).toBe('Kansas City');
    expect(result.state).toBe('MO');
    expect(result.zip).toBe('64156');
  });

  it('parses combined string with apartment correctly (Airtable-naive-split survival)', () => {
    const result = parseShippingAddressFromPayload({
      shipping_address: '123 Main St, Apt 4B, Miami, FL, 33101',
    });
    expect(result.address1).toBe('123 Main St');
    expect(result.address2.toLowerCase()).toContain('apt 4b');
    expect(result.city).toBe('Miami');
    expect(result.state).toBe('FL');
    expect(result.zip).toBe('33101');
  });

  it('falls back to individual fields when no combined string', () => {
    const result = parseShippingAddressFromPayload({
      address: '500 Oak Ave',
      city: 'Boise',
      state: 'Idaho',
      zip: '83702',
    });
    expect(result.address1).toBe('500 Oak Ave');
    expect(result.city).toBe('Boise');
    expect(result.state).toBe('ID'); // normalized to 2-letter
    expect(result.zip).toBe('83702');
  });

  it('treats stub placeholder values as empty', () => {
    const result = parseShippingAddressFromPayload({
      address: 'Pending',
      city: 'Pending',
      state: 'NA',
      zip: '00000',
    });
    expect(result.address1).toBe('');
    expect(result.city).toBe('');
    expect(result.state).toBe('');
    expect(result.zip).toBe('');
  });

  it('extracts last 10 digits of phone and discards malformed', () => {
    expect(parseShippingAddressFromPayload({ phone: '+1 (555) 123-4567' }).phone).toBe(
      '5551234567'
    );
    expect(parseShippingAddressFromPayload({ phone: '12' }).phone).toBe('');
    expect(parseShippingAddressFromPayload({}).phone).toBe('');
  });

  it('returns all-empty for empty payload', () => {
    const result = parseShippingAddressFromPayload({});
    expect(result.address1).toBe('');
    expect(result.city).toBe('');
    expect(result.state).toBe('');
    expect(result.zip).toBe('');
    expect(result.phone).toBe('');
  });

  it('prefers combined string over individual fields when both present', () => {
    // Airtable sends both — apartment in city is corrupted, combined string is correct
    const result = parseShippingAddressFromPayload({
      shipping_address: '742 Evergreen Terrace, Apt 12, Springfield, IL, 62704',
      address: '742 Evergreen Terrace',
      city: 'Apt 12', // ← Airtable's naive split corrupted this
      state: 'Springfield',
      zip: 'IL',
    });
    expect(result.address1).toBe('742 Evergreen Terrace');
    expect(result.city).toBe('Springfield');
    expect(result.state).toBe('IL');
    expect(result.zip).toBe('62704');
  });
});

// ─── Placeholder detection ───────────────────────────────────────────────────
describe('isPlaceholderAddressValue', () => {
  it.each([
    ['', true],
    ['Pending', true],
    ['pending', true],
    ['NA', true],
    ['na', true],
    ['00000', true],
    ['0', true],
    ['Unknown', true],
    ['123 Real Street', false],
    ['Miami', false],
    ['FL', false],
    ['33101', false],
  ])('isPlaceholderAddressValue(%j) === %s', (input, expected) => {
    expect(isPlaceholderAddressValue(input)).toBe(expected);
  });
});

// ─── DB-touching helper ──────────────────────────────────────────────────────
describe('applyShippingAddressToPatient', () => {
  it('writes parsed address fields when patient currently has empty values', async () => {
    mockedPatient.findUnique.mockResolvedValueOnce({
      address1: '',
      address2: '',
      city: '',
      state: '',
      zip: '',
      phone: '',
    });
    mockedPatient.update.mockResolvedValueOnce({ id: 42 });

    const result = await applyShippingAddressToPatient(
      { shipping_address: '3109 NE 118th Terrace, Kansas City, Missouri, 64156' },
      42,
      'test-req-1'
    );

    expect(result.updated).toBe(true);
    expect(result.fields).toEqual(expect.arrayContaining(['address1', 'city', 'state', 'zip']));
    expect(mockedPatient.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: expect.objectContaining({
        address1: '3109 NE 118th Terrace',
        city: 'Kansas City',
        state: 'MO',
        zip: '64156',
      }),
    });
  });

  it('overwrites stub placeholder values (Pending / NA / 00000)', async () => {
    mockedPatient.findUnique.mockResolvedValueOnce({
      address1: 'Pending',
      address2: '',
      city: 'Pending',
      state: 'NA',
      zip: '00000',
      phone: '0000000000',
    });
    mockedPatient.update.mockResolvedValueOnce({ id: 7 });

    const result = await applyShippingAddressToPatient(
      { shipping_address: '500 Oak Ave, Boise, ID, 83702' },
      7,
      'test-req-2'
    );

    expect(result.updated).toBe(true);
    expect(result.fields).toEqual(expect.arrayContaining(['address1', 'city', 'state', 'zip']));
    expect(mockedPatient.update).toHaveBeenCalledTimes(1);
    const updateData = mockedPatient.update.mock.calls[0][0].data as Record<string, string>;
    expect(updateData.address1).toBe('500 Oak Ave');
    expect(updateData.city).toBe('Boise');
    expect(updateData.state).toBe('ID');
    expect(updateData.zip).toBe('83702');
  });

  it('NEVER overwrites a real existing patient address', async () => {
    mockedPatient.findUnique.mockResolvedValueOnce({
      address1: '999 Already Here Blvd',
      address2: '',
      city: 'San Francisco',
      state: 'CA',
      zip: '94110',
      phone: '4155551234',
    });

    const result = await applyShippingAddressToPatient(
      { shipping_address: '123 New St, Miami, FL, 33101' },
      99,
      'test-req-3'
    );

    expect(result.updated).toBe(false);
    expect(result.fields).toEqual([]);
    expect(mockedPatient.update).not.toHaveBeenCalled();
  });

  it('selectively fills only the empty fields, preserving real ones', async () => {
    mockedPatient.findUnique.mockResolvedValueOnce({
      address1: '999 Already Here Blvd', // real — preserve
      address2: '',
      city: 'Pending', // stub — overwrite
      state: 'CA', // real — preserve
      zip: '00000', // stub — overwrite
      phone: '',
    });
    mockedPatient.update.mockResolvedValueOnce({ id: 12 });

    await applyShippingAddressToPatient(
      { shipping_address: '123 New St, Miami, FL, 33101' },
      12,
      'test-req-4'
    );

    expect(mockedPatient.update).toHaveBeenCalledTimes(1);
    const updateData = mockedPatient.update.mock.calls[0][0].data as Record<string, string>;
    expect(updateData).not.toHaveProperty('address1'); // preserved real value
    expect(updateData).not.toHaveProperty('state'); // preserved real value
    expect(updateData.city).toBe('Miami'); // overwritten stub
    expect(updateData.zip).toBe('33101'); // overwritten stub
  });

  it('returns updated=false (no DB call) when payload has no address data', async () => {
    const result = await applyShippingAddressToPatient(
      { phone: 'invalid-not-a-number' },
      1,
      'test-req-5'
    );
    expect(result.updated).toBe(false);
    expect(mockedPatient.findUnique).not.toHaveBeenCalled();
    expect(mockedPatient.update).not.toHaveBeenCalled();
  });

  it('returns updated=false when patient does not exist', async () => {
    mockedPatient.findUnique.mockResolvedValueOnce(null);
    const result = await applyShippingAddressToPatient(
      { shipping_address: '123 Real St, Miami, FL, 33101' },
      9999,
      'test-req-6'
    );
    expect(result.updated).toBe(false);
    expect(mockedPatient.update).not.toHaveBeenCalled();
  });

  it('non-fatal on DB error — never throws', async () => {
    mockedPatient.findUnique.mockRejectedValueOnce(new Error('connection refused'));
    const result = await applyShippingAddressToPatient(
      { shipping_address: '123 Real St, Miami, FL, 33101' },
      1,
      'test-req-7'
    );
    expect(result.updated).toBe(false);
    expect(result.fields).toEqual([]);
  });
});

// ─── Patient lookup by email ─────────────────────────────────────────────────
describe('findPatientByEmailForAddressUpdate', () => {
  it('finds patient via direct searchIndex match', async () => {
    mockedPatient.findFirst.mockResolvedValueOnce({
      id: 42,
      email: 'rsodyssey@gmail.com',
    });

    const id = await findPatientByEmailForAddressUpdate(
      'rsodyssey@gmail.com',
      7,
      'test-lookup-1'
    );
    expect(id).toBe(42);
    expect(mockedPatient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: 7,
          searchIndex: { contains: 'rsodyssey@gmail.com', mode: 'insensitive' },
        }),
      })
    );
  });

  it('returns null when email not found in clinic', async () => {
    mockedPatient.findFirst.mockResolvedValueOnce(null);
    mockedPatient.findMany.mockResolvedValueOnce([]);
    const id = await findPatientByEmailForAddressUpdate(
      'unknown@nowhere.com',
      7,
      'test-lookup-2'
    );
    expect(id).toBeNull();
  });

  it('case-insensitive email match', async () => {
    mockedPatient.findFirst.mockResolvedValueOnce(null);
    mockedPatient.findMany.mockResolvedValueOnce([{ id: 99, email: 'Mixed.Case@Example.COM' }]);
    const id = await findPatientByEmailForAddressUpdate(
      'mixed.case@example.com',
      7,
      'test-lookup-3'
    );
    expect(id).toBe(99);
  });

  it('returns null on empty email', async () => {
    const id = await findPatientByEmailForAddressUpdate('', 7, 'test-lookup-4');
    expect(id).toBeNull();
    expect(mockedPatient.findFirst).not.toHaveBeenCalled();
  });

  it('non-fatal on DB error — returns null', async () => {
    mockedPatient.findFirst.mockRejectedValueOnce(new Error('connection refused'));
    const id = await findPatientByEmailForAddressUpdate(
      'test@example.com',
      7,
      'test-lookup-5'
    );
    expect(id).toBeNull();
  });
});

// ─── Race-condition lock-in ──────────────────────────────────────────────────
describe('Race condition regression — Airtable arriving after Stripe Connect', () => {
  it('backfills patient address even when Stripe-Connect-created patient has empty fields', async () => {
    // Simulates Robin Bemson scenario: Stripe Connect created the patient with
    // empty address (pi.shipping was null), then Airtable Orders webhook fires
    // with the correct shipping_address but detects the duplicate invoice.
    // We must STILL apply the address to the patient row.
    mockedPatient.findUnique.mockResolvedValueOnce({
      address1: '',
      address2: '',
      city: '',
      state: '',
      zip: '',
      phone: '',
    });
    mockedPatient.update.mockResolvedValueOnce({ id: 100 });

    const result = await applyShippingAddressToPatient(
      {
        // Same payload Airtable sends today
        shipping_address: '3109 NE 118th Terrace, Kansas City, Missouri, 64156',
        address: '3109 NE 118th Terrace',
        city: 'Kansas City',
        state: 'Missouri',
        zip: '64156',
      },
      100,
      'race-fix-test'
    );

    expect(result.updated).toBe(true);
    expect(result.fields).toEqual(
      expect.arrayContaining(['address1', 'city', 'state', 'zip'])
    );
  });

  it('idempotent — second call with same payload does NOTHING when address already real', async () => {
    // First call already filled the address. Second call (e.g. Airtable retry)
    // must not re-write or alter the now-real address.
    mockedPatient.findUnique.mockResolvedValueOnce({
      address1: '3109 NE 118th Terrace',
      address2: '',
      city: 'Kansas City',
      state: 'MO',
      zip: '64156',
      phone: '',
    });

    const result = await applyShippingAddressToPatient(
      { shipping_address: '3109 NE 118th Terrace, Kansas City, Missouri, 64156' },
      100,
      'race-fix-test-2'
    );

    expect(result.updated).toBe(false);
    expect(mockedPatient.update).not.toHaveBeenCalled();
  });
});
