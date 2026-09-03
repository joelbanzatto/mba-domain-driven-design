import { IDomainEventHandler } from '../../../common/application/domain-event-handler.interface';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { OrderCancelled } from '../../domain/events/domain-events/order-cancelled.event';
import { IEventRepository } from '../../domain/repositories/event-repository.interface';
import { ISpotReservationRepository } from '../../domain/repositories/spot-reservation-repository.interface';

export class OrderCancelledHandler implements IDomainEventHandler {
  constructor(
    private eventRepo: IEventRepository,
    private spotReservationRepo: ISpotReservationRepository,
    private domainEventManager: DomainEventManager,
  ) {}

  async handle(event: OrderCancelled): Promise<void> {
    const spotId = event.event_spot_id;

    const eventAggregate = await this.eventRepo.findByEventSpotId(spotId);
    if (!eventAggregate) {
      return;
    }

    // o Event devolve o lugar e registra o EventSpotReleased
    eventAggregate.markSpotAsAvailable(spotId);

    // a trava de reserva daquele lugar deixa de existir
    const reservation = await this.spotReservationRepo.findById(spotId);
    if (reservation) {
      await this.spotReservationRepo.delete(reservation);
    }

    await this.eventRepo.add(eventAggregate);
    // eventos de agregados manipulados dentro de um handler não se publicam
    // sozinhos: publicamos os do Event para acordar a política da fila.
    await this.domainEventManager.publish(eventAggregate);
  }

  static listensTo(): string[] {
    return [OrderCancelled.name];
  }
}
