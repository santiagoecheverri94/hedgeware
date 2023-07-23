import {ApisauceInstance} from 'apisauce';
import {BrokerageClient, Snapshot} from '../brokerage-client';
import {getUncheckedIBKRApi} from './api';
import {tickleApiGateway, isOkTickleResponse, tickleApiGatewayEveryMinute} from './tickle';
import {stopSystem, log} from '../../utils';

export class IBKRClient extends BrokerageClient {
  sessionId!: string;

  protected async getApi(): Promise<ApisauceInstance> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({} as any);
      }, 2000);
    });

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
  if (num < 0.1) return 4.11;  // probability 0.1
  if (num < 0.2) return 4.12; // probability 0.1
  if (num < 0.3) return 4.13; // probability 0.1
  if (num < 0.4) return 4.14;  // probability 0.1
  if (num < 0.5) return 4.15; // probability 0.1
  if (num < 0.6) return 4.16; // probability 0.1
  if (num < 0.7) return 4.17;  // probability 0.1
  if (num < 0.8) return 4.18; // probability 0.1
  if (num <= 1) return 4.19; // probability 0.2
  return 0;
}
