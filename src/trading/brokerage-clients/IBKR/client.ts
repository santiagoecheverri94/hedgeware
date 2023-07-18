import {ApisauceInstance} from 'apisauce';
import {BrokerageClient, log, stopSystem} from '../brokerage-client';
import {getIBKRApi} from './api';
import {tickleApiGateway, isOkTickleResponse, tickleApiGatewayEveryMinute} from './tickle';

export class IBKRClient implements BrokerageClient {
  sessionId!: string;

  private async getApi() {
    if (!this.sessionId) {
      await this.initiateBrokerageApiConnection();
    }

    return getIBKRApi();
  }

  async initiateBrokerageApiConnection(): Promise<void> {
    const tickleResponse = await tickleApiGateway();

    if (!isOkTickleResponse(tickleResponse)) {
      stopSystem('Unable to connect with IBKR API Gateway and save sessionId.');
    }

    this.sessionId = tickleResponse.data!.session;
    log('Initiated connection with IBKR API Gateway.');

    tickleApiGatewayEveryMinute();
  }

  async getSecuritySnapshot() {}
}
