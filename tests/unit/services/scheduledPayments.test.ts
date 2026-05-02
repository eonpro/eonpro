/**
 * Scheduled Payments Service unit tests
 * =====================================
 *
 * Covers the in-process replacement for the broken loopback cron path:
 *   - AUTO_CHARGE success: Payment + invoice linked, status PROCESSED
 *   - card_declined: terminal FAILED on first attempt (no retry)
 *   - generic transient error: PENDING + attemptCount++
 *   - 3rd transient failure: terminal FAILED + rep notification
 *   - REMINDER: Notification + email, status PROCESSED
 *   - Stable idempotency: same key reused across attempts in a row
 *   - Cron query filters out attemptCount >= MAX
 *   - Regression: cron route does not call fetch()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ----------------------------------------------------------------------------
// Mocks (declared before importing the SUT)
// ----------------------------------------------------------------------------

// Extend the global @prisma/client mock with the enum the SUT imports.
vi.mock('@prisma/client', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@prisma/client').catch(() => ({}));
  return {
    ...actual,
    PaymentStatus: {
      PENDING: 'PENDING',
      PROCESSING: 'PROCESSING',
      SUCCEEDED: 'SUCCEEDED',
      FAILED: 'FAILED',
      CANCELED: 'CANCELED',
      REFUNDED: 'REFUNDED',
    },
    Prisma: (actual as any).Prisma ?? {},
  };
});

vi.mock('@/lib/db', () => ({
  prisma: {
    scheduledPayment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      update: vi.fn(),
    },
    paymentMethod: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    notification: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    api: vi.fn(),
  },
}));

// Use vi.hoisted so these mocks are accessible inside vi.mock() factories
// (factories are hoisted to top of file by Vitest).
const {
  stripeCreateMock,
  createInvoiceForProcessedPaymentMock,
  sendEmailMock,
  auditLogMock,
} = vi.hoisted(() => ({
  stripeCreateMock: vi.fn(),
  createInvoiceForProcessedPaymentMock: vi.fn(async () => ({ invoiceId: 999 })),
  sendEmailMock: vi.fn(async () => ({ success: true, messageId: 'msg_1' })),
  auditLogMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/stripe/connect', () => ({
  getStripeForClinic: vi.fn(async () => ({
    stripe: {
      paymentIntents: {
        create: stripeCreateMock,
      },
    },
    stripeAccountId: undefined,
    isPlatformAccount: true,
  })),
}));

vi.mock('@/services/stripe/customerService', () => ({
  StripeCustomerService: {
    getOrCreateCustomerForContext: vi.fn(async () => ({ id: 'cus_test_123' })),
  },
}));

vi.mock('@/services/billing/createInvoiceForPayment', () => ({
  createInvoiceForProcessedPayment: createInvoiceForProcessedPaymentMock,
}));

vi.mock('@/lib/email', () => ({
  sendEmail: sendEmailMock,
}));

vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditLog: auditLogMock,
  AuditEventType: {
    SYSTEM_ACCESS: 'SYSTEM_ACCESS',
  },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPHI: (s: string | null | undefined) => s ?? null,
}));

// ----------------------------------------------------------------------------
// Import after mocks
// ----------------------------------------------------------------------------

import {
  processDuePayments,
  processScheduledPayment,
  fireReminder,
  chargeScheduledPayment,
  backoffCutoff,
  mergeMeta,
  MAX_ATTEMPTS,
} from '@/services/billing/scheduledPaymentsService';

import { prisma } from '@/lib/db';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const NOW = new Date('2026-04-28T12:00:00.000Z');

function makeScheduledPayment(overrides: Partial<any> = {}): any {
  return {
    id: 1,
    clinicId: 10,
    patientId: 100,
    planId: null,
    planName: 'OT Hormonal Plan',
    amount: 19900,
    description: 'Monthly TRT',
    scheduledDate: new Date('2026-04-28T08:00:00.000Z'),
    type: 'AUTO_CHARGE',
    status: 'PENDING',
    createdBy: 7,
    processedAt: null,
    paymentId: null,
    canceledAt: null,
    canceledBy: null,
    notes: null,
    metadata: null,
    attemptCount: 0,
    lastAttemptAt: null,
    failureReason: null,
    createdAt: new Date('2026-04-20T08:00:00.000Z'),
    updatedAt: new Date('2026-04-20T08:00:00.000Z'),
    patient: {
      id: 100,
      clinicId: 10,
      firstName: 'John',
      stripeCustomerId: 'cus_test_123',
      paymentMethods: [
        {
          id: 200,
          stripePaymentMethodId: 'pm_test_card',
          cardLast4: '4242',
        },
      ],
    },
    ...overrides,
  };
}

class StripeCardError extends Error {
  type = 'StripeCardError';
  code: string;
  payment_intent?: { id: string };
  constructor(code: string, message: string, piId?: string) {
    super(message);
    this.code = code;
    if (piId) this.payment_intent = { id: piId };
  }
}

class StripeApiTimeoutError extends Error {
  type = 'StripeAPIError';
  constructor(msg: string) {
    super(msg);
  }
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock implementations.
  (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({
    id: 555,
    ...data,
  }));
  (prisma.payment.update as any).mockResolvedValue({ id: 555 });
  (prisma.scheduledPayment.update as any).mockResolvedValue({ id: 1 });
  (prisma.paymentMethod.findFirst as any).mockResolvedValue({
    id: 200,
    stripePaymentMethodId: 'pm_test_card',
    cardLast4: '4242',
    cardBrand: 'Visa',
  });
  (prisma.paymentMethod.update as any).mockResolvedValue({ id: 200 });
  (prisma.notification.findFirst as any).mockResolvedValue(null);
  (prisma.notification.create as any).mockResolvedValue({ id: 1 });
  (prisma.user.findUnique as any).mockResolvedValue({
    id: 7,
    email: 'rep@example.com',
    firstName: 'Alex',
    role: 'admin',
  });

  stripeCreateMock.mockResolvedValue({
    id: 'pi_succeeded',
    status: 'succeeded',
    latest_charge: 'ch_abc',
    client_secret: null,
  });
});

// ----------------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------------

describe('scheduledPaymentsService :: pure helpers', () => {
  it('mergeMeta returns next when existing is null', () => {
    expect(mergeMeta(null, { a: 1 })).toEqual({ a: 1 });
  });

  it('mergeMeta merges and lets next override existing', () => {
    expect(mergeMeta({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('mergeMeta tolerates non-object existing values', () => {
    expect(mergeMeta('garbage' as any, { a: 1 })).toEqual({ a: 1 });
  });

  it('backoffCutoff doubles per attempt and caps at 24h', () => {
    const oneHourMs = 60 * 60 * 1000;
    const c1 = NOW.getTime() - backoffCutoff(NOW, 1).getTime();
    const c5 = NOW.getTime() - backoffCutoff(NOW, 5).getTime();
    const c24 = NOW.getTime() - backoffCutoff(NOW, 24).getTime();
    expect(c1).toBe(2 * oneHourMs);
    expect(c5).toBe(24 * oneHourMs); // capped
    expect(c24).toBe(24 * oneHourMs);
  });
});

// ----------------------------------------------------------------------------
// AUTO_CHARGE success
// ----------------------------------------------------------------------------

describe('scheduledPaymentsService :: chargeScheduledPayment success', () => {
  it('creates a Payment, charges Stripe, links invoice, marks PROCESSED', async () => {
    const sp = makeScheduledPayment();

    const outcome = await chargeScheduledPayment(sp, NOW);

    expect(outcome.kind).toBe('PROCESSED');

    // Stripe called with stable idempotency key.
    expect(stripeCreateMock).toHaveBeenCalledTimes(1);
    const [, stripeOpts] = stripeCreateMock.mock.calls[0];
    expect(stripeOpts.idempotencyKey).toBe('sp_1_attempt_0');

    // Payment created PENDING then updated to SUCCEEDED.
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
    const paymentCreateArgs = (prisma.payment.create as any).mock.calls[0][0];
    expect(paymentCreateArgs.data.status).toBe('PENDING');
    expect(paymentCreateArgs.data.amount).toBe(19900);
    expect(paymentCreateArgs.data.metadata.idempotencyKey).toBe('sp_1_attempt_0');
    expect(paymentCreateArgs.data.metadata.scheduledPaymentId).toBe(1);

    // ScheduledPayment final update flips to PROCESSED.
    const lastSpUpdate = (prisma.scheduledPayment.update as any).mock.calls.at(-1)[0];
    expect(lastSpUpdate.where).toEqual({ id: 1 });
    expect(lastSpUpdate.data.status).toBe('PROCESSED');
    expect(lastSpUpdate.data.failureReason).toBeNull();
    expect(lastSpUpdate.data.attemptCount).toEqual({ increment: 1 });
    expect(lastSpUpdate.data.processedAt).toEqual(NOW);

    // Invoice was created and linked.
    expect(createInvoiceForProcessedPaymentMock).toHaveBeenCalledTimes(1);

    // Audit logged success.
    expect(auditLogMock).toHaveBeenCalled();
    const auditArgs = auditLogMock.mock.calls[0];
    expect(auditArgs[1].action).toBe('scheduled_payment.charged');
    expect(auditArgs[1].outcome).toBe('SUCCESS');
  });
});

// ----------------------------------------------------------------------------
// AUTO_CHARGE: terminal card error
// ----------------------------------------------------------------------------

describe('scheduledPaymentsService :: card errors are terminal', () => {
  it('flips to FAILED on card_declined without retry, fires HIGH-priority Notification', async () => {
    stripeCreateMock.mockRejectedValueOnce(
      new StripeCardError('card_declined', 'Your card was declined.', 'pi_failed_1')
    );

    const sp = makeScheduledPayment();
    const outcome = await chargeScheduledPayment(sp, NOW);

    expect(outcome.kind).toBe('TERMINAL_FAILURE');
    if (outcome.kind === 'TERMINAL_FAILURE') {
      expect(outcome.reason).toMatch(/declined/i);
    }

    const updateCalls = (prisma.scheduledPayment.update as any).mock.calls;
    const failedCall = updateCalls.find((c: any) => c[0].data.status === 'FAILED');
    expect(failedCall).toBeDefined();
    expect(failedCall[0].data.failureReason).toMatch(/declined/i);
    expect(failedCall[0].data.attemptCount).toEqual({ increment: 1 });

    // Rep got a HIGH-priority Notification on terminal failure.
    expect(prisma.notification.create).toHaveBeenCalled();
    const notif = (prisma.notification.create as any).mock.calls[0][0];
    expect(notif.data.priority).toBe('HIGH');
    expect(notif.data.category).toBe('PAYMENT');
    expect(notif.data.userId).toBe(7);
    expect(notif.data.sourceId).toContain('failed');

    // Email also went out to the rep.
    expect(sendEmailMock).toHaveBeenCalled();
    expect(sendEmailMock.mock.calls[0][0].to).toBe('rep@example.com');

    // Audit logged failure terminal.
    const audited = auditLogMock.mock.calls.map((c: any) => c[1].action);
    expect(audited).toContain('scheduled_payment.failed_terminal');
  });

  it('persists the failed PaymentIntent ID for webhook reconciliation', async () => {
    stripeCreateMock.mockRejectedValueOnce(
      new StripeCardError('card_declined', 'declined', 'pi_failed_xyz')
    );

    const sp = makeScheduledPayment();
    await chargeScheduledPayment(sp, NOW);

    const paymentUpdate = (prisma.payment.update as any).mock.calls[0][0];
    expect(paymentUpdate.data.status).toBe('FAILED');
    expect(paymentUpdate.data.stripePaymentIntentId).toBe('pi_failed_xyz');
  });
});

// ----------------------------------------------------------------------------
// AUTO_CHARGE: transient retry path
// ----------------------------------------------------------------------------

describe('scheduledPaymentsService :: transient errors retry', () => {
  it('keeps row PENDING and increments attemptCount on transient error', async () => {
    stripeCreateMock.mockRejectedValueOnce(new StripeApiTimeoutError('Stripe API timeout'));

    const sp = makeScheduledPayment();
    const outcome = await chargeScheduledPayment(sp, NOW);

    expect(outcome.kind).toBe('RETRY_SCHEDULED');
    if (outcome.kind === 'RETRY_SCHEDULED') {
      expect(outcome.attemptCount).toBe(1);
    }

    const updateCalls = (prisma.scheduledPayment.update as any).mock.calls;
    const retryCall = updateCalls.at(-1);
    expect(retryCall[0].data.status).toBe('PENDING');
    expect(retryCall[0].data.attemptCount).toEqual({ increment: 1 });
    expect(retryCall[0].data.lastAttemptAt).toEqual(NOW);

    // No terminal Notification on transient retry.
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('flips to terminal FAILED on the MAX_ATTEMPTS-th transient failure', async () => {
    stripeCreateMock.mockRejectedValueOnce(new StripeApiTimeoutError('Stripe API timeout'));

    const sp = makeScheduledPayment({ attemptCount: MAX_ATTEMPTS - 1 });
    const outcome = await chargeScheduledPayment(sp, NOW);

    expect(outcome.kind).toBe('TERMINAL_FAILURE');

    const updateCalls = (prisma.scheduledPayment.update as any).mock.calls;
    const terminalCall = updateCalls.at(-1);
    expect(terminalCall[0].data.status).toBe('FAILED');

    // Rep notified on terminal flip.
    expect(prisma.notification.create).toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// AUTO_CHARGE: idempotency stability across attempts of the same row
// ----------------------------------------------------------------------------

describe('scheduledPaymentsService :: idempotency keying', () => {
  it('uses the same key on a cron double-tick of the same attempt index', async () => {
    const sp = makeScheduledPayment();

    await chargeScheduledPayment(sp, NOW);
    await chargeScheduledPayment(sp, NOW);

    const keys = stripeCreateMock.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys[0]).toBe('sp_1_attempt_0');
    expect(keys[1]).toBe('sp_1_attempt_0');
  });

  it('rotates the key when attemptCount increases (new retry)', async () => {
    await chargeScheduledPayment(makeScheduledPayment({ attemptCount: 0 }), NOW);
    await chargeScheduledPayment(makeScheduledPayment({ attemptCount: 1 }), NOW);

    const keys = stripeCreateMock.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys[0]).toBe('sp_1_attempt_0');
    expect(keys[1]).toBe('sp_1_attempt_1');
  });
});

// ----------------------------------------------------------------------------
// AUTO_CHARGE: missing payment method
// ----------------------------------------------------------------------------

describe('scheduledPaymentsService :: missing payment method', () => {
  it('terminates immediately when the patient has no saved card', async () => {
    const sp = makeScheduledPayment({
      patient: {
        ...makeScheduledPayment().patient,
        paymentMethods: [],
      },
    });

    const outcome = await chargeScheduledPayment(sp, NOW);

    expect(outcome.kind).toBe('TERMINAL_FAILURE');
    expect(stripeCreateMock).not.toHaveBeenCalled();

    // No PENDING Payment row created when there's no method to charge.
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// REMINDER path
// ----------------------------------------------------------------------------

describe('scheduledPaymentsService :: REMINDER fires notification + email', () => {
  it('flips to PROCESSED, creates Notification, sends email', async () => {
    const sp = makeScheduledPayment({ type: 'REMINDER' });

    await fireReminder(sp, NOW);

    const update = (prisma.scheduledPayment.update as any).mock.calls.at(-1)[0];
    expect(update.data.status).toBe('PROCESSED');
    expect(update.data.attemptCount).toEqual({ increment: 1 });
    expect(update.data.processedAt).toEqual(NOW);

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    const notif = (prisma.notification.create as any).mock.calls[0][0];
    expect(notif.data.userId).toBe(7);
    expect(notif.data.category).toBe('PAYMENT');
    expect(notif.data.priority).toBe('NORMAL');
    expect(notif.data.actionUrl).toContain(`/admin/patients/100`);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('rep@example.com');
    // Subject must NOT contain raw patient first name (PHI guard).
    expect(sendEmailMock.mock.calls[0][0].subject).not.toMatch(/John/);

    // Audit logged.
    const audited = auditLogMock.mock.calls.map((c: any) => c[1].action);
    expect(audited).toContain('scheduled_payment.reminder_fired');
  });

  it('dedupes Notification when sourceId already exists', async () => {
    (prisma.notification.findFirst as any).mockResolvedValueOnce({ id: 42 });

    await fireReminder(makeScheduledPayment({ type: 'REMINDER' }), NOW);

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// processDuePayments query shape
// ----------------------------------------------------------------------------

describe('scheduledPaymentsService :: processDuePayments query', () => {
  it('queries only PENDING + due + attemptCount < MAX', async () => {
    (prisma.scheduledPayment.findMany as any).mockResolvedValueOnce([]);

    await processDuePayments(NOW);

    expect(prisma.scheduledPayment.findMany).toHaveBeenCalledTimes(1);
    const args = (prisma.scheduledPayment.findMany as any).mock.calls[0][0];
    expect(args.where.status).toBe('PENDING');
    expect(args.where.scheduledDate).toEqual({ lte: NOW });
    expect(args.where.attemptCount).toEqual({ lt: MAX_ATTEMPTS });
  });

  it('skips rows still inside their backoff window', async () => {
    const recentlyAttempted = makeScheduledPayment({
      id: 2,
      attemptCount: 1,
      lastAttemptAt: new Date(NOW.getTime() - 10 * 60 * 1000), // 10 min ago, well inside 2h backoff
    });
    (prisma.scheduledPayment.findMany as any).mockResolvedValueOnce([recentlyAttempted]);

    const result = await processDuePayments(NOW);

    expect(result.total).toBe(0);
    expect(stripeCreateMock).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// Manual processScheduledPayment
// ----------------------------------------------------------------------------

describe('scheduledPaymentsService :: processScheduledPayment (manual)', () => {
  it('returns SKIPPED when the row is missing', async () => {
    (prisma.scheduledPayment.findUnique as any).mockResolvedValueOnce(null);
    const outcome = await processScheduledPayment(999, { manualUserId: 7 });
    expect(outcome.kind).toBe('SKIPPED');
  });

  it('returns SKIPPED when the row is not PENDING', async () => {
    (prisma.scheduledPayment.findUnique as any).mockResolvedValueOnce(
      makeScheduledPayment({ status: 'PROCESSED' })
    );
    const outcome = await processScheduledPayment(1, { manualUserId: 7 });
    expect(outcome.kind).toBe('SKIPPED');
  });

  it('charges and audits with manual user context', async () => {
    (prisma.scheduledPayment.findUnique as any).mockResolvedValueOnce(makeScheduledPayment());

    const outcome = await processScheduledPayment(1, { manualUserId: 7, now: NOW });
    expect(outcome.kind).toBe('PROCESSED');

    const audit = auditLogMock.mock.calls[0][1];
    expect(audit.metadata.manual).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Regression: cron route does not loopback-fetch
// ----------------------------------------------------------------------------

describe('scheduledPaymentsService :: cron regression', () => {
  it('process-scheduled-payments cron never imports fetch()', () => {
    const cronPath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'src',
      'app',
      'api',
      'cron',
      'process-scheduled-payments',
      'route.ts'
    );
    const content = fs.readFileSync(cronPath, 'utf8');

    // The broken loopback path used `fetch('.../api/stripe/payments/process'`.
    expect(content).not.toMatch(/fetch\([^)]*api\/stripe\/payments\/process/);
    // It must call the service directly.
    expect(content).toMatch(/processDuePayments\(/);
  });
});
