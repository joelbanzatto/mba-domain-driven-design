import { ApplicationService } from '../../common/application/application.service';
import { CustomerId } from '../domain/entities/customer.entity';
import { EventSectionId } from '../domain/entities/event-section';
import { EventId } from '../domain/entities/event.entity';
import { WaitingList } from '../domain/entities/waiting-list.entity';
import { ICustomerRepository } from '../domain/repositories/customer-repository.interface';
import { IEventRepository } from '../domain/repositories/event-repository.interface';
import { IWaitingListRepository } from '../domain/repositories/waiting-list-repository.interface';

export class WaitingListService {
  constructor(
    private customerRepo: ICustomerRepository,
    private eventRepo: IEventRepository,
    private waitingListRepo: IWaitingListRepository,
    private applicationService: ApplicationService,
  ) {}

  async joinWaitingList(input: {
    event_id: string;
    section_id: string;
    customer_id: string;
  }) {
    return this.applicationService.run(async () => {
      const customer = await this.customerRepo.findById(input.customer_id);
      if (!customer) {
        throw new Error('Customer not found');
      }

      const event = await this.eventRepo.findById(input.event_id);
      if (!event) {
        throw new Error('Event not found');
      }

      const sectionId = new EventSectionId(input.section_id);
      const section = event.sections.find((s) => s.id.equals(sectionId));
      if (!section) {
        throw new Error('Section not found');
      }

      // a seção está esgotada quando nenhum lugar dela está disponível para
      // reserva. Deriva da disponibilidade dos lugares, nunca do contador.
      const hasAvailableSpot = [...section.spots].some(
        (spot) => !spot.is_reserved && spot.is_published,
      );
      if (hasAvailableSpot) {
        throw new Error('Section is not sold out');
      }

      const eventId = new EventId(input.event_id);
      let waitingList = await this.waitingListRepo.findByEventAndSection(
        eventId,
        sectionId,
      );

      if (!waitingList) {
        waitingList = WaitingList.create({
          event_id: eventId,
          section_id: sectionId,
        });
      }

      const entry = waitingList.addEntry(new CustomerId(input.customer_id));
      await this.waitingListRepo.add(waitingList);

      return {
        ...entry.toJSON(),
        event_id: waitingList.event_id.value,
        section_id: waitingList.section_id.value,
      };
    });
  }

  async listWaitingList(input: { event_id: string; section_id: string }) {
    const waitingList = await this.waitingListRepo.findByEventAndSection(
      new EventId(input.event_id),
      new EventSectionId(input.section_id),
    );

    return waitingList ? waitingList.toJSON().entries : [];
  }
}
