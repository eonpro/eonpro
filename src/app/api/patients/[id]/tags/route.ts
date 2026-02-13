import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { z } from 'zod';

type Params = {
  params: Promise<{ id: string }>;
};

// Validation schema for tag operations
const tagSchema = z.object({
  tag: z
    .string()
    .min(1, 'Tag cannot be empty')
    .max(50, 'Tag too long (max 50 characters)')
    .transform((val) => val.replace(/^#/, '').trim()),
});

// Helper to validate patient ID
function validatePatientId(
  idStr: string
): { valid: true; id: number } | { valid: false; error: string } {
  const id = Number(idStr);
  if (Number.isNaN(id) || id <= 0) {
    return { valid: false, error: 'Invalid patient id' };
  }
  return { valid: true, id };
}

// DELETE - Remove a tag from patient
const removeTagHandler = withAuthParams(
  async (request, user, { params }: Params) => {
    const resolvedParams = await params;
    const validation = validatePatientId(resolvedParams.id);

    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 });
    }
    const { id } = validation;

    try {
      // Parse and validate request body
      const body = await request.json();
      const parseResult = tagSchema.safeParse(body);

      if (!parseResult.success) {
        return Response.json(
          {
            error: 'Invalid input',
            details: parseResult.error.issues.map((i) => i.message),
          },
          { status: 400 }
        );
      }

      const normalizedTag = parseResult.data.tag.toLowerCase();

      const patient = await prisma.patient.findUnique({ where: { id } });

      if (!patient) {
        return Response.json({ error: 'Patient not found' }, { status: 404 });
      }

      // Get current tags
      const currentTags = Array.isArray(patient.tags) ? (patient.tags as string[]) : [];

      // Remove the tag (case-insensitive match)
      const updatedTags = currentTags.filter(
        (t: string) => t.replace(/^#/, '').toLowerCase() !== normalizedTag
      );

      // Check if tag was actually removed
      if (updatedTags.length === currentTags.length) {
        return Response.json({ error: 'Tag not found on patient' }, { status: 404 });
      }

      // Update patient
      await prisma.patient.update({
        where: { id },
        data: { tags: updatedTags },
      });

      // Create audit log
      await prisma.patientAudit.create({
        data: {
          patientId: id,
          actorEmail: user.email,
          action: 'update',
          diff: {
            tags: {
              before: currentTags,
              after: updatedTags,
              removed: parseResult.data.tag,
            },
          },
        },
      });

      logger.info('[DELETE /api/patients/[id]/tags] Tag removed', {
        patientId: id,
        userId: user.id,
        removedTag: parseResult.data.tag,
      });

      return Response.json({
        success: true,
        tags: updatedTags,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[PATIENTS/TAGS/DELETE] Failed to remove tag', {
        error: errorMessage,
        patientId: id,
      });
      return Response.json({ error: 'Failed to remove tag' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'staff'] }
);

export const DELETE = removeTagHandler;

// POST - Add a tag to patient
const addTagHandler = withAuthParams(
  async (request, user, { params }: Params) => {
    const resolvedParams = await params;
    const validation = validatePatientId(resolvedParams.id);

    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 });
    }
    const { id } = validation;

    try {
      // Parse and validate request body
      const body = await request.json();
      const parseResult = tagSchema.safeParse(body);

      if (!parseResult.success) {
        return Response.json(
          {
            error: 'Invalid input',
            details: parseResult.error.issues.map((i) => i.message),
          },
          { status: 400 }
        );
      }

      const normalizedTag = parseResult.data.tag;

      const patient = await prisma.patient.findUnique({ where: { id } });

      if (!patient) {
        return Response.json({ error: 'Patient not found' }, { status: 404 });
      }

      // Get current tags
      const currentTags = Array.isArray(patient.tags) ? (patient.tags as string[]) : [];

      // Check if tag already exists (case-insensitive)
      const tagExists = currentTags.some(
        (t: string) => t.replace(/^#/, '').toLowerCase() === normalizedTag.toLowerCase()
      );

      if (tagExists) {
        return Response.json({ error: 'Tag already exists' }, { status: 409 });
      }

      // Add the new tag (max 20 tags per patient)
      if (currentTags.length >= 20) {
        return Response.json({ error: 'Maximum tags limit reached (20)' }, { status: 400 });
      }

      const updatedTags = [...currentTags, normalizedTag];

      // Update patient
      await prisma.patient.update({
        where: { id },
        data: { tags: updatedTags },
      });

      // Create audit log
      await prisma.patientAudit.create({
        data: {
          patientId: id,
          actorEmail: user.email,
          action: 'update',
          diff: {
            tags: {
              before: currentTags,
              after: updatedTags,
              added: normalizedTag,
            },
          },
        },
      });

      logger.info('[POST /api/patients/[id]/tags] Tag added', {
        patientId: id,
        userId: user.id,
        addedTag: normalizedTag,
      });

      return Response.json(
        {
          success: true,
          tags: updatedTags,
        },
        { status: 201 }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[PATIENTS/TAGS/POST] Failed to add tag', {
        error: errorMessage,
        patientId: id,
      });
      return Response.json({ error: 'Failed to add tag' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'staff'] }
);

export const POST = addTagHandler;
