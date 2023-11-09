import {ApiResponse} from 'apisauce';
import {TickleResponse} from './types';
import {getUncheckedIBKRApi} from './api';
import {setTimeout} from 'node:timers/promises';
import { stopSystem } from '../../../utils/system';
import { log } from '../../../utils/log';

export async function initiateApiSessionWithTickling(): Promise<string> {
  const tickleResponse = await tickleApiGateway();

  if (!isOkTickleResponse(tickleResponse)) {
    stopSystem('Unable to connect with IBKR API Gateway and save sessionId.');
  }

  tickleApiGatewayEveryMinute();

  log('Initiated session with IBKR API Gateway tickling.');
  return tickleResponse.data!.session;
}

async function tickleApiGateway(): Promise<ApiResponse<TickleResponse>> {
  return (await getUncheckedIBKRApi()).post<TickleResponse>('/tickle');
}

function isOkTickleResponse(tickleResponse: ApiResponse<TickleResponse>): boolean {
  return Boolean(tickleResponse.status === 200 && tickleResponse.data?.session && tickleResponse.data?.iserver.authStatus.authenticated);
}

async function tickleApiGatewayEveryMinute(): Promise<void> {
  const ONE_MINUTE = 60_000;
  await setTimeout(ONE_MINUTE);

  const tickleResponse = await tickleApiGateway();

  if (tickleResponse.status !== 200) {
    stopSystem('Unable to tickle IBKR API Gateway.');
  }

  if (!tickleResponse.data?.iserver.authStatus.authenticated) {
    stopSystem('IBKR API Gateway became unauthenticated.');
  }

  if (process.env.VERBOSE) {
    log('Tickled IBKR Gateway successfully.');
  }

  tickleApiGatewayEveryMinute();
}
