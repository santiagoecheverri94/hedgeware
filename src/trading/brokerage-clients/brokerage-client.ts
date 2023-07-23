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
