import { prisma } from "@/lib/db";
import { lookupNpi } from "@/lib/npi";
import { providerSchema } from "@/lib/providerSchema";
import { NextRequest } from "next/server";
import { logger } from '@/lib/logger';

export async function GET() {
  // Get providers from Provider table
  const providerRecords = await prisma.provider.findMany({
    orderBy: { createdAt: "desc" },
  });

  // Also get users with PROVIDER role who might not have a Provider record
  const providerUsers = await prisma.user.findMany({
    where: {
      role: 'PROVIDER',
      providerId: null, // Only get users without a linked Provider record
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      createdAt: true,
    },
  });

  // Convert User records to provider-like format for UI compatibility
  const userProviders = providerUsers.map(user => ({
    id: user.id * -1, // Use negative ID to differentiate from Provider table
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    npi: 'Pending', // No NPI yet
    createdAt: user.createdAt,
    isUserOnly: true, // Flag to identify these
  }));

  // Combine both sources
  const allProviders = [...providerRecords, ...userProviders];

  return Response.json({ providers: allProviders });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
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
      },
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

