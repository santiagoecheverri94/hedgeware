import moment from 'moment';
import {ApisauceInstance} from 'apisauce';

export abstract class BrokerageClient {
  protected abstract getApi(): Promise<ApisauceInstance>
  protected abstract initiateBrokerageApiConnection(): void;

  abstract getSnapshot(brokerageId: string): Promise<Snapshot>;
}

export interface Snapshot {
  bid: number;
  ask: number;
  lastPrice: number;
}

export function log(msg: string): void {
  console.log(`\r\n${moment().format('MM-DD-YYYY')} at ${moment().format('hh:mma')} : ${msg}\r\n`);
}

export function stopSystem(errorMsg: string): void {
  throw new Error(errorMsg);
}
