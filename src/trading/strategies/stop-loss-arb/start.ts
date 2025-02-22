import {syncWriteJSONFile, jsonPrettyPrint} from '../../../utils/file';
import {
    isLiveTrading,
    isHistoricalSnapshot,
    isHistoricalSnapshotsExhausted,
    isRandomSnapshot,
} from '../../../utils/price-simulator';
import {isMarketOpen} from '../../../utils/time';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {BrokerageClient} from '../../brokerage-clients/brokerage-client';
import {reconcileStockPosition} from './algo';
import {debugRandomPrices} from './debug';
import {getStocksFileNames, getStockStates, getStockStateFilePath} from './state';
import {StockState} from './types';
import {setTimeout} from 'node:timers/promises';

const brokerageClient = new IBKRClient();

export async function startStopLossArb(): Promise<void> {
    // TODO: test this, and if it works, introduce the cpp version depending on env variable

    const stocks = await getStocksFileNames();
    const states = await getStockStates(stocks);
    await startStopLossArbNode(stocks, states);
}

async function startStopLossArbNode(stocks: string[], states: { [stock: string]: StockState }): Promise<void> {
    // let userHasInterrupted = false;
    // if (isLiveTrading()) {
    //   onUserInterrupt(() => {
    //     userHasInterrupted = true;
    //   });
    // }

    const waitingForStocksToBeHedged: Promise<void>[] = [];
    for (const stock of stocks) {
        waitingForStocksToBeHedged.push(hedgeStockWhileMarketIsOpen(stock, states, brokerageClient));
    }

    await Promise.all(waitingForStocksToBeHedged);

    for (const stock of Object.keys(states).sort()) {
        console.log(`${stock}, tradingCosts: $${states[stock].tradingCosts}\n`);
    }
}

const addon = require('bindings')('deephedge');

async function hedgeStockWhileMarketIsOpen(
    stock: string,
    states: { [stock: string]: StockState },
    brokerageClient: BrokerageClient,
) {
    if (process.env.CPP_NODE_ADDON) {
        return addon.JsHedgeStockWhileMarketIsOpen(stock, states);
    }

    const originalStates = structuredClone(states);

    while (await isMarketOpen(stock)) {
        const stockState = states[stock];

        const snapshot = await reconcileStockPosition(stock, stockState, brokerageClient);

        if (isLiveTrading()) {
            await setTimeout(1000);
        } else if (isRandomSnapshot()) {
            debugRandomPrices(snapshot, stock, states, originalStates);
        } else if (isHistoricalSnapshot()) {
            if (isHistoricalSnapshotsExhausted(stock)) {
                syncWriteJSONFile(
                    getStockStateFilePath(stock),
                    jsonPrettyPrint(stockState),
                );
                break;
            }
        }
    }
}
