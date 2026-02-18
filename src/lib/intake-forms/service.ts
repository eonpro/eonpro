import { prisma } from '@/lib/db';
import { IntakeFormTemplate, IntakeFormQuestion, IntakeFormLink, Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { nanoid } from 'nanoid';
import { addDays } from 'date-fns';
import { buildPatientSearchIndex } from '@/lib/utils/search';
import { encryptPHI } from '@/lib/security/phi-encryption';

// Types
export interface CreateFormTemplateInput {
  name: string;
  description?: string;
  treatmentType: string;
  questions: CreateQuestionInput[];
  metadata?: any;
}

export interface CreateQuestionInput {
  questionText: string;
  questionType: string;
  options?: any;
  isRequired?: boolean;
  validation?: any;
  placeholder?: string;
  helpText?: string;
  orderIndex: number;
  section?: string;
  conditionalLogic?: any;
}

export interface FormLinkInput {
  templateId: number;
  patientEmail: string;
  patientPhone?: string;
  expiresInDays?: number;
  metadata?: any;
}

// Cache for frequently accessed templates
const templateCache = new Map<string, any>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Create a new form template with questions
 */
export async function createFormTemplate(
  input: CreateFormTemplateInput,
  createdById?: number,
  providerId?: number
): Promise<IntakeFormTemplate & { questions: IntakeFormQuestion[] }> {
  try {
    // Validate input
    if (!input.name?.trim()) {
      throw new Error('Form name is required');
    }

    if (!input.questions || input.questions.length === 0) {
      throw new Error('At least one question is required');
    }

    // Create template with questions in a transaction
    const template = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create the template
      const newTemplate = await tx.intakeFormTemplate.create({
        data: {
          name: input.name.trim(),
          description: input.description?.trim(),
          treatmentType: input.treatmentType,
          isActive: true,
          metadata: (input.metadata || {}) as any,
          providerId: providerId as number | undefined,
          createdById: createdById || undefined,
        },
      });

      // Create questions
      const questions = await Promise.all(
        input.questions.map((q, index) =>
          tx.intakeFormQuestion.create({
            data: {
              templateId: newTemplate.id,
              questionText: q.questionText.trim(),
              questionType: q.questionType,
              options: q.options || undefined,
              isRequired: q.isRequired || false,
              validation: q.validation || undefined,
              placeholder: q.placeholder?.trim() || null,
              helpText: q.helpText?.trim() || null,
              orderIndex: q.orderIndex ?? index,
              section: q.section?.trim() || 'General',
              conditionalLogic: q.conditionalLogic || undefined,
            },
          })
        )
      );

      return { ...newTemplate, questions };
    }, { timeout: 15000 });

    // Clear cache
    templateCache.clear();

    logger.info(`Form template created: ${template.id} - ${template.name}`);
    return template;
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to create form template', error);
    throw error;
  }
}

/**
 * Get all active form templates
 */
export async function getFormTemplates(
  providerId?: number,
  includeInactive = false
): Promise<any[]> {
  try {
    const where: Prisma.IntakeFormTemplateWhereInput = {};

    if (!includeInactive) {
      where.isActive = true;
    }

    if (providerId) {
      where.OR = [
        { providerId: null }, // Shared templates
        { providerId: providerId }, // Provider-specific templates
      ];
    }

    const templates = await prisma.intakeFormTemplate.findMany({
      where,
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
        _count: {
          select: {
            submissions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return templates;
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to get form templates', error);
    throw error;
  }
}

/**
 * Get a single form template by ID
 */
export async function getFormTemplate(templateId: number, includeStats = false): Promise<any> {
  try {
    // Check cache first
    const cacheKey = `${templateId}-${includeStats}`;
    const cached = templateCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    const template = await prisma.intakeFormTemplate.findUnique({
      where: { id: templateId },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        ...(includeStats && {
          _count: {
            select: {
              submissions: true,
            },
          },
          submissions: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
              patient: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        }),
      },
    });

    if (!template) {
      throw new Error('Form template not found');
    }

    // Cache the result
    templateCache.set(cacheKey, {
      data: template,
      expires: Date.now() + CACHE_TTL,
    });

    return template;
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to get form template', error);
    throw error;
  }
}

/**
 * Update a form template
 */
export async function updateFormTemplate(
  templateId: number,
  updates: Partial<CreateFormTemplateInput>
): Promise<any> {
  try {
    const template = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Update template
      const updated = await tx.intakeFormTemplate.update({
        where: { id: templateId },
        data: {
          name: updates.name?.trim(),
          description: updates.description?.trim(),
          treatmentType: updates.treatmentType,
          metadata: updates.metadata,
        },
      });

      // Update questions if provided
      if (updates.questions && updates.questions.length > 0) {
        // Delete existing questions
        await tx.intakeFormQuestion.deleteMany({
          where: { templateId },
        });

        // Create new questions
        const questions = await Promise.all(
          updates.questions.map((q, index) =>
            tx.intakeFormQuestion.create({
              data: {
                templateId,
                questionText: q.questionText.trim(),
                questionType: q.questionType,
                options: q.options || undefined,
                isRequired: q.isRequired || false,
                validation: q.validation || undefined,
                placeholder: q.placeholder?.trim() || null,
                helpText: q.helpText?.trim() || null,
                orderIndex: q.orderIndex ?? index,
                section: q.section?.trim() || 'General',
                conditionalLogic: q.conditionalLogic || undefined,
              },
            })
          )
        );

        return { ...updated, questions };
      }

      return updated;
    }, { timeout: 15000 });

    // Clear cache
    templateCache.clear();

    logger.info(`Form template updated: ${templateId}`);
    return template;
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to update form template', error);
    throw error;
  }
}

/**
 * Delete a form template (soft delete)
 */
export async function deleteFormTemplate(templateId: number): Promise<void> {
  try {
    await prisma.intakeFormTemplate.update({
      where: { id: templateId },
      data: { isActive: false },
    });

    // Clear cache
    templateCache.clear();

    logger.info(`Form template deleted: ${templateId}`);
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to delete form template', error);
    throw error;
  }
}

/**
 * Create a shareable link for a form
 */
export async function createFormLink(input: FormLinkInput): Promise<IntakeFormLink> {
  try {
    // Verify template exists
    const template = await prisma.intakeFormTemplate.findUnique({
      where: { id: input.templateId },
    });

    if (!template) {
      throw new Error('Form template not found');
    }

    if (!template.isActive) {
      throw new Error('Form template is not active');
    }

    // Create unique link ID
    const linkId = nanoid(12);

    // Calculate expiration (default 30 days)
    const expiresAt = addDays(new Date(), input.expiresInDays || 30);

    const link = await prisma.intakeFormLink.create({
      data: {
        templateId: input.templateId,
        patientEmail: input.patientEmail.toLowerCase(),
        patientPhone: input.patientPhone || undefined,
        expiresAt,
        metadata: (input.metadata || {}) as any,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    logger.info(`Form link created: ${linkId} for ${input.patientEmail}`);
    return link;
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to create form link', error);
    throw error;
  }
}

/**
 * Get form by link ID (for public access)
 */
export async function getFormByLinkId(linkId: string): Promise<any> {
  try {
    const link = await prisma.intakeFormLink.findUnique({
      where: { id: linkId },
      include: {
        template: {
          include: {
            questions: {
              orderBy: { orderIndex: 'asc' },
            },
            clinic: {
              select: { id: true, name: true },
            },
          },
        },
        submission: {
          include: {
            responses: true,
          },
        },
      },
    });

    if (!link) {
      throw new Error('Form link not found');
    }

    // Check if link is expired
    if (link.expiresAt < new Date()) {
      throw new Error('This form link has expired');
    }

    // Check if form is already submitted
    if (link.submission?.status === 'completed') {
      throw new Error('This form has already been submitted');
    }

    // Check if template is active
    if (!link.template.isActive) {
      throw new Error('This form is no longer available');
    }

    return link;
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to get form by link ID', error);
    throw error;
  }
}

/**
 * Submit form responses
 */
export async function submitFormResponses(
  linkId: string,
  responses: Array<{ questionId: number; answer: string; fileUrl?: string }>,
  patientInfo?: any,
  signature?: string
): Promise<any> {
  try {
    // Get link and verify
    const link = await getFormByLinkId(linkId);

    if (link.submission?.status === 'completed') {
      throw new Error('This form has already been submitted');
    }

    // Validate required questions
    const requiredQuestions = link.template.questions.filter((q: any) => q.isRequired);
    const responseMap = new Map(responses.map((r: any) => [r.questionId, r]));

    for (const question of requiredQuestions) {
      const response = responseMap.get(question.id);
      if (!response || !response.answer?.trim()) {
        throw new Error(`Question "${question.questionText}" is required`);
      }
    }

    let patientId = link.submission?.patientId || null;
    const templateClinicId = link.template.clinicId;

    const submission = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Patient find/create/update inside the transaction for atomicity
      if (!patientId && patientInfo?.email) {
        let patient = await tx.patient.findFirst({
          where: {
            email: patientInfo.email.toLowerCase(),
            ...(templateClinicId ? { clinicId: templateClinicId } : {}),
          },
        });

        if (!patient) {
          if (!templateClinicId) {
            logger.warn('Creating patient without clinicId from intake form', {
              templateId: link.template.id,
            });
          }

          const searchIndex = buildPatientSearchIndex({
            firstName: patientInfo.firstName || '',
            lastName: patientInfo.lastName || '',
            email: patientInfo.email,
            phone: patientInfo.phone || undefined,
          });
          patient = await tx.patient.create({
            data: {
              email: encryptPHI(patientInfo.email.toLowerCase()) || patientInfo.email.toLowerCase(),
              firstName: encryptPHI(patientInfo.firstName || '') || '',
              lastName: encryptPHI(patientInfo.lastName || '') || '',
              phone: encryptPHI(patientInfo.phone || '') || '',
              dob: encryptPHI('1900-01-01') || '1900-01-01',
              gender: 'OTHER',
              address1: '',
              city: '',
              state: '',
              zip: '',
              clinicId: templateClinicId,
              searchIndex,
              source: 'intake-form',
            },
          });
        } else {
          const newFirstName = patientInfo.firstName || patient.firstName;
          const newLastName = patientInfo.lastName || patient.lastName;
          const newPhone = patientInfo.phone || patient.phone;
          const updateSearchIndex = buildPatientSearchIndex({
            firstName: newFirstName,
            lastName: newLastName,
            email: patient.email,
            phone: newPhone,
            patientId: patient.patientId,
          });
          patient = await tx.patient.update({
            where: { id: patient.id },
            data: {
              firstName: encryptPHI(newFirstName) || newFirstName,
              lastName: encryptPHI(newLastName) || newLastName,
              phone: encryptPHI(newPhone) || newPhone,
              searchIndex: updateSearchIndex,
            },
          });
        }
        patientId = patient.id;
      }

      // Re-check for duplicate submission inside transaction (prevents race condition)
      if (link.submission?.id) {
        const existingSub = await tx.intakeFormSubmission.findUnique({
          where: { id: link.submission.id },
          select: { status: true },
        });
        if (existingSub?.status === 'completed') {
          throw new Error('This form has already been submitted');
        }
      }

      let sub;
      if (link.submission?.id) {
        sub = await tx.intakeFormSubmission.update({
          where: { id: link.submission.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            metadata: {
              signature,
              submittedFrom: 'web',
            } as any,
          },
        });
      } else {
        if (!patientId) {
          throw new Error('Unable to determine patient for this submission');
        }
        sub = await tx.intakeFormSubmission.create({
          data: {
            formLinkId: link.id,
            templateId: link.templateId,
            patientId,
            status: 'completed',
            completedAt: new Date(),
            metadata: {
              signature,
              submittedFrom: 'web',
            } as any,
          },
        });
      }

      await tx.intakeFormResponse.deleteMany({
        where: { submissionId: sub.id },
      });

      const createdResponses = await Promise.all(
        responses.map((r: any) =>
          tx.intakeFormResponse.create({
            data: {
              submissionId: sub.id,
              questionId: r.questionId,
              answer: r.answer,
              fileUrl: r.fileUrl || undefined,
            },
          })
        )
      );

      return { ...sub, responses: createdResponses };
    }, { timeout: 15000, isolationLevel: 'Serializable' });

    logger.info(`Form submitted: ${linkId}`);
    return submission;
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to submit form responses', error);
    throw error;
  }
}

/**
 * Get form submissions
 */
export async function getFormSubmissions(
  templateId?: number,
  patientId?: number,
  status?: 'completed' | 'partial' | 'abandoned'
): Promise<any[]> {
  try {
    const where: any = {};

    if (templateId) where.templateId = templateId;
    if (patientId) where.patientId = patientId;
    if (status) where.status = status;

    const submissions = await prisma.intakeFormSubmission.findMany({
      where,
      include: {
        template: {
          select: {
            id: true,
            name: true,
            treatmentType: true,
          },
        },
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        responses: {
          include: {
            question: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return submissions;
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to get form submissions', error);
    throw error;
  }
}

/**
 * Export form submission as structured data
 */
export async function exportFormSubmission(submissionId: number): Promise<any> {
  try {
    const submission = await prisma.intakeFormSubmission.findUnique({
      where: { id: submissionId },
      include: {
        template: {
          include: {
            questions: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        patient: true,
        responses: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!submission) {
      throw new Error('Submission not found');
    }

    // Structure the data for export
    const responseMap = new Map(submission.responses.map((r: any) => [r.questionId, r.answer]));

    const structuredData = {
      formName: submission.template.name,
      submittedAt: submission.completedAt,
      patient: {
        name: `${submission.patient?.firstName} ${submission.patient?.lastName}`,
        email: submission.patient?.email,
        phone: submission.patient?.phone,
      },
      responses: submission.template.questions.map((q: any) => ({
        section: q.section,
        question: q.questionText,
        answer: responseMap.get(q.id) || 'Not answered',
        required: q.isRequired,
      })),
    };

    return structuredData;
  } catch (error: any) {
    // @ts-ignore

    logger.error('Failed to export form submission', error);
    throw error;
  }
}
