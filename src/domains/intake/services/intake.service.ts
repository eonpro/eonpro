/**
 * Intake Service
 *
 * @module domains/intake/services
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface IntakeService {
  listIntakeForms(clinicId: number): Promise<Record<string, unknown>[]>;
  getSubmission(submissionId: number): Promise<Record<string, unknown> | null>;
}

export function createIntakeService(): IntakeService {
  return {
    async listIntakeForms(clinicId: number): Promise<Record<string, unknown>[]> {
      const forms = await prisma.intakeFormTemplate.findMany({
        where: { clinicId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      return forms as unknown as Record<string, unknown>[];
    },

    async getSubmission(submissionId: number): Promise<Record<string, unknown> | null> {
      const submission = await prisma.intakeFormSubmission.findUnique({
        where: { id: submissionId },
        include: { responses: true },
      });
      return submission as unknown as Record<string, unknown> | null;
    },
  };
}

export const intakeService = createIntakeService();
