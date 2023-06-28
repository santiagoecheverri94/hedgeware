import {IBKRClient} from './IBKR/client';
import {BrokerageClient} from './brokerage-client';

export enum Brokerages {
  IBKR = 'IBKR',
  // Tradier = 'Tradier',
}

const singletons: {[brokerage in Brokerages]: BrokerageClient} = {
  [Brokerages.IBKR]: new IBKRClient(),
};

export function getBrokerageClient(brokerage: Brokerages): BrokerageClient {
  return singletons[brokerage];
}
