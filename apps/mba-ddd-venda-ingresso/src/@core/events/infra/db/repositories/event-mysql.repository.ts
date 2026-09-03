import { EntityManager } from '@mikro-orm/mysql';
import { Event, EventId } from '../../../domain/entities/event.entity';
import { EventSpotId } from '../../../domain/entities/event-spot';
import { IEventRepository } from '../../../domain/repositories/event-repository.interface';

export class EventMysqlRepository implements IEventRepository {
  constructor(private entityManager: EntityManager) {}

  async add(entity: Event): Promise<void> {
    this.entityManager.persist(entity);
  }

  async findById(id: string | EventId): Promise<Event> {
    return this.entityManager.findOne(Event, {
      id: typeof id === 'string' ? new EventId(id) : id,
    });
  }

  async findAll(): Promise<Event[]> {
    return this.entityManager.find(Event, {});
  }

  async findByEventSpotId(spot_id: EventSpotId): Promise<Event | null> {
    // O pedido só conhece o spot; o Event é dono do spot através da cadeia
    // Event -> EventSection -> EventSpot. Atravessamos as seções e os lugares
    // (carregados de forma eager) para localizar o agregado dono.
    const events = await this.entityManager.find(Event, {});
    const event = events.find((ev) =>
      ev.sections.find((section) => section.hasSpot(spot_id)),
    );
    return event ?? null;
  }

  async delete(entity: Event): Promise<void> {
    await this.entityManager.remove(entity);
  }
}
