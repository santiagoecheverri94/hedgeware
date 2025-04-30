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
import {isTimeToTrade} from '../../../utils/time';
import {SchwabClient} from '../../brokerage-clients/Schwab/client';
import {BrokerageClient} from '../../brokerage-clients/brokerage-client';
import {
    reconcileRealizedPnlWhenHistoricalSnapshotsExhausted,
    reconcileStockPosition,
} from './algo';
import {debugRandomPrices, printPnLValues} from './debug';
import {
    getStocksFileNames,
    getStockStates,
    getHistoricalStockStates,
    writeLiveStockStates,
} from './state';
import {StockState} from './types';
import {setTimeout} from 'node:timers/promises';

export async function startStopLossArb(): Promise<void> {
    if (isHistoricalSnapshot()) {
        if (isHistoricalCppSnapshot()) {
            // const datesArrayCppPartitions = await getDatesArrayCppPartitions();
            const datesArrayCppPartitions = [['2025-03-21']];

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
                await startStopLossArbNode(states, date);
            }
        }
    } else {
        const today = getTodayDate();

        let brokerageClient: SchwabClient | undefined;
        if (isLiveTrading()) {
            await isTimeToTrade();

            brokerageClient = new SchwabClient();
            await brokerageClient.authenticate();
            await writeLiveStockStates(today, brokerageClient);
        }

        const stocks = await getStocksFileNames(today);
        const states = await getStockStates(stocks, today);

        await startStopLossArbNode(states, today, brokerageClient);
    }
}

function getTodayDate(): string {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todaysDate = `${yyyy}-${mm}-${dd}`;

    return todaysDate;
}

async function getDatesArrayCppPartitions(): Promise<string[][]> {
    const datesArray = await readJSONFile<string[][]>(
        `${process.cwd()}\\..\\deephedge\\historical-data\\cpp_historical_partitions.json`,
    );

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
    states: {
        [stock: string]: StockState;
    },
    date: string,
    brokerageClient?: BrokerageClient,
): Promise<boolean> {
    const waitingForStocksToBeHedged: Promise<void>[] = [];

    let startTime = 0;
    if (isHistoricalSnapshot()) {
        startTime = performance.now();
    }

    const stocks = Object.keys(states).sort();

    for (const stock of stocks) {
        waitingForStocksToBeHedged.push(
            hedgeStockWhileMarketIsOpen(stock, states, date, brokerageClient),
        );
    }

    await Promise.all(waitingForStocksToBeHedged);

    let timeInSeconds = 0;
    if (isHistoricalSnapshot()) {
        const endTime = performance.now();
        timeInSeconds = (endTime - startTime) / 1000;
    }

    if (isHistoricalSnapshot()) {
        for (const stock of stocks) {
            printPnLValues(stock, states[stock]);
        }

        console.log(`Hedging completed in ${timeInSeconds.toFixed(4)} seconds\n`);
    }

    return true;
}

const addon = require('bindings')('deephedge');

const kHedgingInterval = 29 * 1e3;

async function hedgeStockWhileMarketIsOpen(
    stock: string,
    states: { [stock: string]: StockState },
    date: string,
    brokerageClient?: BrokerageClient,
) {
    const originalStates = structuredClone(states);

    while (true) {
        const stockState = states[stock];

        let hedingIntervalTimer: Promise<void>;
        if (isLiveTrading()) {
            hedingIntervalTimer = setTimeout(kHedgingInterval);
        }

        // TODO: need to figure out how to deal with re-authentication issues
        const {snapshot, crossedThreshold} = await reconcileStockPosition(
            stock,
            stockState,
            date,
            brokerageClient,
        );

        if (isLiveTrading()) {
            if (crossedThreshold) {
                printPnLValues(stock, stockState);
                break;
            }

            await hedingIntervalTimer!;
        }

        if (isHistoricalSnapshot() && isHistoricalSnapshotsExhausted(stockState)) {
            reconcileRealizedPnlWhenHistoricalSnapshotsExhausted(stockState);
            deleteHistoricalSnapshots(stockState);
            break;
        }

        if (isRandomSnapshot()) {
            debugRandomPrices(snapshot, stock, states, originalStates);
        }
    }
}
