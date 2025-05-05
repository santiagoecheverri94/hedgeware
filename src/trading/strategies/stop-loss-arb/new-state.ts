import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {IntervalType, SmoothingInterval, StockState} from './types';

export function getFullStockState(partial: StockState): StockState {
    const longIntervals: SmoothingInterval[] =
        getLongIntervalsAboveInitialPrice(partial);

    const shortIntervals: SmoothingInterval[] =
        getShortIntervalsBelowInitialPrice(partial);

    const newState: StockState = {
        date: partial.date,
        prediction: partial.prediction,
        profitThreshold: partial.profitThreshold,
        lossThreshold: partial.lossThreshold,
        brokerageId: partial.brokerageId,
        brokerageTradingCostPerShare: partial.brokerageTradingCostPerShare,
        targetPosition: partial.targetPosition,
        sharesPerInterval: partial.sharesPerInterval,
        spaceBetweenIntervals: partial.spaceBetweenIntervals,
        intervalProfit: partial.intervalProfit,
        numContracts: partial.numContracts,
        initialPrice: partial.initialPrice,
        isStaticIntervals: Boolean(partial.isStaticIntervals),
        position: 0,
        lastAsk: 0,
        lastBid: 0,
        realizedPnL: 0,
        realizedPnLAsPercentage: 0,
        exitPnL: 0,
        exitPnLAsPercentage: 0,
        maxMovingProfitAsPercentage: 0,
        maxMovingLossAsPercentage: 0,
        intervals: [...longIntervals, ...shortIntervals],
        tradingLogs: [],
    };

    return newState;
}

function getLongIntervalsAboveInitialPrice(partial: StockState): SmoothingInterval[] {
    const intervals: SmoothingInterval[] = [];
    const numIntervals = partial.targetPosition / partial.sharesPerInterval;

    for (let index = 1; index <= numIntervals + 1; index++) {
        const spaceFromBaseInterval = fc.multiply(index, partial.spaceBetweenIntervals);
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
        const spaceFromBaseInterval = fc.multiply(index, partial.spaceBetweenIntervals);
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
