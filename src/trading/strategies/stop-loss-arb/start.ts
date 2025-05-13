import path from 'node:path';
import {readJSONFile} from '../../../utils/file';
import {
    isLiveTrading,
    isHistoricalSnapshot,
    isHistoricalSnapshotsExhausted,
    isRandomSnapshot,
    deleteHistoricalSnapshots,
    isHistoricalCppSnapshot,
    INITIAL_RANDOM_PRICE,
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
    getInitialStockState,
} from './state';
import {StockState} from './types';
import {setTimeout} from 'node:timers/promises';

export async function startStopLossArb(): Promise<void> {
    const partialStockState: Partial<StockState> = {
        isStaticIntervals: false,
        profitThreshold: 0.5,
        lossThreshold: -0.75,
        brokerageTradingCostPerShare: 0, // otherwise 0.004,
        targetPosition: 100,
        sharesPerInterval: 50,
        intervalProfit: 0.05,
        spaceBetweenIntervals: 0.09,
    };

    const historicalPartialStockState: Partial<StockState> = {
        ...partialStockState,
        numContracts: 1,
    };

    if (isHistoricalSnapshot()) {
        const arrayOfDatesArrays = await getDatesArrayCppPartitions();
        // const arrayOfDatesArrays = [['2025-03-21']];
        // const arrayOfDatesArrays = [['2025-05-09']];

        const startDate = arrayOfDatesArrays[0][0];
        const lastDatesArray = arrayOfDatesArrays[arrayOfDatesArrays.length - 1];
        const endDate =
            arrayOfDatesArrays[arrayOfDatesArrays.length - 1][
                lastDatesArray.length - 1
            ];

        console.log(`Start date: ${startDate}, End date: ${endDate}`);

        if (isHistoricalCppSnapshot()) {
            addon.JsStartStopLossArbCpp(
                arrayOfDatesArrays,
                historicalPartialStockState,
            );
        } else {
            for (const arrayOfDates of arrayOfDatesArrays) {
                for (const date of arrayOfDates) {
                    // We pass the dates sequentially when we stay in NodeJS
                    const states = await getHistoricalStockStatesForDate(
                        date,
                        historicalPartialStockState,
                    );
                    await startStopLossArbNode(states, date);
                }
            }
        }

        console.log('Partial Stock State:', historicalPartialStockState);
    } else if (isLiveTrading()) {
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
    } else if (isRandomSnapshot()) {
        const datePlaceholder = 'YYYY-MM-DD';

        const states: { [stock: string]: StockState } = {
            RNDM: getInitialStockState(datePlaceholder, 'RNDM', INITIAL_RANDOM_PRICE, {
                isStaticIntervals: true,
                brokerageTradingCostPerShare: 0,
                targetPosition: 10,
                sharesPerInterval: 10,
                intervalProfit: 0.02,
                spaceBetweenIntervals: 0.04,
            }),
        };

        await startStopLossArbNode(states, datePlaceholder);
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

    let timeInMinutes = 0;
    if (isHistoricalSnapshot()) {
        const endTime = performance.now();
        timeInMinutes = (endTime - startTime) / 1000 / 60;
    }

    if (isHistoricalSnapshot()) {
        for (const stock of stocks) {
            printPnLValues(stock, states[stock]);
        }

        console.log(`Hedging completed in ${timeInMinutes.toFixed(4)} minutes\n`);
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
