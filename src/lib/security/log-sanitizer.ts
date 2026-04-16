/**
 * Log Sanitizer — HIPAA-safe redaction helpers for structured logging.
 *
 * Use these instead of logging raw PHI (email, phone, name, address).
 */

export function redactEmail(email: string | null | undefined): string {
  if (!email) return '[empty]';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const local = parts[0].substring(0, 2) + '***';
  const domainParts = parts[1].split('.');
  const domain = domainParts[0].substring(0, 2) + '***';
  return `${local}@${domain}`;
}

export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return '[empty]';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

export function redactName(name: string | null | undefined): string {
  if (!name) return '[empty]';
  return name.charAt(0) + '***';
}

export function redactRecipients(recipients: string | string[]): string {
  const list = Array.isArray(recipients) ? recipients : [recipients];
  return list.map(redactEmail).join(', ');
}
