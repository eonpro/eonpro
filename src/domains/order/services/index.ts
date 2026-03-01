/**
 * Order Services Index
 * ====================
 *
 * @module domains/order/services
 */

export {
  orderService,
  type OrderService,
  type GetOrderResult,
  type ListOrdersResult,
} from './order.service';

export {
  cancelOrder,
  CancelOrderError,
  type CancelOrderInput,
  type CancelOrderResult,
} from './cancel-order';
