/**
 * Unit tests for `attachSalesRepFromOtDisposition`.
 *
 * Covers:
 *   - Creates a fresh `PatientSalesRepAssignment` when none exists.
 *   - No-op when active assignment already targets the same rep.
 *   - Reassignment: deactivates old + creates new when rep differs.
 *   - Skips on cross-clinic patient (multi-tenant defense).
 *   - Skips on missing/inactive/ineligible rep (defense-in-depth).
 *   - Best-effort error path: returns `error` instead of throwing on DB failure.
 *   - Audit log fired on success.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAuditLog, mockLogger } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('@/lib/audit/hipaa-audit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/audit/hipaa-audit')>(
    '@/lib/audit/hipaa-audit'
  );
  return { ...actual, auditLog: mockAuditLog };
});
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));

import { attachSalesRepFromOtDisposition } from '@/services/sales-rep/otDispositionAssignment';

// ---------------------------------------------------------------------------
// Fake Prisma client — minimal surface used by the helper
// ---------------------------------------------------------------------------

type Assignment = {
  id: number;
  patientId: number;
  clinicId: number;
  salesRepId: number;
  isActive: boolean;
  removedAt: Date | null;
  removedById: number | null;
  removalNote: string | null;
  assignedAt: Date;
};

type FakeDb = {
  patients: Map<number, { id: number; clinicId: number }>;
  users: Map<number, { id: number; status: string; role: string }>;
  assignments: Assignment[];
  /** Optional throw-injection per surface for error-path tests. */
  throws?: { patient?: Error; user?: Error; assignment?: Error };
};

function makeFakePrisma(db: FakeDb) {
  let nextAssignmentId = 100 + db.assignments.length;

  const patient = {
    findUnique: vi.fn(async ({ where: { id } }: { where: { id: number } }) => {
      if (db.throws?.patient) throw db.throws.patient;
      return db.patients.get(id) ?? null;
    }),
  };
  const user = {
    findUnique: vi.fn(async ({ where: { id } }: { where: { id: number } }) => {
      if (db.throws?.user) throw db.throws.user;
      return db.users.get(id) ?? null;
    }),
  };

  const patientSalesRepAssignment = {
    findFirst: vi.fn(
      async ({
        where: { patientId, clinicId, isActive },
      }: {
        where: { patientId: number; clinicId: number; isActive: boolean };
      }) => {
        if (db.throws?.assignment) throw db.throws.assignment;
        const row = db.assignments
          .filter(
            (a) => a.patientId === patientId && a.clinicId === clinicId && a.isActive === isActive
          )
          .sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime())[0];
        return row ?? null;
      }
    ),
    update: vi.fn(async ({ where: { id }, data }: { where: { id: number }; data: Partial<Assignment> }) => {
      const row = db.assignments.find((a) => a.id === id);
      if (!row) throw new Error('Assignment not found in fake db');
      Object.assign(row, data);
      return row;
    }),
    create: vi.fn(
      async ({
        data,
      }: {
        data: { patientId: number; salesRepId: number; clinicId: number; assignedById: number };
      }) => {
        if (db.throws?.assignment) throw db.throws.assignment;
        const row: Assignment = {
          id: ++nextAssignmentId,
          patientId: data.patientId,
          salesRepId: data.salesRepId,
          clinicId: data.clinicId,
          isActive: true,
          removedAt: null,
          removedById: null,
          removalNote: null,
          assignedAt: new Date(),
        };
        db.assignments.push(row);
        return { id: row.id };
      }
    ),
  };

  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn({ patientSalesRepAssignment });
  });

  return {
    patient,
    user,
    patientSalesRepAssignment,
    $transaction,
  } as unknown as Parameters<typeof attachSalesRepFromOtDisposition>[0]['prismaClient'];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuditLog.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Happy path: create
// ---------------------------------------------------------------------------

describe('attachSalesRepFromOtDisposition — create', () => {
  it('creates a new active PatientSalesRepAssignment when none exists', async () => {
    const db: FakeDb = {
      patients: new Map([[42, { id: 42, clinicId: 7 }]]),
      users: new Map([[55, { id: 55, status: 'ACTIVE', role: 'SALES_REP' }]]),
      assignments: [],
    };
    const prismaClient = makeFakePrisma(db);

    const result = await attachSalesRepFromOtDisposition({
      patientId: 42,
      salesRepId: 55,
      clinicId: 7,
      assignedById: 999,
      source: 'ot_rx_override',
      overrideResourceId: 12345,
      prismaClient,
    });

    expect(result.status).toBe('created');
    expect(result.assignmentId).toBeGreaterThan(0);
    expect(result.previousSalesRepId).toBeNull();
    expect(db.assignments).toHaveLength(1);
    expect(db.assignments[0]).toMatchObject({
      patientId: 42,
      salesRepId: 55,
      clinicId: 7,
      isActive: true,
    });
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    const auditCall = mockAuditLog.mock.calls[0][1];
    expect(auditCall).toMatchObject({
      action: 'ot_disposition_rep_assigned',
      outcome: 'SUCCESS',
      patientId: 42,
      resourceType: 'PatientSalesRepAssignment',
    });
    /** PHI safety: never include patient name/email/phone in the audit metadata. */
    const meta = auditCall.metadata ?? {};
    for (const v of Object.values(meta)) {
      expect(typeof v === 'string' && /@/.test(v)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Happy path: unchanged
// ---------------------------------------------------------------------------

describe('attachSalesRepFromOtDisposition — unchanged', () => {
  it('is a no-op when an active assignment already targets the same rep', async () => {
    const db: FakeDb = {
      patients: new Map([[42, { id: 42, clinicId: 7 }]]),
      users: new Map([[55, { id: 55, status: 'ACTIVE', role: 'SALES_REP' }]]),
      assignments: [
        {
          id: 11,
          patientId: 42,
          salesRepId: 55,
          clinicId: 7,
          isActive: true,
          removedAt: null,
          removedById: null,
          removalNote: null,
          assignedAt: new Date('2026-04-01'),
        },
      ],
    };
    const prismaClient = makeFakePrisma(db);

    const result = await attachSalesRepFromOtDisposition({
      patientId: 42,
      salesRepId: 55,
      clinicId: 7,
      assignedById: 999,
      source: 'ot_rx_override',
      prismaClient,
    });

    expect(result.status).toBe('unchanged');
    expect(result.assignmentId).toBe(11);
    expect(db.assignments).toHaveLength(1);
    expect(db.assignments[0].isActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Happy path: reassign
// ---------------------------------------------------------------------------

describe('attachSalesRepFromOtDisposition — reassign', () => {
  it('deactivates the prior assignment and creates a new one when rep differs', async () => {
    const db: FakeDb = {
      patients: new Map([[42, { id: 42, clinicId: 7 }]]),
      users: new Map([
        [55, { id: 55, status: 'ACTIVE', role: 'SALES_REP' }],
        [88, { id: 88, status: 'ACTIVE', role: 'SALES_REP' }],
      ]),
      assignments: [
        {
          id: 11,
          patientId: 42,
          salesRepId: 88,
          clinicId: 7,
          isActive: true,
          removedAt: null,
          removedById: null,
          removalNote: null,
          assignedAt: new Date('2026-03-01'),
        },
      ],
    };
    const prismaClient = makeFakePrisma(db);

    const result = await attachSalesRepFromOtDisposition({
      patientId: 42,
      salesRepId: 55,
      clinicId: 7,
      assignedById: 999,
      source: 'ot_nonrx_override',
      prismaClient,
    });

    expect(result.status).toBe('reassigned');
    expect(result.previousSalesRepId).toBe(88);

    /** Old row deactivated. */
    const old = db.assignments.find((a) => a.id === 11);
    expect(old?.isActive).toBe(false);
    expect(old?.removedById).toBe(999);
    expect(old?.removalNote).toContain('OT manual disposition');
    expect(old?.removedAt).toBeInstanceOf(Date);

    /** New row created and active. */
    const newRow = db.assignments.find((a) => a.id === result.assignmentId);
    expect(newRow).toBeTruthy();
    expect(newRow?.isActive).toBe(true);
    expect(newRow?.salesRepId).toBe(55);
  });
});

// ---------------------------------------------------------------------------
// Defense: cross-clinic patient
// ---------------------------------------------------------------------------

describe('attachSalesRepFromOtDisposition — multi-tenant defense', () => {
  it('skips when the patient belongs to a different clinic', async () => {
    const db: FakeDb = {
      patients: new Map([[42, { id: 42, clinicId: 99 }]]), // wrong clinic
      users: new Map([[55, { id: 55, status: 'ACTIVE', role: 'SALES_REP' }]]),
      assignments: [],
    };
    const prismaClient = makeFakePrisma(db);

    const result = await attachSalesRepFromOtDisposition({
      patientId: 42,
      salesRepId: 55,
      clinicId: 7,
      assignedById: 999,
      source: 'ot_rx_override',
      prismaClient,
    });

    expect(result.status).toBe('skipped_patient_mismatch');
    expect(db.assignments).toHaveLength(0);
    expect(mockLogger.security).toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('skips when the patient does not exist', async () => {
    const db: FakeDb = {
      patients: new Map(),
      users: new Map([[55, { id: 55, status: 'ACTIVE', role: 'SALES_REP' }]]),
      assignments: [],
    };
    const prismaClient = makeFakePrisma(db);

    const result = await attachSalesRepFromOtDisposition({
      patientId: 42,
      salesRepId: 55,
      clinicId: 7,
      assignedById: 999,
      source: 'ot_rx_override',
      prismaClient,
    });

    expect(result.status).toBe('skipped_patient_mismatch');
    expect(db.assignments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Defense: ineligible / inactive rep
// ---------------------------------------------------------------------------

describe('attachSalesRepFromOtDisposition — invalid rep', () => {
  it('skips when the rep is INACTIVE', async () => {
    const db: FakeDb = {
      patients: new Map([[42, { id: 42, clinicId: 7 }]]),
      users: new Map([[55, { id: 55, status: 'INACTIVE', role: 'SALES_REP' }]]),
      assignments: [],
    };
    const prismaClient = makeFakePrisma(db);

    const result = await attachSalesRepFromOtDisposition({
      patientId: 42,
      salesRepId: 55,
      clinicId: 7,
      assignedById: 999,
      source: 'ot_rx_override',
      prismaClient,
    });

    expect(result.status).toBe('skipped_invalid_rep');
    expect(db.assignments).toHaveLength(0);
  });

  it('skips when the rep role is not commission-eligible (e.g. PATIENT)', async () => {
    const db: FakeDb = {
      patients: new Map([[42, { id: 42, clinicId: 7 }]]),
      users: new Map([[55, { id: 55, status: 'ACTIVE', role: 'PATIENT' }]]),
      assignments: [],
    };
    const prismaClient = makeFakePrisma(db);

    const result = await attachSalesRepFromOtDisposition({
      patientId: 42,
      salesRepId: 55,
      clinicId: 7,
      assignedById: 999,
      source: 'ot_rx_override',
      prismaClient,
    });

    expect(result.status).toBe('skipped_invalid_rep');
    expect(db.assignments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Best-effort error path
// ---------------------------------------------------------------------------

describe('attachSalesRepFromOtDisposition — best-effort error path', () => {
  it('returns error without throwing when assignment write fails', async () => {
    const db: FakeDb = {
      patients: new Map([[42, { id: 42, clinicId: 7 }]]),
      users: new Map([[55, { id: 55, status: 'ACTIVE', role: 'SALES_REP' }]]),
      assignments: [],
      throws: { assignment: new Error('boom: connection lost') },
    };
    const prismaClient = makeFakePrisma(db);

    const result = await attachSalesRepFromOtDisposition({
      patientId: 42,
      salesRepId: 55,
      clinicId: 7,
      assignedById: 999,
      source: 'ot_rx_override',
      prismaClient,
    });

    expect(result.status).toBe('error');
    expect(result.assignmentId).toBeNull();
    expect(result.errorMessage).toContain('boom');
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
