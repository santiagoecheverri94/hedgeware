import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {IntervalType, SmoothingInterval, StockState} from './types';

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
        profitThreshold: partial.profitThreshold,
        lossThreshold: partial.lossThreshold,
        intervals: [...longIntervals, ...shortIntervals],
        prediction: partial.prediction,
        isStaticIntervals: partial.isStaticIntervals,
        position: 0,
        lastAsk: 0,
        lastBid: 0,
        netPositionValue: 0,
        realizedPnLAsPercentage: 0,
        exitPnLAsPercentage: 0,
        maxMovingProfitAsPercentage: 0,
        maxMovingLossAsPercentage: 0,
        tradingLogs: [],
    };

    return newState;
}

function getLongIntervalsAboveInitialPrice(
    stockState: StockState,
): SmoothingInterval[] {
    const intervals: SmoothingInterval[] = [];
    const numIntervals = stockState.targetPosition / stockState.sharesPerInterval;

    for (let index = 1; index <= numIntervals + 1; index++) {
        const spaceFromBaseInterval = fc.multiply(
            index,
            stockState.spaceBetweenIntervals,
        );
        const buyPrice = fc.roundToNumDecimalPlaces(
            fc.add(
                fc.add(stockState.initialPrice, spaceFromBaseInterval),
                fc.divide(stockState.spaceBetweenIntervals, 2),
            ),
            2,
        );

        intervals.unshift({
            type: IntervalType.LONG,
            positionLimit: stockState.sharesPerInterval * index,
            SELL: {
                price: fc.add(buyPrice, stockState.intervalProfit),
                active: false,
                crossed: false,
            },
            BUY: {
                price: buyPrice,
                active: true,
                crossed: true,
            },
        });
    }

    return intervals;
}

function getShortIntervalsBelowInitialPrice(
    stockState: StockState,
): SmoothingInterval[] {
    const intervals: SmoothingInterval[] = [];
    const numIntervals = stockState.targetPosition / stockState.sharesPerInterval;

    for (let index = 1; index <= numIntervals + 1; index++) {
        const spaceFromBaseInterval = fc.multiply(
            index,
            stockState.spaceBetweenIntervals,
        );

        // const buyPrice = fc.roundToNumDecimalPlaces(
        //     fc.subtract(
        //         fc.subtract(stockState.initialPrice, spaceFromBaseInterval),
        //         fc.divide(stockState.spaceBetweenIntervals, 2),
        //     ),
        //     2,
        // );

        const sellPrice = fc.roundToNumDecimalPlaces(
            fc.subtract(
                fc.subtract(stockState.initialPrice, spaceFromBaseInterval),
                fc.divide(stockState.spaceBetweenIntervals, 2),
            ),
            2,
        );

        intervals.push({
            type: IntervalType.SHORT,
            positionLimit: -(stockState.sharesPerInterval * index),
            SELL: {
                // price: fc.add(buyPrice, stockState.intervalProfit),
                price: sellPrice,
                active: true,
                crossed: true,
            },
            BUY: {
                // price: buyPrice,
                price: fc.subtract(sellPrice, stockState.intervalProfit),
                active: false,
                crossed: false,
            },
        });
    }

    return intervals;
}
