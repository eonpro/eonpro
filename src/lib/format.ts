export function formatDobInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const segments: string[] = [];

  if (digits.length === 0) {
    return '';
  }

  segments.push(digits.slice(0, Math.min(2, digits.length)));

  if (digits.length > 2) {
    segments.push(digits.slice(2, Math.min(4, digits.length)));
  }

  if (digits.length > 4) {
    segments.push(digits.slice(4));
  }

  return segments.filter(Boolean).join('/');
}
