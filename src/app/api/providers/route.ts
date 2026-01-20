import { prisma, basePrisma } from "@/lib/db";
import { lookupNpi } from "@/lib/npi";
import { providerSchema } from "@/lib/providerSchema";
import { NextRequest, NextResponse } from "next/server";
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

// GET - List providers (protected)
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  // Get all providers from Provider table (these have NPI and credentials)
  // Use basePrisma to bypass clinic filtering - providers may work across clinics
  let providers;
  
  if (user.role === 'super_admin') {
    // Super admin sees all providers
    providers = await basePrisma.provider.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
          }
        }
      }
    });
  } else {
    // For provider role: ALWAYS include their own linked provider record
    // Plus any providers from their clinic or shared providers
    const userData = await basePrisma.user.findUnique({
      where: { id: user.id },
      select: { providerId: true, email: true }
    });
    
    // Build OR conditions
    const orConditions: any[] = [
      { clinicId: user.clinicId },
      { clinicId: null },
    ];
    
    // If user has a linked provider, include it by ID
    if (userData?.providerId) {
      orConditions.push({ id: userData.providerId });
    }
    
    // Also include provider matching user's email (in case not linked yet)
    if (userData?.email) {
      orConditions.push({ email: userData.email });
    }
    
    providers = await basePrisma.provider.findMany({
      where: {
        OR: orConditions
      },
      orderBy: { createdAt: "desc" },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
          }
        }
      }
    });
    
    // Remove duplicates (in case provider matches multiple conditions)
    const seen = new Set();
    providers = providers.filter((p: any) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }

  logger.info(`[PROVIDERS/GET] Returning ${providers.length} providers for user ${user.id} (${user.role})`);
  return NextResponse.json({ providers });
}, { roles: ['admin', 'super_admin', 'provider'] });

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Extract clinicId separately as it's not in the schema
  const { clinicId, ...providerData } = body;

  const parsed = providerSchema.safeParse(providerData);
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

  const data = parsed.data;

  try {
    const registry = await lookupNpi(data.npi);

    const provider = await prisma.provider.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        titleLine:
          data.titleLine ??
          [registry.basic?.credential, registry.basic?.lastName]
            .filter(Boolean)
            .join(" "),
        npi: data.npi,
        licenseState: data.licenseState,
        licenseNumber: data.licenseNumber,
        dea: data.dea,
        email: data.email,
        phone: data.phone,
        signatureDataUrl: data.signatureDataUrl ?? undefined,
        npiVerifiedAt: new Date(),
        npiRawResponse: registry as any,
        // Add clinic assignment
        clinicId: clinicId ? parseInt(clinicId) : null,
      },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    return Response.json({ provider });
  } catch (err: any) {
    // @ts-ignore

    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error("[PROVIDERS/POST] Failed to create provider", err);
    return Response.json(
      { error: errorMessage ?? "Failed to create provider" },
      { status: 400 }
    );
  }
}

