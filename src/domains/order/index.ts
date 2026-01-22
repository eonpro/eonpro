/**
 * Order Domain
 * ============
 *
 * Public exports for the order domain.
 * Import from '@/domains/order' for all order-related functionality.
 *
 * @module domains/order
 *
 * @example
 * ```typescript
 * import { orderService, type Order } from '@/domains/order';
 *
 * const order = await orderService.getById(1, userContext);
 * ```
 */

// Services (primary API)
export {
  orderService,
  type OrderService,
  type GetOrderResult,
  type ListOrdersResult,
} from './services';

// Repositories (for advanced use cases)
export { orderRepository, type OrderRepository } from './repositories';

// Types
export type {
  Order,
  Rx,
  OrderEvent,
  OrderWithPatient,
  OrderWithDetails,
  OrderSummary,
  CreateOrderInput,
  CreateRxInput,
  UpdateOrderInput,
  CreateOrderEventInput,
  OrderListFilters,
  OrderListResult,
  OrderStatus,
  ShippingStatus,
  OrderEventType,
} from './types';

export { ORDER_EVENT_TYPES } from './types';

// Re-export UserContext for convenience
export type { UserContext } from '../shared/types';
