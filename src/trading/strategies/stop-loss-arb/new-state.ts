import { FloatCalculations, doFloatCalculation } from "../../../utils/float-calculator";
import {
    jsonPrettyPrint,
    readJSONFile,
    syncWriteJSONFile,
    syncRenameFile,
} from "../../../utils/file";
import { IntervalTypes, SmoothingInterval, StockState } from "./types";
import {
    getHistoricalSnapshotStockAndStartAndEndDates,
    getSnapshotsForStockOnDate,
    isHistoricalSnapshot,
} from "../../../utils/price-simulator";
import { getStockStateFilePath, getStocksFileNames } from "./state";

export async function renameHistoricalStates(newStock: string): Promise<void> {
    if (!isHistoricalSnapshot()) {
        throw new Error(
            "Must be in historical snapshot mode to rename historical states"
        );
    }

    const previousStocksFileNames = await getStocksFileNames(false);
    for (const prevFileName of previousStocksFileNames) {
        const { startDate, endDate } =
            getHistoricalSnapshotStockAndStartAndEndDates(prevFileName);
        const newFileName = `${newStock}__${startDate}_${endDate}`;

        await syncRenameFile(
            getStockStateFilePath(prevFileName),
            getStockStateFilePath(newFileName)
        );
    }
}

export async function refreshHistoricalStates(
    isDynamicIntervals: boolean
): Promise<void> {
    if (!isHistoricalSnapshot()) {
        throw new Error(
            "Must be in historical snapshot mode to refresh historical states"
        );
    }

    const stocksFileNames = await getStocksFileNames();
    for (const fileName of stocksFileNames) {
        const { stock, startDate } =
            getHistoricalSnapshotStockAndStartAndEndDates(fileName);
        const snapshotsForStockOnStartDate = await getSnapshotsForStockOnDate(
            stock,
            startDate
        );
        const initialPrice = snapshotsForStockOnStartDate[0].ask;

        await createNewStockStateFromExisting(
            fileName,
            initialPrice,
            isDynamicIntervals
        );
    }
}

export async function createNewStockStateFromExisting(
    stock: string,
    initialPrice: number,
    isDynamicIntervals: boolean
): Promise<void> {
    const filePath = getStockStateFilePath(`${stock}`);
    const partialStockState = await readJSONFile<StockState>(filePath);
    const newState = getFullStockState(
        partialStockState,
        initialPrice,
        isDynamicIntervals
    );

    syncWriteJSONFile(getStockStateFilePath(`${stock}`), jsonPrettyPrint(newState));
}

function getFullStockState(
    partialStockState: StockState,
    initialPrice: number,
    isDynamicIntervals: boolean
): StockState {
    const {
        brokerageId,
        brokerageTradingCostPerShare,
        sharesPerInterval,
        numContracts,
        targetPosition,
        premiumSold,
        intervalProfit,
        spaceBetweenIntervals,
    } = partialStockState;

    // TODO: remove the following in a future iteration
    const lowerCallStrikePrice = Math.floor(initialPrice);
    const upperCallStrikePrice = lowerCallStrikePrice + 2;
    // const upperCallStrikePrice = Math.ceil(longIntervalsAbove[0].SELL.price);
    // const lowerCallStrikePrice = upperCallStrikePrice - 2;

    const longIntervalsAbove: SmoothingInterval[] = getLongIntervalsAbove({
        centralPrice: lowerCallStrikePrice,
        targetPosition,
        intervalProfit,
        spaceBetweenIntervals,
        sharesPerInterval,
    });

    const longIntervalsBelow: SmoothingInterval[] = getLongIntervalsBelow({
        centralPrice: lowerCallStrikePrice,
        targetPosition,
        intervalProfit,
        spaceBetweenIntervals,
        sharesPerInterval,
    });

    let totalPremiumSold = doFloatCalculation(
        FloatCalculations.subtract,
        initialPrice,
        lowerCallStrikePrice
    );
    totalPremiumSold = doFloatCalculation(
        FloatCalculations.add,
        totalPremiumSold,
        premiumSold
    );

    const newState: StockState = {
        brokerageId,
        brokerageTradingCostPerShare,
        targetPosition,
        sharesPerInterval,
        spaceBetweenIntervals,
        intervalProfit,
        numContracts,
        premiumSold,
        isDynamicIntervals,
        upperCallStrikePrice,
        initialPrice,
        lowerCallStrikePrice,
        position: 0,
        lastAsk: undefined,
        lastBid: undefined,
        transitoryValue: doFloatCalculation(
            FloatCalculations.multiply,
            totalPremiumSold,
            100
        ),
        unrealizedValue: doFloatCalculation(
            FloatCalculations.multiply,
            totalPremiumSold,
            100
        ),
        intervals: [...longIntervalsAbove, ...longIntervalsBelow],
        tradingLogs: [],
    };

    return newState;
}

function getLongIntervalsAbove({
    centralPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
}: {
    centralPrice: number;
    targetPosition: number;
    intervalProfit: number;
    spaceBetweenIntervals: number;
    sharesPerInterval: number;
}): SmoothingInterval[] {
    const basePrice = doFloatCalculation(
        FloatCalculations.add,
        centralPrice,
        getSpaceBetweenInitialPriceAndFirstInterval(
            spaceBetweenIntervals,
            intervalProfit
        )
    );
    const intervals: SmoothingInterval[] = [];
    const numIntervals = targetPosition / 2 / sharesPerInterval;

    let absoluteIndex = 0;
    for (let i = 1; i <= numIntervals; i++) {
        const spaceFromBaseInterval = doFloatCalculation(
            FloatCalculations.multiply,
            absoluteIndex,
            spaceBetweenIntervals
        );
        const buyPrice = doFloatCalculation(
            FloatCalculations.add,
            basePrice,
            spaceFromBaseInterval
        );

        intervals.unshift({
            type: IntervalTypes.LONG,
            positionLimit: sharesPerInterval * i + targetPosition / 2,
            SELL: {
                price: doFloatCalculation(
                    FloatCalculations.add,
                    buyPrice,
                    intervalProfit
                ),
                active: false,
                crossed: false,
            },
            BUY: {
                price: buyPrice,
                active: true,
                crossed: true,
            },
        });

        absoluteIndex++;
    }

    return intervals;
}

function getLongIntervalsBelow({
    centralPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
}: {
    centralPrice: number;
    targetPosition: number;
    intervalProfit: number;
    spaceBetweenIntervals: number;
    sharesPerInterval: number;
}): SmoothingInterval[] {
    const basePrice = doFloatCalculation(
        FloatCalculations.subtract,
        centralPrice,
        getSpaceBetweenInitialPriceAndFirstInterval(
            spaceBetweenIntervals,
            intervalProfit
        )
    );
    const intervals: SmoothingInterval[] = [];
    const numIntervals = targetPosition / 2 / sharesPerInterval;

    let absoluteIndex = 0;
    for (let i = numIntervals; i >= 1; i--) {
        const spaceFromBaseInterval = doFloatCalculation(
            FloatCalculations.multiply,
            absoluteIndex,
            spaceBetweenIntervals
        );
        const sellPrice = doFloatCalculation(
            FloatCalculations.subtract,
            basePrice,
            spaceFromBaseInterval
        );

        intervals.push({
            type: IntervalTypes.LONG,
            positionLimit: sharesPerInterval * i,
            SELL: {
                price: sellPrice,
                active: false,
                crossed: false,
            },
            BUY: {
                price: doFloatCalculation(
                    FloatCalculations.subtract,
                    sellPrice,
                    intervalProfit
                ),
                active: true,
                crossed: true,
            },
        });

        absoluteIndex++;
    }

    return intervals;
}

function getSpaceBetweenInitialPriceAndFirstInterval(
    spaceBetweenIntervals: number,
    intervalProfit: number
): number {
    return doFloatCalculation(
        FloatCalculations.divide,
        getSpaceBetweenOpposingBuySell(spaceBetweenIntervals, intervalProfit),
        2
    );
}

function getSpaceBetweenOpposingBuySell(
    spaceBetweenIntervals: number,
    intervalProfit: number
): number {
    return doFloatCalculation(
        FloatCalculations.subtract,
        spaceBetweenIntervals,
        intervalProfit
    );
}

function getLongIntervals({
    initialAskPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
}: {
    initialAskPrice: number;
    targetPosition: number;
    intervalProfit: number;
    spaceBetweenIntervals: number;
    sharesPerInterval: number;
}): SmoothingInterval[] {
    const basePrice = doFloatCalculation(
        FloatCalculations.add,
        initialAskPrice,
        getSpaceBetweenInitialPriceAndFirstInterval(
            spaceBetweenIntervals,
            intervalProfit
        )
    );
    const intervals: SmoothingInterval[] = [];
    const numIntervals = targetPosition / sharesPerInterval;

    let absoluteIndex = 0;
    for (let i = 0; i <= numIntervals; i++) {
        const spaceFromBaseInterval = doFloatCalculation(
            FloatCalculations.multiply,
            absoluteIndex,
            spaceBetweenIntervals
        );
        const buyPrice = doFloatCalculation(
            FloatCalculations.add,
            basePrice,
            spaceFromBaseInterval
        );

        intervals.unshift({
            type: IntervalTypes.LONG,
            positionLimit: sharesPerInterval * i,
            SELL: {
                price: doFloatCalculation(
                    FloatCalculations.add,
                    buyPrice,
                    intervalProfit
                ),
                active: false,
                crossed: false,
            },
            BUY: {
                price: buyPrice,
                active: true,
                crossed: true,
            },
        });

        absoluteIndex++;
    }

    return intervals;
}

function getShortIntervals({
    initialAskPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
}: {
    initialAskPrice: number;
    targetPosition: number;
    intervalProfit: number;
    spaceBetweenIntervals: number;
    sharesPerInterval: number;
}): SmoothingInterval[] {
    const basePrice = doFloatCalculation(
        FloatCalculations.subtract,
        initialAskPrice,
        getSpaceBetweenInitialPriceAndFirstInterval(
            spaceBetweenIntervals,
            intervalProfit
        )
    );
    const intervals: SmoothingInterval[] = [];
    const numIntervals = targetPosition / sharesPerInterval;

    let absoluteIndex = 0;
    for (let i = 0; i <= numIntervals; i++) {
        const spaceFromBaseInterval = doFloatCalculation(
            FloatCalculations.multiply,
            absoluteIndex,
            spaceBetweenIntervals
        );
        const sellPrice = doFloatCalculation(
            FloatCalculations.subtract,
            basePrice,
            spaceFromBaseInterval
        );

        intervals.push({
            type: IntervalTypes.SHORT,
            positionLimit: -sharesPerInterval * i,
            SELL: {
                price: sellPrice,
                active: true,
                crossed: true,
            },
            BUY: {
                price: doFloatCalculation(
                    FloatCalculations.subtract,
                    sellPrice,
                    intervalProfit
                ),
                active: false,
                crossed: false,
            },
        });

        absoluteIndex++;
    }

    return intervals;
}
