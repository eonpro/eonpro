export type IntakeEntry = {
  id: string;
  label: string;
  value: string;
  rawValue?: any;
  section?: string;
};

export type IntakeSection = {
  title: string;
  entries: IntakeEntry[];
};

export type NormalizedPatient = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export type NormalizedIntake = {
  submissionId: string;
  submittedAt: Date;
  patient: NormalizedPatient;
  sections: IntakeSection[];
  answers: IntakeEntry[];
};
