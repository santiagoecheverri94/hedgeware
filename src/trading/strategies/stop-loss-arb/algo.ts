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
import {StockState} from './types';

export async function reconcileStockPosition(
    stock: string,
    stockState: StockState,
    brokerageClient: BrokerageClient,
): Promise<Snapshot> {
    // 0)
    let snapshot: Snapshot;
    snapshot = await (isLiveTrading() ? brokerageClient.getSnapshot(stock, stockState.brokerageId) : getSimulatedSnapshot(stock));

    if (isWideBidAskSpread(snapshot, stockState) || !snapshot.bid || !snapshot.ask) {
        return snapshot;
    }

    // 1)
    const crossingHappened = checkCrossings(stockState, snapshot);

    if (isLiveTrading() && crossingHappened) {
        syncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
    }

    // 2)
    const numToBuy = getNumToBuy(stockState, snapshot);

    // 3)
    let numToSell = 0;
    if (numToBuy === 0) {
        numToSell = getNumToSell(stockState, snapshot);
    }

    // 4)
    let newPosition: number | undefined;
    if (numToBuy > 0) {
        newPosition = stockState.position + stockState.sharesPerInterval * numToBuy;
    } else if (numToSell > 0) {
        newPosition = stockState.position - stockState.sharesPerInterval * numToSell;
    }

    const isSnapshotChanged = isSnapshotChange(snapshot, stockState);
    if (newPosition !== undefined) {
        await setNewPosition({
            stock,
            brokerageClient,
            stockState,
            newPosition,
            snapshot,
            orderSide: numToBuy > 0 ? OrderAction.BUY : OrderAction.SELL,
        });

        checkCrossings(stockState, snapshot);

        if (isLiveTrading()) {
            syncWriteJSONFile(
                getStockStateFilePath(stock),
                jsonPrettyPrint(stockState),
            );
        }
    } else if (isSnapshotChanged) {
        // 5)
        doSnapShotChangeUpdates(stock, stockState, snapshot);
    }

    return snapshot;
}

function isWideBidAskSpread({bid, ask}: Snapshot, stockState: StockState): boolean {
    return fc.gt(fc.subtract(ask, bid), stockState.intervalProfit) === 1;
}

function checkCrossings(
    stockState: StockState,
    {bid, ask}: Snapshot,
): boolean {
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

function getNumToBuy(stockState: StockState, {ask}: Snapshot): number {
    const {intervals, position} = stockState;

    let newPosition = position;
    const indexesToExecute: number[] = [];
    for (let i = intervals.length - 1; i >= 0; i--) {
        const interval = intervals[i];

        if (
            fc.gte(ask, interval[OrderAction.BUY].price) &&
            interval[OrderAction.BUY].active &&
            interval[OrderAction.BUY].crossed
        ) {
            if (newPosition < interval.positionLimit) {
                indexesToExecute.unshift(i);
                newPosition += stockState.sharesPerInterval;
            }
        }
    }

    for (const index of indexesToExecute) {
        const interval = intervals[index];

        interval[OrderAction.BUY].active = false;
        interval[OrderAction.BUY].crossed = false;

        interval[OrderAction.SELL].active = true;
        interval[OrderAction.SELL].crossed = false;
    }

    if (stockState.isStaticIntervals) {
        addSkippedBuysIfRequired(stockState, indexesToExecute);
    }

    if (indexesToExecute.length > 0) {
        const purchaseValue = fc.multiply(
            stockState.sharesPerInterval * indexesToExecute.length,
            ask,
        );
        stockState.tradingCosts = fc.subtract(stockState.tradingCosts, purchaseValue);

        const tradingCosts = fc.multiply(
            stockState.brokerageTradingCostPerShare,
            indexesToExecute.length * stockState.sharesPerInterval,
        );
        stockState.tradingCosts = fc.subtract(stockState.tradingCosts, tradingCosts);

        if (!stockState.isStaticIntervals) {
            correctBadBuyIfRequired(stockState, indexesToExecute);
        }
    }

    return indexesToExecute.length;
}

function getNumToSell(stockState: StockState, {bid}: Snapshot): number {
    const {intervals, position} = stockState;

    let newPosition = position;
    const indexesToExecute: number[] = [];
    for (const [i, interval] of intervals.entries()) {
        if (
            fc.lte(bid, interval[OrderAction.SELL].price) &&
            interval[OrderAction.SELL].active &&
            interval[OrderAction.SELL].crossed
        ) {
            if (newPosition > interval.positionLimit) {
                indexesToExecute.push(i);
                newPosition -= stockState.sharesPerInterval;
            }
        }
    }

    if (stockState.isStaticIntervals) {
        addSkippedSellsIfRequired(stockState, indexesToExecute);
    }

    for (const index of indexesToExecute) {
        const interval = intervals[index];

        interval[OrderAction.SELL].active = false;
        interval[OrderAction.SELL].crossed = false;

        interval[OrderAction.BUY].active = true;
        interval[OrderAction.BUY].crossed = false;
    }

    if (indexesToExecute.length > 0) {
        const saleValue = fc.multiply(
            stockState.sharesPerInterval * indexesToExecute.length,
            bid,
        );
        stockState.tradingCosts = fc.add(stockState.tradingCosts, saleValue);

        const tradingCosts = fc.multiply(
            stockState.brokerageTradingCostPerShare,
            indexesToExecute.length * stockState.sharesPerInterval,
        );
        stockState.tradingCosts = fc.subtract(stockState.tradingCosts, tradingCosts);

        if (!stockState.isStaticIntervals) {
            correctBadSellIfRequired(stockState, indexesToExecute);
        }
    }

    return indexesToExecute.length;
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

    doSnapShotChangeUpdates(stock, stockState, snapshot);

    const tradingLog: (typeof stockState.tradingLogs)[number] = {
        action: orderSide,
        timeStamp: snapshot.timestamp || getCurrentTimeStamp(),
        price: orderSide === OrderAction.BUY ? snapshot.ask : snapshot.bid,
        previousPosition,
        newPosition,
        tradingCosts: stockState.tradingCosts,
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

function doSnapShotChangeUpdates(
    stock: string,
    stockState: StockState,
    snapshot: Snapshot,
): void {
    stockState.lastAsk = snapshot.ask;
    stockState.lastBid = snapshot.bid;

    if (isLiveTrading()) {
        syncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
    }
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
