export const EASTERN_TZ = 'America/New_York';
const DEFAULT_TIMEZONE = EASTERN_TZ;

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
    const result = new Date(Date.UTC(year, month, day) - offsetMs);

    // On DST transition days the offset at midnight differs from noon.
    // Verify the result lands on the correct calendar date; if not, adjust ±1h.
    const normalized = new Date(Date.UTC(year, month, day));
    const expectedDay = normalized.getUTCDate();
    const expectedMonth = normalized.getUTCMonth() + 1;

    const vParts = formatter.formatToParts(result);
    const vDay = Number(vParts.find((p) => p.type === 'day')!.value);
    const vMonth = Number(vParts.find((p) => p.type === 'month')!.value);
    if (vDay === expectedDay && vMonth === expectedMonth) return result;

    for (const delta of [3_600_000, -3_600_000]) {
      const adj = new Date(result.getTime() + delta);
      const aParts = formatter.formatToParts(adj);
      const aDay = Number(aParts.find((p) => p.type === 'day')!.value);
      const aMonth = Number(aParts.find((p) => p.type === 'month')!.value);
      if (aDay === expectedDay && aMonth === expectedMonth) return adj;
    }

    return result;
  } catch {
    return new Date(Date.UTC(year, month, day));
  }
}

/**
 * Return the UTC Date for the start of "today" in a given timezone,
 * plus common relative boundaries (yesterday, start of week, start of month).
 */
export function getTimezoneAwareBoundaries(tz: string = DEFAULT_TIMEZONE): {
  todayStart: Date;
  yesterdayStart: Date;
  weekStart: Date;
  monthStart: Date;
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
} {
  const { year, month, day, dayOfWeek } = getDatePartsInTz(tz);

  const todayStart = midnightInTz(year, month, day, tz);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setTime(yesterdayStart.getTime() - 24 * 60 * 60 * 1000);

  const weekStart = midnightInTz(year, month, day - dayOfWeek, tz);
  const monthStart = midnightInTz(year, month, 1, tz);

  return { todayStart, yesterdayStart, weekStart, monthStart, year, month, day, dayOfWeek };
}

/**
 * Convert a Date to "YYYY-MM-DD" in Eastern Time (not UTC).
 * Use this instead of `d.toISOString().split('T')[0]`.
 */
export function toDateStringET(d: Date): string {
  const parts = getDatePartsForDate(d);
  const y = parts.year;
  const m = String(parts.month + 1).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse "YYYY-MM-DD" as midnight Eastern Time.
 * Use this instead of `new Date('YYYY-MM-DD')` which parses as UTC midnight.
 */
export function parseDateET(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return midnightInTz(y, m - 1, d, EASTERN_TZ);
}

/**
 * Shift a calendar date in Eastern Time by `deltaDays` (negative allowed).
 * Returns the UTC instant of midnight at the result date in Eastern Time.
 */
export function addCalendarDaysET(d: Date, deltaDays: number): Date {
  const { year, month, day } = getDatePartsForDate(d);
  const rolled = new Date(Date.UTC(year, month, day + deltaDays));
  return midnightInTz(
    rolled.getUTCFullYear(),
    rolled.getUTCMonth(),
    rolled.getUTCDate(),
    EASTERN_TZ,
  );
}

/**
 * Midnight Eastern on the first day of the calendar month containing `d` (in ET).
 */
export function startOfMonthET(d: Date): Date {
  const parts = getDatePartsForDate(d);
  return midnightInTz(parts.year, parts.month, 1, EASTERN_TZ);
}

/**
 * Convert a "YYYY-MM-DD" string to a UTC midnight Date for use with Prisma @db.Date columns.
 * PostgreSQL DATE columns store calendar dates and Prisma returns them at UTC midnight.
 * Use this (not parseDateET) when querying or writing to @db.Date fields.
 */
export function dbDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00.000Z');
}

/**
 * Extract "YYYY-MM-DD" from a Date that came from a Prisma @db.Date column.
 * These are always at UTC midnight, so we use UTC methods to get the correct calendar date.
 * Use this (not toDateStringET) when reading @db.Date field values.
 */
export function dbDateToString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Get start of day in Eastern Time for a given Date.
 */
export function startOfDayET(d: Date): Date {
  const parts = getDatePartsForDate(d);
  return midnightInTz(parts.year, parts.month, parts.day, EASTERN_TZ);
}

/**
 * Get end of day (next midnight) in Eastern Time for a given Date.
 */
export function endOfDayET(d: Date): Date {
  const parts = getDatePartsForDate(d);
  return midnightInTz(parts.year, parts.month, parts.day + 1, EASTERN_TZ);
}

/**
 * Format a Date for display using Eastern Time.
 */
export function formatDateET(d: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return d.toLocaleDateString('en-US', { timeZone: EASTERN_TZ, ...opts });
}

/**
 * Format a Date+Time for display using Eastern Time.
 */
export function formatDateTimeET(d: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return d.toLocaleString('en-US', { timeZone: EASTERN_TZ, ...opts });
}

/**
 * "Today" as "YYYY-MM-DD" in Eastern Time.
 */
export function todayET(): string {
  return toDateStringET(new Date());
}

/**
 * Get date parts for a specific Date object in Eastern Time.
 */
function getDatePartsForDate(d: Date): { year: number; month: number; day: number; dayOfWeek: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: EASTERN_TZ,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
    });
    const parts = formatter.formatToParts(d);
    const yearPart = parts.find((p) => p.type === 'year');
    const monthPart = parts.find((p) => p.type === 'month');
    const dayPart = parts.find((p) => p.type === 'day');
    const weekdayPart = parts.find((p) => p.type === 'weekday');
    if (!yearPart || !monthPart || !dayPart || !weekdayPart) {
      throw new Error('Missing date parts');
    }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      year: Number(yearPart.value),
      month: Number(monthPart.value) - 1,
      day: Number(dayPart.value),
      dayOfWeek: dayNames.indexOf(weekdayPart.value),
    };
  } catch {
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), dayOfWeek: d.getDay() };
  }
}
