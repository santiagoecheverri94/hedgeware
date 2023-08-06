import {ApisauceInstance} from 'apisauce';

export abstract class BrokerageClient {
  protected abstract orderTypes: {[type in OrderTypes]: string};
  protected abstract orderSides: {[side in OrderSides]: string};
  protected abstract timesInForce: {[time in TimesInForce]: string};

  protected abstract snapshotFields: {[field in SnapShotFields]: string};

  protected abstract getApi(): Promise<ApisauceInstance>
  protected abstract initiateBrokerageApiConnection(): void;

  abstract getSnapshot(brokerageId: string): Promise<Snapshot>;
  abstract placeOrder(orderDetails: OrderDetails): Promise<string>;
  abstract modifyOrder(orderId: string, orderDetails: OrderDetails): Promise<string>;
  abstract cancelOrder(orderId: string): Promise<void>;
}

export enum SnapShotFields {
  bid = 'bid',
  ask = 'ask',
  last = 'last',
}

export type Snapshot = {
  [field in SnapShotFields]: number
}

export enum OrderTypes {
  LIMIT = 'LIMIT',
}

export enum OrderSides {
  buy = 'buy',
  sell = 'sell',
}

export enum TimesInForce {
  day = 'day',
}

export interface OrderDetails {
  type: OrderTypes.LIMIT,
  brokerageIdOfTheSecurity: string;
  price: number,
  side: OrderSides;
  quantity: number;
  timeInForce: TimesInForce.day;
}
