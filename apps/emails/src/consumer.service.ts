import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ConsumerService {
  @RabbitSubscribe({
    exchange: 'amq.direct',
    routingKey: 'PartnerCreatedIntegrationEvent',
    //routingKey: 'events.fullcycle.com/*',
    queue: 'emails',
  })
  handle(msg: { event_name: string; [key: string]: any }) {
    // switch(msg.event_name) {
    //     case 'PartnerCreatedIntegrationEvent':

    //     case 'PartnerUpdatedIntegrationEvent':
    // }
    console.log('ConsumerService.handle', msg);
  }

  @RabbitSubscribe({
    exchange: 'amq.direct',
    routingKey: 'SpotOfferedToWaitingCustomerIntegrationEvent',
    queue: 'emails',
  })
  handleSpotOfferedToWaitingCustomer(msg: {
    event_name: string;
    payload: {
      customer_id: string;
      event_id: string;
      section_id: string;
      spot_id: string;
    };
  }) {
    const { customer_id, section_id, spot_id } = msg.payload;
    console.log('ConsumerService.handleSpotOfferedToWaitingCustomer', {
      event_name: msg.event_name,
      message: `Abriu uma vaga: notificando o cliente ${customer_id} da seção ${section_id} (lugar ${spot_id})`,
      payload: msg.payload,
    });
  }
}
