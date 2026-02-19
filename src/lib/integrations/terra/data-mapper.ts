/**
 * Maps Terra webhook data payloads to our Prisma model create inputs.
 *
 * Terra delivers normalised payloads for body, activity, sleep, nutrition, and
 * daily summaries.  All Terra measurements are metric (kg, meters, seconds).
 * We convert to imperial where our models store imperial (lbs, miles, minutes).
 *
 * Idempotency keys:
 *  - activity / sleep → metadata.summary_id
 *  - body / daily / nutrition → metadata.start_time + metadata.end_time
 */

import type { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

const KG_TO_LBS = 2.20462;
const M_TO_MILES = 0.000621371;

function kgToLbs(kg: number | null | undefined): number | null {
  return typeof kg === 'number' ? Math.round(kg * KG_TO_LBS * 10) / 10 : null;
}

function metersToMiles(m: number | null | undefined): number | null {
  return typeof m === 'number' ? Math.round(m * M_TO_MILES * 100) / 100 : null;
}

function secondsToMinutes(s: number | null | undefined): number | null {
  return typeof s === 'number' ? Math.round(s / 60) : null;
}

function safeDate(iso: string | null | undefined): Date {
  if (!iso) return new Date();
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

function safeInt(v: number | null | undefined): number | null {
  return typeof v === 'number' ? Math.round(v) : null;
}

function safeFloat(v: number | null | undefined): number | null {
  return typeof v === 'number' ? Math.round(v * 100) / 100 : null;
}

// ---------------------------------------------------------------------------
// Terra payload types (subset of what we actually use)
// ---------------------------------------------------------------------------

interface TerraMetadata {
  start_time?: string;
  end_time?: string;
  summary_id?: string;
}

interface TerraBodyData {
  metadata?: TerraMetadata;
  weight_kg?: number | null;
  bmi?: number | null;
  body_fat_percentage?: number | null;
}

interface TerraActivityData {
  metadata?: TerraMetadata;
  calories?: number | null;
  active_durations_data?: {
    activity_seconds?: number | null;
  };
  movement_data?: {
    steps_data?: { steps?: number | null };
  };
  distance_data?: {
    summary?: {
      distance_meters?: number | null;
    };
    detailed?: { distance_meters?: number | null };
  };
  heart_rate_data?: {
    summary?: {
      avg_hr_bpm?: number | null;
    };
  };
  device_data?: {
    name?: string;
  };
  name?: string;
}

interface TerraSleepData {
  metadata?: TerraMetadata;
  duration_in_bed_seconds?: number | null;
  duration_asleep_seconds?: number | null;
  sleep_durations_data?: {
    asleep?: {
      duration_deep_sleep_state_seconds?: number | null;
      duration_REM_sleep_state_seconds?: number | null;
      duration_light_sleep_state_seconds?: number | null;
    };
    awake?: {
      duration_awake_state_seconds?: number | null;
    };
  };
  sleep_quality_score?: number | null;
}

interface TerraNutritionData {
  metadata?: TerraMetadata;
  summary?: {
    macros?: {
      calories?: number | null;
      protein_g?: number | null;
      carbohydrates_g?: number | null;
      fat_g?: number | null;
      fiber_g?: number | null;
      sugar_g?: number | null;
      sodium_mg?: number | null;
    };
  };
  meals?: Array<{
    name?: string;
    macros?: {
      calories?: number | null;
      protein_g?: number | null;
      carbohydrates_g?: number | null;
      fat_g?: number | null;
      fiber_g?: number | null;
      sugar_g?: number | null;
      sodium_mg?: number | null;
    };
  }>;
}

interface TerraDailyData {
  metadata?: TerraMetadata;
  steps?: number | null;
  calories_data?: {
    total_burned_calories?: number | null;
    net_activity_calories?: number | null;
  };
  distance_data?: {
    distance_meters?: number | null;
  };
  heart_rate_data?: {
    summary?: {
      avg_hr_bpm?: number | null;
      resting_hr_bpm?: number | null;
    };
  };
}

// ---------------------------------------------------------------------------
// Mappers — each returns Prisma create data (without patientId / clinicId)
// ---------------------------------------------------------------------------

export interface MappedWeightLog {
  weight: number;
  unit: string;
  source: string;
  recordedAt: Date;
  notes: string | null;
}

export function mapBodyToWeightLogs(
  items: TerraBodyData[],
  provider: string
): MappedWeightLog[] {
  const results: MappedWeightLog[] = [];

  for (const item of items) {
    const lbs = kgToLbs(item.weight_kg);
    if (!lbs || lbs <= 0) continue;

    results.push({
      weight: lbs,
      unit: 'lbs',
      source: 'device',
      recordedAt: safeDate(item.metadata?.start_time),
      notes: `Synced from ${provider}`,
    });
  }

  return results;
}

export interface MappedExerciseLog {
  activityType: string;
  duration: number;
  intensity: string;
  calories: number | null;
  steps: number | null;
  distance: number | null;
  heartRateAvg: number | null;
  notes: string | null;
  source: string;
  recordedAt: Date;
}

function inferIntensity(calories: number | null, durationMin: number): string {
  if (!calories || !durationMin) return 'moderate';
  const cpm = calories / durationMin;
  if (cpm > 12) return 'vigorous';
  if (cpm < 5) return 'light';
  return 'moderate';
}

export function mapActivityToExerciseLogs(
  items: TerraActivityData[],
  provider: string
): MappedExerciseLog[] {
  const results: MappedExerciseLog[] = [];

  for (const item of items) {
    const durationMin =
      secondsToMinutes(item.active_durations_data?.activity_seconds) ??
      secondsToMinutes(
        (safeDate(item.metadata?.end_time).getTime() -
          safeDate(item.metadata?.start_time).getTime()) /
          1000
      ) ??
      0;

    if (durationMin <= 0) continue;

    const cal = safeInt(item.calories);
    const steps =
      safeInt(item.movement_data?.steps_data?.steps) ?? null;
    const dist =
      metersToMiles(
        item.distance_data?.summary?.distance_meters ??
          item.distance_data?.detailed?.distance_meters
      );

    results.push({
      activityType: (item.name || 'workout').toLowerCase(),
      duration: durationMin,
      intensity: inferIntensity(cal, durationMin),
      calories: cal,
      steps,
      distance: dist,
      heartRateAvg: safeInt(item.heart_rate_data?.summary?.avg_hr_bpm) ?? null,
      notes: `Synced from ${provider}`,
      source: 'device',
      recordedAt: safeDate(item.metadata?.start_time),
    });
  }

  return results;
}

export interface MappedSleepLog {
  sleepStart: Date;
  sleepEnd: Date;
  duration: number;
  quality: number | null;
  deepSleep: number | null;
  remSleep: number | null;
  lightSleep: number | null;
  awakeTime: number | null;
  notes: string | null;
  source: string;
  recordedAt: Date;
}

export function mapSleepToSleepLogs(
  items: TerraSleepData[],
  provider: string
): MappedSleepLog[] {
  const results: MappedSleepLog[] = [];

  for (const item of items) {
    const durationMin =
      secondsToMinutes(item.duration_asleep_seconds ?? item.duration_in_bed_seconds);
    if (!durationMin || durationMin <= 0) continue;

    const durations = item.sleep_durations_data;
    const quality = item.sleep_quality_score
      ? Math.min(10, Math.max(1, Math.round(item.sleep_quality_score / 10)))
      : null;

    results.push({
      sleepStart: safeDate(item.metadata?.start_time),
      sleepEnd: safeDate(item.metadata?.end_time),
      duration: durationMin,
      quality,
      deepSleep: secondsToMinutes(durations?.asleep?.duration_deep_sleep_state_seconds),
      remSleep: secondsToMinutes(durations?.asleep?.duration_REM_sleep_state_seconds),
      lightSleep: secondsToMinutes(durations?.asleep?.duration_light_sleep_state_seconds),
      awakeTime: secondsToMinutes(durations?.awake?.duration_awake_state_seconds),
      notes: `Synced from ${provider}`,
      source: 'device',
      recordedAt: safeDate(item.metadata?.start_time),
    });
  }

  return results;
}

export interface MappedNutritionLog {
  mealType: string;
  description: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  notes: string | null;
  source: string;
  recordedAt: Date;
}

export function mapNutritionToNutritionLogs(
  items: TerraNutritionData[],
  provider: string
): MappedNutritionLog[] {
  const results: MappedNutritionLog[] = [];

  for (const item of items) {
    if (item.meals?.length) {
      for (const meal of item.meals) {
        const macros = meal.macros;
        if (!macros?.calories) continue;

        results.push({
          mealType: inferMealType(meal.name),
          description: meal.name || null,
          calories: safeInt(macros.calories),
          protein: safeFloat(macros.protein_g),
          carbs: safeFloat(macros.carbohydrates_g),
          fat: safeFloat(macros.fat_g),
          fiber: safeFloat(macros.fiber_g),
          sugar: safeFloat(macros.sugar_g),
          sodium: safeFloat(macros.sodium_mg),
          notes: `Synced from ${provider}`,
          source: 'device',
          recordedAt: safeDate(item.metadata?.start_time),
        });
      }
    } else if (item.summary?.macros) {
      const macros = item.summary.macros;
      if (!macros.calories) continue;

      results.push({
        mealType: 'snack',
        description: 'Daily nutrition summary',
        calories: safeInt(macros.calories),
        protein: safeFloat(macros.protein_g),
        carbs: safeFloat(macros.carbohydrates_g),
        fat: safeFloat(macros.fat_g),
        fiber: safeFloat(macros.fiber_g),
        sugar: safeFloat(macros.sugar_g),
        sodium: safeFloat(macros.sodium_mg),
        notes: `Synced from ${provider}`,
        source: 'device',
        recordedAt: safeDate(item.metadata?.start_time),
      });
    }
  }

  return results;
}

function inferMealType(name: string | undefined): string {
  if (!name) return 'snack';
  const lower = name.toLowerCase();
  if (lower.includes('breakfast')) return 'breakfast';
  if (lower.includes('lunch')) return 'lunch';
  if (lower.includes('dinner') || lower.includes('supper')) return 'dinner';
  return 'snack';
}

/**
 * Daily summaries contain aggregated step/calorie data.
 * We map them to ExerciseLog entries with activityType "daily_summary".
 */
export function mapDailyToExerciseLogs(
  items: TerraDailyData[],
  provider: string
): MappedExerciseLog[] {
  const results: MappedExerciseLog[] = [];

  for (const item of items) {
    const steps = safeInt(item.steps);
    const cal = safeInt(
      item.calories_data?.net_activity_calories ??
        item.calories_data?.total_burned_calories
    );

    if (!steps && !cal) continue;

    results.push({
      activityType: 'daily_summary',
      duration: 1440, // full day in minutes
      intensity: 'moderate',
      calories: cal,
      steps,
      distance: metersToMiles(item.distance_data?.distance_meters),
      heartRateAvg: safeInt(item.heart_rate_data?.summary?.avg_hr_bpm) ?? null,
      notes: `Daily summary from ${provider}`,
      source: 'device',
      recordedAt: safeDate(item.metadata?.start_time),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Dedup key helpers
// ---------------------------------------------------------------------------

export interface DedupKey {
  type: 'summary_id' | 'time_range';
  value: string;
}

export function getActivityDedupKey(item: TerraActivityData): DedupKey | null {
  const sid = item.metadata?.summary_id;
  if (sid) return { type: 'summary_id', value: sid };
  const st = item.metadata?.start_time;
  const et = item.metadata?.end_time;
  if (st && et) return { type: 'time_range', value: `${st}|${et}` };
  return null;
}

export function getSleepDedupKey(item: TerraSleepData): DedupKey | null {
  const sid = item.metadata?.summary_id;
  if (sid) return { type: 'summary_id', value: sid };
  const st = item.metadata?.start_time;
  const et = item.metadata?.end_time;
  if (st && et) return { type: 'time_range', value: `${st}|${et}` };
  return null;
}

export function getBodyDedupKey(item: TerraBodyData): string | null {
  const st = item.metadata?.start_time;
  return st || null;
}

export function getDailyDedupKey(item: TerraDailyData): string | null {
  const st = item.metadata?.start_time;
  return st || null;
}

export function getNutritionDedupKey(item: TerraNutritionData): string | null {
  const st = item.metadata?.start_time;
  return st || null;
}

// Re-export types for webhook handler
export type {
  TerraBodyData,
  TerraActivityData,
  TerraSleepData,
  TerraNutritionData,
  TerraDailyData,
};
