import { prisma } from '@/lib/db';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const definition: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_soap_notes',
    description:
      'Get SOAP notes for a specific patient. Returns subjective, objective, assessment, plan, and status.',
    parameters: {
      type: 'object',
      properties: {
        patientId: { type: 'number', description: 'The patient ID' },
        limit: { type: 'number', description: 'Max notes to return (default 3)' },
      },
      required: ['patientId'],
    },
  },
};

export async function execute(
  params: { patientId: number; limit?: number },
  clinicId: number
): Promise<unknown> {
  const verified = await prisma.patient.findFirst({
    where: { id: params.patientId, clinicId },
    select: { id: true },
  });
  if (!verified) return { found: false, message: 'Patient not found in this clinic.' };

  const notes = await prisma.sOAPNote.findMany({
    where: { patientId: params.patientId },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 3,
    select: {
      id: true,
      subjective: true,
      objective: true,
      assessment: true,
      plan: true,
      medicalNecessity: true,
      status: true,
      sourceType: true,
      createdAt: true,
    },
  });

  if (notes.length === 0) {
    return { found: true, notes: [], message: 'No SOAP notes found for this patient.' };
  }

  return {
    found: true,
    count: notes.length,
    notes: notes.map((n) => ({
      id: n.id,
      subjective: truncate(n.subjective, 500),
      objective: truncate(n.objective, 500),
      assessment: truncate(n.assessment, 500),
      plan: truncate(n.plan, 500),
      medicalNecessity: n.medicalNecessity ? truncate(n.medicalNecessity, 300) : null,
      status: n.status,
      source: n.sourceType,
      date: n.createdAt.toISOString(),
    })),
  };
}

function truncate(text: string, max: number): string {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + '...';
}
