import { prisma } from "@/lib/db";
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';

type Params = {
  params: Promise<{ id: string }>;
};

// DELETE - Remove a tag from patient
const removeTagHandler = withAuthParams(async (request, user, { params }: Params) => {
  const resolvedParams = await params;
  const id = Number(resolvedParams.id);
  
  if (Number.isNaN(id)) {
    return Response.json({ error: "Invalid patient id" }, { status: 400 });
  }

  try {
    const { tag } = await request.json();
    
    if (!tag || typeof tag !== 'string') {
      return Response.json({ error: "Tag is required" }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({ where: { id } });
    
    if (!patient) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }

    // Get current tags
    const currentTags = Array.isArray(patient.tags) ? patient.tags as string[] : [];
    
    // Remove the tag (case-insensitive match)
    const normalizedTag = tag.replace(/^#/, '').toLowerCase();
    const updatedTags = currentTags.filter(
      (t: string) => t.replace(/^#/, '').toLowerCase() !== normalizedTag
    );

    // Update patient
    const updatedPatient = await prisma.patient.update({
      where: { id },
      data: { tags: updatedTags },
    });

    // Create audit log
    await prisma.patientAudit.create({
      data: {
        patientId: id,
        actorEmail: user.email,
        action: "update",
        diff: {
          tags: {
            before: currentTags,
            after: updatedTags,
            removed: tag,
          },
        },
      },
    });

    logger.info(`[DELETE /api/patients/${id}/tags] Tag "${tag}" removed by ${user.email}`);
    
    return Response.json({ 
      success: true, 
      tags: updatedTags,
    });
  } catch (err: any) {
    logger.error("[PATIENTS/TAGS/DELETE] Failed to remove tag", err);
    return Response.json(
      { error: err.message ?? "Failed to remove tag" },
      { status: 500 }
    );
  }
}, { roles: ['super_admin', 'admin', 'provider', 'staff'] });

export const DELETE = removeTagHandler;

// POST - Add a tag to patient
const addTagHandler = withAuthParams(async (request, user, { params }: Params) => {
  const resolvedParams = await params;
  const id = Number(resolvedParams.id);
  
  if (Number.isNaN(id)) {
    return Response.json({ error: "Invalid patient id" }, { status: 400 });
  }

  try {
    const { tag } = await request.json();
    
    if (!tag || typeof tag !== 'string') {
      return Response.json({ error: "Tag is required" }, { status: 400 });
    }

    const patient = await prisma.patient.findUnique({ where: { id } });
    
    if (!patient) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }

    // Get current tags
    const currentTags = Array.isArray(patient.tags) ? patient.tags as string[] : [];
    
    // Normalize the tag (remove # prefix if present)
    const normalizedTag = tag.replace(/^#/, '').trim();
    
    // Check if tag already exists (case-insensitive)
    const tagExists = currentTags.some(
      (t: string) => t.replace(/^#/, '').toLowerCase() === normalizedTag.toLowerCase()
    );
    
    if (tagExists) {
      return Response.json({ error: "Tag already exists" }, { status: 400 });
    }

    // Add the new tag
    const updatedTags = [...currentTags, normalizedTag];

    // Update patient
    const updatedPatient = await prisma.patient.update({
      where: { id },
      data: { tags: updatedTags },
    });

    // Create audit log
    await prisma.patientAudit.create({
      data: {
        patientId: id,
        actorEmail: user.email,
        action: "update",
        diff: {
          tags: {
            before: currentTags,
            after: updatedTags,
            added: normalizedTag,
          },
        },
      },
    });

    logger.info(`[POST /api/patients/${id}/tags] Tag "${normalizedTag}" added by ${user.email}`);
    
    return Response.json({ 
      success: true, 
      tags: updatedTags,
    });
  } catch (err: any) {
    logger.error("[PATIENTS/TAGS/POST] Failed to add tag", err);
    return Response.json(
      { error: err.message ?? "Failed to add tag" },
      { status: 500 }
    );
  }
}, { roles: ['super_admin', 'admin', 'provider', 'staff'] });

export const POST = addTagHandler;
