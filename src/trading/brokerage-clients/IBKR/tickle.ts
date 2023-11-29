import {ApiResponse} from 'apisauce';
import {TickleResponse} from './types';
import {getUncheckedIBKRApi} from './api';
import {setTimeout} from 'node:timers/promises';
import {stopSystem} from '../../../utils/system';
import {log} from '../../../utils/log';

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

  const response = await tickleApiGateway();

  if (response.status && response.status >= 400 && response.status < 500) {
    log('Failed due to our fault. Debugger will be triggered.');
    debugger;
    stopSystem('IBKR API Gateway tickle failed with 400.');
  }

  if (response.status && response.status >= 500 && response.status < 600) {
    log('Failed due to server error. Debugger will be triggered, and will try again in a minute.');
    // debugger;
  }

  if (response.data?.iserver.authStatus.authenticated === false) {
    debugger;
    stopSystem('IBKR API Gateway became unauthenticated.');
  }

  if (!response.data) {
    debugger;
    stopSystem('IBKR API Gateway tickle failed due to bad response.');
  }

  if (process.env.VERBOSE) {
    log('Tickled IBKR Gateway successfully.');
  }

  tickleApiGatewayEveryMinute();
}
