import {ApisauceInstance} from 'apisauce';
import {setSecurityPosition} from './commands/set-security-position';

export abstract class BrokerageClient {
  protected abstract orderTypes: {[type in OrderTypes]: string};
  protected abstract orderSides: {[side in OrderSides]: string};
  protected abstract timesInForce: {[time in TimesInForce]: string};

  protected abstract snapshotFields: {[field in SnapShotFields]: string};

  protected abstract getApi(): Promise<ApisauceInstance>
  protected abstract initiateBrokerageApiConnection(): void;

  abstract getSnapshot(brokerageIdOfSecurity: string): Promise<Snapshot>;
  abstract placeOrder(orderDetails: OrderDetails): Promise<string>;
  abstract modifyOrder(orderId: string, orderDetails: OrderDetails): Promise<string>;
  abstract cancelOrder(orderId: string): Promise<void>;
  abstract getPositionSize(brokerageIdOfSecurity: string): Promise<number>;

  async setSecurityPosition(brokerageIdOfSecurity: string, newPosition: number): Promise<void> {
    return setSecurityPosition({
      brokerageClient: this,
      brokerageIdOfSecurity,
      newPosition,
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
  buy = 'buy',
  sell = 'sell',
}

export enum TimesInForce {
  day = 'day',
}

export interface OrderDetails {
  type: OrderTypes.LIMIT,
  brokerageIdOfSecurity: string;
  price: number,
  side: OrderSides;
  quantity: number;
  timeInForce: TimesInForce.day;
}
