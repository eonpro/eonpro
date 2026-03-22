/**
 * Device-local calendar `YYYY-MM-DD` (React Native). Avoid `toISOString().split('T')[0]` (UTC).
 */
export function calendarDateStringInDeviceTimezone(d: Date): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const parts = fmt.formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (y == null || m == null || day == null) throw new Error('parts');
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } catch {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
