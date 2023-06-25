import {ApiResponse, create} from 'apisauce'
import {Agent as HttpsAgent} from 'node:https'
import moment from 'moment'

import {BrokerageClient} from '../brokerage-client'
import {MINUTE_IN_MILLISECONDS} from '../constants'
import {TickleResponse} from './ibkr-types'

export class IBKRClient implements BrokerageClient {
  // move this to a base, abstract class

  api = create({
    baseURL: 'https://localhost:5000/v1/api',
    headers: {Accept: 'application/json'},
    httpsAgent: new HttpsAgent({
      rejectUnauthorized: false,
    }),
  }); // obtaining this api must be an async operation to do throtling

  log(msg: string): void {
    console.log(`\r\n${moment().format('MM-DD-YYYY')} at ${moment().format('hh:mma')} : ${msg}\r\n`)
  }

  // ---------------------------------------

  sessionId!: string;

  stopSystem!: (errorMsg: string) => void;

  constructor(stopSytem: (errorMsg: string) => void = (errorMsg: string) => {
    throw new Error(errorMsg)
  }) {
    this.stopSystem = stopSytem

    this.tickleApiGateway().then(response => {
      if (response.status === 200 && response.data?.session && response.data?.iserver.authStatus.authenticated) {
        this.sessionId = response.data?.session
        this.log('Initiated connection with IBKR API Gateway.')
      } else {
        this.stopSystemDueToApiGatewayError('Unable to connect with IBKR API Gateway and save sessionId.')
      }
    })

    this.tickleApiGatewayEveryMinute()
  }

  async tickleApiGateway(): Promise<ApiResponse<TickleResponse, TickleResponse>> {
    return this.api.post<TickleResponse>('/tickle')
  }

  tickleApiGatewayEveryMinute(): void {
    setTimeout(async () => {
      const tickleResponse = await this.tickleApiGateway()

      if (tickleResponse.status !== 200) {
        this.stopSystemDueToApiGatewayError('Unable to tickle IBKR API Gateway.')
      }

      if (!tickleResponse.data?.iserver.authStatus.authenticated) {
        this.stopSystemDueToApiGatewayError('IBKR API Gateway became unauthenticated.')
      }

      this.log('Tickled IBKR Gateway successfully.')
      this.tickleApiGatewayEveryMinute()
    }, MINUTE_IN_MILLISECONDS)
  }

  stopSystemDueToApiGatewayError(errorMsg: string): void {
    this.reportApiGatewayError(errorMsg)
    this.stopSystem(errorMsg)
  }

  reportApiGatewayError(errorMsg: string): void {
    this.log(errorMsg)
  }
}
