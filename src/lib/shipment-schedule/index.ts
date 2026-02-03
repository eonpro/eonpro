/**
 * Shipment Schedule Module
 * 
 * Handles multi-shipment scheduling for packages that exceed medication Beyond Use Date (BUD).
 * 
 * @example
 * ```typescript
 * import { 
 *   createShipmentScheduleForSubscription,
 *   calculateShipmentsNeeded,
 *   getUpcomingShipments,
 * } from '@/lib/shipment-schedule';
 * 
 * // Create schedule for a 6-month package
 * const { shipments, totalShipments } = await createShipmentScheduleForSubscription(subscriptionId);
 * // Result: 2 shipments (initial + 90 days)
 * 
 * // Get shipments due in the next 7 days
 * const upcoming = await getUpcomingShipments(clinicId, 7);
 * ```
 */

export {
  // Core functions
  createShipmentScheduleForSubscription,
  createShipmentSchedule,
  calculateShipmentsNeeded,
  calculateShipmentDates,
  requiresMultiShipment,
  getPackageMonthsFromSubscription,

  // Query functions
  getUpcomingShipments,
  getShipmentsNeedingReminder,
  getShipmentSeries,
  getPatientShipmentSchedule,
  getShipmentScheduleSummary,

  // Update functions
  markReminderSent,
  markPatientNotified,
  rescheduleShipment,
  cancelRemainingShipments,

  // Constants
  DEFAULT_BUD_DAYS,
  MIN_MULTI_SHIPMENT_MONTHS,
  ADVANCE_REMINDER_DAYS,

  // Types
  type ShipmentScheduleInput,
  type ShipmentScheduleResult,
  type UpcomingShipment,
} from './shipmentScheduleService';
