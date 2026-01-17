/**
 * Care Plan Service
 * 
 * Manages care plans, goals, activities, and patient progress tracking
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { CarePlanStatus, GoalStatus } from '@prisma/client';

// Weight Loss Care Plan Template
export const WEIGHT_LOSS_CARE_PLAN_TEMPLATE = {
  name: 'Weight Loss Program',
  description: 'Comprehensive weight loss program with medication management',
  treatmentType: 'weight-loss',
  defaultDurationDays: 90,
  goals: [
    {
      title: 'Achieve Target Weight',
      description: 'Reach your goal weight through medication and lifestyle changes',
      targetValuePlaceholder: '{targetWeight}',
      unit: 'lbs',
    },
    {
      title: 'Improve Diet Quality',
      description: 'Follow recommended dietary guidelines for weight loss',
    },
    {
      title: 'Increase Physical Activity',
      description: 'Establish regular exercise routine',
    },
    {
      title: 'Medication Compliance',
      description: 'Take prescribed medications as directed',
    },
  ],
  activities: [
    {
      title: 'Daily Weigh-In',
      description: 'Record your weight each morning',
      frequency: 'daily',
      instructions: 'Weigh yourself at the same time each morning, after using the bathroom',
    },
    {
      title: 'Medication Administration',
      description: 'Take medication as prescribed',
      frequency: 'weekly',
      instructions: 'Administer injection as demonstrated by your provider',
    },
    {
      title: 'Food Logging',
      description: 'Track meals and snacks',
      frequency: 'daily',
      instructions: 'Log all food consumed including portions',
    },
    {
      title: 'Exercise Session',
      description: 'Complete recommended exercise',
      frequency: '3x per week',
      instructions: 'Aim for 30 minutes of moderate activity',
    },
    {
      title: 'Hydration Tracking',
      description: 'Drink adequate water',
      frequency: 'daily',
      instructions: 'Aim for 8 glasses (64 oz) of water per day',
    },
  ],
};

// Hormone Therapy Care Plan Template
export const HORMONE_THERAPY_TEMPLATE = {
  name: 'Hormone Therapy Program',
  description: 'Hormone replacement therapy with monitoring',
  treatmentType: 'hormone-therapy',
  defaultDurationDays: 180,
  goals: [
    {
      title: 'Optimize Hormone Levels',
      description: 'Achieve target hormone levels through therapy',
    },
    {
      title: 'Symptom Improvement',
      description: 'Reduce symptoms and improve quality of life',
    },
    {
      title: 'Maintain Safety Labs',
      description: 'Keep safety markers within normal ranges',
    },
  ],
  activities: [
    {
      title: 'Medication Administration',
      description: 'Take/apply hormone medication as prescribed',
      frequency: 'as prescribed',
      instructions: 'Follow provider instructions for medication dosing',
    },
    {
      title: 'Symptom Journal',
      description: 'Track symptoms and energy levels',
      frequency: 'daily',
      instructions: 'Rate your energy and note any symptoms',
    },
    {
      title: 'Lab Work',
      description: 'Complete scheduled lab tests',
      frequency: 'as scheduled',
      instructions: 'Fast for 8-12 hours before lab draw if required',
    },
  ],
};

export interface CreateCarePlanInput {
  clinicId?: number;
  patientId: number;
  providerId?: number;
  title: string;
  description?: string;
  templateId?: number;
  startDate?: Date;
  endDate?: Date;
  goals?: {
    title: string;
    description?: string;
    targetValue?: string;
    unit?: string;
    targetDate?: Date;
  }[];
  activities?: {
    title: string;
    description?: string;
    frequency?: string;
    instructions?: string;
    goalIndex?: number;
  }[];
}

export interface RecordProgressInput {
  carePlanId: number;
  goalId?: number;
  activityId?: number;
  value?: string;
  notes?: string;
  recordedById?: number;
  recordedByPatient?: boolean;
}

/**
 * Create a care plan template
 */
export async function createCarePlanTemplate(
  template: typeof WEIGHT_LOSS_CARE_PLAN_TEMPLATE & { clinicId?: number; createdById?: number }
): Promise<any> {
  try {
    const carePlanTemplate = await prisma.carePlanTemplate.create({
      data: {
        clinicId: template.clinicId,
        name: template.name,
        description: template.description,
        treatmentType: template.treatmentType,
        defaultDurationDays: template.defaultDurationDays,
        content: {
          goals: template.goals,
          activities: template.activities,
        },
        createdById: template.createdById,
        isActive: true,
      },
    });

    logger.info('Care plan template created', { templateId: carePlanTemplate.id });

    return carePlanTemplate;
  } catch (error) {
    logger.error('Failed to create care plan template', { error });
    throw error;
  }
}

/**
 * Create a new care plan for a patient
 */
export async function createCarePlan(input: CreateCarePlanInput): Promise<{
  success: boolean;
  carePlan?: any;
  error?: string;
}> {
  try {
    let templateContent: any = null;

    // If using a template, fetch it
    if (input.templateId) {
      const template = await prisma.carePlanTemplate.findUnique({
        where: { id: input.templateId },
      });

      if (template) {
        templateContent = template.content as any;
        
        // Set default dates if not provided
        if (!input.endDate && template.defaultDurationDays) {
          const start = input.startDate || new Date();
          input.endDate = new Date(start.getTime() + template.defaultDurationDays * 24 * 60 * 60 * 1000);
        }
      }
    }

    // Create the care plan
    const carePlan = await prisma.carePlan.create({
      data: {
        clinicId: input.clinicId,
        patientId: input.patientId,
        providerId: input.providerId,
        title: input.title,
        description: input.description,
        status: CarePlanStatus.DRAFT,
        startDate: input.startDate,
        endDate: input.endDate,
        templateId: input.templateId,
      },
    });

    // Add goals
    const goalsToCreate = input.goals || (templateContent?.goals as any[]) || [];
    const createdGoals = [];

    for (let i = 0; i < goalsToCreate.length; i++) {
      const goal = goalsToCreate[i];
      const createdGoal = await prisma.carePlanGoal.create({
        data: {
          carePlanId: carePlan.id,
          title: goal.title,
          description: goal.description,
          targetValue: goal.targetValue,
          unit: goal.unit,
          targetDate: goal.targetDate,
          status: GoalStatus.NOT_STARTED,
          orderIndex: i,
        },
      });
      createdGoals.push(createdGoal);
    }

    // Add activities
    const activitiesToCreate = input.activities || (templateContent?.activities as any[]) || [];

    for (let i = 0; i < activitiesToCreate.length; i++) {
      const activity = activitiesToCreate[i];
      const goalId = activity.goalIndex !== undefined ? createdGoals[activity.goalIndex]?.id : null;

      await prisma.carePlanActivity.create({
        data: {
          carePlanId: carePlan.id,
          goalId,
          title: activity.title,
          description: activity.description,
          frequency: activity.frequency,
          instructions: activity.instructions,
          orderIndex: i,
        },
      });
    }

    // Fetch the complete care plan
    const fullCarePlan = await prisma.carePlan.findUnique({
      where: { id: carePlan.id },
      include: {
        goals: { orderBy: { orderIndex: 'asc' } },
        activities: { orderBy: { orderIndex: 'asc' } },
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    logger.info('Care plan created', {
      carePlanId: carePlan.id,
      patientId: input.patientId,
      goalsCount: goalsToCreate.length,
      activitiesCount: activitiesToCreate.length,
    });

    return { success: true, carePlan: fullCarePlan };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create care plan', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Activate a care plan
 */
export async function activateCarePlan(carePlanId: number): Promise<{
  success: boolean;
  carePlan?: any;
  error?: string;
}> {
  try {
    const carePlan = await prisma.carePlan.update({
      where: { id: carePlanId },
      data: {
        status: CarePlanStatus.ACTIVE,
        activatedAt: new Date(),
        startDate: new Date(),
      },
    });

    // Update all goals to IN_PROGRESS
    await prisma.carePlanGoal.updateMany({
      where: { carePlanId },
      data: { status: GoalStatus.IN_PROGRESS },
    });

    logger.info('Care plan activated', { carePlanId });

    return { success: true, carePlan };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to activate care plan', { carePlanId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Record progress for a care plan
 */
export async function recordProgress(input: RecordProgressInput): Promise<{
  success: boolean;
  progress?: any;
  error?: string;
}> {
  try {
    const progress = await prisma.carePlanProgress.create({
      data: {
        carePlanId: input.carePlanId,
        goalId: input.goalId,
        activityId: input.activityId,
        value: input.value,
        notes: input.notes,
        recordedById: input.recordedById,
        recordedByPatient: input.recordedByPatient || false,
      },
    });

    // If this is a goal progress with a value, update the goal's current value
    if (input.goalId && input.value) {
      await prisma.carePlanGoal.update({
        where: { id: input.goalId },
        data: { currentValue: input.value },
      });
    }

    logger.info('Progress recorded', {
      carePlanId: input.carePlanId,
      goalId: input.goalId,
      activityId: input.activityId,
    });

    return { success: true, progress };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to record progress', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Complete a goal
 */
export async function completeGoal(goalId: number): Promise<{
  success: boolean;
  goal?: any;
  error?: string;
}> {
  try {
    const goal = await prisma.carePlanGoal.update({
      where: { id: goalId },
      data: {
        status: GoalStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    // Check if all goals are completed
    const carePlanGoals = await prisma.carePlanGoal.findMany({
      where: { carePlanId: goal.carePlanId },
    });

    const allCompleted = carePlanGoals.every((g: { status: string }) => g.status === GoalStatus.COMPLETED);

    if (allCompleted) {
      await prisma.carePlan.update({
        where: { id: goal.carePlanId },
        data: {
          status: CarePlanStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      logger.info('Care plan completed - all goals achieved', { carePlanId: goal.carePlanId });
    }

    logger.info('Goal completed', { goalId });

    return { success: true, goal };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to complete goal', { goalId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get care plan with progress summary
 */
export async function getCarePlanWithProgress(carePlanId: number): Promise<any> {
  const carePlan = await prisma.carePlan.findUnique({
    where: { id: carePlanId },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      provider: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      goals: {
        orderBy: { orderIndex: 'asc' },
        include: {
          progress: {
            orderBy: { recordedAt: 'desc' },
            take: 10,
          },
        },
      },
      activities: {
        orderBy: { orderIndex: 'asc' },
        include: {
          progress: {
            orderBy: { recordedAt: 'desc' },
            take: 5,
          },
        },
      },
      progress: {
        orderBy: { recordedAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!carePlan) return null;

  // Calculate progress statistics
  const totalGoals = carePlan.goals.length;
  const completedGoals = carePlan.goals.filter((g: { status: string }) => g.status === GoalStatus.COMPLETED).length;
  const inProgressGoals = carePlan.goals.filter((g: { status: string }) => g.status === GoalStatus.IN_PROGRESS).length;

  const progressPercentage = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  // Recent activity count (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recentProgressCount = carePlan.progress.filter(
    (p: { recordedAt: Date }) => new Date(p.recordedAt) >= weekAgo
  ).length;

  return {
    ...carePlan,
    stats: {
      totalGoals,
      completedGoals,
      inProgressGoals,
      progressPercentage,
      recentProgressCount,
      daysRemaining: carePlan.endDate
        ? Math.max(0, Math.ceil((new Date(carePlan.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null,
    },
  };
}

/**
 * Get patient's care plans
 */
export async function getPatientCarePlans(
  patientId: number,
  options?: {
    status?: CarePlanStatus;
    includeArchived?: boolean;
  }
): Promise<any[]> {
  const where: any = { patientId };

  if (options?.status) {
    where.status = options.status;
  } else if (!options?.includeArchived) {
    where.status = { not: CarePlanStatus.ARCHIVED };
  }

  return prisma.carePlan.findMany({
    where,
    include: {
      goals: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
      provider: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      template: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get available care plan templates
 */
export async function getCarePlanTemplates(clinicId?: number): Promise<any[]> {
  return prisma.carePlanTemplate.findMany({
    where: {
      isActive: true,
      OR: [
        { clinicId: null }, // Global templates
        ...(clinicId ? [{ clinicId }] : []),
      ],
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Archive a care plan
 */
export async function archiveCarePlan(carePlanId: number): Promise<{
  success: boolean;
  carePlan?: any;
  error?: string;
}> {
  try {
    const carePlan = await prisma.carePlan.update({
      where: { id: carePlanId },
      data: { status: CarePlanStatus.ARCHIVED },
    });

    logger.info('Care plan archived', { carePlanId });

    return { success: true, carePlan };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to archive care plan', { carePlanId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get progress history for a care plan goal
 */
export async function getGoalProgressHistory(
  goalId: number,
  options?: { startDate?: Date; endDate?: Date }
): Promise<any[]> {
  const where: any = { goalId };

  if (options?.startDate || options?.endDate) {
    where.recordedAt = {};
    if (options.startDate) where.recordedAt.gte = options.startDate;
    if (options.endDate) where.recordedAt.lte = options.endDate;
  }

  return prisma.carePlanProgress.findMany({
    where,
    orderBy: { recordedAt: 'asc' },
    include: {
      recordedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
}

/**
 * Add a goal to an existing care plan
 */
export async function addGoalToCarePlan(
  carePlanId: number,
  goal: {
    title: string;
    description?: string;
    targetValue?: string;
    unit?: string;
    targetDate?: Date;
  }
): Promise<{
  success: boolean;
  goal?: any;
  error?: string;
}> {
  try {
    // Get current max order index
    const existingGoals = await prisma.carePlanGoal.findMany({
      where: { carePlanId },
      orderBy: { orderIndex: 'desc' },
      take: 1,
    });

    const orderIndex = existingGoals.length > 0 ? existingGoals[0].orderIndex + 1 : 0;

    const newGoal = await prisma.carePlanGoal.create({
      data: {
        carePlanId,
        title: goal.title,
        description: goal.description,
        targetValue: goal.targetValue,
        unit: goal.unit,
        targetDate: goal.targetDate,
        status: GoalStatus.NOT_STARTED,
        orderIndex,
      },
    });

    logger.info('Goal added to care plan', { carePlanId, goalId: newGoal.id });

    return { success: true, goal: newGoal };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to add goal', { carePlanId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Initialize default care plan templates for a clinic
 */
export async function initializeCarePlanTemplates(clinicId: number): Promise<void> {
  try {
    // Check if templates already exist
    const existingTemplates = await prisma.carePlanTemplate.count({
      where: { clinicId },
    });

    if (existingTemplates > 0) {
      logger.info('Care plan templates already exist for clinic', { clinicId });
      return;
    }

    // Create weight loss template
    await createCarePlanTemplate({
      ...WEIGHT_LOSS_CARE_PLAN_TEMPLATE,
      clinicId,
    });

    // Create hormone therapy template
    await createCarePlanTemplate({
      ...HORMONE_THERAPY_TEMPLATE,
      clinicId,
    });

    logger.info('Initialized care plan templates for clinic', { clinicId });
  } catch (error) {
    logger.error('Failed to initialize care plan templates', { clinicId, error });
    throw error;
  }
}
