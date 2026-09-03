import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import { WaitingListSchema, WaitingListEntrySchema } from '../../schemas';
import { WaitingList } from '../../../../domain/entities/waiting-list.entity';
import { WaitingListEntryStatus } from '../../../../domain/entities/waiting-list-entry.entity';
import { CustomerId } from '../../../../domain/entities/customer.entity';
import { EventId } from '../../../../domain/entities/event.entity';
import { EventSectionId } from '../../../../domain/entities/event-section';
import { EventSpotId } from '../../../../domain/entities/event-spot';
import { WaitingListMysqlRepository } from '../waiting-list-mysql.repository';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('WaitingList repository - persiste, recarrega na ordem e busca por evento+seção', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [WaitingListSchema, WaitingListEntrySchema],
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
  const repo = new WaitingListMysqlRepository(em);

  const eventId = new EventId();
  const sectionId = new EventSectionId();
  const firstCustomer = new CustomerId();
  const secondCustomer = new CustomerId();

  const waitingList = WaitingList.create({
    event_id: eventId,
    section_id: sectionId,
  });
  waitingList.addEntry(firstCustomer);
  await delay(15); // garante ordem de chegada distinta (created_at)
  waitingList.addEntry(secondCustomer);

  await repo.add(waitingList);
  await em.flush();
  em.clear();

  const reloaded = await repo.findByEventAndSection(eventId, sectionId);
  expect(reloaded).not.toBeNull();
  expect(reloaded.id.equals(waitingList.id)).toBe(true);

  const entries = reloaded.toJSON().entries;
  expect(entries).toHaveLength(2);
  // recarregadas na ordem de chegada
  expect(entries[0].customer_id).toBe(firstCustomer.value);
  expect(entries[1].customer_id).toBe(secondCustomer.value);
  expect(entries[0].status).toBe(WaitingListEntryStatus.PENDING);
  expect(entries[1].status).toBe(WaitingListEntryStatus.PENDING);

  // promove a primeira entrada e confirma que o status persiste
  reloaded.offerSpotToNext(new EventSpotId());
  await repo.add(reloaded);
  await em.flush();
  em.clear();

  const afterPromotion = await repo.findByEventAndSection(eventId, sectionId);
  const promotedEntries = afterPromotion.toJSON().entries;
  expect(promotedEntries[0].customer_id).toBe(firstCustomer.value);
  expect(promotedEntries[0].status).toBe(WaitingListEntryStatus.NOTIFIED);
  expect(promotedEntries[1].status).toBe(WaitingListEntryStatus.PENDING);

  await orm.close();
});
