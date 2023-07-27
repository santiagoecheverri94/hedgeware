import {ApisauceInstance} from 'apisauce';

export abstract class BrokerageClient {
  protected abstract orderTypes: {[type in OrderTypes]: string};
  protected abstract snapshotFields: {[field in SnapShotFields]: string};

  protected abstract getApi(): Promise<ApisauceInstance>
  protected abstract initiateBrokerageApiConnection(): void;

  abstract getSnapshot(brokerageId: string): Promise<Snapshot>;
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
