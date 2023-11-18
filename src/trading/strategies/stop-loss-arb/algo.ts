import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {getFileNamesWithinFolder, jsonPrettyPrint, readJSONFile, syncWriteJSONFile} from '../../../utils/file';
import {isLiveTrading, restartSimulatedSnapshot} from '../../../utils/price-simulator';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {OrderSides, Snapshot} from '../../brokerage-clients/brokerage-client';
import {getCurrentTimeStamp, isMarketOpen} from '../../../utils/time';
import {log} from '../../../utils/log';
import {onUserInterrupt} from '../../../utils/system';
import { IntervalTypes, StockState } from './types';
import { debugSimulation } from './debug';

const brokerageClient = new IBKRClient();

export async function startStopLossArb(): Promise<void> {
  const stocks = await getStocks();

  const states = await getStockStates(stocks);

  let userHasInterrupted = false;
  if (isLiveTrading()) {
    onUserInterrupt(() => {
      userHasInterrupted = true;
    });
  }

  await Promise.all(stocks.map(stock => (async () => {
    await isMarketOpen(stock);
    let lastDifferentSnapshot: Snapshot | null = null;
    while ((await isMarketOpen(stock) && !userHasInterrupted)) {
      const stockState = states[stock];
      const snapshot = await reconcileStockPosition(stock, stockState);

      if (snapshot) {
        lastDifferentSnapshot = snapshot;
      }

      if ((await debugSimulation(stock, states, snapshot)).shouldBreak) {
        console.log(lastDifferentSnapshot);
        console.log(`position: ${stockState.position}, unrealizedValue: ${stockState.unrealizedValue}`);
        debugger;
        break;
      }
    }
  })()));
}

async function getStocks(): Promise<string[]> {
  const fileNames = await getFileNamesWithinFolder(getStockStatesFolderPath());
  return fileNames.filter(fileName => !['results', 'templates'].some(excludedFileName => fileName.includes(excludedFileName)) && !fileName.startsWith('_'));
}

function getStockStatesFolderPath(): string {
  if (!isLiveTrading()) {
    return `${process.cwd()}\\src\\trading\\strategies\\stop-loss-arb\\stock-states\\simulated`;
  }

  return `${process.cwd()}\\src\\trading\\strategies\\stop-loss-arb\\stock-states`;
}

export async function getStockStates(stocks: string[]): Promise<{ [stock: string]: StockState; }> {
  const states: {[stock: string]: StockState} = {};
  for (const stock of stocks) {
    states[stock] = await readJSONFile<StockState>(getStockStateFilePath(stock));
  }

  return states;
}

export function getStockStateFilePath(stock: string): string {
  return `${getStockStatesFolderPath()}\\${stock}.json`;
}

async function reconcileStockPosition(stock: string, stockState: StockState): Promise<Snapshot | null> {
  // 0)
  const snapshot = await brokerageClient.getSnapshot(stock, stockState.brokerageId);
  if (isWideBidAskSpread(snapshot)) {
    return null;
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

  if (newPosition !== undefined) {
    // TODO: remove await, but need to keep track of unresolved orders before
    // exiting
    // brokerageClient.setSecurityPosition({

    await brokerageClient.setSecurityPosition({
      brokerageIdOfSecurity: stockState.brokerageId,
      currentPosition: stockState.position * stockState.numContracts,
      newPosition: newPosition * stockState.numContracts,
      snapshot,
    });

    const tradingLog: typeof stockState.tradingLogs[number] = {
      action: numToBuy > 0 ? OrderSides.BUY : OrderSides.SELL,
      timeStamp: getCurrentTimeStamp(),
      price: numToBuy > 0 ? snapshot.ask : snapshot.bid,
      previousPosition: stockState.position,
      newPosition,
    };

    stockState.tradingLogs.push(tradingLog);

    log(`Changed position for ${stock} (${stockState.numContracts} constracts): ${jsonPrettyPrint({
      price: tradingLog.price,
      previousPosition: tradingLog.previousPosition,
      newPosition: tradingLog.newPosition,
    })}`);

    stockState.position = newPosition;

    checkCrossings(stock, stockState, snapshot);

    if (isLiveTrading()) {
      syncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
    }
  }

  // 5)
  const isSnapshotChanged = isSnapshotChange(snapshot, stockState);
  if (isSnapshotChanged) {
    stockState.lastAsk = snapshot.ask;
    stockState.lastBid = snapshot.bid;
    stockState.unrealizedValue = getUnrealizedValue(stockState, snapshot);

    if (isLiveTrading()) {
      syncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
    }
  }

  // 6)
  return newPosition !== undefined || isSnapshotChanged ? snapshot : null;
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

function isWideBidAskSpread({bid, ask}: Snapshot): boolean {
  return doFloatCalculation(FloatCalculations.greaterThan, doFloatCalculation(FloatCalculations.subtract, ask, bid), 0.01) === 1;
}

function getNumToBuy(stockState: StockState, {ask}: Snapshot): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  const indexesToExecute: number[] = [];
  for (let i = intervals.length - 1; i >= 0; i--) {
    const interval = intervals[i];

    if (doFloatCalculation(FloatCalculations.greaterThanOrEqual, ask, interval[OrderSides.BUY].price) && interval[OrderSides.BUY].active && interval[OrderSides.BUY].crossed) {
      if ((interval.type === IntervalTypes.LONG && newPosition === interval.positionLimit) || newPosition < interval.positionLimit) {
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
      if ((interval.type === IntervalTypes.SHORT && newPosition === interval.positionLimit) || newPosition > interval.positionLimit) {
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

function isSnapshotChange(snapshot: Snapshot, stockState: StockState): boolean {
  if (!stockState.lastAsk || !stockState.lastBid) {
    return true;
  }

  return !doFloatCalculation(FloatCalculations.equal, stockState.lastAsk, snapshot.ask) || !doFloatCalculation(FloatCalculations.equal, stockState.lastBid, snapshot.bid);
}

export function getUnrealizedValue(stockState: StockState, {bid, ask}: Snapshot): number {
  if (stockState.position === 0) {
    return stockState.transitoryValue;
  }

  const optionsUnrealizedClosingPrice = stockState.position > 0 ? Math.min(bid, stockState.callStrikePrice || Number.POSITIVE_INFINITY) : Math.max(ask, stockState.putStrikePrice || Number.NEGATIVE_INFINITY);
  const extraUnrealizedClosingPrice = stockState.position > 0 ? bid : ask;

  let unrealizedTransactionValue: number;
  if (Math.abs(stockState.position) <= 100) {
    unrealizedTransactionValue = doFloatCalculation(FloatCalculations.multiply, Math.abs(stockState.position), optionsUnrealizedClosingPrice);
  } else {
    const optionsUnrealizedTransactionValue = doFloatCalculation(FloatCalculations.multiply, 100, optionsUnrealizedClosingPrice);
    const extraUnrealizedTransactionValue = doFloatCalculation(FloatCalculations.multiply, Math.abs(stockState.position) - 100, extraUnrealizedClosingPrice);
    unrealizedTransactionValue = doFloatCalculation(FloatCalculations.add, optionsUnrealizedTransactionValue, extraUnrealizedTransactionValue);
  }

  const unrealizedValue = doFloatCalculation(stockState.position > 0 ? FloatCalculations.add : FloatCalculations.subtract, stockState.transitoryValue, unrealizedTransactionValue);
  const finalTradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, Math.abs(stockState.position));

  return doFloatCalculation(FloatCalculations.subtract, unrealizedValue, finalTradingCosts);
}
