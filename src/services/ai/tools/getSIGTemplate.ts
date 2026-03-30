import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { SIG_TEMPLATES } from '../beccaKnowledgeBase';

export const definition: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_sig_template',
    description:
      'Get prescription direction (SIG) templates for GLP-1 medications. Returns dose, directions, quantity, refills, and days supply.',
    parameters: {
      type: 'object',
      properties: {
        medication: {
          type: 'string',
          enum: ['semaglutide', 'tirzepatide'],
          description: 'Which medication',
        },
        phase: {
          type: 'string',
          enum: ['initiation', 'escalation', 'maintenance'],
          description: 'Treatment phase',
        },
      },
      required: ['medication', 'phase'],
    },
  },
};

export async function execute(
  params: { medication: string; phase: string },
): Promise<unknown> {
  const medTemplates = SIG_TEMPLATES[params.medication as keyof typeof SIG_TEMPLATES];
  if (!medTemplates || typeof medTemplates === 'object' && 'injectionSites' in medTemplates) {
    return { error: `No SIG templates for "${params.medication}". Available: semaglutide, tirzepatide.` };
  }

  const template = (medTemplates as Record<string, unknown>)[params.phase];
  if (!template) {
    return { error: `No template for phase "${params.phase}". Available: initiation, escalation, maintenance.` };
  }

  return {
    medication: params.medication,
    phase: params.phase,
    template,
    generalGuidelines: SIG_TEMPLATES.generalGuidelines,
  };
}
