import {create} from 'apisauce'
import {Agent as httpsAgent} from 'node:https'
import moment from 'moment'

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

  constructor(stopSytem: () => void = () => {
    process.exit(1)
  }) {
    this.stopSystem = stopSytem

    this.tickleApiGateway().then(response => {
      if (response.status === 200 && response.data?.session && response.data?.iserver.authStatus.authenticated) {
        this.sessionId = response.data?.session
        this.log(`Initiated connection with IBKR API Gateway at ${moment().format('hh:mma on MM-DD-YYYY')}.`)
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

      if (tickleResponse.status !== 200) {
        this.stopSystemDueToApiGatewayError('Unable to tickle IBKR API Gateway.')
      }

      if (!tickleResponse.data?.iserver.authStatus.authenticated) {
        this.stopSystemDueToApiGatewayError(`IBKR API Gateway became unauthenticated at ${moment().format('hh:mma on MM-DD-YYYY')}.`)
      }

      this.log('Tickled IBKR Gateway successfully.')
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
