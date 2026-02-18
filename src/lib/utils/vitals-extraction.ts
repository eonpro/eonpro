/**
 * Shared Vitals Extraction Utility
 *
 * Single source of truth for extracting patient vitals (height, weight, BMI,
 * blood pressure, ideal weight) from intake documents and form submissions.
 *
 * Used by both the admin patient detail page and the patient portal vitals API.
 */

export interface ExtractedVitals {
  height: string | null;
  weight: string | null;
  bmi: string | null;
  bloodPressure: string | null;
  idealWeight: string | null;
}

interface DocumentData {
  sections?: Array<{
    entries?: Array<{ label?: string; value?: unknown }>;
  }>;
  answers?: Array<{ label?: string; value?: unknown }>;
  [key: string]: unknown;
}

interface IntakeSubmission {
  responses?: Array<{
    value?: string;
    question?: {
      text?: string;
      label?: string;
      questionText?: string;
    };
  }>;
}

interface IntakeDocument {
  category?: string;
  data?: DocumentData | Buffer | null;
}

/**
 * Extract vitals from parsed intake documents and intake form submissions.
 *
 * Data sources searched (in priority order):
 * 1. Document data `sections[].entries[]` (eonpro-intake, heyflow)
 * 2. Document data `answers[]` (some webhooks)
 * 3. IntakeFormSubmission `responses[].question.text` (intake form system)
 * 4. Flat key-value pairs in document data (legacy formats)
 */
export function extractVitalsFromIntake(
  documents: IntakeDocument[],
  submissions: IntakeSubmission[]
): ExtractedVitals {
  const result: ExtractedVitals = {
    height: null,
    weight: null,
    bmi: null,
    bloodPressure: null,
    idealWeight: null,
  };

  const findValue = (...labels: string[]): string | null => {
    const intakeDoc = documents.find(
      (d) =>
        d.category === 'MEDICAL_INTAKE_FORM' &&
        d.data &&
        typeof d.data === 'object' &&
        !Buffer.isBuffer(d.data) &&
        !((d.data as Record<string, unknown>).type === 'Buffer')
    );

    const docData = intakeDoc?.data as DocumentData | undefined;

    if (docData) {
      if (Array.isArray(docData.sections)) {
        for (const section of docData.sections) {
          if (Array.isArray(section.entries)) {
            for (const entry of section.entries) {
              const entryLabel = (entry.label || '').toLowerCase();
              for (const label of labels) {
                if (entryLabel.includes(label.toLowerCase()) && entry.value && entry.value !== '') {
                  return String(entry.value);
                }
              }
            }
          }
        }
      }

      if (Array.isArray(docData.answers)) {
        for (const answer of docData.answers) {
          const answerLabel = (answer.label || '').toLowerCase();
          for (const label of labels) {
            if (answerLabel.includes(label.toLowerCase()) && answer.value && answer.value !== '') {
              return String(answer.value);
            }
          }
        }
      }
    }

    if (submissions?.length > 0) {
      for (const submission of submissions) {
        if (Array.isArray(submission.responses)) {
          for (const response of submission.responses) {
            const questionText = (
              response.question?.text ||
              response.question?.label ||
              response.question?.questionText ||
              ''
            ).toLowerCase();
            for (const label of labels) {
              if (questionText.includes(label.toLowerCase()) && response.value && response.value !== '') {
                return String(response.value);
              }
            }
          }
        }
      }
    }

    if (docData && typeof docData === 'object') {
      for (const label of labels) {
        const searchKey = label.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const [key, value] of Object.entries(docData)) {
          if (key === 'sections' || key === 'answers') continue;
          const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (normalizedKey.includes(searchKey) && value && value !== '') {
            return String(value);
          }
        }
      }
    }

    return null;
  };

  const heightFeet = findValue('height (feet)', 'height feet', 'heightfeet');
  const heightInches = findValue('height (inches)', 'height inches', 'heightinches');
  if (heightFeet) {
    result.height = heightInches ? `${heightFeet}'${heightInches}"` : `${heightFeet}'0"`;
  } else {
    result.height = findValue('height');
  }

  result.weight = findValue('starting weight', 'current weight', 'weight');

  let bmiValue = findValue('bmi');
  if (!bmiValue && result.height && result.weight) {
    const calculated = calculateBMI(result.height, result.weight);
    if (calculated) bmiValue = calculated.toFixed(2);
  }
  result.bmi = bmiValue;

  const bp = findValue('blood pressure', 'bloodpressure');
  result.bloodPressure = bp && bp.toLowerCase() !== 'unknown' ? bp : null;

  result.idealWeight = findValue('ideal weight', 'goal weight', 'target weight');

  return result;
}

/**
 * Calculate BMI from height and weight strings.
 * Supports formats: "5'8"", "5'8", "68 inches", "68" for height.
 * Assumes weight in lbs, height in feet-inches or total inches.
 */
export function calculateBMI(heightStr: string, weightStr: string): number | null {
  try {
    const weight = parseFloat(weightStr.replace(/[^0-9.]/g, ''));
    if (isNaN(weight) || weight <= 0 || weight > 1500) return null;

    let heightInches: number;

    const feetInchMatch = heightStr.match(/(\d+)'(\d+)/);
    if (feetInchMatch) {
      const feet = parseInt(feetInchMatch[1], 10);
      const inches = parseInt(feetInchMatch[2], 10);
      heightInches = feet * 12 + inches;
    } else {
      heightInches = parseFloat(heightStr.replace(/[^0-9.]/g, ''));
    }

    if (isNaN(heightInches) || heightInches <= 0 || heightInches > 108) return null;

    const bmi = (weight / (heightInches * heightInches)) * 703;
    if (bmi < 10 || bmi > 100) return null;

    return bmi;
  } catch {
    return null;
  }
}

/**
 * Parse a Prisma Buffer or serialized Buffer into parsed JSON document data.
 * Returns the original object if it's already parsed JSON.
 */
export function parseDocumentData(data: unknown): DocumentData | null {
  if (!data) return null;

  if (Buffer.isBuffer(data)) {
    try {
      return JSON.parse(data.toString('utf-8'));
    } catch {
      return null;
    }
  }

  if (
    typeof data === 'object' &&
    (data as Record<string, unknown>).type === 'Buffer' &&
    Array.isArray((data as Record<string, unknown>).data)
  ) {
    try {
      return JSON.parse(Buffer.from((data as { data: number[] }).data).toString('utf-8'));
    } catch {
      return null;
    }
  }

  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  if (typeof data === 'object') {
    return data as DocumentData;
  }

  return null;
}
