import {ApisauceInstance} from 'apisauce';
import {BrokerageClient, OrderTypes, SnapShotFields, Snapshot} from '../brokerage-client';
import {getUncheckedIBKRApi} from './api';
import {initiateApiSessionWithTickling} from './tickle';
import { getNextRandomAskPrice } from '../../../utils/askPriceSimulator';
import { SnapshotResponse } from './types';
import { getSnapshotFromResponse, isSnapshotResponseWithAllFields } from './snapshot';

export class IBKRClient extends BrokerageClient {
  protected orderTypes = {
    [OrderTypes.LIMIT]: 'LMT',
  };

  protected snapshotFields = {
    [SnapShotFields.bid]: '84',
    [SnapShotFields.ask]: '86',
    [SnapShotFields.last]: '31',
  };

  protected sessionId!: string;

  protected async getApi(): Promise<ApisauceInstance> {
    if (!this.sessionId) {
      await this.initiateBrokerageApiConnection();
    }

    return getUncheckedIBKRApi();
  }

  protected async initiateBrokerageApiConnection(): Promise<void> {
    this.sessionId = await initiateApiSessionWithTickling();
  }

  async getSnapshot(conid: string): Promise<Snapshot> {
    // IBKR Docs require that snapshot requests are preceeded by an accounts request.
    await (await this.getApi()).get('/iserver/accounts');

    return this.getSnapshotAfterAccountsRequestIsDone(conid);
  }

  private async getSnapshotAfterAccountsRequestIsDone(conid: string): Promise<Snapshot> {
    const fields = Object.values(this.snapshotFields);

    const response = (await (await this.getApi()).get<SnapshotResponse[]>('/iserver/marketdata/snapshot', {
      conids: conid,
      fields: Object.values(this.snapshotFields).join(','),
    }));
    const snapshotResponse = response.data![0];

    if (isSnapshotResponseWithAllFields(snapshotResponse, fields)) {
      return getSnapshotFromResponse(snapshotResponse, this.snapshotFields);
    }
      
    return await this.getSnapshotAfterAccountsRequestIsDone(conid);
  }
}
