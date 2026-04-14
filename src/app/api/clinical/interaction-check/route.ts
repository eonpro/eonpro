import { NextRequest, NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth/middleware';
import { checkAllergyDrugClass } from '@/lib/clinical/drug-classes';
import { resolveRxCUI, checkInteractions } from '@/lib/clinical/rxnorm-client';
import { logger } from '@/lib/logger';

interface InteractionCheckRequest {
  medications: string[];
  allergies: string[];
}

async function handler(req: NextRequest) {
  try {
    const body = (await req.json()) as InteractionCheckRequest;
    const medications = (body.medications ?? []).filter((m) => m.trim().length > 0);
    const allergies = (body.allergies ?? []).filter((a) => a.trim().length > 0);

    if (medications.length === 0) {
      return NextResponse.json({ interactions: [], allergyWarnings: [], aiSummary: null });
    }

    // Step 1: Check allergy cross-references using local drug class map (instant)
    const allergyWarnings = medications
      .map((med) => checkAllergyDrugClass(med, allergies))
      .filter(Boolean);

    // Step 2: Resolve RxCUI for each medication (parallel, cached)
    const rxcuiPairs = await Promise.all(
      medications.map(async (med) => ({ name: med, rxcui: await resolveRxCUI(med) }))
    );
    const validRxcuis = rxcuiPairs.filter((p) => p.rxcui !== null) as {
      name: string;
      rxcui: string;
    }[];

    // Step 3: Check drug-drug interactions via RxNorm
    const interactions =
      validRxcuis.length >= 2 ? await checkInteractions(validRxcuis.map((p) => p.rxcui)) : [];

    // Step 4: Generate AI summary if there are warnings (non-blocking, best effort)
    let aiSummary: string | null = null;
    if (interactions.length > 0 || allergyWarnings.length > 0) {
      try {
        const { generateClinicalSummary } = await import('@/services/ai/openaiService');
        const prompt = buildSummaryPrompt(medications, allergies, interactions, allergyWarnings);
        aiSummary = await generateClinicalSummary(prompt);
      } catch (err) {
        logger.warn('[interaction-check] AI summary failed (non-critical)', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      interactions,
      allergyWarnings,
      aiSummary,
    });
  } catch (error) {
    logger.error('[interaction-check] Error:', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to check interactions' }, { status: 500 });
  }
}

function buildSummaryPrompt(
  medications: string[],
  allergies: string[],
  interactions: any[],
  allergyWarnings: any[]
): string {
  const parts = [
    'Provide a brief clinical summary (2-3 sentences) for a healthcare provider:',
    `Medications: ${medications.join(', ')}`,
  ];
  if (allergies.length > 0) {
    parts.push(`Known allergies: ${allergies.join(', ')}`);
  }
  if (interactions.length > 0) {
    parts.push(
      `Drug interactions found: ${interactions.map((i) => `${i.drug1} + ${i.drug2}: ${i.description}`).join('; ')}`
    );
  }
  if (allergyWarnings.length > 0) {
    parts.push(
      `Allergy warnings: ${allergyWarnings.map((w: any) => `${w.medication} vs ${w.allergy}: ${w.reason}`).join('; ')}`
    );
  }
  parts.push(
    'Focus on clinical significance, severity, and whether medication changes may be needed. Be concise.'
  );
  return parts.join('\n');
}

export const POST = withAuth(handler);
