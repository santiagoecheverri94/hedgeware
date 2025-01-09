import {syncWriteJSONFile, jsonPrettyPrint} from '../../../utils/file';
import {isLiveTrading, isHistoricalSnapshot, isHistoricalSnapshotsExhausted} from '../../../utils/price-simulator';
import {onUserInterrupt} from '../../../utils/system';
import {isMarketOpen} from '../../../utils/time';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {BrokerageClient} from '../../brokerage-clients/brokerage-client';
import {reconcileStockPosition} from './algo';
import {getStocksFileNames, getStockStates, getStockStateFilePath} from './state';
import {StockState} from './types';

const brokerageClient = new IBKRClient();

export async function startStopLossArb(): Promise<void> {
  const stocks = await getStocksFileNames();

  const states = await getStockStates(stocks);

  // let userHasInterrupted = false;
  // if (isLiveTrading()) {
  //   onUserInterrupt(() => {
  //     userHasInterrupted = true;
  //   });
  // }

  await Promise.all(stocks.map(stock => hedgeStockWhileMarketIsOpen(stock, states, brokerageClient)));

  for (const stock of Object.keys(states).sort()) {
    console.log(`${stock}, unrealizedValue: $${states[stock].unrealizedValue}\n`);
  }
}

async function hedgeStockWhileMarketIsOpen(stock: string, states: {[stock: string]: StockState}, brokerageClient: BrokerageClient) {
  while (await isMarketOpen(stock)) {
    const stockState = states[stock];

    await reconcileStockPosition(stock, stockState, brokerageClient);

    if (isHistoricalSnapshot()) {
      if (isHistoricalSnapshotsExhausted(stock)) {
        // syncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
        break;
      }
    }
  }
}
