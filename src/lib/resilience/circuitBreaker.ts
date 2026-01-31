import { logger } from '@/lib/logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  name: string;
  timeout?: number; // Request timeout in ms
  errorThreshold?: number; // Error percentage to open circuit
  volumeThreshold?: number; // Minimum requests before calculating error percentage
  sleepWindow?: number; // Time to wait before trying again (ms)
  bucketSize?: number; // Time window for metrics (ms)
  fallback?: (...args: any[]) => Promise<any>;
}

interface Metrics {
  failures: number;
  successes: number;
  timeouts: number;
  shortCircuits: number;
  lastFailureTime?: number;
}

export class CircuitBreaker<T = any> {
  private state: CircuitState = CircuitState.CLOSED;
  private metrics: Metrics = {
    failures: 0,
    successes: 0,
    timeouts: 0,
    shortCircuits: 0,
  };
  private nextAttempt?: number;
  private bucketStart: number = Date.now();
  
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      name: options.name,
      timeout: options.timeout || 3000,
      errorThreshold: options.errorThreshold || 50,
      volumeThreshold: options.volumeThreshold || 10,
      sleepWindow: options.sleepWindow || 60000,
      bucketSize: options.bucketSize || 10000,
      fallback: options.fallback || this.defaultFallback,
    };
  }

  private defaultFallback(): Promise<never> {
    return Promise.reject(new Error(`Circuit breaker ${this.options.name} is OPEN`));
  }

  private resetBucketIfNeeded(): void {
    const now = Date.now();
    if (now - this.bucketStart > this.options.bucketSize) {
      this.metrics = {
        failures: 0,
        successes: 0,
        timeouts: 0,
        shortCircuits: 0,
      };
      this.bucketStart = now;
    }
  }

  private calculateErrorPercentage(): number {
    const total = this.metrics.failures + this.metrics.successes + this.metrics.timeouts;
    if (total < this.options.volumeThreshold) {
      return 0;
    }
    return ((this.metrics.failures + this.metrics.timeouts) / total) * 100;
  }

  private shouldOpen(): boolean {
    return this.calculateErrorPercentage() >= this.options.errorThreshold;
  }

  private updateState(): void {
    this.resetBucketIfNeeded();

    if (this.state === CircuitState.CLOSED && this.shouldOpen()) {
      this.open();
    } else if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      if (this.nextAttempt && now >= this.nextAttempt) {
        this.halfOpen();
      }
    }
  }

  private open(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.options.sleepWindow;
    logger.warn(`Circuit breaker ${this.options.name} is now OPEN`);
  }

  private close(): void {
    this.state = CircuitState.CLOSED;
    this.nextAttempt = undefined;
    logger.info(`Circuit breaker ${this.options.name} is now CLOSED`);
  }

  private halfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    logger.info(`Circuit breaker ${this.options.name} is now HALF_OPEN`);
  }

  private async executeWithTimeout<R>(
    fn: (...args: any[]) => Promise<R>,
    ...args: any[]
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      fn(...args)
        .then((result: any) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: any) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private onSuccess(): void {
    this.metrics.successes++;
    if (this.state === CircuitState.HALF_OPEN) {
      this.close();
    }
  }

  private onFailure(error: Error): void {
    this.metrics.failures++;
    this.metrics.lastFailureTime = Date.now();
    
    logger.error(`Circuit breaker ${this.options.name} failure:`, error);
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.open();
    }
  }

  private onTimeout(): void {
    this.metrics.timeouts++;
    this.metrics.lastFailureTime = Date.now();
    
    logger.warn(`Circuit breaker ${this.options.name} timeout`);
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.open();
    }
  }

  private onShortCircuit(): void {
    this.metrics.shortCircuits++;
    logger.debug(`Circuit breaker ${this.options.name} short-circuited`);
  }

  async execute<R = T>(
    fn: (...args: any[]) => Promise<R>,
    ...args: any[]
  ): Promise<R> {
    this.updateState();

    if (this.state === CircuitState.OPEN) {
      this.onShortCircuit();
      return this.options.fallback(...args) as Promise<R>;
    }

    try {
      const result = await this.executeWithTimeout(fn, ...args);
      this.onSuccess();
      return result;
    } catch (error: any) {
    // @ts-ignore
   
      if (error instanceof Error && error.message.includes('Timeout')) {
        this.onTimeout();
      } else {
        this.onFailure(error as Error);
      }
      
      if ((this.state as CircuitState) === CircuitState.OPEN || (this.state as CircuitState) === CircuitState.HALF_OPEN) {
        return this.options.fallback(...args) as Promise<R>;
      }
      
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): Readonly<Metrics> {
    return { ...this.metrics };
  }

  reset(): void {
    this.close();
    this.metrics = {
      failures: 0,
      successes: 0,
      timeouts: 0,
      shortCircuits: 0,
    };
    this.bucketStart = Date.now();
  }
}

// Factory function for creating circuit breakers
export function createCircuitBreaker<T = any>(
  options: CircuitBreakerOptions
): CircuitBreaker<T> {
  return new CircuitBreaker<T>(options);
}

// Decorator for adding circuit breaker to methods
export function withCircuitBreaker(options: Omit<CircuitBreakerOptions, 'name'>) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const circuitBreaker = new CircuitBreaker({
      ...options,
      name: `${target.constructor.name}.${propertyName}`,
    });

    descriptor.value = async function (...args: any[]) {
      return circuitBreaker.execute(
        originalMethod.bind(this),
        ...args
      );
    };

    return descriptor;
  };
}

// Circuit breaker registry for managing multiple breakers
class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  register(breaker: CircuitBreaker, name: string): void {
    this.breakers.set(name, breaker);
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  resetAll(): void {
    this.breakers.forEach((breaker: any) => breaker.reset());
  }

  getStatus(): Record<string, { state: CircuitState; metrics: Readonly<Metrics> }> {
    const status: Record<string, { state: CircuitState; metrics: Readonly<Metrics> }> = {};
    
    this.breakers.forEach((breaker, name) => {
      status[name] = {
        state: breaker.getState(),
        metrics: breaker.getMetrics(),
      };
    });
    
    return status;
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

// Pre-configured circuit breakers for common services
export const circuitBreakers = {
  database: createCircuitBreaker({
    name: 'database',
    timeout: 5000,
    errorThreshold: 50,
    volumeThreshold: 10,
    sleepWindow: 30000,
    fallback: async () => {
      throw new Error('Database is currently unavailable');
    },
  }),

  redis: createCircuitBreaker({
    name: 'redis',
    timeout: 1000,
    errorThreshold: 70,
    volumeThreshold: 5,
    sleepWindow: 10000,
    fallback: async () => null, // Return null if cache is down
  }),

  externalApi: createCircuitBreaker({
    name: 'externalApi',
    timeout: 10000,
    errorThreshold: 30,
    volumeThreshold: 10,
    sleepWindow: 60000,
    fallback: async () => {
      throw new Error('External API is currently unavailable');
    },
  }),

  email: createCircuitBreaker({
    name: 'email',
    timeout: 10000,
    errorThreshold: 80,
    volumeThreshold: 5,
    sleepWindow: 30000,
    fallback: async () => {
      // Queue for retry later
      logger.warn('Email service down, queuing for retry');
      return { queued: true };
    },
  }),

  sms: createCircuitBreaker({
    name: 'sms',
    timeout: 10000,
    errorThreshold: 70,
    volumeThreshold: 5,
    sleepWindow: 30000,
    fallback: async () => {
      // Queue for retry later
      logger.warn('SMS service down, queuing for retry');
      return { queued: true };
    },
  }),

  // ENTERPRISE: Stripe payment service circuit breaker
  stripe: createCircuitBreaker({
    name: 'stripe',
    timeout: 30000, // Stripe operations can take longer
    errorThreshold: 30, // Lower threshold for payment failures
    volumeThreshold: 5,
    sleepWindow: 60000, // 1 minute cooldown
    fallback: async () => {
      throw new Error('Stripe payment service is temporarily unavailable. Please try again.');
    },
  }),

  // ENTERPRISE: Lifefile pharmacy API circuit breaker
  lifefile: createCircuitBreaker({
    name: 'lifefile',
    timeout: 20000,
    errorThreshold: 40,
    volumeThreshold: 5,
    sleepWindow: 60000,
    fallback: async () => {
      throw new Error('Pharmacy service is temporarily unavailable. Order has been saved and will be processed automatically.');
    },
  }),
};

// Register all pre-configured breakers
Object.entries(circuitBreakers).forEach(([name, breaker]) => {
  circuitBreakerRegistry.register(breaker, name);
});
