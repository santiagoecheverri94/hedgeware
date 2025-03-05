import {syncWriteJSONFile, jsonPrettyPrint} from '../../../utils/file';
import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {
    isLiveTrading,
    isHistoricalSnapshot,
    isHistoricalSnapshotsExhausted,
    isRandomSnapshot,
    deleteHistoricalSnapshots,
} from '../../../utils/price-simulator';
import {isMarketOpen} from '../../../utils/time';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {BrokerageClient} from '../../brokerage-clients/brokerage-client';
import {reconcileStockPosition} from './algo';
import {debugRandomPrices, printPnLValues} from './debug';
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

async function startStopLossArbNode(
    stocks: string[],
    states: { [stock: string]: StockState },
): Promise<void> {
    debugger;
    if (process.env.CPP_NODE_ADDON) {
        return addon.JsStartStopLossArbCpp(stocks, states);
    }

    // let userHasInterrupted = false;
    // if (isLiveTrading()) {
    //   onUserInterrupt(() => {
    //     userHasInterrupted = true;
    //   });
    // }

    const waitingForStocksToBeHedged: Promise<void>[] = [];

    let startTime = 0;
    if (isHistoricalSnapshot()) {
        startTime = performance.now();
    }

    for (const stock of stocks) {
        waitingForStocksToBeHedged.push(
            hedgeStockWhileMarketIsOpen(stock, states, brokerageClient),
        );
    }

    await Promise.all(waitingForStocksToBeHedged);

    let timeInSeconds = 0;
    if (isHistoricalSnapshot()) {
        const endTime = performance.now();
        timeInSeconds = (endTime - startTime) / 1000;
    }

    for (const stock of Object.keys(states).sort()) {
        printPnLValues(stock, states[stock]);
    }

    if (isHistoricalSnapshot()) {
        console.log(`Hedging completed in ${timeInSeconds.toFixed(4)} seconds\n`);
    }
}

const addon = require('bindings')('deephedge');

async function hedgeStockWhileMarketIsOpen(
    stock: string,
    states: { [stock: string]: StockState },
    brokerageClient: BrokerageClient,
) {
    const originalStates = structuredClone(states);

    while (await isMarketOpen(stock)) {
        const stockState = states[stock];

        const snapshot = await reconcileStockPosition(
            stock,
            stockState,
            brokerageClient,
        );

        if (isLiveTrading() || isHistoricalSnapshot()) {
            if (
                isExitPnlBeyondThresholds(stockState) ||
                isHistoricalSnapshotsExhausted(stock)
            ) {
                if (isHistoricalSnapshot()) {
                    deleteHistoricalSnapshots(stock);
                }

                // syncWriteJSONFile(
                //     getStockStateFilePath(stock),
                //     jsonPrettyPrint(stockState),
                // );

                break;
            }
        }

        if (isLiveTrading()) {
            await setTimeout(1000);
        }

        if (isRandomSnapshot()) {
            debugRandomPrices(snapshot, stock, states, originalStates);
        }
    }
}

const LIVE_PROFIT_THRESHOLD = 0.005;
const LIVE_LOSS_THRESHOLD = Number.NEGATIVE_INFINITY; // TODO: Tbd

const HISTORICAL_PROFIT_THRESHOLD = Number.parseFloat(
    process.env.HISTORICAL_PROFIT_THRESHOLD || '0.01',
);

function isExitPnlBeyondThresholds(stockState: StockState): boolean {
    const exitPnLAsPercent = stockState.exitPnLAsPercent;

    if (isHistoricalSnapshot()) {
        if (fc.gte(exitPnLAsPercent, HISTORICAL_PROFIT_THRESHOLD)) {
            return true;
        }
    } else if (isLiveTrading()) {
        if (fc.gte(exitPnLAsPercent, LIVE_PROFIT_THRESHOLD)) {
            return true;
        }

        if (fc.lte(exitPnLAsPercent, LIVE_LOSS_THRESHOLD)) {
            return true;
        }
    }

    return false;
}
