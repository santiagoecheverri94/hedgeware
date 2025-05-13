import {writeJSONFile, jsonPrettyPrint, renameFile} from '../../../utils/file';
import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {log} from '../../../utils/log';
import {getSimulatedSnapshot, isLiveTrading} from '../../../utils/price-simulator';
import {
    getCurrentMomentInNewYork,
    getCurrentTimeStamp,
    getMomentForTime,
    kTradingEndTime,
} from '../../../utils/time';
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
    date: string,
    brokerageClient?: BrokerageClient,
): Promise<{
    snapshot: Snapshot;
    crossedThreshold: boolean;
}> {
    // 0)
    let snapshot: Snapshot;
    snapshot = await (brokerageClient ?
        brokerageClient.getSnapshot(stockState.brokerageId) :
        getSimulatedSnapshot(stockState));

    const isSnapshotChanged = isSnapshotChange(snapshot, stockState);
    const isPastTradingTimeBool = isPastTradingTime();
    if (isSnapshotChanged || isPastTradingTimeBool) {
        updateSnaphotOnState(stockState, snapshot);
        updateExitPnL(stockState);

        const isExitPnlBeyondThresholdsStr = isExitPnlBeyondThresholds(stockState);
        if (
            isLiveTrading() &&
            (isExitPnlBeyondThresholdsStr || isPastTradingTimeBool)
        ) {
            if (stockState.position !== 0) {
                await setNewPosition({
                    stock,
                    brokerageClient,
                    stockState,
                    newPosition: 0,
                    snapshot,
                });

                setRealizedPnL(stockState);
            }

            await writeJSONFile(
                getStockStateFilePath(stock, date),
                jsonPrettyPrint(stockState),
            );

            const oldPath = getStockStateFilePath(stock, date);

            const suffix = isExitPnlBeyondThresholdsStr || 'N';
            const newFileName = `_${stock}_${suffix}`;
            const newPath = getStockStateFilePath(newFileName, date);

            await renameFile(oldPath, newPath);

            return {
                snapshot,
                crossedThreshold: true,
            };
        }
    }

    if (isWideBidAskSpread(snapshot, stockState) || !snapshot.bid || !snapshot.ask) {
        return {
            snapshot,
            crossedThreshold: false,
        };
    }

    // 1)
    checkCrossings(stockState, snapshot);

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
        await setNewPosition({
            stock,
            brokerageClient,
            stockState,
            newPosition,
            snapshot,
        });

        checkCrossings(stockState, snapshot);
    }

    // 6)
    if (isSnapshotChanged) {
        if (isLiveTrading()) {
            await writeJSONFile(
                getStockStateFilePath(stock, date),
                jsonPrettyPrint(stockState),
            );
        }
    }

    return {
        snapshot,
        crossedThreshold: false,
    };
}

function isExitPnlBeyondThresholds(stockState: StockState): string {
    if (isLiveTrading() && stockState.profitThreshold && stockState.lossThreshold) {
        if (fc.gte(stockState.exitPnLAsPercentage, stockState.profitThreshold)) {
            return 'W';
        }

        if (fc.lte(stockState.exitPnLAsPercentage, stockState.lossThreshold)) {
            return 'L';
        }
    }

    return '';
}

function isPastTradingTime(): boolean {
    // return false;

    const tradingEndTime = getMomentForTime(kTradingEndTime);
    const currentMomentInNewYork = getCurrentMomentInNewYork();

    const isPastTradingTimeBool = currentMomentInNewYork.isSameOrAfter(tradingEndTime);

    return isPastTradingTimeBool;
}

function isWideBidAskSpread({bid, ask}: Snapshot, stockState: StockState): boolean {
    // return false;
    return fc.gte(fc.subtract(ask, bid), stockState.spaceBetweenIntervals) === 1;
}

function checkCrossings(stockState: StockState, {bid, ask}: Snapshot): void {
    const {intervals} = stockState;

    for (const interval of intervals) {
        if (
            interval[OrderAction.BUY].active &&
            !interval[OrderAction.BUY].crossed &&
            fc.lt(ask, interval[OrderAction.BUY].price)
        ) {
            interval[OrderAction.BUY].crossed = true;
        }

        if (
            interval[OrderAction.SELL].active &&
            !interval[OrderAction.SELL].crossed &&
            fc.gt(bid, interval[OrderAction.SELL].price)
        ) {
            interval[OrderAction.SELL].crossed = true;
        }
    }
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

    if (stockState.isStaticIntervals) {
        addSkippedBuysIfRequired(stockState, indicesToExecute);
    }

    for (const index of indicesToExecute) {
        const interval = intervals[index];

        interval[OrderAction.BUY].active = false;
        interval[OrderAction.BUY].crossed = false;

        interval[OrderAction.SELL].active = true;
        interval[OrderAction.SELL].crossed = false;
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
}: {
    stock: string;
    brokerageClient?: BrokerageClient;
    stockState: StockState;
    newPosition: number;
    snapshot: Snapshot;
}): Promise<void> {
    const previousPosition = stockState.position;
    stockState.position = newPosition;

    const orderSide: OrderAction =
        newPosition > previousPosition ? OrderAction.BUY : OrderAction.SELL;

    const quotedPrice = orderSide === OrderAction.BUY ? snapshot.ask : snapshot.bid;
    let priceSetAt: number = quotedPrice;

    const tradingLog: (typeof stockState.tradingLogs)[number] = {
        action: orderSide,
        timeStamp: snapshot.timestamp || getCurrentTimeStamp(),
        quotedPrice,
        realizedPrice: priceSetAt,
        previousPosition,
        newPosition,
    };
    stockState.tradingLogs.push(tradingLog);

    if (brokerageClient) {
        priceSetAt = await brokerageClient.setSecurityPosition({
            brokerageIdOfSecurity: stockState.brokerageId,
            currentPosition: previousPosition * stockState.numContracts,
            newPosition: newPosition * stockState.numContracts,
        });

        log(
            `Changed position for ${stock}, action: ${orderSide}, fullNewPosition: ${
                newPosition * stockState.numContracts
            }, quotedPrice: ${tradingLog.quotedPrice}, realizedPrice: ${
                tradingLog.realizedPrice
            }`,
        );

        await writeJSONFile(
            getStockStateFilePath(stock, stockState.date),
            jsonPrettyPrint(stockState),
        );
    }

    const newNetPositionValue = getNewNetPositionValue({
        currentPositionValue: stockState.netPositionValue,
        commissionPerShare: stockState.brokerageTradingCostPerShare,
        orderSide,
        newPosition,
        previousPosition,
        priceSetAt,
    });

    stockState.netPositionValue = newNetPositionValue;
}

function getNewNetPositionValue({
    currentPositionValue,
    commissionPerShare,
    orderSide,
    newPosition,
    previousPosition,
    priceSetAt,
}: {
    currentPositionValue: number;
    commissionPerShare: number;
    orderSide: OrderAction;
    newPosition: number;
    previousPosition: number;
    priceSetAt: number;
}): number {
    const quantity = Math.abs(newPosition - previousPosition);

    const commissionCosts = fc.multiply(quantity, commissionPerShare);

    let change = -commissionCosts;

    const orderValue = fc.multiply(quantity, priceSetAt);

    if (orderSide === OrderAction.BUY) {
        change = fc.subtract(change, orderValue);
    } else if (orderSide === OrderAction.SELL) {
        change = fc.add(change, orderValue);
    }

    const newPositionValue = fc.add(currentPositionValue, change);

    return newPositionValue;
}

function setRealizedPnL(stockState: StockState): void {
    if (stockState.position !== 0) {
        throw new Error('Cannot set realized PnL because Position is not zero');
    }

    const percentageDenominator = fc.multiply(
        stockState.targetPosition + stockState.sharesPerInterval,
        stockState.initialPrice,
    );

    const realizedPnLAsPercentage = fc.multiply(
        fc.divide(stockState.netPositionValue, percentageDenominator),
        100,
    );

    stockState.realizedPnLAsPercentage = realizedPnLAsPercentage;
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

    const orderSide: OrderAction = position > 0 ? OrderAction.SELL : OrderAction.BUY;

    const priceSetAt = orderSide === OrderAction.BUY ? lastAsk : lastBid;

    const ifClosingPositionValue = getNewNetPositionValue({
        currentPositionValue: stockState.netPositionValue,
        commissionPerShare: stockState.brokerageTradingCostPerShare,
        orderSide,
        newPosition: 0,
        previousPosition: position,
        priceSetAt,
    });

    const percentageDenominator = fc.multiply(
        stockState.targetPosition + stockState.sharesPerInterval,
        stockState.initialPrice,
    );

    const exitPnLAsPercentage = fc.multiply(
        fc.divide(ifClosingPositionValue, percentageDenominator),
        100,
    );

    stockState.exitPnLAsPercentage = exitPnLAsPercentage;

    if (fc.gt(exitPnLAsPercentage, stockState.maxMovingProfitAsPercentage)) {
        stockState.maxMovingProfitAsPercentage = exitPnLAsPercentage;
    }

    if (fc.lt(exitPnLAsPercentage, stockState.maxMovingLossAsPercentage)) {
        stockState.maxMovingLossAsPercentage = exitPnLAsPercentage;
    }

    // Here the cpp version is different, because it has the reched_when losses...
}

export function reconcileRealizedPnlWhenHistoricalSnapshotsExhausted(
    stockState: StockState,
): void {
    updateExitPnL(stockState);

    setNewPosition({
        stock: stockState.brokerageId,
        brokerageClient: undefined,
        stockState,
        newPosition: 0,
        snapshot: {
            ask: stockState.lastAsk,
            bid: stockState.lastBid,
            timestamp: getCurrentTimeStamp(),
        },
    });

    setRealizedPnL(stockState);
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
