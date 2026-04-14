/**
 * Validates a cardholder name input.
 * @param name - The cardholder name string.
 * @returns An object with { isValid, error }.
 */
export function validateCardholderName(name: string): {
  isValid: boolean;
  error: string | null;
} {
  const trimmed = name?.trim() || '';

  const rules: [boolean, string][] = [
    [!trimmed, 'Cardholder name is required'],
    [!/^[a-zA-Z\s]+$/.test(trimmed), 'Cardholder name must contain only letters and spaces'],
    [trimmed.length < 2, "Enter the cardholder's full name"],
    [trimmed.length > 50, 'Cardholder name must be less than 50 characters'],
  ];

  for (const [invalid, message] of rules) {
    if (invalid) return { isValid: false, error: message };
  }

  return { isValid: true, error: null };
}
