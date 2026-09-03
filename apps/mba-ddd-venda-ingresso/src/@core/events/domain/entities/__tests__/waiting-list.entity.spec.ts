import { MikroORM } from '@mikro-orm/core';
import { CustomerId } from '../customer.entity';
import { EventId } from '../event.entity';
import { EventSectionId } from '../event-section';
import { EventSpotId } from '../event-spot';
import { WaitingList } from '../waiting-list.entity';
import { WaitingListEntryStatus } from '../waiting-list-entry.entity';
import { CustomerJoinedWaitingList } from '../../events/domain-events/customer-joined-waiting-list.event';
import { SpotOfferedToWaitingCustomer } from '../../events/domain-events/spot-offered-to-waiting-customer.event';
import {
  WaitingListSchema,
  WaitingListEntrySchema,
} from '../../../infra/db/schemas';

describe('WaitingList Entity Unit Tests', () => {
  beforeAll(async () => {
    await MikroORM.init(
      {
        allowGlobalContext: true,
        entities: [WaitingListSchema, WaitingListEntrySchema],
        type: 'mysql',
        dbName: 'fake',
      },
      false,
    );
  });

  const makeWaitingList = () =>
    WaitingList.create({
      event_id: new EventId(),
      section_id: new EventSectionId(),
    });

  test('deve adicionar uma entrada PENDING e registrar CustomerJoinedWaitingList', () => {
    const waitingList = makeWaitingList();
    const customerId = new CustomerId();

    const entry = waitingList.addEntry(customerId);

    expect(entry.status).toBe(WaitingListEntryStatus.PENDING);
    expect(waitingList.entries.size).toBe(1);

    const joined = [...waitingList.events].find(
      (e) => e instanceof CustomerJoinedWaitingList,
    ) as CustomerJoinedWaitingList;
    expect(joined).toBeInstanceOf(CustomerJoinedWaitingList);
    expect(joined.customer_id.equals(customerId)).toBe(true);
  });

  test('não deve permitir o mesmo cliente com entrada PENDING duplicada', () => {
    const waitingList = makeWaitingList();
    const customerId = new CustomerId();
    waitingList.addEntry(customerId);

    expect(() => waitingList.addEntry(customerId)).toThrow(
      'Customer already in waiting list',
    );
  });

  test('deve promover a primeira entrada para NOTIFIED e registrar SpotOfferedToWaitingCustomer', () => {
    const waitingList = makeWaitingList();
    const first = new CustomerId();
    const second = new CustomerId();
    waitingList.addEntry(first);
    waitingList.addEntry(second);
    const spotId = new EventSpotId();

    const promoted = waitingList.offerSpotToNext(spotId);

    expect(promoted.customer_id.equals(first)).toBe(true);
    expect(promoted.status).toBe(WaitingListEntryStatus.NOTIFIED);

    const offered = [...waitingList.events].find(
      (e) => e instanceof SpotOfferedToWaitingCustomer,
    ) as SpotOfferedToWaitingCustomer;
    expect(offered).toBeInstanceOf(SpotOfferedToWaitingCustomer);
    expect(offered.customer_id.equals(first)).toBe(true);
    expect(offered.spot_id.equals(spotId)).toBe(true);

    // a segunda entrada continua PENDING
    const stillPending = waitingList.entries.find((e) =>
      e.customer_id.equals(second),
    );
    expect(stillPending.status).toBe(WaitingListEntryStatus.PENDING);
  });

  test('notificar sem entrada pendente não faz nada', () => {
    const waitingList = makeWaitingList();

    const result = waitingList.offerSpotToNext(new EventSpotId());

    expect(result).toBeNull();
    const offered = [...waitingList.events].find(
      (e) => e instanceof SpotOfferedToWaitingCustomer,
    );
    expect(offered).toBeUndefined();
  });

  test('uma entrada NOTIFIED não é notificada de novo', () => {
    const waitingList = makeWaitingList();
    waitingList.addEntry(new CustomerId());

    waitingList.offerSpotToNext(new EventSpotId());
    // não há mais entrada pendente
    const second = waitingList.offerSpotToNext(new EventSpotId());

    expect(second).toBeNull();
    const offeredEvents = [...waitingList.events].filter(
      (e) => e instanceof SpotOfferedToWaitingCustomer,
    );
    expect(offeredEvents).toHaveLength(1);
  });
});
