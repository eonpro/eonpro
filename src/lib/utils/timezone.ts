const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Get the current calendar date parts in a specific IANA timezone.
 * Handles the case where the server runs in UTC but the business
 * operates in a different timezone (e.g. Eastern Time).
 */
export function getDatePartsInTz(tz: string = DEFAULT_TIMEZONE): {
  year: number;
  month: number;   // 0-indexed (0 = Jan)
  day: number;
  dayOfWeek: number; // 0 = Sunday
} {
  const now = new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
    });
    const parts = formatter.formatToParts(now);
    const yearPart = parts.find((p) => p.type === 'year');
    const monthPart = parts.find((p) => p.type === 'month');
    const dayPart = parts.find((p) => p.type === 'day');
    const weekdayPart = parts.find((p) => p.type === 'weekday');
    if (!yearPart || !monthPart || !dayPart || !weekdayPart) {
      throw new Error('Missing date parts from formatter');
    }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      year: Number(yearPart.value),
      month: Number(monthPart.value) - 1,
      day: Number(dayPart.value),
      dayOfWeek: dayNames.indexOf(weekdayPart.value),
    };
  } catch {
    return {
      year: now.getUTCFullYear(),
      month: now.getUTCMonth(),
      day: now.getUTCDate(),
      dayOfWeek: now.getUTCDay(),
    };
  }
}

/**
 * Create a UTC Date representing midnight of a calendar date in a given
 * timezone.  For example, midnightInTz(2026, 2, 13, 'America/New_York')
 * returns 2026-03-13T05:00:00.000Z (EST is UTC-5, EDT is UTC-4).
 */
export function midnightInTz(
  year: number,
  month: number,
  day: number,
  tz: string = DEFAULT_TIMEZONE,
): Date {
  const guess = new Date(Date.UTC(year, month, day, 12, 0, 0));
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(guess);
    const hourPart = parts.find((p) => p.type === 'hour');
    const minutePart = parts.find((p) => p.type === 'minute');
    if (!hourPart || !minutePart) {
      throw new Error('Missing time parts from formatter');
    }
    const h = Number(hourPart.value) % 24;
    const m = Number(minutePart.value);
    const offsetMs = (h * 60 + m - 12 * 60) * 60 * 1000;
    return new Date(Date.UTC(year, month, day) - offsetMs);
  } catch {
    return new Date(Date.UTC(year, month, day));
  }
}

/**
 * Return the UTC Date for the start of "today" in a given timezone,
 * plus common relative boundaries (yesterday, start of week, start of month).
 */
export function getTimezoneAwareBoundaries(tz: string = DEFAULT_TIMEZONE) {
  const { year, month, day, dayOfWeek } = getDatePartsInTz(tz);

  const todayStart = midnightInTz(year, month, day, tz);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setTime(yesterdayStart.getTime() - 24 * 60 * 60 * 1000);

  const weekStart = midnightInTz(year, month, day - dayOfWeek, tz);
  const monthStart = midnightInTz(year, month, 1, tz);

  return { todayStart, yesterdayStart, weekStart, monthStart, year, month, day, dayOfWeek };
}
