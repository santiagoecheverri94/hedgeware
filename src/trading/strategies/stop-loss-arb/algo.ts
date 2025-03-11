import {syncWriteJSONFile, jsonPrettyPrint} from '../../../utils/file';
import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {log} from '../../../utils/log';
import {getSimulatedSnapshot, isLiveTrading} from '../../../utils/price-simulator';
import {getCurrentTimeStamp} from '../../../utils/time';
import {
    Snapshot,
    OrderAction,
    BrokerageClient,
} from '../../brokerage-clients/brokerage-client';
import {getStockStateFilePath} from './state';
import {IntervalType, StockState} from './types';

export async function reconcileStockPosition(
    stock: string,
    stockState: StockState,
    brokerageClient: BrokerageClient,
): Promise<Snapshot> {
    // 0)
    let snapshot: Snapshot;
    snapshot = await (isLiveTrading() ?
        brokerageClient.getSnapshot(stock, stockState.brokerageId) :
        getSimulatedSnapshot(stock));

    if (isWideBidAskSpread(snapshot, stockState) || !snapshot.bid || !snapshot.ask) {
        return snapshot;
    }

    // TODO: do I still need this afterwards?
    const isSnapshotChanged = isSnapshotChange(snapshot, stockState);
    if (isSnapshotChanged) {
        updateSnaphotOnState(stockState, snapshot);

        updateExitPnL(stockState);

        if (isLiveTrading()) {
            syncWriteJSONFile(
                getStockStateFilePath(stock),
                jsonPrettyPrint(stockState),
            );
        }
    }

    // 1)
    const crossingHappened = checkCrossings(stockState, snapshot);

    if (isLiveTrading() && crossingHappened) {
        syncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
    }

    // 2)
    let intervalIndicesToExecute = getNumToBuy(stockState, snapshot);
    const numToBuy = intervalIndicesToExecute.length;

    // 3)
    let numToSell = 0;
    if (numToBuy === 0) {
        intervalIndicesToExecute = getNumToSell(stockState, snapshot);
        numToSell = intervalIndicesToExecute.length;
    }

    // 4)
    let newPosition: number | undefined;
    if (numToBuy > 0) {
        newPosition = stockState.position + stockState.sharesPerInterval * numToBuy;
    } else if (numToSell > 0) {
        newPosition = stockState.position - stockState.sharesPerInterval * numToSell;
    }

    // 5)
    if (newPosition !== undefined) {
        const orderSide: OrderAction =
            numToBuy > 0 ? OrderAction.BUY : OrderAction.SELL;

        // TODO: refactor so price is returned from setNewPosition
        let priceSetAt: number = (await setNewPosition({
            stock,
            brokerageClient,
            stockState,
            newPosition,
            snapshot,
            orderSide,
        })) as any;

        priceSetAt = orderSide === OrderAction.BUY ? snapshot.ask : snapshot.bid;

        updateRealizedPnL(stockState, intervalIndicesToExecute, orderSide, priceSetAt);

        checkCrossings(stockState, snapshot);
    }

    // 6)
    if (isSnapshotChanged) {
        updateSnaphotOnState(stockState, snapshot);

        updateExitPnL(stockState);

        if (isLiveTrading()) {
            syncWriteJSONFile(
                getStockStateFilePath(stock),
                jsonPrettyPrint(stockState),
            );
        }
    }

    return snapshot;
}

function isWideBidAskSpread({bid, ask}: Snapshot, stockState: StockState): boolean {
    return fc.gt(fc.subtract(ask, bid), stockState.spaceBetweenIntervals) === 1;
}

function checkCrossings(stockState: StockState, {bid, ask}: Snapshot): boolean {
    const {intervals} = stockState;

    let crossingHappened = false;
    for (const interval of intervals) {
        if (
            interval[OrderAction.BUY].active &&
            !interval[OrderAction.BUY].crossed &&
            fc.lt(ask, interval[OrderAction.BUY].price)
        ) {
            interval[OrderAction.BUY].crossed = true;
            crossingHappened = true;
        }

        if (
            interval[OrderAction.SELL].active &&
            !interval[OrderAction.SELL].crossed &&
            fc.gt(bid, interval[OrderAction.SELL].price)
        ) {
            interval[OrderAction.SELL].crossed = true;
            crossingHappened = true;
        }
    }

    return crossingHappened;
}

function getNumToBuy(stockState: StockState, {ask}: Snapshot): number[] {
    const {intervals, position} = stockState;

    let newPosition = position;
    const indicesToExecute: number[] = [];
    for (let i = intervals.length - 1; i >= 0; i--) {
        const interval = intervals[i];

        if (
            fc.gte(ask, interval[OrderAction.BUY].price) &&
            interval[OrderAction.BUY].active &&
            interval[OrderAction.BUY].crossed
        ) {
            if (newPosition < interval.positionLimit) {
                indicesToExecute.unshift(i);
                newPosition += stockState.sharesPerInterval;
            }
        }
    }

    for (const index of indicesToExecute) {
        const interval = intervals[index];

        interval[OrderAction.BUY].active = false;
        interval[OrderAction.BUY].crossed = false;

        interval[OrderAction.SELL].active = true;
        interval[OrderAction.SELL].crossed = false;
    }

    if (stockState.isStaticIntervals) {
        addSkippedBuysIfRequired(stockState, indicesToExecute);
    }

    if (indicesToExecute.length > 0) {
        if (!stockState.isStaticIntervals) {
            correctBadBuyIfRequired(stockState, indicesToExecute);
        }
    }

    return indicesToExecute;
}

function getNumToSell(stockState: StockState, {bid}: Snapshot): number[] {
    const {intervals, position} = stockState;

    let newPosition = position;
    const indicesToExecute: number[] = [];
    for (const [i, interval] of intervals.entries()) {
        if (
            fc.lte(bid, interval[OrderAction.SELL].price) &&
            interval[OrderAction.SELL].active &&
            interval[OrderAction.SELL].crossed
        ) {
            if (newPosition > interval.positionLimit) {
                indicesToExecute.push(i);
                newPosition -= stockState.sharesPerInterval;
            }
        }
    }

    if (stockState.isStaticIntervals) {
        addSkippedSellsIfRequired(stockState, indicesToExecute);
    }

    for (const index of indicesToExecute) {
        const interval = intervals[index];

        interval[OrderAction.SELL].active = false;
        interval[OrderAction.SELL].crossed = false;

        interval[OrderAction.BUY].active = true;
        interval[OrderAction.BUY].crossed = false;
    }

    if (indicesToExecute.length > 0) {
        if (!stockState.isStaticIntervals) {
            correctBadSellIfRequired(stockState, indicesToExecute);
        }
    }

    return indicesToExecute;
}

function isSnapshotChange(snapshot: Snapshot, stockState: StockState): boolean {
    if (!stockState.lastAsk || !stockState.lastBid) {
        return true;
    }

    return (
        !fc.eq(stockState.lastAsk, snapshot.ask) ||
        !fc.eq(stockState.lastBid, snapshot.bid)
    );
}

async function setNewPosition({
    stock,
    brokerageClient,
    stockState,
    newPosition,
    snapshot,
    orderSide,
}: {
    stock: string;
    brokerageClient: BrokerageClient;
    stockState: StockState;
    newPosition: number;
    snapshot: Snapshot;
    orderSide: OrderAction;
}): Promise<void> {
    const previousPosition = stockState.position;
    stockState.position = newPosition;

    const tradingLog: (typeof stockState.tradingLogs)[number] = {
        action: orderSide,
        timeStamp: snapshot.timestamp || getCurrentTimeStamp(),
        price: orderSide === OrderAction.BUY ? snapshot.ask : snapshot.bid,
        previousPosition,
        newPosition,
    };
    stockState.tradingLogs.push(tradingLog);

    if (isLiveTrading()) {
        await brokerageClient.setSecurityPosition({
            brokerageIdOfSecurity: stockState.brokerageId,
            currentPosition: stockState.position * stockState.numContracts,
            newPosition: newPosition * stockState.numContracts,
            snapshot,
        });

        log(
            `Changed position for ${stock} (${
                stockState.numContracts
            } constracts): ${jsonPrettyPrint({
                price: tradingLog.price,
                previousPosition: tradingLog.previousPosition,
                newPosition: tradingLog.newPosition,
            })}`,
        );
    }
}

function updateRealizedPnL(
    stockState: StockState,
    executedIndices: number[],
    orderSide: OrderAction,
    price: number,
): void {
    if (executedIndices.length === 0) {
        return;
    }

    const commissionCosts = fc.multiply(
        executedIndices.length * stockState.sharesPerInterval,
        stockState.brokerageTradingCostPerShare,
    );

    stockState.realizedPnL = fc.subtract(stockState.realizedPnL, commissionCosts);

    for (const index of executedIndices) {
        const interval = stockState.intervals[index];

        let pnLFromThisExecution: number | undefined;

        if (interval.type === IntervalType.LONG) {
            if (orderSide === OrderAction.BUY) {
                interval[OrderAction.SELL].boughtAtPrice = price;
            } else if (orderSide === OrderAction.SELL) {
                pnLFromThisExecution = fc.multiply(
                    stockState.sharesPerInterval,
                    fc.subtract(price, interval[OrderAction.SELL].boughtAtPrice!),
                );
            }
        }

        if (interval.type === IntervalType.SHORT) {
            if (orderSide === OrderAction.SELL) {
                interval[OrderAction.BUY].soldAtPrice = price;
            } else if (orderSide === OrderAction.BUY) {
                pnLFromThisExecution = fc.multiply(
                    stockState.sharesPerInterval,
                    fc.subtract(interval[OrderAction.BUY].soldAtPrice!, price),
                );
            }
        }

        if (pnLFromThisExecution !== undefined) {
            stockState.realizedPnL = fc.add(
                stockState.realizedPnL,
                pnLFromThisExecution,
            );
        }
    }
}

function updateSnaphotOnState(stockState: StockState, snapshot: Snapshot): void {
    stockState.lastAsk = snapshot.ask;
    stockState.lastBid = snapshot.bid;
}

function updateExitPnL(stockState: StockState): void {
    const {lastAsk, lastBid, position} = stockState;

    if (position === 0) {
        return;
    }

    let exitPnL = stockState.realizedPnL;

    const commissionCosts = fc.multiply(
        position,
        stockState.brokerageTradingCostPerShare,
    );

    exitPnL = fc.subtract(exitPnL, commissionCosts);

    for (const interval of stockState.intervals) {
        let intervalPnL: number | undefined;

        if (interval.type === IntervalType.LONG && interval[OrderAction.SELL].active) {
            const boughtAtPrice = interval[OrderAction.SELL].boughtAtPrice!;
            intervalPnL = fc.multiply(
                stockState.sharesPerInterval,
                fc.subtract(lastBid, boughtAtPrice),
            );
        }

        if (interval.type === IntervalType.SHORT && interval[OrderAction.BUY].active) {
            const soldAtPrice = interval[OrderAction.BUY].soldAtPrice!;
            intervalPnL = fc.multiply(
                stockState.sharesPerInterval,
                fc.subtract(soldAtPrice, lastAsk),
            );
        }

        if (intervalPnL !== undefined) {
            exitPnL = fc.add(exitPnL, intervalPnL);
        }
    }

    stockState.exitPnL = exitPnL;

    const percentageDenominator = fc.multiply(stockState.targetPosition + stockState.sharesPerInterval, stockState.initialPrice);

    const exitPnLAsPercentage = fc.multiply(fc.divide(
        exitPnL,
        percentageDenominator,
    ), 100);

    stockState.exitPnLAsPercentage = exitPnLAsPercentage;

    if (fc.gt(exitPnLAsPercentage, stockState.maxMovingProfitAsPercentage)) {
        stockState.maxMovingProfitAsPercentage = exitPnLAsPercentage;
    }

    if (fc.lt(exitPnLAsPercentage, stockState.maxMovingLossAsPercentage)) {
        stockState.maxMovingLossAsPercentage = exitPnLAsPercentage;
    }

    // Here the cpp version is different, because it has the reched_when losses...
}

function correctBadBuyIfRequired(
    stockState: StockState,
    indexesToExecute: number[],
): void {
    const lowestIndexExecuted = indexesToExecute[indexesToExecute.length - 1];
    if (lowestIndexExecuted >= stockState.intervals.length - 1) {
        return;
    }

    const intervalBelowLowestIntervalExecuted =
        stockState.intervals[lowestIndexExecuted + 1];
    if (!intervalBelowLowestIntervalExecuted[OrderAction.BUY].active) {
        return;
    }

    intervalBelowLowestIntervalExecuted[OrderAction.BUY].active = false;
    intervalBelowLowestIntervalExecuted[OrderAction.BUY].crossed = false;
    intervalBelowLowestIntervalExecuted[OrderAction.SELL].active = true;
    intervalBelowLowestIntervalExecuted[OrderAction.SELL].crossed = false;

    const topIntervalExecuted = stockState.intervals[indexesToExecute[0]];
    topIntervalExecuted[OrderAction.BUY].active = true;
    topIntervalExecuted[OrderAction.BUY].crossed = false;
    topIntervalExecuted[OrderAction.SELL].active = false;
    topIntervalExecuted[OrderAction.SELL].crossed = false;

    for (const interval of stockState.intervals) {
        interval[OrderAction.BUY].price = fc.add(
            interval[OrderAction.BUY].price,
            stockState.spaceBetweenIntervals,
        );
        interval[OrderAction.SELL].price = fc.add(
            interval[OrderAction.SELL].price,
            stockState.spaceBetweenIntervals,
        );
    }
}

function correctBadSellIfRequired(
    stockState: StockState,
    indexesToExecute: number[],
): void {
    const highestIndexExecuted = indexesToExecute[0];
    if (highestIndexExecuted === 0) {
        return;
    }

    const intervalAboveHighestIntervalExecuted =
        stockState.intervals[highestIndexExecuted - 1];
    if (!intervalAboveHighestIntervalExecuted[OrderAction.SELL].active) {
        return;
    }

    intervalAboveHighestIntervalExecuted[OrderAction.SELL].active = false;
    intervalAboveHighestIntervalExecuted[OrderAction.SELL].crossed = false;
    intervalAboveHighestIntervalExecuted[OrderAction.BUY].active = true;
    intervalAboveHighestIntervalExecuted[OrderAction.BUY].crossed = false;

    const bottomIntervalExecuted =
        stockState.intervals[indexesToExecute[indexesToExecute.length - 1]];
    bottomIntervalExecuted[OrderAction.SELL].active = true;
    bottomIntervalExecuted[OrderAction.SELL].crossed = false;
    bottomIntervalExecuted[OrderAction.BUY].active = false;
    bottomIntervalExecuted[OrderAction.BUY].crossed = false;

    for (const interval of stockState.intervals) {
        interval[OrderAction.BUY].price = fc.subtract(
            interval[OrderAction.BUY].price,
            stockState.spaceBetweenIntervals,
        );
        interval[OrderAction.SELL].price = fc.subtract(
            interval[OrderAction.SELL].price,
            stockState.spaceBetweenIntervals,
        );
    }
}

function addSkippedBuysIfRequired(
    stockState: StockState,
    indexesToExecute: number[],
): void {
    if (indexesToExecute.length === 0) {
        return;
    }

    const {intervals} = stockState;
    const bottomOriginalIndexToExecute = indexesToExecute[indexesToExecute.length - 1];
    for (let i = intervals.length - 1; i > bottomOriginalIndexToExecute; i--) {
        const interval = intervals[i];

        if (interval[OrderAction.BUY].active) {
            indexesToExecute.push(i);
        }
    }
}

function addSkippedSellsIfRequired(
    stockState: StockState,
    indexesToExecute: number[],
): void {
    if (indexesToExecute.length === 0) {
        return;
    }

    const {intervals} = stockState;
    const topOriginalIndexToExecute = indexesToExecute[0];
    for (let i = 0; i < topOriginalIndexToExecute; i++) {
        const interval = intervals[i];

        if (interval[OrderAction.SELL].active) {
            indexesToExecute.unshift(i);
        }
    }
}
