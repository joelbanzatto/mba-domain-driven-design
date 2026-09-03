import { IDomainEventHandler } from '../../../common/application/domain-event-handler.interface';
import { DomainEventManager } from '../../../common/domain/domain-event-manager';
import { EventSpotReleased } from '../../domain/events/domain-events/event-spot-released.event';
import { IWaitingListRepository } from '../../domain/repositories/waiting-list-repository.interface';

export class EventSpotReleasedHandler implements IDomainEventHandler {
  constructor(
    private waitingListRepo: IWaitingListRepository,
    private domainEventManager: DomainEventManager,
  ) {}

  async handle(event: EventSpotReleased): Promise<void> {
    const waitingList = await this.waitingListRepo.findByEventAndSection(
      event.event_id,
      event.section_id,
    );

    // sem fila para a seção: a reação termina sem efeito e sem erro
    if (!waitingList) {
      return;
    }

    const offered = waitingList.offerSpotToNext(event.spot_id);
    // sem entrada pendente: nada a promover
    if (!offered) {
      return;
    }

    await this.waitingListRepo.add(waitingList);
    // publica tanto o evento de domínio quanto o de integração do agregado
    await this.domainEventManager.publish(waitingList);
    await this.domainEventManager.publishForIntegrationEvent(waitingList);
  }

  static listensTo(): string[] {
    return [EventSpotReleased.name];
  }
}
