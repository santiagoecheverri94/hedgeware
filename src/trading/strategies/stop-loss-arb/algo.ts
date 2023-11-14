import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {getFileNamesWithinFolder, jsonPrettyPrint, readJSONFile, syncWriteJSONFile} from '../../../utils/file';
import {isHistoricalSnapshot, isHistoricalSnapshotsExhausted, isLiveTrading, isRandomSnapshot, restartSimulatedSnapshot} from '../../../utils/price-simulator';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {OrderSides, Snapshot} from '../../brokerage-clients/brokerage-client';
import {getCurrentTimeStamp, isMarketOpen} from '../../../utils/time';
import {log} from '../../../utils/log';
import {onUserInterrupt} from '../../../utils/system';

export enum IntervalTypes {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

export interface SmoothingInterval {
  type: IntervalTypes;
  positionLimit: number;
  [OrderSides.SELL]: {
    active: boolean;
    crossed: boolean;
    price: number;
  };
  [OrderSides.BUY]: {
    active: boolean;
    crossed: boolean;
    price: number;
  };
}

export interface StockState {
  brokerageId: string;
  brokerageTradingCostPerShare: number;
  sharesPerInterval: number,
  intervalProfit: number;
  premiumSold: number | null;
  callStrikePrice: number | null;
  initialPrice: number;
  putStrikePrice: number | null;
  spaceBetweenIntervals: number;
  numContracts: number;
  position: number;
  targetPosition: number;
  intervals: SmoothingInterval[];
  tradingLogs: {
    timeStamp: string;
    action: OrderSides,
    price: number;
    previousPosition: number;
    newPosition: number;
  }[];
  transitoryValue: number;
  unrealizedValue: number;
  lastAsk?: number;
  lastBid?: number;
}

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
    while (await isMarketOpen(stock) && !userHasInterrupted) {
      const snapshot = await reconcileStockPosition(stock, states[stock]);

      if (isHistoricalSnapshot()) {
        if (snapshot) {
          debugHistoricalPrices(stock, states[stock], snapshot);
        }

        if (isHistoricalSnapshotsExhausted(stock)) {
          sortDescPositiveExitValuesByStock(stock);
          sortAscNegativeExitValuesByStock(stock);
          break;
        }
      }

      if (isRandomSnapshot() && snapshot) {
        states[stock] = await debugRandomPrices(snapshot, stock, states[stock]);
      }
    }
  })()));

  if (isHistoricalSnapshot()) {
    debugger;
  }
}

async function getStocks(): Promise<string[]> {
  const fileNames = await getFileNamesWithinFolder(getStockStatesFolderPath());
  return fileNames.filter(fileName => !['template', 'skip', 'results'].some(excludedFileName => fileName.includes(excludedFileName)) && !fileName.startsWith('__'));
}

function getStockStatesFolderPath(): string {
  if (!isLiveTrading()) {
    return `${process.cwd()}\\src\\trading\\strategies\\stop-loss-arb\\stock-states\\simulated`;
  }

  return `${process.cwd()}\\src\\trading\\strategies\\stop-loss-arb\\stock-states`;
}

async function getStockStates(stocks: string[]): Promise<{ [stock: string]: StockState; }> {
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

    // correctBadBuyIfRequired(stockState, indexesToExecute);
  }

  return indexesToExecute.length;
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

    // correctBadSellIfRequired(stockState, indexesToExecute);
  }

  return indexesToExecute.length;
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

function getUnrealizedValue(stockState: StockState, {bid, ask}: Snapshot): number {
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

interface ExitValue {
  snapshot: Snapshot;
  value: number;
}

const testHistoricalSamples: {
  [stock: string]: {
    positiveExitValues: ExitValue[];
    negativeExitValues: ExitValue[];
  }
} = {};

async function debugHistoricalPrices(stock: string, stockState: StockState, snapshot: Snapshot): Promise<void> {
  if (!testHistoricalSamples[stock]) {
    testHistoricalSamples[stock] = {
      positiveExitValues: [],
      negativeExitValues: [],
    };
  }

  if (doFloatCalculation(FloatCalculations.greaterThan, stockState.unrealizedValue, 0)) {
    testHistoricalSamples[stock].positiveExitValues.push({
      snapshot,
      value: stockState.unrealizedValue,
    });
  }

  if (doFloatCalculation(FloatCalculations.lessThan, stockState.unrealizedValue, 0)) {
    testHistoricalSamples[stock].negativeExitValues.push({
      snapshot,
      value: stockState.unrealizedValue,
    });
  }
}

function sortDescPositiveExitValuesByStock(stock: string): void {
  testHistoricalSamples[stock].positiveExitValues.sort((a, b) => {
    // if (a > b) {
    if (doFloatCalculation(FloatCalculations.greaterThan, a.value, b.value)) {
      return -1;
    }

    // if (a < b) {
    if (doFloatCalculation(FloatCalculations.lessThan, a.value, b.value)) {
      return 1;
    }

    return 0;
  });
}

function sortAscNegativeExitValuesByStock(stock: string): void {
  testHistoricalSamples[stock].negativeExitValues.sort((a, b) => {
    // if (a > b) {
    if (doFloatCalculation(FloatCalculations.greaterThan, a.value, b.value)) {
      return 1;
    }

    // if (a < b) {
    if (doFloatCalculation(FloatCalculations.lessThan, a.value, b.value)) {
      return -1;
    }

    return 0;
  });
}

const testRandomSamples: {[stock: string]: {
  distance: number;
  upOrDown: 'up' | 'down';
  unrealizedValue: number;
}[]} = {};

async function debugRandomPrices({bid, ask}: Snapshot, stock: string, stockState: StockState): Promise<StockState> {
  const aboveTopSell = doFloatCalculation(FloatCalculations.add, stockState.intervals[0][OrderSides.SELL].price, stockState.spaceBetweenIntervals);
  if (doFloatCalculation(FloatCalculations.equal, bid, stockState.callStrikePrice || aboveTopSell)) {
    return debugUpperOrLowerBound({bid, ask} as Snapshot, 'up', stock, stockState);
  }

  const belowBottomBuy = doFloatCalculation(FloatCalculations.subtract, stockState.intervals[stockState.intervals.length - 1][OrderSides.BUY].price, stockState.spaceBetweenIntervals);
  if (doFloatCalculation(FloatCalculations.equal, ask, stockState.putStrikePrice || belowBottomBuy)) {
    return debugUpperOrLowerBound({bid, ask} as Snapshot, 'down', stock, stockState);
  }

  return stockState;
}

async function debugUpperOrLowerBound(snapshot: Snapshot, upperOrLowerBound: 'up' | 'down', stock: string, stockState: StockState): Promise<StockState> {
  if (stockState.tradingLogs.length === 0) {
    restartSimulatedSnapshot();
    return (await getStockStates([stock]))[stock];
  }

  stockState.unrealizedValue = getUnrealizedValue(stockState, snapshot);

  console.log(`stock: ${stock}, bound: ${upperOrLowerBound}, ${bidOrAsk(upperOrLowerBound)}: ${snapshot[bidOrAsk(upperOrLowerBound)]}, position: ${stockState.position}, unrealizedValue: ${stockState.unrealizedValue}`);
  syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
  if (upperOrLowerBound === 'up' && stockState.position < stockState.targetPosition) {
    debugger;
  } else if (upperOrLowerBound === 'down' && stockState.position > -stockState.targetPosition) {
    debugger;
  }

  const NUM_SAMPLES = 1000;

  if (!testRandomSamples[stock]) {
    testRandomSamples[stock] = [];
  }

  const samples = testRandomSamples[stock];

  samples.push({
    upOrDown: upperOrLowerBound,
    distance: Math.abs(doFloatCalculation(FloatCalculations.subtract, stockState.tradingLogs[0].price, stockState.initialPrice)),
    unrealizedValue: stockState.unrealizedValue,
  });

  if (samples.length === NUM_SAMPLES) {
    debugger;

    const averageDistance = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.distance), 0), samples.length);
    const averageUnrealizedValue = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.unrealizedValue), 0), samples.length);
    console.log(`maxDistance: ${Math.max(...samples.map(sample => sample.distance))}`);
    console.log(`averageDistance: ${averageDistance}`);
    console.log(`averageUnrealizedValue: ${averageUnrealizedValue}`);
    testRandomSamples[stock] = [];
  }

  restartSimulatedSnapshot();
  return (await getStockStates([stock]))[stock];
}

function bidOrAsk(upperOrLowerBound: 'up' | 'down'): 'bid' | 'ask' {
  return upperOrLowerBound === 'up' ? 'bid' : 'ask';
}
