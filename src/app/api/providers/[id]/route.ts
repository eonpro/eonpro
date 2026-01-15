import { prisma } from "@/lib/db";
import { providerSchema } from "@/lib/providerSchema";
import { logger } from '@/lib/logger';
import { AppError, ApiResponse } from '@/types/common';
import { Patient, Provider, Order } from '@/types/models';

type Params = {
  params: Promise<{ id: string }>;
};

function diffProviders(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
) {
  const diff: Record<string, { before: any; after: any }> = {};
  fields.forEach((field: any) => {
    if (before[field] !== after[field]) {
      diff[field] = { before: before[field], after: after[field] };
    }
  });
  return diff;
}

export async function GET(_request: Request, { params }: Params) {
  const resolvedParams = await params;
  const id = Number(resolvedParams.id);
  if (Number.isNaN(id)) {
    return Response.json({ error: "Invalid provider id" }, { status: 400 });
  }
  const provider = await prisma.provider.findUnique({
    where: { id },
  });
  if (!provider) {
    return Response.json({ error: "Provider not found" }, { status: 404 });
  }
  return Response.json({ provider });
}

export async function PATCH(request: Request, { params }: Params) {
  const resolvedParams = await params;
  const id = Number(resolvedParams.id);
  if (Number.isNaN(id)) {
    return Response.json({ error: "Invalid provider id" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = providerSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return Response.json(
      {
        error: firstIssue?.message ?? "Invalid provider payload",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.provider.findUnique({ where: { id } });
    if (!existing) {
      return Response.json({ error: "Provider not found" }, { status: 404 });
    }

    const provider = await prisma.provider.update({
      where: { id },
      data: parsed.data,
    });

    const changeSet = diffProviders(existing, provider, [
      "firstName",
      "lastName",
      "titleLine",
      "npi",
      "licenseState",
      "licenseNumber",
      "dea",
      "email",
      "phone",
      "signatureDataUrl",
      "clinicId",
    ]);

    if (Object.keys(changeSet).length > 0) {
      await prisma.providerAudit.create({
        data: {
          providerId: id,
          actorEmail:
            request.headers.get("x-actor-email") ??
            request.headers.get("x-user-email") ??
            "unknown",
          action: "update",
          diff: changeSet,
        },
      });
    }

    return Response.json({ provider });
  } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error("[PROVIDERS/PATCH] Failed to update provider", err);
    return Response.json(
      { error: errorMessage ?? "Failed to update provider" },
      { status: 400 }
    );
  }
}

