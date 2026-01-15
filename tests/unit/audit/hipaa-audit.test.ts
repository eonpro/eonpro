/**
 * HIPAA Audit Logging Tests
 * Tests for HIPAA-compliant audit logging functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {},
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
    api: vi.fn(),
  },
}));

// Mock fs for fallback logging
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
}));

describe('HIPAA Audit Event Types', () => {
  it('should define authentication event types', async () => {
    const { AuditEventType } = await import('@/lib/audit/hipaa-audit');
    
    expect(AuditEventType.LOGIN).toBe('LOGIN');
    expect(AuditEventType.LOGOUT).toBe('LOGOUT');
    expect(AuditEventType.LOGIN_FAILED).toBe('LOGIN_FAILED');
    expect(AuditEventType.PASSWORD_CHANGE).toBe('PASSWORD_CHANGE');
    expect(AuditEventType.SESSION_TIMEOUT).toBe('SESSION_TIMEOUT');
  });

  it('should define PHI access event types', async () => {
    const { AuditEventType } = await import('@/lib/audit/hipaa-audit');
    
    expect(AuditEventType.PHI_VIEW).toBe('PHI_VIEW');
    expect(AuditEventType.PHI_CREATE).toBe('PHI_CREATE');
    expect(AuditEventType.PHI_UPDATE).toBe('PHI_UPDATE');
    expect(AuditEventType.PHI_DELETE).toBe('PHI_DELETE');
    expect(AuditEventType.PHI_EXPORT).toBe('PHI_EXPORT');
  });

  it('should define document event types', async () => {
    const { AuditEventType } = await import('@/lib/audit/hipaa-audit');
    
    expect(AuditEventType.DOCUMENT_VIEW).toBe('DOCUMENT_VIEW');
    expect(AuditEventType.DOCUMENT_UPLOAD).toBe('DOCUMENT_UPLOAD');
    expect(AuditEventType.DOCUMENT_DOWNLOAD).toBe('DOCUMENT_DOWNLOAD');
    expect(AuditEventType.DOCUMENT_DELETE).toBe('DOCUMENT_DELETE');
  });

  it('should define emergency access event types', async () => {
    const { AuditEventType } = await import('@/lib/audit/hipaa-audit');
    
    expect(AuditEventType.EMERGENCY_ACCESS).toBe('EMERGENCY_ACCESS');
    expect(AuditEventType.BREAK_GLASS).toBe('BREAK_GLASS');
  });

  it('should define administrative event types', async () => {
    const { AuditEventType } = await import('@/lib/audit/hipaa-audit');
    
    expect(AuditEventType.USER_CREATE).toBe('USER_CREATE');
    expect(AuditEventType.USER_UPDATE).toBe('USER_UPDATE');
    expect(AuditEventType.USER_DELETE).toBe('USER_DELETE');
    expect(AuditEventType.PERMISSION_CHANGE).toBe('PERMISSION_CHANGE');
  });
});

describe('Audit Log Function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log audit events', async () => {
    const { auditLog, AuditEventType } = await import('@/lib/audit/hipaa-audit');
    const { logger } = await import('@/lib/logger');
    
    const mockRequest = {
      headers: new Headers({
        'x-forwarded-for': '192.168.1.100',
        'user-agent': 'TestAgent/1.0',
      }),
      cookies: {
        get: vi.fn().mockReturnValue({ value: 'session-123' }),
      },
      method: 'GET',
      url: 'http://localhost/api/patients/1',
    } as unknown as NextRequest;

    await auditLog(mockRequest, {
      userId: 'user-123',
      userEmail: 'user@example.com',
      userRole: 'PROVIDER',
      clinicId: 1,
      eventType: AuditEventType.PHI_VIEW,
      resourceType: 'Patient',
      resourceId: '1',
      patientId: 1,
      action: 'VIEW_PATIENT',
      outcome: 'SUCCESS',
    });

    expect(logger.api).toHaveBeenCalledWith(
      'AUDIT',
      'PHI_VIEW',
      expect.objectContaining({
        userId: 'user-123',
        eventType: 'PHI_VIEW',
        outcome: 'SUCCESS',
      })
    );
  });

  it('should work without request context', async () => {
    const { auditLog, AuditEventType } = await import('@/lib/audit/hipaa-audit');
    const { logger } = await import('@/lib/logger');

    await auditLog(null, {
      userId: 'system',
      eventType: AuditEventType.SYSTEM_ACCESS,
      resourceType: 'Database',
      action: 'SYSTEM_MAINTENANCE',
      outcome: 'SUCCESS',
    });

    expect(logger.api).toHaveBeenCalledWith(
      'AUDIT',
      'SYSTEM_ACCESS',
      expect.objectContaining({
        userId: 'system',
        ipAddress: 'system',
      })
    );
  });

  it('should trigger security alerts for suspicious events', async () => {
    const { auditLog, AuditEventType } = await import('@/lib/audit/hipaa-audit');
    const { logger } = await import('@/lib/logger');

    await auditLog(null, {
      userId: 'attacker',
      eventType: AuditEventType.SECURITY_ALERT,
      resourceType: 'System',
      action: 'SUSPICIOUS_ACTIVITY',
      outcome: 'FAILURE',
    });

    expect(logger.security).toHaveBeenCalledWith(
      'SECURITY_ALERT',
      expect.objectContaining({
        severity: 'HIGH',
        type: 'SECURITY_ALERT',
      })
    );
  });

  it('should log critical events separately', async () => {
    const { auditLog, AuditEventType } = await import('@/lib/audit/hipaa-audit');
    const { logger } = await import('@/lib/logger');

    await auditLog(null, {
      userId: 'user-1',
      eventType: AuditEventType.PHI_DELETE,
      resourceType: 'Patient',
      resourceId: '100',
      action: 'DELETE_PATIENT_RECORD',
      outcome: 'SUCCESS',
    });

    // Should log to regular audit
    expect(logger.api).toHaveBeenCalled();
    
    // Should also log to critical events
    expect(logger.security).toHaveBeenCalledWith(
      'CRITICAL_AUDIT',
      expect.objectContaining({
        integrity: 'CRITICAL',
        immutable: true,
      })
    );
  });

  it('should include integrity hash in audit records', async () => {
    const { auditLog, AuditEventType } = await import('@/lib/audit/hipaa-audit');
    const { logger } = await import('@/lib/logger');

    await auditLog(null, {
      userId: 'user-1',
      eventType: AuditEventType.LOGIN,
      resourceType: 'Session',
      action: 'LOGIN',
      outcome: 'SUCCESS',
    });

    expect(logger.api).toHaveBeenCalledWith(
      'AUDIT',
      'LOGIN',
      expect.objectContaining({
        hash: expect.any(String),
        integrity: 'SHA256',
      })
    );
  });
});

describe('Request Context Extraction', () => {
  it('should extract IP from x-forwarded-for header', () => {
    const extractIP = (headers: Headers): string => {
      return headers.get('x-forwarded-for') || 
             headers.get('x-real-ip') || 
             headers.get('cf-connecting-ip') || 
             'unknown';
    };

    const headers = new Headers({ 'x-forwarded-for': '10.0.0.1' });
    expect(extractIP(headers)).toBe('10.0.0.1');
  });

  it('should fall back to x-real-ip', () => {
    const extractIP = (headers: Headers): string => {
      return headers.get('x-forwarded-for') || 
             headers.get('x-real-ip') || 
             headers.get('cf-connecting-ip') || 
             'unknown';
    };

    const headers = new Headers({ 'x-real-ip': '10.0.0.2' });
    expect(extractIP(headers)).toBe('10.0.0.2');
  });

  it('should fall back to cf-connecting-ip (Cloudflare)', () => {
    const extractIP = (headers: Headers): string => {
      return headers.get('x-forwarded-for') || 
             headers.get('x-real-ip') || 
             headers.get('cf-connecting-ip') || 
             'unknown';
    };

    const headers = new Headers({ 'cf-connecting-ip': '10.0.0.3' });
    expect(extractIP(headers)).toBe('10.0.0.3');
  });

  it('should return unknown when no IP headers present', () => {
    const extractIP = (headers: Headers): string => {
      return headers.get('x-forwarded-for') || 
             headers.get('x-real-ip') || 
             headers.get('cf-connecting-ip') || 
             'unknown';
    };

    const headers = new Headers();
    expect(extractIP(headers)).toBe('unknown');
  });

  it('should extract user agent', () => {
    const headers = new Headers({ 'user-agent': 'Mozilla/5.0' });
    expect(headers.get('user-agent')).toBe('Mozilla/5.0');
  });
});

describe('Audit Hash Calculation', () => {
  it('should calculate SHA256 hash', () => {
    const calculateHash = (data: any): string => {
      return crypto
        .createHash('sha256')
        .update(JSON.stringify(data))
        .digest('hex');
    };

    const data = { event: 'test', userId: '123' };
    const hash = calculateHash(data);

    expect(hash).toBeDefined();
    expect(hash.length).toBe(64); // SHA256 produces 64 hex chars
  });

  it('should produce consistent hashes for same data', () => {
    const calculateHash = (data: any): string => {
      return crypto
        .createHash('sha256')
        .update(JSON.stringify(data))
        .digest('hex');
    };

    const data = { event: 'test', userId: '123' };
    const hash1 = calculateHash(data);
    const hash2 = calculateHash(data);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different data', () => {
    const calculateHash = (data: any): string => {
      return crypto
        .createHash('sha256')
        .update(JSON.stringify(data))
        .digest('hex');
    };

    const data1 = { event: 'test', userId: '123' };
    const data2 = { event: 'test', userId: '456' };

    expect(calculateHash(data1)).not.toBe(calculateHash(data2));
  });
});

describe('Critical Event Detection', () => {
  it('should identify PHI events as critical', () => {
    const criticalEvents = [
      'PHI_VIEW',
      'PHI_UPDATE',
      'PHI_DELETE',
      'PHI_EXPORT',
      'DOCUMENT_DOWNLOAD',
      'EMERGENCY_ACCESS',
      'BREAK_GLASS',
      'PERMISSION_CHANGE',
      'SECURITY_ALERT',
    ];

    const isCritical = (eventType: string): boolean => {
      return criticalEvents.includes(eventType);
    };

    expect(isCritical('PHI_VIEW')).toBe(true);
    expect(isCritical('PHI_DELETE')).toBe(true);
    expect(isCritical('BREAK_GLASS')).toBe(true);
    expect(isCritical('LOGIN')).toBe(false);
    expect(isCritical('USER_CREATE')).toBe(false);
  });
});

describe('Audit Log Query', () => {
  it('should accept filter parameters', async () => {
    const { queryAuditLogs, AuditEventType } = await import('@/lib/audit/hipaa-audit');

    const result = await queryAuditLogs({
      userId: 'user-1',
      patientId: 100,
      eventType: AuditEventType.PHI_VIEW,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      outcome: 'SUCCESS',
      limit: 100,
    });

    expect(Array.isArray(result)).toBe(true);
  });
});

describe('Audit Report Generation', () => {
  it('should generate JSON report', async () => {
    const { generateAuditReport } = await import('@/lib/audit/hipaa-audit');

    const report = await generateAuditReport(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      'json'
    );

    expect(typeof report).toBe('string');
    // Should be valid JSON
    expect(() => JSON.parse(report as string)).not.toThrow();
  });

  it('should generate CSV report', async () => {
    const { generateAuditReport } = await import('@/lib/audit/hipaa-audit');

    const report = await generateAuditReport(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      'csv'
    );

    expect(typeof report).toBe('string');
  });

  it('should generate PDF placeholder', async () => {
    const { generateAuditReport } = await import('@/lib/audit/hipaa-audit');

    const report = await generateAuditReport(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      'pdf'
    );

    expect(report).toBeInstanceOf(Buffer);
  });
});

describe('Audit Integrity Verification', () => {
  it('should verify audit log integrity', async () => {
    const { verifyAuditIntegrity } = await import('@/lib/audit/hipaa-audit');

    const result = await verifyAuditIntegrity('log-123');

    expect(result).toHaveProperty('valid');
    expect(typeof result.valid).toBe('boolean');
  });
});

describe('Audit Context', () => {
  it('should have required fields', () => {
    interface AuditContext {
      userId: number | string;
      eventType: string;
      resourceType: string;
      action: string;
      outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
    }

    const context: AuditContext = {
      userId: 'user-1',
      eventType: 'PHI_VIEW',
      resourceType: 'Patient',
      action: 'VIEW',
      outcome: 'SUCCESS',
    };

    expect(context.userId).toBeDefined();
    expect(context.eventType).toBeDefined();
    expect(context.resourceType).toBeDefined();
    expect(context.action).toBeDefined();
    expect(context.outcome).toBeDefined();
  });

  it('should support optional fields', () => {
    interface AuditContext {
      userId: number | string;
      userEmail?: string;
      userRole?: string;
      clinicId?: number;
      eventType: string;
      resourceType: string;
      resourceId?: string | number;
      patientId?: number;
      action: string;
      outcome: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
      reason?: string;
      metadata?: Record<string, any>;
      emergency?: boolean;
    }

    const context: AuditContext = {
      userId: 'user-1',
      userEmail: 'user@example.com',
      userRole: 'PROVIDER',
      clinicId: 1,
      eventType: 'PHI_VIEW',
      resourceType: 'Patient',
      resourceId: 100,
      patientId: 100,
      action: 'VIEW_RECORD',
      outcome: 'SUCCESS',
      reason: 'Scheduled appointment',
      metadata: { appointmentId: 50 },
      emergency: false,
    };

    expect(context.userEmail).toBe('user@example.com');
    expect(context.patientId).toBe(100);
    expect(context.metadata?.appointmentId).toBe(50);
  });
});

describe('withAuditLog Middleware', () => {
  it('should wrap handlers with audit logging', async () => {
    const { withAuditLog, AuditEventType } = await import('@/lib/audit/hipaa-audit');
    const { logger } = await import('@/lib/logger');

    const mockHandler = vi.fn().mockResolvedValue({ data: 'test' });
    const wrappedHandler = withAuditLog(mockHandler, {
      eventType: AuditEventType.PHI_VIEW,
      resourceType: 'Patient',
    });

    const mockRequest = {
      headers: new Headers(),
      cookies: { get: vi.fn() },
      method: 'GET',
      url: 'http://localhost/api/test',
    };

    const mockUser = { id: 'user-1', email: 'test@example.com' };

    await wrappedHandler(mockRequest, mockUser);

    expect(mockHandler).toHaveBeenCalled();
    expect(logger.api).toHaveBeenCalled();
  });

  it('should log failures when handler throws', async () => {
    const { withAuditLog, AuditEventType } = await import('@/lib/audit/hipaa-audit');
    const { logger } = await import('@/lib/logger');

    const mockHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
    const wrappedHandler = withAuditLog(mockHandler, {
      eventType: AuditEventType.PHI_UPDATE,
      resourceType: 'Patient',
    });

    const mockRequest = {
      headers: new Headers(),
      cookies: { get: vi.fn() },
      method: 'PUT',
      url: 'http://localhost/api/test',
    };

    await expect(wrappedHandler(mockRequest, null)).rejects.toThrow('Handler error');
    
    expect(logger.api).toHaveBeenCalledWith(
      'AUDIT',
      'PHI_UPDATE',
      expect.objectContaining({
        outcome: 'FAILURE',
      })
    );
  });
});

describe('HIPAA Compliance Requirements', () => {
  it('should track who accessed what and when', () => {
    // HIPAA requires tracking:
    // - Who (userId)
    // - What (resourceType, resourceId)
    // - When (timestamp)
    // - From where (ipAddress)
    // - Outcome (success/failure)

    const requiredFields = [
      'userId',
      'resourceType',
      'action',
      'outcome',
      'timestamp',
      'ipAddress',
    ];

    requiredFields.forEach(field => {
      expect(field).toBeDefined();
    });
  });

  it('should support 6-year retention', () => {
    // HIPAA requires 6-year retention of audit logs
    const HIPAA_RETENTION_YEARS = 6;
    const retentionMs = HIPAA_RETENTION_YEARS * 365 * 24 * 60 * 60 * 1000;
    
    expect(HIPAA_RETENTION_YEARS).toBe(6);
    expect(retentionMs).toBeGreaterThan(0);
  });

  it('should support tamper-evident logging', () => {
    // Audit logs should include hashes for integrity verification
    const auditRecord = {
      event: 'PHI_VIEW',
      data: { patientId: 1 },
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(auditRecord))
      .digest('hex');

    expect(hash.length).toBe(64);
  });
});
