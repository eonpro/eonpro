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
            const val = response.value || (response as any).answer;
            for (const label of labels) {
              if (questionText.includes(label.toLowerCase()) && val && val !== '') {
                return String(val);
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

  // Height — try composed "5'8"" first, then feet/inches separately
  const composedHeight = findValue('height');
  if (composedHeight && composedHeight.includes("'")) {
    result.height = composedHeight;
  } else {
    const heightFeet = findValue('height (feet)', 'height feet', 'heightfeet');
    const heightInches = findValue('height (inches)', 'height inches', 'heightinches');
    if (heightFeet) {
      const ft = heightFeet.replace(/[^0-9]/g, '');
      const inches = heightInches ? heightInches.replace(/[^0-9]/g, '') : '0';
      result.height = `${ft}'${inches}"`;
    } else if (composedHeight) {
      result.height = composedHeight;
    }
  }

  // Weight — strip "lbs" suffix for clean number display
  const rawWeight = findValue('starting weight', 'current weight', 'weight');
  if (rawWeight) {
    result.weight = rawWeight.replace(/\s*lbs?\s*$/i, '').trim();
  }

  // BMI — use stored value or calculate from height/weight
  let bmiValue = findValue('bmi');
  if (bmiValue) {
    bmiValue = bmiValue.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(bmiValue);
    if (isNaN(parsed) || parsed < 10 || parsed > 100) {
      bmiValue = null;
    }
  }
  if (!bmiValue && result.height && result.weight) {
    const calculated = calculateBMI(result.height, result.weight);
    if (calculated) bmiValue = calculated.toFixed(2);
  }
  result.bmi = bmiValue;

  // Blood pressure
  const bp = findValue('blood pressure', 'bloodpressure');
  result.bloodPressure =
    bp && bp.toLowerCase() !== 'unknown' && bp.toLowerCase() !== 'unknown / not sure' ? bp : null;

  // Ideal weight — strip "lbs" suffix
  const rawIdeal = findValue('ideal weight', 'goal weight', 'target weight');
  if (rawIdeal) {
    result.idealWeight = rawIdeal.replace(/\s*lbs?\s*$/i, '').trim();
  }

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

  let raw: string | object | null = null;

  // Prisma 6.x returns Uint8Array for Bytes columns
  if (data instanceof Uint8Array) {
    raw = new TextDecoder().decode(data);
  } else if (Buffer.isBuffer(data)) {
    raw = data.toString('utf-8');
  } else if (
    typeof data === 'object' &&
    (data as Record<string, unknown>).type === 'Buffer' &&
    Array.isArray((data as Record<string, unknown>).data)
  ) {
    raw = Buffer.from((data as { data: number[] }).data).toString('utf-8');
  } else if (typeof data === 'string') {
    raw = data;
  } else if (typeof data === 'object') {
    return data as DocumentData;
  }

  if (raw === null) return null;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try {
      let parsed = JSON.parse(trimmed);
      // Handle double-serialized JSON (string inside a JSON string)
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          /* use first parse result */
        }
      }
      return typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}
