import {syncWriteJSONFile, jsonPrettyPrint} from '../../../utils/file';
import {doFloatCalculation, FloatCalculations} from '../../../utils/float-calculator';
import {isLiveTrading} from '../../../utils/price-simulator';
import {Snapshot, OrderSides, BrokerageClient} from '../../brokerage-clients/brokerage-client';
import {getStockStateFilePath, setNewPosition, doSnapShotChangeUpdates, isWideBidAskSpread, isSnapshotChange} from './state';
import {StockState} from './types';

export async function reconcileStockPosition(stock: string, stockState: StockState, brokerageClient: BrokerageClient): Promise<void> {
  // 0)
  // TODO: support wider bid/ask spreads, maybe set the limit on the stockState itself
  const snapshot = await brokerageClient.getSnapshot(stock, stockState.brokerageId);
  if (isWideBidAskSpread(snapshot) || !snapshot.bid || !snapshot.ask) {
    return;
  }

  // 1)
  const crossingHappened = checkCrossings(stock, stockState, snapshot);

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
    newPosition = stockState.position + (stockState.sharesPerInterval * numToBuy);
  } else if (numToSell > 0) {
    newPosition = stockState.position - (stockState.sharesPerInterval * numToSell);
  }

  const isSnapshotChanged = isSnapshotChange(snapshot, stockState);
  if (newPosition !== undefined) {
    await setNewPosition({
      stock,
      brokerageClient,
      stockState,
      newPosition,
      snapshot,
      orderSide: numToBuy > 0 ? OrderSides.BUY : OrderSides.SELL,
    });

    checkCrossings(stock, stockState, snapshot);

    if (isLiveTrading()) {
      syncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
    }
  } else if (isSnapshotChanged) { // 5)
    doSnapShotChangeUpdates(stock, stockState, snapshot);
  }
}

function checkCrossings(stock: string, stockState: StockState, {bid, ask}: Snapshot): boolean {
  const {intervals} = stockState;

  let crossingHappened = false;
  for (const interval of intervals) {
    if (interval[OrderSides.BUY].active && !interval[OrderSides.BUY].crossed && doFloatCalculation(FloatCalculations.lessThan, ask, interval[OrderSides.BUY].price)) {
      interval[OrderSides.BUY].crossed = true;
      crossingHappened = true;
    }

    if (interval[OrderSides.SELL].active && !interval[OrderSides.SELL].crossed && doFloatCalculation(FloatCalculations.greaterThan, bid, interval[OrderSides.SELL].price)) {
      interval[OrderSides.SELL].crossed = true;
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

    if (doFloatCalculation(FloatCalculations.greaterThanOrEqual, ask, interval[OrderSides.BUY].price) && interval[OrderSides.BUY].active && interval[OrderSides.BUY].crossed) {
      // if ((interval.type === IntervalTypes.LONG && newPosition === interval.positionLimit) || newPosition < interval.positionLimit) {
      if (newPosition < interval.positionLimit) {
        indexesToExecute.unshift(i);
        newPosition += stockState.sharesPerInterval;
      }
    }
  }

  if (!stockState.isDynamicIntervals) {
    addSkippedBuysIfRequired(stockState, indexesToExecute);
  }

  for (const index of indexesToExecute) {
    const interval = intervals[index];

    interval[OrderSides.BUY].active = false;
    interval[OrderSides.BUY].crossed = false;

    interval[OrderSides.SELL].active = true;
    interval[OrderSides.SELL].crossed = false;
  }

  if (indexesToExecute.length > 0) {
    const purchaseValue = doFloatCalculation(FloatCalculations.multiply, stockState.sharesPerInterval * indexesToExecute.length, ask);
    stockState.transitoryValue = doFloatCalculation(FloatCalculations.subtract, stockState.transitoryValue, purchaseValue);

    const tradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, indexesToExecute.length * stockState.sharesPerInterval);
    stockState.transitoryValue = doFloatCalculation(FloatCalculations.subtract, stockState.transitoryValue, tradingCosts);

    if (stockState.isDynamicIntervals) {
      correctBadBuyIfRequired(stockState, indexesToExecute);
    }
  }

  return indexesToExecute.length;
}

function addSkippedBuysIfRequired(stockState: StockState, indexesToExecute: number[]): void {
  if (indexesToExecute.length === 0) {
    return;
  }

  const {intervals} = stockState;
  const bottomOriginalIndexToExecute = indexesToExecute[indexesToExecute.length - 1];
  for (let i = intervals.length - 1; i > bottomOriginalIndexToExecute; i--) {
    const interval = intervals[i];

    if (interval[OrderSides.BUY].active) { // && i !== indexesToExecute[indexesToExecute.length - 1] + stockState.uncrossedBuyingSkips) {
      indexesToExecute.push(i); // TODO: splice this properly instead of pushing
    }
  }
}

function correctBadBuyIfRequired(stockState: StockState, indexesToExecute: number[]): void {
  const lowestIndexExecuted = indexesToExecute[indexesToExecute.length - 1];
  if (lowestIndexExecuted >= stockState.intervals.length - 1) {
    return;
  }

  const intervalBelowLowestIntervalExecuted = stockState.intervals[lowestIndexExecuted + 1];
  if (!intervalBelowLowestIntervalExecuted[OrderSides.BUY].active) {
    return;
  }

  intervalBelowLowestIntervalExecuted[OrderSides.BUY].active = false;
  intervalBelowLowestIntervalExecuted[OrderSides.BUY].crossed = false;
  intervalBelowLowestIntervalExecuted[OrderSides.SELL].active = true;
  intervalBelowLowestIntervalExecuted[OrderSides.SELL].crossed = false;

  const topIntervalExecuted = stockState.intervals[indexesToExecute[0]];
  topIntervalExecuted[OrderSides.BUY].active = true;
  topIntervalExecuted[OrderSides.BUY].crossed = false;
  topIntervalExecuted[OrderSides.SELL].active = false;
  topIntervalExecuted[OrderSides.SELL].crossed = false;

  for (const interval of stockState.intervals) {
    interval[OrderSides.BUY].price = doFloatCalculation(FloatCalculations.add, interval[OrderSides.BUY].price, stockState.spaceBetweenIntervals);
    interval[OrderSides.SELL].price = doFloatCalculation(FloatCalculations.add, interval[OrderSides.SELL].price, stockState.spaceBetweenIntervals);
  }
}

function getNumToSell(stockState: StockState, {bid}: Snapshot): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  const indexesToExecute: number[] = [];
  for (const [i, interval] of intervals.entries()) {
    if (doFloatCalculation(FloatCalculations.lessThanOrEqual, bid, interval[OrderSides.SELL].price)  && interval[OrderSides.SELL].active && interval[OrderSides.SELL].crossed) {
      // if ((interval.type === IntervalTypes.SHORT && newPosition === interval.positionLimit) || newPosition > interval.positionLimit) {
      if (newPosition > interval.positionLimit) {
        indexesToExecute.push(i);
        newPosition -= stockState.sharesPerInterval;
      }
    }
  }

  if (!stockState.isDynamicIntervals) {
    addSkippedSellsIfRequired(stockState, indexesToExecute);
  }

  for (const index of indexesToExecute) {
    const interval = intervals[index];

    interval[OrderSides.SELL].active = false;
    interval[OrderSides.SELL].crossed = false;

    interval[OrderSides.BUY].active = true;
    interval[OrderSides.BUY].crossed = false;
  }

  if (indexesToExecute.length > 0) {
    const saleValue = doFloatCalculation(FloatCalculations.multiply, stockState.sharesPerInterval * indexesToExecute.length, bid);
    stockState.transitoryValue = doFloatCalculation(FloatCalculations.add, stockState.transitoryValue, saleValue);

    const tradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, indexesToExecute.length * stockState.sharesPerInterval);
    stockState.transitoryValue = doFloatCalculation(FloatCalculations.subtract, stockState.transitoryValue, tradingCosts);

    if (stockState.isDynamicIntervals) {
      correctBadSellIfRequired(stockState, indexesToExecute);
    }
  }

  return indexesToExecute.length;
}

function addSkippedSellsIfRequired(stockState: StockState, indexesToExecute: number[]): void {
  if (indexesToExecute.length === 0) {
    return;
  }

  const {intervals} = stockState;
  const topOriginalIndexToExecute = indexesToExecute[0];
  for (let i = 0; i < topOriginalIndexToExecute; i++) {
    const interval = intervals[i];

    if (interval[OrderSides.SELL].active) { // && i !== indexesToExecute[0] - stockState.uncrossedSellingSkips) {
      indexesToExecute.unshift(i); // TODO: splice this properly instead of unshifting
    }
  }
}

function correctBadSellIfRequired(stockState: StockState, indexesToExecute: number[]): void {
  const highestIndexExecuted = indexesToExecute[0];
  if (highestIndexExecuted === 0) {
    return;
  }

  const intervalAboveHighestIntervalExecuted = stockState.intervals[highestIndexExecuted - 1];
  if (!intervalAboveHighestIntervalExecuted[OrderSides.SELL].active) {
    return;
  }

  intervalAboveHighestIntervalExecuted[OrderSides.SELL].active = false;
  intervalAboveHighestIntervalExecuted[OrderSides.SELL].crossed = false;
  intervalAboveHighestIntervalExecuted[OrderSides.BUY].active = true;
  intervalAboveHighestIntervalExecuted[OrderSides.BUY].crossed = false;

  const bottomIntervalExecuted = stockState.intervals[indexesToExecute[indexesToExecute.length - 1]];
  bottomIntervalExecuted[OrderSides.SELL].active = true;
  bottomIntervalExecuted[OrderSides.SELL].crossed = false;
  bottomIntervalExecuted[OrderSides.BUY].active = false;
  bottomIntervalExecuted[OrderSides.BUY].crossed = false;

  for (const interval of stockState.intervals) {
    interval[OrderSides.BUY].price = doFloatCalculation(FloatCalculations.subtract, interval[OrderSides.BUY].price, stockState.spaceBetweenIntervals);
    interval[OrderSides.SELL].price = doFloatCalculation(FloatCalculations.subtract, interval[OrderSides.SELL].price, stockState.spaceBetweenIntervals);
  }
}
