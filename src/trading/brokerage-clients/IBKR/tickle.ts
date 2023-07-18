import {ApiResponse} from 'apisauce';
import {TickleResponse} from './types';
import {getIBKRApi} from './api';
import {log, stopSystem} from '../brokerage-client';

export async function tickleApiGateway(): Promise<ApiResponse<TickleResponse>> {
  const api = await getIBKRApi();
  return api.post<TickleResponse>('/tickle');
}

export function isOkTickleResponse(tickleResponse: ApiResponse<TickleResponse>): boolean {
  return Boolean(tickleResponse.status === 200 && tickleResponse.data?.session && tickleResponse.data?.iserver.authStatus.authenticated);
}

export function tickleApiGatewayEveryMinute(): void {
  const ONE_MINUTE = 60_000;
  setTimeout(async () => {
    const tickleResponse = await tickleApiGateway();

    if (tickleResponse.status !== 200) {
      stopSystem('Unable to tickle IBKR API Gateway.');
    }

    if (!tickleResponse.data?.iserver.authStatus.authenticated) {
      stopSystem('IBKR API Gateway became unauthenticated.');
    }

    log('Tickled IBKR Gateway successfully.');

    tickleApiGatewayEveryMinute();
  }, ONE_MINUTE);
}
