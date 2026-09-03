import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  CustomerSchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  OrderSchema,
  PartnerSchema,
  SpotReservationSchema,
  WaitingListSchema,
  WaitingListEntrySchema,
} from '../../infra/db/schemas';
import { UnitOfWorkMikroOrm } from '../../../common/infra/unit-of-work-mikro-orm';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { ApplicationService } from '../../../common/application/application.service';
import { PartnerMysqlRepository } from '../../infra/db/repositories/partner-mysql.repository';
import { CustomerMysqlRepository } from '../../infra/db/repositories/customer-mysql.repository';
import { EventMysqlRepository } from '../../infra/db/repositories/event-mysql.repository';
import { OrderMysqlRepository } from '../../infra/db/repositories/order-mysql.repository';
import { SpotReservationMysqlRepository } from '../../infra/db/repositories/spot-reservation-mysql.repository';
import { WaitingListMysqlRepository } from '../../infra/db/repositories/waiting-list-mysql.repository';
import { Partner } from '../../domain/entities/partner.entity';
import { Customer } from '../../domain/entities/customer.entity';
import { Order, OrderStatus } from '../../domain/entities/order.entity';
import { SpotReservation } from '../../domain/entities/spot-reservation.entity';
import { WaitingListEntryStatus } from '../../domain/entities/waiting-list-entry.entity';
import { OrderCancelledHandler } from '../handlers/order-cancelled.handler';
import { EventSpotReleasedHandler } from '../handlers/event-spot-released.handler';
import { SpotOfferedToWaitingCustomer } from '../../domain/events/domain-events/spot-offered-to-waiting-customer.event';
import { SpotOfferedToWaitingCustomerIntegrationEvent } from '../../domain/events/integration-events/spot-offered-to-waiting-customer.int-events';
import { OrderService } from '../order.service';
import { WaitingListService } from '../waiting-list.service';

test('fluxo de ponta a ponta: um único cancelamento libera o lugar e notifica o primeiro da fila', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [
      PartnerSchema,
      CustomerSchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
      OrderSchema,
      SpotReservationSchema,
      WaitingListSchema,
      WaitingListEntrySchema,
    ],
    dbName: 'events',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();

  const uow = new UnitOfWorkMikroOrm(em);
  const domainEventManager = new DomainEventManager();
  const applicationService = new ApplicationService(uow, domainEventManager);

  const partnerRepo = new PartnerMysqlRepository(em);
  const customerRepo = new CustomerMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);
  const orderRepo = new OrderMysqlRepository(em);
  const spotReservationRepo = new SpotReservationMysqlRepository(em);
  const waitingListRepo = new WaitingListMysqlRepository(em);

  // reproduz em teste o que o EventsModule.onModuleInit faz
  const orderCancelledHandler = new OrderCancelledHandler(
    eventRepo,
    spotReservationRepo,
    domainEventManager,
  );
  const eventSpotReleasedHandler = new EventSpotReleasedHandler(
    waitingListRepo,
    domainEventManager,
  );
  OrderCancelledHandler.listensTo().forEach((name) =>
    domainEventManager.register(name, async (event) => {
      await orderCancelledHandler.handle(event);
    }),
  );
  EventSpotReleasedHandler.listensTo().forEach((name) =>
    domainEventManager.register(name, async (event) => {
      await eventSpotReleasedHandler.handle(event);
    }),
  );

  const integrationEvents: SpotOfferedToWaitingCustomerIntegrationEvent[] = [];
  domainEventManager.registerForIntegrationEvent(
    SpotOfferedToWaitingCustomer.name,
    async (domainEvent) => {
      integrationEvents.push(
        new SpotOfferedToWaitingCustomerIntegrationEvent(domainEvent),
      );
    },
  );

  // seed: parceiro, clientes A e B, evento com seção de 1 lugar
  const partner = Partner.create({ name: 'Partner 1' });
  await partnerRepo.add(partner);
  const customerA = Customer.create({ name: 'Customer A', cpf: '70375887091' });
  const customerB = Customer.create({ name: 'Customer B', cpf: '59211087074' });
  await customerRepo.add(customerA);
  await customerRepo.add(customerB);

  const event = partner.initEvent({
    name: 'Event 1',
    description: 'Event 1',
    date: new Date(),
  });
  event.addSection({
    name: 'Section 1',
    description: 'Section 1',
    price: 100,
    total_spots: 1,
  });
  event.publishAll();
  await eventRepo.add(event);
  await em.flush();

  const section = event.sections[0];
  const spot = section.spots[0];
  const sectionId = section.id;
  const spotId = spot.id;

  // cliente A compra o único lugar (estado pós-compra: seção esgota)
  const reservation = SpotReservation.create({
    spot_id: spotId,
    customer_id: customerA.id,
  });
  await spotReservationRepo.add(reservation);
  event.markSpotAsReserved({ section_id: sectionId, spot_id: spotId });
  await eventRepo.add(event);
  const order = Order.create({
    customer_id: customerA.id,
    event_spot_id: spotId,
    amount: 100,
  });
  order.pay();
  await orderRepo.add(order);
  await em.flush();
  em.clear();

  // cliente B entra na fila da seção esgotada
  const waitingListService = new WaitingListService(
    customerRepo,
    eventRepo,
    waitingListRepo,
    applicationService,
  );
  await waitingListService.joinWaitingList({
    event_id: event.id.value,
    section_id: sectionId.value,
    customer_id: customerB.id.value,
  });
  em.clear();

  // O ÚNICO COMANDO: cancelar o pedido do cliente A
  const orderService = new OrderService(
    orderRepo,
    customerRepo,
    eventRepo,
    spotReservationRepo,
    uow,
    null,
    applicationService,
  );
  await orderService.cancel({ order_id: order.id.value });
  em.clear();

  // 1) o lugar voltou a ficar disponível
  const reloadedEvent = await eventRepo.findById(event.id.value);
  const reloadedSpot = reloadedEvent.sections[0].spots.find((s) =>
    s.id.equals(spotId),
  );
  expect(reloadedSpot.is_reserved).toBe(false);

  // 2) a SpotReservation não existe mais
  const reloadedReservation = await spotReservationRepo.findById(spotId);
  expect(reloadedReservation).toBeNull();

  // 3) a primeira entrada da fila está NOTIFIED
  const reloadedWaitingList = await waitingListRepo.findByEventAndSection(
    event.id,
    sectionId,
  );
  const entries = reloadedWaitingList.toJSON().entries;
  expect(entries).toHaveLength(1);
  expect(entries[0].customer_id).toBe(customerB.id.value);
  expect(entries[0].status).toBe(WaitingListEntryStatus.NOTIFIED);

  // o pedido está cancelado
  const reloadedOrder = await orderRepo.findById(order.id.value);
  expect(reloadedOrder.status).toBe(OrderStatus.CANCELLED);

  // o evento de integração atravessou a fronteira
  expect(integrationEvents).toHaveLength(1);
  expect(integrationEvents[0].event_name).toBe(
    'SpotOfferedToWaitingCustomerIntegrationEvent',
  );
  expect(integrationEvents[0].payload.customer_id).toBe(customerB.id.value);
  expect(integrationEvents[0].payload.section_id).toBe(sectionId.value);
  expect(integrationEvents[0].payload.spot_id).toBe(spotId.value);

  await orm.close();
});
