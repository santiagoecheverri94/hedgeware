import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {
    jsonPrettyPrint,
    readJSONFile,
    syncWriteJSONFile,
    syncRenameFile,
} from '../../../utils/file';
import {IntervalType, ProfitTracker, SmoothingInterval, StockState} from './types';
import {isHistoricalSnapshot} from '../../../utils/price-simulator';
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

export function getFullStockState(partial: StockState): StockState {
    const longIntervals: SmoothingInterval[] =
        getLongIntervalsAboveInitialPrice(partial);

    const shortIntervals: SmoothingInterval[] =
        getShortIntervalsBelowInitialPrice(partial);

    const newState: StockState = {
        date: partial.date,
        brokerageId: partial.brokerageId,
        brokerageTradingCostPerShare: partial.brokerageTradingCostPerShare,
        targetPosition: partial.targetPosition,
        sharesPerInterval: partial.sharesPerInterval,
        spaceBetweenIntervals: partial.spaceBetweenIntervals,
        intervalProfit: partial.intervalProfit,
        numContracts: partial.numContracts,
        initialPrice: partial.initialPrice,
        shiftIntervalsFromInitialPrice: partial.shiftIntervalsFromInitialPrice,
        isStaticIntervals: Boolean(partial.isStaticIntervals),
        position: 0,
        lastAsk: 0,
        lastBid: 0,
        realizedPnL: 0,
        exitPnL: 0,
        exitPnLAsPercentage: 0,
        maxMovingProfitAsPercentage: 0,
        maxMovingLossAsPercentage: 0,
        track1PercentageProfit: {} as ProfitTracker,
        track075PercentageProfit: {} as ProfitTracker,
        track05PercentageProfit: {} as ProfitTracker,
        track025PercentageProfit: {} as ProfitTracker,
        intervals: [...longIntervals, ...shortIntervals],
        tradingLogs: [],
    };

    return newState;
}

function getLongIntervalsAboveInitialPrice(partial: StockState): SmoothingInterval[] {
    const intervals: SmoothingInterval[] = [];
    const numIntervals = partial.targetPosition / partial.sharesPerInterval;

    for (let index = 1; index <= numIntervals + 1; index++) {
        const spaceFromBaseInterval = fc.multiply(
            index + partial.shiftIntervalsFromInitialPrice,
            partial.spaceBetweenIntervals,
        );
        const sellPrice = fc.add(partial.initialPrice, spaceFromBaseInterval);

        intervals.unshift({
            type: IntervalType.LONG,
            positionLimit: partial.sharesPerInterval * index,
            SELL: {
                price: sellPrice,
                active: false,
                crossed: false,
                boughtAtPrice: Number.NaN,
            },
            BUY: {
                price: fc.subtract(sellPrice, partial.intervalProfit),
                active: true,
                crossed: true,
            },
        });
    }

    return intervals;
}

function getShortIntervalsBelowInitialPrice(partial: StockState): SmoothingInterval[] {
    const intervals: SmoothingInterval[] = [];
    const numIntervals = partial.targetPosition / partial.sharesPerInterval;

    for (let index = 1; index <= numIntervals + 1; index++) {
        const spaceFromBaseInterval = fc.multiply(
            index + partial.shiftIntervalsFromInitialPrice,
            partial.spaceBetweenIntervals,
        );
        const buyPrice = fc.subtract(partial.initialPrice, spaceFromBaseInterval);

        intervals.push({
            type: IntervalType.SHORT,
            positionLimit: -(partial.sharesPerInterval * index),
            SELL: {
                price: fc.add(buyPrice, partial.intervalProfit),
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
