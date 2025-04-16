import {readJSONFile} from '../../../utils/file';
import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {
    isLiveTrading,
    isHistoricalSnapshot,
    isHistoricalSnapshotsExhausted,
    isRandomSnapshot,
    deleteHistoricalSnapshots,
    isHistoricalCppSnapshot,
} from '../../../utils/price-simulator';
import {isMarketOpen} from '../../../utils/time';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {BrokerageClient} from '../../brokerage-clients/brokerage-client';
import {reconcileStockPosition} from './algo';
import {debugRandomPrices, printPnLValues} from './debug';
import {getStocksFileNames, getStockStates, getHistoricalStockStates} from './state';
import {StockState} from './types';
import {setTimeout} from 'node:timers/promises';

const brokerageClient = new IBKRClient();

export async function startStopLossArb(): Promise<void> {
    if (isHistoricalSnapshot()) {
        if (isHistoricalCppSnapshot()) {
            const datesArrayCppPartitions = await getDatesArrayCppPartitions();
            // const datesArrayCppPartitions = [['2025-03-21']];

            for (const dates of datesArrayCppPartitions) {
                // We pass the dates to C++ in buckets to be run in parallel
                // TODO: make more efficient by passing less, but deeper buckets
                await runHistoricalDatesOnCpp(dates);
            }
        } else {
            const dates = ['2025-03-21'];

            for (const date of dates) {
                // We pass the dates sequentially when we stay in NodeJS
                const states = await getHistoricalStockStates(date);
                await startStopLossArbNode(states);
            }
        }
    } else {
        const stocks = await getStocksFileNames();
        const states = await getStockStates(stocks);

        await startStopLossArbNode(states);
    }
}

async function getDatesArrayCppPartitions(): Promise<string[][]> {
    const datesArray = await readJSONFile<string[][]>(`${process.cwd()}\\..\\deephedge\\historical-data-80\\cpp_historical_partitions.json`);

    return datesArray;
}

async function runHistoricalDatesOnCpp(dates: string[]): Promise<void> {
    const statesList: { [stock: string]: StockState }[] = [];

    for (const date of dates) {
        const states = await getHistoricalStockStates(date);
        statesList.push(states);
    }

    addon.JsStartStopLossArbCpp(statesList);
}

async function startStopLossArbNode(
    states: { [stock: string]: StockState },
): Promise<void> {
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

    const stocks = Object.keys(states).sort();

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

    for (const stock of stocks) {
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
                isHistoricalSnapshotsExhausted(stockState)
            ) {
                if (isHistoricalSnapshot()) {
                    deleteHistoricalSnapshots(stockState);
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

const LIVE_PROFIT_THRESHOLD = 0.5;
const LIVE_LOSS_THRESHOLD = -0.75;

function isExitPnlBeyondThresholds(stockState: StockState): boolean {
    if (isLiveTrading()) {
        if (fc.gte(stockState.exitPnLAsPercentage, LIVE_PROFIT_THRESHOLD)) {
            return true;
        }

        if (fc.lte(stockState.exitPnLAsPercentage, LIVE_LOSS_THRESHOLD)) {
            return true;
        }
    }

    return false;
}
