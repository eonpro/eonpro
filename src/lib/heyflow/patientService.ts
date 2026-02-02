import type { Patient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generatePatientId } from "@/lib/patients";
import type { NormalizedIntake, NormalizedPatient } from "./types";

type NormalizedPatientForCreate = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
};

export async function upsertPatientFromIntake(intake: NormalizedIntake): Promise<Patient> {
  const normalized = normalizePatient(intake.patient);
  const hashtags = collectHashtags(intake);

  const matchFilters = buildMatchFilters(normalized);
  let existing: Patient | null = null;

  if (matchFilters.length > 0) {
    existing = await // @ts-ignore
    prisma.patient.findFirst({
      where: { OR: matchFilters },
    });
  }

  if (existing) {
    const updated = await prisma.patient.update({
      where: { id: existing.id },
      data: {
        ...normalized,
        tags: mergeTags(existing.tags, hashtags),
        notes: appendNotes(existing.notes, intake.submissionId),
      },
    });
    return updated;
  }

  // Generate patient ID using the shared utility (handles clinic prefixes)
  // Default to clinic 1 = EONMEDS
  const patientId = await generatePatientId(1);

  const created = await prisma.patient.create({
    data: {
      ...normalized,
      patientId,
      tags: hashtags,
      notes: `Created via MedLink submission ${intake.submissionId}`,
      source: "webhook",
      sourceMetadata: {
        type: "heyflow",
        submissionId: intake.submissionId,
        timestamp: new Date().toISOString()
      }
    },
  });

  return created;
}

function normalizePatient(patient: NormalizedPatient): NormalizedPatientForCreate {
  return {
    firstName: capitalize(patient.firstName) || "Unknown",
    lastName: capitalize(patient.lastName) || "Unknown",
    email: patient.email?.toLowerCase() || "unknown@example.com",
    phone: sanitizePhone(patient.phone),
    dob: normalizeDate(patient.dob),
    gender: normalizeGender(patient.gender),
    address1: patient.address1 ?? "",
    address2: patient.address2 ?? "",
    city: patient.city ?? "",
    state: (patient.state ?? "").toUpperCase(),
    zip: patient.zip ?? "",
  };
}

function buildMatchFilters(patient: NormalizedPatient) {
  const filters: Prisma.PatientWhereInput[] = [];
  if (patient.email) {
    filters.push({ email: patient.email.toLowerCase() });
  }
  if (patient.phone) {
    filters.push({ phone: sanitizePhone(patient.phone) });
  }
  if (patient.firstName && patient.lastName && patient.dob) {
    filters.push({
      firstName: patient.firstName,
      lastName: patient.lastName,
      dob: patient.dob,
    });
  }
  return filters;
}

function sanitizePhone(value?: string) {
  if (!value) return "0000000000";
  const digits = value.replace(/\D/g, "");
  return digits || "0000000000";
}

function normalizeGender(value?: string) {
  if (!value) return "m";
  const lower = value.toLowerCase().trim();
  // Check for female/woman variations
  if (lower === 'f' || lower === 'female' || lower === 'woman') return "f";
  // Check for male/man variations
  if (lower === 'm' || lower === 'male' || lower === 'man') return "m";
  // Fallback: if starts with 'f' or 'w' (woman), treat as female
  if (lower.startsWith("f") || lower.startsWith("w")) return "f";
  return "m";
}

function normalizeDate(value?: string) {
  if (!value) return "1900-01-01";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = value.replace(/[^0-9]/g, "").match(/(\d{2})(\d{2})(\d{4})/);
  if (parts) {
    const [, mm, dd, yyyy] = parts;
    return `${yyyy}-${mm}-${dd}`;
  }
  return "1900-01-01";
}

function capitalize(value?: string) {
  if (!value) return "";
  return value
    .toLowerCase()
    .split(" ")
    .map((chunk: any) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function mergeTags(existing: any, incoming: string[]) {
  const current = Array.isArray(existing) ? (existing as string[]) : [];
  const merged = new Set([...current, ...incoming]);
  return Array.from(merged).filter(Boolean);
}

function collectHashtags(intake: NormalizedIntake) {
  const tags = new Set<string>(["medlink"]);
  intake.answers.forEach((answer: any) => {
    const matches = answer.value.match(/#\w+/g);
    if (matches) {
      matches.forEach((tag: any) => tags.add(tag.replace(/^#/, "").toLowerCase()));
    }
  });
  return Array.from(tags);
}

function appendNotes(existing: string | null | undefined, submissionId: string) {
  const suffix = `Synced from MedLink ${submissionId}`;
  if (!existing) return suffix;
  if (existing.includes(submissionId)) return existing;
  return `${existing}\n${suffix}`;
}
