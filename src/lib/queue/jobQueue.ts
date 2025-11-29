import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from 'bullmq';
import { logger } from '@/lib/logger';

// Redis connection configuration
const connection: ConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

// Job types enum
export enum JobType {
  SEND_EMAIL = 'SEND_EMAIL',
  SEND_SMS = 'SEND_SMS',
  GENERATE_REPORT = 'GENERATE_REPORT',
  PROCESS_PAYMENT = 'PROCESS_PAYMENT',
  SYNC_PATIENT_DATA = 'SYNC_PATIENT_DATA',
  BACKUP_DATABASE = 'BACKUP_DATABASE',
  CLEANUP_OLD_DATA = 'CLEANUP_OLD_DATA',
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
  GENERATE_INVOICE = 'GENERATE_INVOICE',
  UPDATE_ANALYTICS = 'UPDATE_ANALYTICS',
  PROCESS_PRESCRIPTION = 'PROCESS_PRESCRIPTION',
  VERIFY_INSURANCE = 'VERIFY_INSURANCE',
  EXPORT_DATA = 'EXPORT_DATA',
  IMPORT_DATA = 'IMPORT_DATA',
  WEBHOOK_DELIVERY = 'WEBHOOK_DELIVERY',
}

// Job data interfaces
export interface EmailJobData {
  to: string | string[];
  subject: string;
  body: string;
  template?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
}

export interface SMSJobData {
  to: string;
  message: string;
}

export interface ReportJobData {
  type: 'patient' | 'financial' | 'clinical' | 'operational';
  startDate: Date;
  endDate: Date;
  format: 'pdf' | 'excel' | 'csv';
  userId: string;
}

export interface PaymentJobData {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
}

export interface NotificationJobData {
  userId: string;
  type: 'appointment' | 'medication' | 'lab_result' | 'general';
  title: string;
  message: string;
  data?: Record<string, any>;
}

export interface WebhookJobData {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  retryCount?: number;
  signature?: string;
}

// Queue configuration
export interface QueueConfig {
  defaultJobOptions?: {
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  };
  concurrency?: number;
}

// Job processor type
type JobProcessor<T> = (job: Job<T>) => Promise<void>;

// Queue manager class
class QueueManager {
  private queues: Map<JobType, Queue> = new Map();
  private workers: Map<JobType, Worker> = new Map();
  private events: Map<JobType, QueueEvents> = new Map();
  private processors: Map<JobType, JobProcessor<any>> = new Map();

  constructor(private config: QueueConfig = {}) {
    this.initializeQueues();
    this.registerProcessors();
  }

  private initializeQueues(): void {
    Object.values(JobType).forEach((jobType: any) => {
      const queue = new Queue(jobType, {
        connection,
        defaultJobOptions: this.config.defaultJobOptions || {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      });

      const events = new QueueEvents(jobType, { connection });

      this.queues.set(jobType, queue);
      this.events.set(jobType, events);

      // Set up event listeners
      events.on('completed', ({ jobId, returnvalue }) => {
        logger.info(`Job ${jobId} of type ${jobType} completed`, { returnvalue });
      });

      events.on('failed', ({ jobId, failedReason }) => {
        logger.error(`Job ${jobId} of type ${jobType} failed`, { failedReason });
      });

      events.on('progress', ({ jobId, data }) => {
        logger.debug(`Job ${jobId} of type ${jobType} progress`, { data });
      });
    });
  }

  private registerProcessors(): void {
    // Email processor
    this.processors.set(JobType.SEND_EMAIL, async (job: Job<EmailJobData>) => {
      const { to, subject, body, template, attachments } = job.data;
      
      // Update progress
      await job.updateProgress(10);
      
      // TODO: Integrate with actual email service (SendGrid, SES, etc.)
      logger.info('Sending email', { to, subject });
      
      // Simulate email sending
      await new Promise((resolve: any) => setTimeout(resolve, 1000));
      
      await job.updateProgress(100);
    });

    // SMS processor
    this.processors.set(JobType.SEND_SMS, async (job: Job<SMSJobData>) => {
      const { to, message } = job.data;
      
      // TODO: Integrate with Twilio or other SMS service
      logger.info('Sending SMS', { to, message: message.substring(0, 50) });
      
      // Simulate SMS sending
      await new Promise((resolve: any) => setTimeout(resolve, 500));
    });

    // Report processor
    this.processors.set(JobType.GENERATE_REPORT, async (job: Job<ReportJobData>) => {
      const { type, startDate, endDate, format, userId } = job.data;
      
      await job.updateProgress(10);
      
      // TODO: Implement actual report generation
      logger.info('Generating report', { type, format, userId });
      
      // Simulate report generation
      await new Promise((resolve: any) => setTimeout(resolve, 5000));
      
      await job.updateProgress(100);
    });

    // Payment processor
    this.processors.set(JobType.PROCESS_PAYMENT, async (job: Job<PaymentJobData>) => {
      const { orderId, amount, currency, paymentMethod } = job.data;
      
      // TODO: Integrate with Stripe or other payment gateway
      logger.info('Processing payment', { orderId, amount, currency });
      
      // Simulate payment processing
      await new Promise((resolve: any) => setTimeout(resolve, 2000));
    });

    // Notification processor
    this.processors.set(JobType.SEND_NOTIFICATION, async (job: Job<NotificationJobData>) => {
      const { userId, type, title, message, data } = job.data;
      
      // TODO: Implement push notification service
      logger.info('Sending notification', { userId, type, title });
      
      // Simulate notification sending
      await new Promise((resolve: any) => setTimeout(resolve, 300));
    });

    // Webhook processor
    this.processors.set(JobType.WEBHOOK_DELIVERY, async (job: Job<WebhookJobData>) => {
      const { url, method, headers, body, signature } = job.data;
      
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
            ...(signature ? { 'X-Webhook-Signature': signature } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          throw new Error(`Webhook delivery failed: ${response.status}`);
        }

        logger.info('Webhook delivered successfully', { url, method });
      } catch (error: any) {
    // @ts-ignore
   
        logger.error('Webhook delivery failed', { url, method, error });
        throw error;
      }
    });
  }

  async startWorker(jobType: JobType): Promise<void> {
    const processor = this.processors.get(jobType);
    if (!processor) {
      throw new Error(`No processor registered for job type: ${jobType}`);
    }

    const worker = new Worker(
      jobType,
      processor,
      {
        connection,
        concurrency: this.config.concurrency || 5,
        autorun: true,
      }
    );

    worker.on('completed', (job: any) => {
      logger.debug(`Worker completed job ${job.id} of type ${jobType}`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`Worker failed job ${job?.id} of type ${jobType}`, err);
    });

    this.workers.set(jobType, worker);
  }

  async startAllWorkers(): Promise<void> {
    for (const jobType of Object.values(JobType)) {
      await this.startWorker(jobType);
    }
    logger.info('All workers started');
  }

  async addJob<T>(
    jobType: JobType,
    data: T,
    options?: {
      delay?: number;
      priority?: number;
      attempts?: number;
      backoff?: {
        type: 'exponential' | 'fixed';
        delay: number;
      };
      repeat?: {
        pattern?: string; // Cron pattern
        every?: number; // Milliseconds
        limit?: number;
      };
    }
  ): Promise<Job<T>> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${jobType}`);
    }

    const job = await queue.add(
      `${jobType}_${Date.now()}`,
      data,
      options
    );

    logger.debug(`Job ${job.id} added to queue ${jobType}`);
    return job as Job<T>;
  }

  async addBulkJobs<T>(
    jobType: JobType,
    jobs: Array<{ data: T; opts?: any }>
  ): Promise<Job<T>[]> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${jobType}`);
    }

    const jobsToAdd = jobs.map((job, index) => ({
      name: `${jobType}_bulk_${Date.now()}_${index}`,
      data: job.data,
      opts: job.opts,
    }));

    const addedJobs = await queue.addBulk(jobsToAdd);
    logger.info(`Added ${addedJobs.length} bulk jobs to queue ${jobType}`);
    return addedJobs as Job<T>[];
  }

  async getJob(jobType: JobType, jobId: string): Promise<Job | undefined> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${jobType}`);
    }

    return queue.getJob(jobId);
  }

  async getQueueStatus(jobType: JobType): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
  }> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${jobType}`);
    }

    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);

    return { waiting, active, completed, failed, delayed, paused };
  }

  async pauseQueue(jobType: JobType): Promise<void> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${jobType}`);
    }

    await queue.pause();
    logger.info(`Queue ${jobType} paused`);
  }

  async resumeQueue(jobType: JobType): Promise<void> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${jobType}`);
    }

    await queue.resume();
    logger.info(`Queue ${jobType} resumed`);
  }

  async cleanQueue(jobType: JobType, grace: number = 0): Promise<void> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue not found for job type: ${jobType}`);
    }

    await queue.clean(grace, 1000);
    logger.info(`Queue ${jobType} cleaned`);
  }

  async shutdown(): Promise<void> {
    // Close all workers
    for (const [jobType, worker] of this.workers) {
      await worker.close();
      logger.info(`Worker for ${jobType} closed`);
    }

    // Close all queues
    for (const [jobType, queue] of this.queues) {
      await queue.close();
      logger.info(`Queue ${jobType} closed`);
    }

    // Close all event listeners
    for (const [jobType, events] of this.events) {
      await events.close();
      logger.info(`Events for ${jobType} closed`);
    }

    logger.info('Queue manager shutdown complete');
  }

  async getAllQueueStatuses(): Promise<Record<string, any>> {
    const statuses: Record<string, any> = {};
    
    for (const jobType of Object.values(JobType)) {
      try {
        statuses[jobType] = await this.getQueueStatus(jobType);
      } catch (error: any) {
    // @ts-ignore
   
        statuses[jobType] = { error: 'Unable to fetch status' };
      }
    }
    
    return statuses;
  }
}

// Singleton instance
let queueManager: QueueManager | null = null;

export function getQueueManager(config?: QueueConfig): QueueManager {
  if (!queueManager) {
    queueManager = new QueueManager(config);
  }
  return queueManager;
}

// Helper functions for common job types
export const jobQueue = {
  async sendEmail(data: EmailJobData, options?: any): Promise<Job<EmailJobData>> {
    return getQueueManager().addJob(JobType.SEND_EMAIL, data, options);
  },

  async sendSMS(data: SMSJobData, options?: any): Promise<Job<SMSJobData>> {
    return getQueueManager().addJob(JobType.SEND_SMS, data, options);
  },

  async generateReport(data: ReportJobData, options?: any): Promise<Job<ReportJobData>> {
    return getQueueManager().addJob(JobType.GENERATE_REPORT, data, options);
  },

  async processPayment(data: PaymentJobData, options?: any): Promise<Job<PaymentJobData>> {
    return getQueueManager().addJob(JobType.PROCESS_PAYMENT, data, options);
  },

  async sendNotification(data: NotificationJobData, options?: any): Promise<Job<NotificationJobData>> {
    return getQueueManager().addJob(JobType.SEND_NOTIFICATION, data, options);
  },

  async deliverWebhook(data: WebhookJobData, options?: any): Promise<Job<WebhookJobData>> {
    return getQueueManager().addJob(JobType.WEBHOOK_DELIVERY, data, {
      attempts: data.retryCount || 5,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      ...options,
    });
  },
};
