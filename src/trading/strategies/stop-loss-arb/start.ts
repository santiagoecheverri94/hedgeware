import path from 'node:path';
import {readJSONFile} from '../../../utils/file';
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
    getHistoricalStockStatesForDate,
    writeLiveStockStatesBeforeTradingStart,
} from './state';
import {StockState} from './types';
import {setTimeout} from 'node:timers/promises';
import {FloatCalculator as fc} from '../../../utils/float-calculator';

export async function startStopLossArb(): Promise<void> {
    const intervalProfit = 0.02;
    const partialStockState: Partial<StockState> = {
        profitThreshold: 0.5,
        lossThreshold: -0.75,
        brokerageTradingCostPerShare: 0, // otherwise 0.004,
        numContracts: 4, // to achieve round lots
        targetPosition: 100,
        sharesPerInterval: 25,
        spaceBetweenIntervals: fc.multiply(intervalProfit, 2), // this also needs consideration
        intervalProfit,
    };

    if (isHistoricalSnapshot()) {
        const arrayOfDatesArrays = await getDatesArrayCppPartitions();

        if (isHistoricalCppSnapshot()) {
            addon.JsStartStopLossArbCpp(arrayOfDatesArrays, partialStockState);
        } else {
            for (const arrayOfDates of arrayOfDatesArrays) {
                for (const date of arrayOfDates) {
                    // We pass the dates sequentially when we stay in NodeJS
                    const states = await getHistoricalStockStatesForDate(
                        date,
                        partialStockState,
                    );
                    await startStopLossArbNode(states, date);
                }
            }
        }
    } else {
        const today = getTodayDate();

        let brokerageClient: BrokerageClient | undefined;
        if (isLiveTrading()) {
            await isTimeToTrade();

            brokerageClient = await SchwabClient.getInstance();
            await writeLiveStockStatesBeforeTradingStart(
                today,
                brokerageClient,
                partialStockState,
            );
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
    const partitionsPath = path.join(
        process.cwd(),
        '..',
        'deephedge',
        'historical-data',
        'cpp_historical_partitions.json',
    );
    const datesArray = await readJSONFile<string[][]>(partitionsPath);
    return datesArray;
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
