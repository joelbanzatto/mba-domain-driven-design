import { Event } from '../event.entity';
import { EventSpotId } from '../event-spot';
import { PartnerId } from '../partner.entity';
import { EventSpotReleased } from '../../events/domain-events/event-spot-released.event';
import { initOrm } from './helpers';

describe('Event markSpotAsAvailable Unit Tests', () => {
  initOrm();

  const makePublishedEvent = () => {
    const event = Event.create({
      name: 'Evento 1',
      description: 'Descrição do evento 1',
      date: new Date(),
      partner_id: new PartnerId(),
    });
    event.addSection({
      name: 'Sessão 1',
      description: 'Descrição da sessão 1',
      total_spots: 1,
      price: 100,
    });
    event.publishAll();
    return event;
  };

  test('deve devolver o lugar e registrar EventSpotReleased com event_id, section_id e spot_id', () => {
    const event = makePublishedEvent();
    const [section] = event.sections;
    const [spot] = section.spots;

    event.markSpotAsReserved({ section_id: section.id, spot_id: spot.id });
    expect(spot.is_reserved).toBe(true);

    event.markSpotAsAvailable(spot.id);

    expect(spot.is_reserved).toBe(false);

    const released = [...event.events].find(
      (e) => e instanceof EventSpotReleased,
    ) as EventSpotReleased;
    expect(released).toBeInstanceOf(EventSpotReleased);
    expect(released.event_id.equals(event.id)).toBe(true);
    expect(released.section_id.equals(section.id)).toBe(true);
    expect(released.spot_id.equals(spot.id)).toBe(true);
  });

  test('deve lançar Spot not found quando o lugar não pertence ao evento', () => {
    const event = makePublishedEvent();

    expect(() => event.markSpotAsAvailable(new EventSpotId())).toThrow(
      'Spot not found',
    );
  });
});
