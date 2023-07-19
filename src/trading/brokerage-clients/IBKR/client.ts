import {ApisauceInstance} from 'apisauce';
import {BrokerageClient, log, stopSystem, Snapshot} from '../brokerage-client';
import {getUncheckedIBKRApi} from './api';
import {tickleApiGateway, isOkTickleResponse, tickleApiGatewayEveryMinute} from './tickle';

export class IBKRClient extends BrokerageClient {
  sessionId!: string;

  protected async getApi(): Promise<ApisauceInstance> {
    if (!this.sessionId) {
      await this.initiateBrokerageApiConnection();
    }

    return getUncheckedIBKRApi();
  }

  protected async initiateBrokerageApiConnection(): Promise<void> {
    const tickleResponse = await tickleApiGateway();

    if (!isOkTickleResponse(tickleResponse)) {
      stopSystem('Unable to connect with IBKR API Gateway and save sessionId.');
    }

    this.sessionId = tickleResponse.data!.session;
    log('Initiated connection with IBKR API Gateway.');

    tickleApiGatewayEveryMinute();
  }

  async getSnapshot(conid: string): Promise<Snapshot> {
    const api = await this.getApi();

    // const snapshotResponse = await api.post

    const snapshot: Snapshot = {
      bid: 0,
      ask: getRandom(),
      lastPrice: 0,
    };

    return snapshot;
  }
}

function getRandom(): number {
  const num = Math.random();
  if (num < 0.3) return 4.16;  // probability 0.3
  if (num < 0.6) return 4.15; // probability 0.3
  if (num <= 1) return 4.14; // probability 0.4
  return 0;
}
