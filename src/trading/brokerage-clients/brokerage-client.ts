import {ApisauceInstance} from 'apisauce';
import {setSecurityPosition} from './commands/set-security-position';

export abstract class BrokerageClient {
  protected abstract orderTypes: {[type in OrderTypes]: string};
  protected abstract orderSides: {[side in OrderSides]: string};
  protected abstract orderStatus: {[status in OrderStatus]: string};
  protected abstract timesInForce: {[time in TimesInForce]: string};

  protected abstract snapshotFields: {[field in SnapShotFields]: string};

  protected abstract getApi(): Promise<ApisauceInstance>
  protected abstract initiateBrokerageApiConnection(): void;

  abstract getSnapshot(brokerageIdOfSecurity: string): Promise<Snapshot>;
  abstract placeOrder(orderDetails: OrderDetails): Promise<string>;
  abstract modifyOrder(orderId: string, orderDetails: OrderDetails): Promise<string>;
  abstract cancelOrder(orderId: string): Promise<void>;
  abstract getOrderStatus(orderId: string): Promise<OrderStatus>;
  abstract getPositionSize(brokerageIdOfSecurity: string): Promise<number>;

  async setSecurityPosition({
    brokerageIdOfSecurity,
    currentPosition,
    newPosition,
    snapshot,
  }: {
    brokerageIdOfSecurity: string,
    currentPosition: number,
    newPosition: number,
    snapshot: Snapshot,
  }): Promise<void> {
    return setSecurityPosition({
      brokerageClient: this,
      brokerageIdOfSecurity,
      newPosition,
      currentPosition,
      snapshot,
    });
  }
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
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderStatus {
  FILLED = 'FILLED',
  // Pending, Cancelled, etc.
}

export enum TimesInForce {
  DAY = 'DAY',
}

export interface OrderDetails {
  type: OrderTypes.LIMIT,
  brokerageIdOfSecurity: string;
  price: number,
  side: OrderSides;
  quantity: number;
  timeInForce: TimesInForce.DAY;
}
