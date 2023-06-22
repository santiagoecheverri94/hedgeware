import {create} from 'apisauce'
import {Agent as httpsAgent} from 'node:https'

import {BrokerageClient} from '../BrokerageClient'
import {MINUTE_IN_MILLISECONDS} from '../constants'
import {TickleResponse} from './IBKRTypes'

export class IBKRClient implements BrokerageClient {
  // move this to a base, abstract class

  api = create({
    baseURL: 'https://localhost:5000/v1/api',
    headers: {Accept: 'application/json'},
    httpsAgent: new httpsAgent({
      rejectUnauthorized: false,
    }),
  }); // obtaining this api must be an async operation to do throtling

  log(msg: string) {
    console.log(`\r\n${msg}\r\n`)
  }

  // ---------------------------------------

  sessionId!: string;

  stopSystem!: () => void;

  constructor(stopSytem: () => void) {
    this.stopSystem = stopSytem
    this.tickleApiGateway().then(response => {
      if (response.status === 200 && response.data?.session) {
        this.sessionId = response.data?.session
        this.log('Initiated connection with IBKR API Gateway and saved sessionId.')
      } else {
        this.stopSystemDueToApiGatewayError('Unable to connect with IBKR API Gateway and save sessionId.')
      }
    })
    this.tickleApiGatewayEveryMinute()
  }

  tickleApiGateway() {
    return this.api.post<TickleResponse>('/tickle')
  }

  tickleApiGatewayEveryMinute() {
    setTimeout(async () => {
      const tickleResponse = await this.tickleApiGateway()

      if (tickleResponse.status === 200) {
        this.log('Tickled IBKR Gateway successfully.')
      } else {
        this.stopSystemDueToApiGatewayError('Unable to tickle IBKR API Gateway.')
      }

      this.tickleApiGatewayEveryMinute()
    }, MINUTE_IN_MILLISECONDS)
  }

  stopSystemDueToApiGatewayError(errorMsg: string) {
    this.reportApiGatewayError(errorMsg)
    this.stopSystem()
  }

  reportApiGatewayError(errorMsg: string) {
    this.log(errorMsg)
  }
}
