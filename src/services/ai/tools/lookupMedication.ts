import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import {
  GLP1_MEDICATIONS,
  COMPOUNDED_GLP1_INFO,
  CLINICAL_GUIDELINES,
  FAQ,
} from '../beccaKnowledgeBase';

export const definition: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'lookup_medication',
    description:
      'Look up clinical information about GLP-1 medications (semaglutide, tirzepatide). Returns dosing, side effects, contraindications, drug interactions, and titration protocols.',
    parameters: {
      type: 'object',
      properties: {
        medication: {
          type: 'string',
          enum: ['semaglutide', 'tirzepatide', 'both'],
          description: 'Which medication to look up',
        },
        topic: {
          type: 'string',
          enum: [
            'overview',
            'dosing',
            'side_effects',
            'contraindications',
            'drug_interactions',
            'monitoring',
            'eligibility',
            'compounded',
          ],
          description: 'What aspect of the medication to look up',
        },
      },
      required: ['medication', 'topic'],
    },
  },
};

export async function execute(
  params: { medication: string; topic: string },
): Promise<unknown> {
  const { medication, topic } = params;

  const meds =
    medication === 'both'
      ? { semaglutide: GLP1_MEDICATIONS.semaglutide, tirzepatide: GLP1_MEDICATIONS.tirzepatide }
      : medication === 'semaglutide'
        ? { semaglutide: GLP1_MEDICATIONS.semaglutide }
        : { tirzepatide: GLP1_MEDICATIONS.tirzepatide };

  switch (topic) {
    case 'overview':
      return Object.fromEntries(
        Object.entries(meds).map(([name, med]) => [
          name,
          {
            brandNames: med.brandNames,
            class: med.class,
            mechanism: med.mechanism,
            indications: med.indications,
            forms: med.forms,
          },
        ]),
      );

    case 'dosing':
      return Object.fromEntries(
        Object.entries(meds).map(([name, med]) => [
          name,
          {
            titrationProtocol: med.titrationProtocol,
            dosingAdjustments: CLINICAL_GUIDELINES.dosingAdjustments,
          },
        ]),
      );

    case 'side_effects':
      return Object.fromEntries(
        Object.entries(meds).map(([name, med]) => [
          name,
          {
            sideEffects: med.sideEffects,
            whenToDiscontinue: CLINICAL_GUIDELINES.whenToHoldOrDiscontinue,
          },
        ]),
      );

    case 'contraindications':
      return Object.fromEntries(
        Object.entries(meds).map(([name, med]) => [name, med.contraindications]),
      );

    case 'drug_interactions':
      return Object.fromEntries(
        Object.entries(meds).map(([name, med]) => [name, med.drugInteractions]),
      );

    case 'monitoring':
      return Object.fromEntries(
        Object.entries(meds).map(([name, med]) => [name, med.monitoring]),
      );

    case 'eligibility':
      return {
        eligibilityCriteria: CLINICAL_GUIDELINES.glp1Eligibility,
        bmiClassification: CLINICAL_GUIDELINES.bmiClassification,
        icd10Codes: CLINICAL_GUIDELINES.icd10Codes,
      };

    case 'compounded':
      return COMPOUNDED_GLP1_INFO;

    default:
      return {
        availableTopics: [
          'overview',
          'dosing',
          'side_effects',
          'contraindications',
          'drug_interactions',
          'monitoring',
          'eligibility',
          'compounded',
        ],
        faq: FAQ.clinical,
      };
  }
}
