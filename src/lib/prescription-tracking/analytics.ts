/**
 * Prescription Fulfillment Analytics
 * Tracks and analyzes pharmacy performance and delivery times
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

interface FulfillmentMetrics {
  averageTimeToProcess: number;
  averageTimeToShip: number;
  averageTimeToDeliver: number;
  totalFulfillmentTime: number;
  onTimeDeliveryRate: number;
  sameDayShipmentRate: number;
  nextDayShipmentRate: number;
}

/**
 * Update fulfillment analytics for a prescription
 */
export async function updateFulfillmentAnalytics(prescriptionId: number): Promise<void> {
  try {
    const prescription = await (prisma as any).prescriptionTracking.findUnique({
      where: { id: prescriptionId }
    });

    if (!prescription) {
      logger.error('Prescription not found for analytics', { prescriptionId });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get or create today's analytics record
    const analytics = await (prisma as any).fulfillmentAnalytics.upsert({
      where: {
        date_pharmacyName: {
          date: today,
          pharmacyName: prescription.pharmacyName || 'Default'
        }
      },
      create: {
        date: today,
        week: getWeekNumber(today),
        month: today.getMonth() + 1,
        year: today.getFullYear(),
        pharmacyName: prescription.pharmacyName || 'Default',
        totalOrders: 1,
        completedOrders: (prescription.currentStatus as any) === "DELIVERED" ? 1 : 0,
        cancelledOrders: (prescription.currentStatus as any) === "CANCELLED" ? 1 : 0,
        pendingOrders: ['PENDING', 'PROCESSING', 'SHIPPED'].includes(prescription.currentStatus) ? 1 : 0,
      },
      update: {
        totalOrders: { increment: 1 },
        completedOrders: (prescription.currentStatus as any) === "DELIVERED" ? 
          { increment: 1 } : undefined,
        cancelledOrders: (prescription.currentStatus as any) === "CANCELLED" ? 
          { increment: 1 } : undefined,
        pendingOrders: ['PENDING', 'PROCESSING', 'SHIPPED'].includes(prescription.currentStatus) ? 
          { increment: 1 } : undefined,
      }
    });

    // Calculate aggregated metrics for the day
    await recalculateDailyMetrics(today, prescription.pharmacyName || 'Default');

  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to update fulfillment analytics', { error, prescriptionId });
  }
}

/**
 * Recalculate daily metrics
 */
async function recalculateDailyMetrics(date: Date, pharmacyName: string): Promise<void> {
  try {
    // Get all prescriptions for this day and pharmacy
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const prescriptions = await (prisma as any).prescriptionTracking.findMany({
      where: {
        pharmacyName,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    if (prescriptions.length === 0) return;

    // Calculate averages
    const processingTimes = prescriptions
      .filter((p: any) => p.timeToProcess !== null)
      .map((p: any) => p.timeToProcess!);
    
    const shippingTimes = prescriptions
      .filter((p: any) => p.timeToShip !== null)
      .map((p: any) => p.timeToShip!);
    
    const deliveryTimes = prescriptions
      .filter((p: any) => p.timeToDeliver !== null)
      .map((p: any) => p.timeToDeliver!);
    
    const fulfillmentTimes = prescriptions
      .filter((p: any) => p.totalFulfillmentTime !== null)
      .map((p: any) => p.totalFulfillmentTime!);

    // Calculate on-time metrics
    const deliveredOrders = prescriptions.filter((p: any) => 
      (p.currentStatus as any) === "DELIVERED" && 
      p.actualDeliveryDate && 
      p.estimatedDeliveryDate
    );
    
    const onTimeDeliveries = deliveredOrders.filter((p: any) => 
      p.actualDeliveryDate! <= p.estimatedDeliveryDate!
    );

    // Calculate same-day and next-day shipments
    const shippedOrders = prescriptions.filter((p: any) => 
      (p.currentStatus as any) === "SHIPPED" || (p.currentStatus as any) === "DELIVERED"
    );
    
    const sameDayShipments = shippedOrders.filter((p: any) => {
      if (!p.timeToShip) return false;
      return p.timeToShip < 1440; // Less than 24 hours
    });
    
    const nextDayShipments = shippedOrders.filter((p: any) => {
      if (!p.timeToShip) return false;
      return p.timeToShip >= 1440 && p.timeToShip < 2880; // 24-48 hours
    });

    // Update analytics
    await (prisma as any).fulfillmentAnalytics.update({
      where: {
        date_pharmacyName: {
          date: startOfDay,
          pharmacyName
        }
      },
      data: {
        avgTimeToProcess: processingTimes.length > 0  ? average(processingTimes)  : undefined,
        avgTimeToShip: shippingTimes.length > 0  ? average(shippingTimes)  : undefined,
        avgTimeToDeliver: deliveryTimes.length > 0  ? average(deliveryTimes)  : undefined,
        avgTotalFulfillment: fulfillmentTimes.length > 0  ? average(fulfillmentTimes)  : undefined,
        
        minTimeToProcess: processingTimes.length > 0  ? Math.min(...processingTimes)  : undefined,
        maxTimeToProcess: processingTimes.length > 0  ? Math.max(...processingTimes)  : undefined,
        minTimeToShip: shippingTimes.length > 0  ? Math.min(...shippingTimes)  : undefined,
        maxTimeToShip: shippingTimes.length > 0  ? Math.max(...shippingTimes)  : undefined,
        minTimeToDeliver: deliveryTimes.length > 0  ? Math.min(...deliveryTimes)  : undefined,
        maxTimeToDeliver: deliveryTimes.length > 0  ? Math.max(...deliveryTimes)  : undefined,
        
        onTimeDeliveryRate: deliveredOrders.length > 0  ? (onTimeDeliveries.length / deliveredOrders.length) * 100  : undefined,
        sameDayShipmentRate: shippedOrders.length > 0  ? (sameDayShipments.length / shippedOrders.length) * 100  : undefined,
        nextDayShipmentRate: shippedOrders.length > 0  ? (nextDayShipments.length / shippedOrders.length) * 100  : undefined,
      }
    });

    logger.info('Daily metrics recalculated', { 
      date: startOfDay, 
      pharmacyName,
      prescriptionCount: prescriptions.length 
    });

  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to recalculate daily metrics', error);
  }
}

/**
 * Generate fulfillment report for a date range
 */
export async function generateFulfillmentReport(
  startDate: Date,
  endDate: Date,
  pharmacyName?: string
): Promise<FulfillmentMetrics> {
  try {
    const where: any = {
      date: {
        gte: startDate,
        lte: endDate
      }
    };

    if (pharmacyName) {
      where.pharmacyName = pharmacyName;
    }

    const analytics = await (prisma as any).fulfillmentAnalytics.findMany({
      where
    });

    if (analytics.length === 0) {
      return {
        averageTimeToProcess: 0,
        averageTimeToShip: 0,
        averageTimeToDeliver: 0,
        totalFulfillmentTime: 0,
        onTimeDeliveryRate: 0,
        sameDayShipmentRate: 0,
        nextDayShipmentRate: 0,
      };
    }

    // Calculate weighted averages
    const totalOrders = analytics.reduce((sum, a) => sum + a.totalOrders, 0);
    
    const metrics: FulfillmentMetrics = {
      averageTimeToProcess: weightedAverage(
        analytics.map((a: any) => ({ value: a.avgTimeToProcess || 0, weight: a.totalOrders }))
      ),
      averageTimeToShip: weightedAverage(
        analytics.map((a: any) => ({ value: a.avgTimeToShip || 0, weight: a.totalOrders }))
      ),
      averageTimeToDeliver: weightedAverage(
        analytics.map((a: any) => ({ value: a.avgTimeToDeliver || 0, weight: a.totalOrders }))
      ),
      totalFulfillmentTime: weightedAverage(
        analytics.map((a: any) => ({ value: a.avgTotalFulfillment || 0, weight: a.totalOrders }))
      ),
      onTimeDeliveryRate: weightedAverage(
        analytics.map((a: any) => ({ value: a.onTimeDeliveryRate || 0, weight: a.completedOrders }))
      ),
      sameDayShipmentRate: weightedAverage(
        analytics.map((a: any) => ({ value: a.sameDayShipmentRate || 0, weight: a.totalOrders }))
      ),
      nextDayShipmentRate: weightedAverage(
        analytics.map((a: any) => ({ value: a.nextDayShipmentRate || 0, weight: a.totalOrders }))
      ),
    };

    return metrics;

  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to generate fulfillment report', error);
    throw error;
  }
}

/**
 * Get pharmacy performance comparison
 */
export async function comparePharmacyPerformance(
  startDate: Date,
  endDate: Date
): Promise<Record<string, FulfillmentMetrics>> {
  try {
    const pharmacies = await (prisma as any).fulfillmentAnalytics.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      distinct: ['pharmacyName']
    });

    const comparison: Record<string, FulfillmentMetrics> = {};

    for (const pharmacy of pharmacies) {
      if (pharmacy.pharmacyName) {
        comparison[pharmacy.pharmacyName] = await generateFulfillmentReport(
          startDate,
          endDate,
          pharmacy.pharmacyName
        );
      }
    }

    return comparison;

  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to compare pharmacy performance', error);
    throw error;
  }
}

/**
 * Identify bottlenecks in fulfillment process
 */
export async function identifyBottlenecks(
  pharmacyName?: string,
  threshold: number = 1440 // 24 hours in minutes
): Promise<{
  processingBottlenecks: number;
  shippingBottlenecks: number;
  deliveryBottlenecks: number;
  recommendations: string[];
}> {
  try {
    const where: any = {};
    if (pharmacyName) {
      where.pharmacyName = pharmacyName;
    }

    const prescriptions = await (prisma as any).prescriptionTracking.findMany({
      where,
      select: {
        timeToProcess: true,
        timeToShip: true,
        timeToDeliver: true,
      }
    });

    const processingBottlenecks = prescriptions.filter((p: any) => 
      p.timeToProcess && p.timeToProcess > threshold
    ).length;

    const shippingBottlenecks = prescriptions.filter((p: any) => 
      p.timeToShip && p.timeToShip > threshold
    ).length;

    const deliveryBottlenecks = prescriptions.filter((p: any) => 
      p.timeToDeliver && p.timeToDeliver > threshold * 2 // 48 hours for delivery
    ).length;

    const recommendations: string[] = [];

    if (processingBottlenecks > prescriptions.length * 0.2) {
      recommendations.push(
        'High processing delays detected. Consider increasing pharmacy staff or optimizing workflow.'
      );
    }

    if (shippingBottlenecks > prescriptions.length * 0.2) {
      recommendations.push(
        'Shipping delays are frequent. Review packaging process or consider alternative carriers.'
      );
    }

    if (deliveryBottlenecks > prescriptions.length * 0.1) {
      recommendations.push(
        'Delivery times are exceeding expectations. Consider express shipping options for urgent medications.'
      );
    }

    return {
      processingBottlenecks,
      shippingBottlenecks,
      deliveryBottlenecks,
      recommendations
    };

  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to identify bottlenecks', error);
    throw error;
  }
}

// Utility functions
function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function weightedAverage(items: { value: number; weight: number }[]): number {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return 0;
  
  const weightedSum = items.reduce((sum, item) => 
    sum + (item.value * item.weight), 0
  );
  
  return weightedSum / totalWeight;
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}
