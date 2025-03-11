import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {
    jsonPrettyPrint,
    readJSONFile,
    syncWriteJSONFile,
    syncRenameFile,
} from '../../../utils/file';
import {IntervalType, SmoothingInterval, StockState} from './types';
import {
    isHistoricalSnapshot,
} from '../../../utils/price-simulator';
import {getStockStateFilePath, getStocksFileNames} from './state';

export async function refreshHistoricalStates(): Promise<void> {
    if (!isHistoricalSnapshot()) {
        throw new Error(
            'Must be in historical snapshot mode to refresh historical states',
        );
    }

    const stocksFileNames = await getStocksFileNames();
    for (const fileName of stocksFileNames) {
        await createNewStockStateFromExisting(fileName);
    }
}

export async function createNewStockStateFromExisting(stock: string): Promise<void> {
    const filePath = getStockStateFilePath(`${stock}`);
    const partialStockState = await readJSONFile<StockState>(filePath);
    const newState = getFullStockState(partialStockState);

    syncWriteJSONFile(getStockStateFilePath(`${stock}`), jsonPrettyPrint(newState));
}

export function getFullStockState(partialStockState: StockState): StockState {
    const {
        brokerageId,
        brokerageTradingCostPerShare,
        sharesPerInterval,
        numContracts,
        targetPosition,
        intervalProfit,
        spaceBetweenIntervals,
        initialPrice,
        shiftIntervalsFromInitialPrice,
    } = partialStockState;

    const longIntervals: SmoothingInterval[] = getLongIntervalsAboveInitialPrice({
        initialPrice,
        targetPosition,
        intervalProfit,
        spaceBetweenIntervals,
        sharesPerInterval,
        SHIFT: shiftIntervalsFromInitialPrice,
    });

    const shortIntervals: SmoothingInterval[] = getShortIntervalsBelowInitialPrice({
        initialPrice,
        targetPosition,
        intervalProfit,
        spaceBetweenIntervals,
        sharesPerInterval,
        SHIFT: shiftIntervalsFromInitialPrice,
    });

    const newState: StockState = {
        isStaticIntervals: false,
        brokerageId,
        brokerageTradingCostPerShare,
        targetPosition,
        sharesPerInterval,
        spaceBetweenIntervals,
        intervalProfit,
        numContracts,
        initialPrice,
        shiftIntervalsFromInitialPrice,
        position: 0,
        lastAsk: 0,
        lastBid: 0,
        realizedPnL: 0,
        exitPnL: 0,
        exitPnLAsPercent: 0,
        maxMovingLossAsPercent: 0,
        intervals: [...longIntervals, ...shortIntervals],
        tradingLogs: [],
    };

    return newState;
}

function getLongIntervalsAboveInitialPrice({
    initialPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
    SHIFT,
}: {
    initialPrice: number;
    targetPosition: number;
    intervalProfit: number;
    spaceBetweenIntervals: number;
    sharesPerInterval: number;
    SHIFT: number;
}): SmoothingInterval[] {
    const intervals: SmoothingInterval[] = [];
    const numIntervals = targetPosition / sharesPerInterval;

    for (let index = 1; index <= numIntervals + 1; index++) {
        const spaceFromBaseInterval = fc.multiply(index + SHIFT, spaceBetweenIntervals);
        const sellPrice = fc.add(initialPrice, spaceFromBaseInterval);

        intervals.unshift({
            type: IntervalType.LONG,
            positionLimit: sharesPerInterval * index,
            SELL: {
                price: sellPrice,
                active: false,
                crossed: false,
                boughtAtPrice: Number.NaN,
            },
            BUY: {
                price: fc.subtract(sellPrice, intervalProfit),
                active: true,
                crossed: true,
            },
        });
    }

    return intervals;
}

function getShortIntervalsBelowInitialPrice({
    initialPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
    SHIFT,
}: {
    initialPrice: number;
    targetPosition: number;
    intervalProfit: number;
    spaceBetweenIntervals: number;
    sharesPerInterval: number;
    SHIFT: number;
}): SmoothingInterval[] {
    const intervals: SmoothingInterval[] = [];
    const numIntervals = targetPosition / sharesPerInterval;

    for (let index = 1; index <= numIntervals + 1; index++) {
        const spaceFromBaseInterval = fc.multiply(index + SHIFT, spaceBetweenIntervals);
        const buyPrice = fc.subtract(initialPrice, spaceFromBaseInterval);

        intervals.push({
            type: IntervalType.SHORT,
            positionLimit: -(sharesPerInterval * index),
            SELL: {
                price: fc.add(buyPrice, intervalProfit),
                active: true,
                crossed: true,
            },
            BUY: {
                price: buyPrice,
                active: false,
                crossed: false,
                soldAtPrice: Number.NaN,
            },
        });
    }

    return intervals;
}
