import { CustomerId } from '../customer.entity';
import { EventSpotId } from '../event-spot';
import { Order, OrderStatus } from '../order.entity';
import { OrderCancelled } from '../../events/domain-events/order-cancelled.event';

describe('Order Entity Unit Tests', () => {
  const makeOrder = () =>
    Order.create({
      customer_id: new CustomerId(),
      event_spot_id: new EventSpotId(),
      amount: 200,
    });

  test('deve cancelar um pedido pendente e registrar OrderCancelled com event_spot_id', () => {
    const order = makeOrder();

    order.cancel();

    expect(order.status).toBe(OrderStatus.CANCELLED);

    const cancelled = [...order.events].find(
      (e) => e instanceof OrderCancelled,
    ) as OrderCancelled;
    expect(cancelled).toBeInstanceOf(OrderCancelled);
    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(cancelled.event_spot_id.equals(order.event_spot_id)).toBe(true);
  });

  test('deve cancelar um pedido pago', () => {
    const order = makeOrder();
    order.pay();

    order.cancel();

    expect(order.status).toBe(OrderStatus.CANCELLED);
  });

  test('não deve cancelar um pedido já cancelado', () => {
    const order = makeOrder();
    order.cancel();

    expect(() => order.cancel()).toThrow('Order already cancelled');
  });
});
