import { Entity } from '../../../common/domain/entity';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerId } from './customer.entity';

export class WaitingListEntryId extends Uuid {}

export enum WaitingListEntryStatus {
  PENDING = 'PENDING',
  NOTIFIED = 'NOTIFIED',
}

export type WaitingListEntryConstructorProps = {
  id?: WaitingListEntryId | string;
  customer_id: CustomerId | string;
  status?: WaitingListEntryStatus;
  created_at?: Date;
};

export class WaitingListEntry extends Entity {
  id: WaitingListEntryId;
  customer_id: CustomerId;
  status: WaitingListEntryStatus;
  created_at: Date;

  constructor(props: WaitingListEntryConstructorProps) {
    super();
    this.id =
      typeof props.id === 'string'
        ? new WaitingListEntryId(props.id)
        : props.id ?? new WaitingListEntryId();
    this.customer_id =
      props.customer_id instanceof CustomerId
        ? props.customer_id
        : new CustomerId(props.customer_id);
    this.status = props.status ?? WaitingListEntryStatus.PENDING;
    this.created_at = props.created_at ?? new Date();
  }

  static create(props: { customer_id: CustomerId; created_at?: Date }) {
    return new WaitingListEntry({
      customer_id: props.customer_id,
      created_at: props.created_at,
    });
  }

  get is_pending(): boolean {
    return this.status === WaitingListEntryStatus.PENDING;
  }

  notify() {
    // uma entrada já notificada não é notificada de novo
    if (this.status === WaitingListEntryStatus.NOTIFIED) {
      return;
    }
    this.status = WaitingListEntryStatus.NOTIFIED;
  }

  toJSON() {
    return {
      id: this.id.value,
      customer_id: this.customer_id.value,
      status: this.status,
      created_at: this.created_at,
    };
  }
}
