import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {
    jsonPrettyPrint,
    readJSONFile,
    syncWriteJSONFile,
    syncRenameFile,
} from '../../../utils/file';
import {SmoothingInterval, StockState} from './types';
import {
    getHistoricalSnapshotStockAndStartAndEndDates,
    getSnapshotsForStockOnDate,
    isHistoricalSnapshot,
} from '../../../utils/price-simulator';
import {getStockStateFilePath, getStocksFileNames} from './state';

export async function renameHistoricalStates(newStock: string): Promise<void> {
    if (!isHistoricalSnapshot()) {
        throw new Error(
            'Must be in historical snapshot mode to rename historical states',
        );
    }

    const previousStocksFileNames = await getStocksFileNames(false);
    for (const prevFileName of previousStocksFileNames) {
        const {startDate, endDate} =
            getHistoricalSnapshotStockAndStartAndEndDates(prevFileName);
        const newFileName = `${newStock}__${startDate}_${endDate}`;

        await syncRenameFile(
            getStockStateFilePath(prevFileName),
            getStockStateFilePath(newFileName),
        );
    }
}

export async function refreshHistoricalStates(): Promise<void> {
    if (!isHistoricalSnapshot()) {
        throw new Error(
            'Must be in historical snapshot mode to refresh historical states',
        );
    }

    const stocksFileNames = await getStocksFileNames();
    for (const fileName of stocksFileNames) {
        const {stock, startDate} =
            getHistoricalSnapshotStockAndStartAndEndDates(fileName);
        const snapshotsForStockOnStartDate = await getSnapshotsForStockOnDate(
            stock,
            startDate,
        );
        const initialPrice = snapshotsForStockOnStartDate[0].ask;

        await createNewStockStateFromExisting(fileName);
    }
}

export async function createNewStockStateFromExisting(stock: string): Promise<void> {
    const filePath = getStockStateFilePath(`${stock}`);
    const partialStockState = await readJSONFile<StockState>(filePath);
    const newState = getFullStockState(partialStockState);

    syncWriteJSONFile(getStockStateFilePath(`${stock}`), jsonPrettyPrint(newState));
}

function getFullStockState(partialStockState: StockState): StockState {
    const {
        brokerageId,
        brokerageTradingCostPerShare,
        sharesPerInterval,
        numContracts,
        targetPosition,
        intervalProfit,
        spaceBetweenIntervals,
        callStrikePrice,
        initialPrice,
        putStrikePrice,
    } = partialStockState;

    const longIntervals: SmoothingInterval[] = getLongIntervalsAboveWithSellTail({
        callStrikePrice,
        targetPosition,
        intervalProfit,
        spaceBetweenIntervals,
        sharesPerInterval,
    });

    const shortIntervals: SmoothingInterval[] = getShortIntervalsBelowWithBuyHead({
        putStrikePrice,
        targetPosition,
        intervalProfit,
        spaceBetweenIntervals,
        sharesPerInterval,
    });

    const newState: StockState = {
        brokerageId,
        brokerageTradingCostPerShare,
        targetPosition,
        sharesPerInterval,
        spaceBetweenIntervals,
        intervalProfit,
        numContracts,
        callStrikePrice,
        initialPrice,
        putStrikePrice,
        position: 0,
        lastAsk: undefined,
        lastBid: undefined,
        tradingCosts: 0,
        intervals: [...longIntervals, ...shortIntervals],
        tradingLogs: [],
    };

    return newState;
}

function getLongIntervalsAboveWithSellTail({
    callStrikePrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
}: {
    callStrikePrice: number;
    targetPosition: number;
    intervalProfit: number;
    spaceBetweenIntervals: number;
    sharesPerInterval: number;
}): SmoothingInterval[] {
    const intervals: SmoothingInterval[] = [];
    const numIntervals = targetPosition / sharesPerInterval;

    const SHIFT = 3; // num extra positions above callStrikePrice
    for (let index = 0; index <= numIntervals; index++) {
        const spaceFromBaseInterval = fc.multiply(index + SHIFT, spaceBetweenIntervals);
        const sellPrice = fc.subtract(callStrikePrice, spaceFromBaseInterval);

        if (index !== numIntervals) {
            intervals.push({
                positionLimit: targetPosition - (sharesPerInterval * index),
                SELL: {
                    price: sellPrice,
                    active: false,
                    crossed: false,
                },
                BUY: {
                    price: fc.subtract(sellPrice, intervalProfit),
                    active: true,
                    crossed: true,
                },
            });
        } else {
            // SELL tail
            intervals.push({
                positionLimit: targetPosition - (sharesPerInterval * index),
                SELL: {
                    price: sellPrice,
                    active: true,
                    crossed: false,
                },
                BUY: {
                    price: fc.subtract(sellPrice, intervalProfit),
                    active: false,
                    crossed: false,
                },
            });
        }
    }

    return intervals;
}

function getShortIntervalsBelowWithBuyHead({
    putStrikePrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
}: {
    putStrikePrice: number;
    targetPosition: number;
    intervalProfit: number;
    spaceBetweenIntervals: number;
    sharesPerInterval: number;
}): SmoothingInterval[] {
    const intervals: SmoothingInterval[] = [];
    const numIntervals = targetPosition / sharesPerInterval;

    const SHIFT = 3; // num extra positions above putStrikePrice
    for (let index = 0; index <= numIntervals; index++) {
        const spaceFromBaseInterval = fc.multiply(index + SHIFT, spaceBetweenIntervals);
        const buyPrice = fc.add(putStrikePrice, spaceFromBaseInterval);

        if (index !== numIntervals) {
            intervals.unshift({
                positionLimit: -(targetPosition - (sharesPerInterval * index)),
                SELL: {
                    price: fc.add(buyPrice, intervalProfit),
                    active: true,
                    crossed: true,
                },
                BUY: {
                    price: buyPrice,
                    active: false,
                    crossed: false,
                },
            });
        } else {
            // BUY head
            intervals.unshift({
                positionLimit: -(targetPosition - (sharesPerInterval * index)),
                SELL: {
                    price: fc.add(buyPrice, intervalProfit),
                    active: false,
                    crossed: false,
                },
                BUY: {
                    price: buyPrice,
                    active: true,
                    crossed: false,
                },
            });
        }
    }

    return intervals;
}
