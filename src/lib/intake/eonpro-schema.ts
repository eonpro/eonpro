/**
 * EONPRO Intake Schema Contract v1.0
 * 
 * This is the single source of truth for data format between
 * WeightLossIntake and EONPRO EMR.
 * 
 * IMPORTANT: Any changes to this schema must be coordinated
 * between both systems to maintain compatibility.
 */

import { z } from 'zod';

// Schema version - increment on breaking changes
export const SCHEMA_VERSION = '1.0';

// =============================================================================
// REQUIRED FIELDS - Must be present in every submission
// =============================================================================

export const PatientIdentitySchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().min(10).max(20), // E.164 or 10-digit
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/, 
    'Date must be YYYY-MM-DD or MM/DD/YYYY'),
  gender: z.enum(['male', 'female', 'other', 'Male', 'Female', 'Other', 'm', 'f', 'M', 'F']),
});

export const AddressSchema = z.object({
  streetAddress: z.string().min(1).max(200),
  apartment: z.string().max(50).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(50), // 2-letter code or full name
  zipCode: z.string().min(5).max(10),
});

// =============================================================================
// MEDICAL FIELDS - Send if available
// =============================================================================

export const VitalsSchema = z.object({
  weight: z.union([z.string(), z.number()]).optional(),
  idealWeight: z.union([z.string(), z.number()]).optional(),
  height: z.string().optional(), // "5'10\"" or "70 inches"
  bmi: z.union([z.string(), z.number()]).optional(),
  bloodPressure: z.string().optional(), // "120-129" or "120/80"
});

export const MedicalHistorySchema = z.object({
  currentMedications: z.string().optional(),
  allergies: z.string().optional(),
  medicalConditions: z.string().optional(),
  mentalHealthHistory: z.string().optional(),
  familyHistory: z.string().optional(),
  surgicalHistory: z.string().optional(),
  chronicConditions: z.string().optional(),
});

export const GLP1Schema = z.object({
  glp1History: z.enum(['yes', 'no', 'Yes', 'No', '']).optional(),
  glp1Type: z.string().optional(),
  medicationPreference: z.string().optional(), // "semaglutide", "tirzepatide"
  semaglutideDosage: z.string().optional(),
  tirzepatideDosage: z.string().optional(),
  previousSideEffects: z.string().optional(),
  currentGLP1Dose: z.string().optional(),
});

export const LifestyleSchema = z.object({
  activityLevel: z.string().optional(),
  alcoholUse: z.string().optional(),
  recreationalDrugs: z.string().optional(),
  weightLossHistory: z.string().optional(),
});

export const VisitInfoSchema = z.object({
  reasonForVisit: z.string().optional(),
  chiefComplaint: z.string().optional(),
  healthGoals: z.string().optional(),
});

// =============================================================================
// COMPLETE INTAKE PAYLOAD SCHEMA
// =============================================================================

export const IntakeDataSchema = PatientIdentitySchema
  .merge(AddressSchema)
  .merge(VitalsSchema)
  .merge(MedicalHistorySchema)
  .merge(GLP1Schema)
  .merge(LifestyleSchema)
  .merge(VisitInfoSchema)
  .extend({
    // Metadata
    qualified: z.string().optional(),
    language: z.string().optional(),
    intakeSource: z.string().optional(),
    airtableRecordId: z.string().optional(),
  });

export const IntakePayloadSchema = z.object({
  // Required metadata
  submissionId: z.string().min(1),
  submittedAt: z.string().datetime().optional(),
  schemaVersion: z.string().optional().default(SCHEMA_VERSION),
  
  // Intake data - can be in 'data' object or at root
  data: IntakeDataSchema.partial().optional(),
  
  // Alternative formats we support
  sections: z.array(z.any()).optional(),
  answers: z.array(z.any()).optional(),
  responseId: z.string().optional(),
  
  // Submission metadata
  submissionType: z.enum(['complete', 'partial']).optional(),
  qualified: z.string().optional(),
});

// Type exports
export type PatientIdentity = z.infer<typeof PatientIdentitySchema>;
export type Address = z.infer<typeof AddressSchema>;
export type IntakeData = z.infer<typeof IntakeDataSchema>;
export type IntakePayload = z.infer<typeof IntakePayloadSchema>;

// =============================================================================
// FIELD MAPPING: WeightLossIntake → EONPRO Internal
// =============================================================================

export const FIELD_MAPPING: Record<string, string[]> = {
  // Patient Identity
  firstName: ['firstName', 'first_name', 'First Name'],
  lastName: ['lastName', 'last_name', 'Last Name'],
  email: ['email', 'Email', 'email_address'],
  phone: ['phone', 'Phone', 'phone_number', 'phoneNumber', 'mobile'],
  dob: ['dateOfBirth', 'date_of_birth', 'dob', 'DOB', 'Date of Birth', 'birthday'],
  gender: ['gender', 'Gender', 'sex', 'Sex'],
  
  // Address
  address1: ['streetAddress', 'street_address', 'address', 'Address', 'Street Address'],
  address2: ['apartment', 'apt', 'unit', 'suite', 'Apartment'],
  city: ['city', 'City'],
  state: ['state', 'State', 'stateCode', 'state_code'],
  zip: ['zipCode', 'zip_code', 'zip', 'ZIP Code', 'postalCode', 'postal_code'],
  
  // Vitals - these map to display fields
  weight: ['weight', 'Weight', 'Starting Weight', 'currentWeight'],
  idealWeight: ['idealWeight', 'ideal_weight', 'Ideal Weight', 'goal_weight', 'targetWeight'],
  height: ['height', 'Height'],
  bmi: ['bmi', 'BMI', 'body_mass_index'],
  bloodPressure: ['bloodPressure', 'blood_pressure', 'Blood Pressure', 'bp'],
  
  // Medical History
  currentMedications: ['currentMedications', 'medications', 'Current Medications', 'Medications List'],
  allergies: ['allergies', 'Allergies', 'medication_allergies'],
  medicalConditions: ['medicalConditions', 'conditions', 'Medical Conditions', 'chronic_conditions'],
  mentalHealthHistory: ['mentalHealthHistory', 'mental_health', 'Mental Health History'],
  familyHistory: ['familyHistory', 'family_history', 'Family History'],
  surgicalHistory: ['surgicalHistory', 'surgical_history', 'Surgical History', 'surgeries'],
  
  // GLP-1
  glp1History: ['glp1History', 'glp_1_history', 'GLP-1 History', 'glp1_history'],
  glp1Type: ['glp1Type', 'glp_1_type', 'Current GLP-1 Medication'],
  medicationPreference: ['medicationPreference', 'medication_preference', 'Medication Preference'],
  semaglutideDosage: ['semaglutideDosage', 'semaglutide_dosage', 'Semaglutide Dose'],
  tirzepatideDosage: ['tirzepatideDosage', 'tirzepatide_dosage', 'Tirzepatide Dose'],
  
  // Lifestyle
  activityLevel: ['activityLevel', 'activity_level', 'Daily Physical Activity', 'physical_activity'],
  alcoholUse: ['alcoholUse', 'alcohol_use', 'Alcohol Intake', 'alcohol'],
  
  // Visit
  reasonForVisit: ['reasonForVisit', 'reason_for_visit', 'Reason for Visit'],
  chiefComplaint: ['chiefComplaint', 'chief_complaint', 'Chief Complaint'],
  healthGoals: ['healthGoals', 'health_goals', 'Health Goals', 'goals'],
};

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

export function validateIntakePayload(payload: unknown): {
  valid: boolean;
  data?: IntakePayload;
  errors?: string[];
} {
  try {
    const result = IntakePayloadSchema.safeParse(payload);
    
    if (result.success) {
      return { valid: true, data: result.data };
    }
    
    const errors = result.error.errors.map(e => 
      `${e.path.join('.')}: ${e.message}`
    );
    
    return { valid: false, errors };
  } catch (error) {
    return { 
      valid: false, 
      errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown'}`] 
    };
  }
}

/**
 * Extract a field value using multiple possible field names
 */
export function extractField(data: Record<string, unknown>, fieldKey: string): unknown {
  const possibleNames = FIELD_MAPPING[fieldKey] || [fieldKey];
  
  for (const name of possibleNames) {
    if (data[name] !== undefined && data[name] !== null && data[name] !== '') {
      return data[name];
    }
  }
  
  return undefined;
}

/**
 * Normalize incoming payload to standard format
 */
export function normalizePayloadFields(payload: Record<string, unknown>): Record<string, unknown> {
  const data = (payload.data as Record<string, unknown>) || payload;
  const normalized: Record<string, unknown> = {};
  
  for (const [standardKey, aliases] of Object.entries(FIELD_MAPPING)) {
    for (const alias of aliases) {
      if (data[alias] !== undefined && data[alias] !== null && data[alias] !== '') {
        normalized[standardKey] = data[alias];
        break;
      }
    }
  }
  
  // Copy any fields not in our mapping
  for (const [key, value] of Object.entries(data)) {
    if (!Object.values(FIELD_MAPPING).flat().includes(key)) {
      normalized[key] = value;
    }
  }
  
  return normalized;
}
