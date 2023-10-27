import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {getCurrentTimeStamp, getFileNamesWithinFolder, isMarketOpen, jsonPrettyPrint, log, readJSONFile, asyncWriteJSONFile, syncWriteJSONFile} from '../../../utils/miscellaneous';
import {restartSimulatedPrice} from '../../../utils/price-simulator';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {OrderSides, Snapshot} from '../../brokerage-clients/brokerage-client';
import {setTimeout} from 'node:timers/promises';

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
    boughtAt?: number;
  };
  [OrderSides.BUY]: {
    active: boolean;
    crossed: boolean;
    price: number;
    soldAt?: number;
  };
}

export interface StockState {
  brokerageId: string;
  brokerageTradingCostPerShare: number;
  sharesPerInterval: number,
  intervalProfit: number;
  spaceBetweenIntervals: number;
  numContracts: number;
  position: number;
  intervals: SmoothingInterval[];
  tradingLogs: {
    timeStamp: string;
    action: OrderSides,
    price: number;
    previousPosition: number;
    newPosition: number;
    realizedPnLOfTrade: number;
  }[];
  realizedPnL: number;
}

const brokerageClient = new IBKRClient();

export async function startStopLossArb(): Promise<void> {
  const stocks = await getStocks();

  const states = await getStockStates(stocks);

  await Promise.all(stocks.map(stock => (async () => {
    while (isMarketOpen()) {
      const {bid, ask} = await reconcileStockPosition(stock, states[stock]);

      if (process.env.SIMULATE_SNAPSHOT) {
        states[stock] = await debugSimulatedPrices(bid, ask, stock, states[stock]);
      }
    }
  })()));
}

async function getStocks(): Promise<string[]> {
  const fileNames = await getFileNamesWithinFolder(getStockStatesFolderPath());
  return fileNames.filter(fileName => !['template', 'skip', 'results'].some(excludedFileName => fileName.includes(excludedFileName)));
}

function getStockStatesFolderPath(): string {
  if (process.env.SIMULATE_SNAPSHOT) {
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

async function reconcileStockPosition(stock: string, stockState: StockState): Promise<{bid: number, ask: number}> {
  // 0) wait a second
  if (!process.env.SIMULATE_SNAPSHOT) {
    const ONE_SECOND = 1000;
    await setTimeout(ONE_SECOND);
  }

  // 1)
  const snapshot = await brokerageClient.getSnapshot(stockState.brokerageId);
  const crossingHappened = checkCrossings(stock, stockState, snapshot);

  if (!process.env.SIMULATE_SNAPSHOT && crossingHappened) {
    // log(`"${stock}" crossed, bid: ${bid}, ask: ${ask}, position: ${stockState.position}, realizedPnL: ${stockState.realizedPnL}`);
    asyncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
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
  const previousPnL = stockState.realizedPnL;
  if (numToBuy > 0) {
    newPosition = stockState.position + (stockState.sharesPerInterval * numToBuy);
  } else if (numToSell > 0) {
    newPosition = stockState.position - (stockState.sharesPerInterval * numToSell);
  }

  if (newPosition !== undefined) {
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
      realizedPnLOfTrade: doFloatCalculation(FloatCalculations.subtract, stockState.realizedPnL, previousPnL),
    };

    stockState.tradingLogs.push(tradingLog);

    log(`Changed position for ${stock} (${stockState.numContracts} constracts): ${jsonPrettyPrint({
      price: tradingLog.price,
      previousPosition: tradingLog.previousPosition,
      newPosition: tradingLog.newPosition,
    })}`);

    stockState.position = newPosition;

    checkCrossings(stock, stockState, snapshot);

    if (process.env.SIMULATE_SNAPSHOT) {
      syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
    } else {
      asyncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
    }
  }

  // 5)
  return snapshot;
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

function getNumToBuy(stockState: StockState, {bid, ask}: Snapshot): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  const indexesToExecute: number[] = [];
  for (let i = intervals.length - 1; i >= 0; i--) {
    const interval = intervals[i];

    if (doFloatCalculation(FloatCalculations.greaterThanOrEqual, ask, interval[OrderSides.BUY].price) && interval[OrderSides.BUY].active && interval[OrderSides.BUY].crossed) {
      // if (interval.type === IntervalTypes.LONG && newPosition == interval.positionLimit || newPosition < interval.positionLimit) {
      if (newPosition <= interval.positionLimit) {
        indexesToExecute.push(i);
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

    if (interval.type === IntervalTypes.LONG) {
      interval[OrderSides.SELL].boughtAt = ask;
    } else if (interval.type === IntervalTypes.SHORT) {
      const unscaledSalePnL = doFloatCalculation(FloatCalculations.subtract, interval[OrderSides.BUY].soldAt!, ask);
      const salePnL = doFloatCalculation(FloatCalculations.multiply, unscaledSalePnL, stockState.sharesPerInterval);
      stockState.realizedPnL = doFloatCalculation(FloatCalculations.add, stockState.realizedPnL, salePnL);
      delete interval[OrderSides.BUY].soldAt;
    }
  }

  if (indexesToExecute.length > 0) {
    const tradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, indexesToExecute.length * stockState.sharesPerInterval);
    stockState.realizedPnL = doFloatCalculation(FloatCalculations.subtract, stockState.realizedPnL, tradingCosts);

    insertClonedShortIntervals(stockState, indexesToExecute, bid);
    removeResolvedClonedIntervalsAbove(stockState, indexesToExecute);
  }

  return indexesToExecute.length;
}

function insertClonedShortIntervals(stockState: StockState, indexesToExecute: number[], bid: number): void {
  let newIntervals: SmoothingInterval[] = [...stockState.intervals];

  for (const indexToExecute of indexesToExecute) {
    if (doFloatCalculation(FloatCalculations.greaterThan, bid, stockState.intervals[indexToExecute][OrderSides.SELL].price)) {
      continue;
    }

    const originalIndexInNewIntervals = newIntervals.findIndex(interval => interval === stockState.intervals[indexToExecute]);

    const newShortIntervalSellPrice = doFloatCalculation(FloatCalculations.subtract, stockState.intervals[indexToExecute][OrderSides.SELL].price, stockState.spaceBetweenIntervals);
    const newShortInterval: SmoothingInterval = {
      type: IntervalTypes.SHORT,
      positionLimit: stockState.intervals[indexToExecute].positionLimit,
      SELL: {
        active: true,
        crossed: false,
        price: newShortIntervalSellPrice,
      },
      BUY: {
        active: false,
        crossed: false,
        price: doFloatCalculation(FloatCalculations.subtract, newShortIntervalSellPrice, stockState.intervalProfit),
      }
    };

    const intervalsAboveAndIncludingOriginal = newIntervals.slice(0, originalIndexInNewIntervals + 1);
    const intervalsBelowOriginal = newIntervals.slice(originalIndexInNewIntervals + 1);

    intervalsBelowOriginal.forEach(interval => {
      interval[OrderSides.SELL].price = doFloatCalculation(FloatCalculations.subtract, interval[OrderSides.SELL].price, stockState.spaceBetweenIntervals);
      interval[OrderSides.BUY].price = doFloatCalculation(FloatCalculations.subtract, interval[OrderSides.BUY].price, stockState.spaceBetweenIntervals);
    });

    newIntervals = [
      ...intervalsAboveAndIncludingOriginal,
      newShortInterval,
      ...intervalsBelowOriginal,
    ];
  }

  stockState.intervals = newIntervals;
}

function removeResolvedClonedIntervalsAbove(stockState: StockState, indexesToExecute: number[]): void {
  let newIntervals: SmoothingInterval[] = [...stockState.intervals];

  for (const indexToExecute of indexesToExecute) {
    const originalInterval = stockState.intervals[indexToExecute];
    const originalIndexInNewIntervals = newIntervals.findIndex(interval => interval === stockState.intervals[indexToExecute]);
    
    let intervalsAboveOriginal = newIntervals.slice(0, originalIndexInNewIntervals);
    let numRemoved = 0;
    intervalsAboveOriginal = intervalsAboveOriginal.filter(interval => {
      const isIntervalOfAnotherPosition = interval.positionLimit !== originalInterval.positionLimit;
      if (isIntervalOfAnotherPosition) {
        return true;
      }

      const isSellActiveShortIntervalOfSamePosition = interval.type === IntervalTypes.SHORT && interval[OrderSides.SELL].active;
      const isBuyActiveLongIntervalOfSamePosition = interval.type === IntervalTypes.LONG && interval[OrderSides.BUY].active;

      if (!isSellActiveShortIntervalOfSamePosition && !isBuyActiveLongIntervalOfSamePosition) {
        return true;
      }

      numRemoved++;
      return false;
    });

    if (numRemoved > 0) {
      intervalsAboveOriginal.forEach(interval => {
        const shiftPriceBy = doFloatCalculation(FloatCalculations.multiply, numRemoved, stockState.spaceBetweenIntervals);
        interval[OrderSides.SELL].price = doFloatCalculation(FloatCalculations.subtract, interval[OrderSides.SELL].price, shiftPriceBy);
        interval[OrderSides.BUY].price = doFloatCalculation(FloatCalculations.subtract, interval[OrderSides.BUY].price, shiftPriceBy);
      });

      const intervalsBelowAndIncludingOriginal = newIntervals.slice(originalIndexInNewIntervals);
      newIntervals = [
        ...intervalsAboveOriginal,
        ...intervalsBelowAndIncludingOriginal,
      ];
    }
  }

  stockState.intervals = newIntervals;
}

function getNumToSell(stockState: StockState, {bid, ask}: Snapshot): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  let indexesToExecute: number[] = [];
  for (const [i, interval] of intervals.entries()) {
    if (doFloatCalculation(FloatCalculations.lessThanOrEqual, bid, interval[OrderSides.SELL].price)  && interval[OrderSides.SELL].active && interval[OrderSides.SELL].crossed) {
      // if (interval.type === IntervalTypes.SHORT && newPosition == interval.positionLimit || newPosition > interval.positionLimit) {
      if (newPosition > interval.positionLimit) {
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

    if (interval.type === IntervalTypes.LONG) {
      const unscaledSalePnL = doFloatCalculation(FloatCalculations.subtract, bid, interval[OrderSides.SELL].boughtAt!);
      const salePnL = doFloatCalculation(FloatCalculations.multiply, unscaledSalePnL, stockState.sharesPerInterval);
      stockState.realizedPnL = doFloatCalculation(FloatCalculations.add, stockState.realizedPnL, salePnL);
      delete interval[OrderSides.SELL].boughtAt;
    } else if (interval.type === IntervalTypes.SHORT) {
      interval[OrderSides.BUY].soldAt = bid;
    }
  }

  if (indexesToExecute.length > 0) {
    const tradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, indexesToExecute.length * stockState.sharesPerInterval);
    stockState.realizedPnL = doFloatCalculation(FloatCalculations.subtract, stockState.realizedPnL, tradingCosts);
  
    insertClonedLongIntervals(stockState, indexesToExecute, ask);
    removeResolvedClonedIntervalsBelow(stockState, indexesToExecute);
  }

  return indexesToExecute.length;
}

function insertClonedLongIntervals(stockState: StockState, indexesToExecute: number[], ask: number): void {
  let newIntervals: SmoothingInterval[] = [...stockState.intervals];

  for (const indexToExecute of indexesToExecute) {
    if (doFloatCalculation(FloatCalculations.lessThan, ask, stockState.intervals[indexToExecute][OrderSides.BUY].price)) {
      continue;
    }

    const originalIndexInNewIntervals = newIntervals.findIndex(interval => interval === stockState.intervals[indexToExecute]);

    const newLongIntervalBuyPrice = doFloatCalculation(FloatCalculations.add, stockState.intervals[indexToExecute][OrderSides.BUY].price, stockState.spaceBetweenIntervals);
    const newLongInterval: SmoothingInterval = {
      type: IntervalTypes.LONG,
      positionLimit: stockState.intervals[indexToExecute].positionLimit,
      SELL: {
        active: false,
        crossed: false,
        price: doFloatCalculation(FloatCalculations.add, newLongIntervalBuyPrice, stockState.intervalProfit),
      },
      BUY: {
        active: true,
        crossed: false,
        price: newLongIntervalBuyPrice,
      }
    };

    const intervalsAboveOriginal = newIntervals.slice(0, originalIndexInNewIntervals);
    const intervalsBelowAndIncludingOriginal = newIntervals.slice(originalIndexInNewIntervals);

    intervalsAboveOriginal.forEach(interval => {
      interval[OrderSides.SELL].price = doFloatCalculation(FloatCalculations.add, interval[OrderSides.SELL].price, stockState.spaceBetweenIntervals);
      interval[OrderSides.BUY].price = doFloatCalculation(FloatCalculations.add, interval[OrderSides.BUY].price, stockState.spaceBetweenIntervals);
    });

    newIntervals = [
      ...intervalsAboveOriginal,
      newLongInterval,
      ...intervalsBelowAndIncludingOriginal,
    ];
  }

  stockState.intervals = newIntervals;
}

function removeResolvedClonedIntervalsBelow(stockState: StockState, indexesToExecute: number[]): void {
  let newIntervals: SmoothingInterval[] = [...stockState.intervals];

  for (const indexToExecute of indexesToExecute) {
    const originalInterval = stockState.intervals[indexToExecute];
    const originalIndexInNewIntervals = newIntervals.findIndex(interval => interval === stockState.intervals[indexToExecute]);
    
    let numRemoved = 0;
    let intervalsBelowOriginal = newIntervals.slice(originalIndexInNewIntervals + 1);
    intervalsBelowOriginal = intervalsBelowOriginal.filter(interval => {
      const isIntervalOfAnotherPosition = interval.positionLimit !== originalInterval.positionLimit;
      if (isIntervalOfAnotherPosition) {
        return true;
      }

      const isSellActiveShortIntervalOfSamePosition = interval.type === IntervalTypes.SHORT && interval[OrderSides.SELL].active;
      const isBuyActiveLongIntervalOfSamePosition = interval.type === IntervalTypes.LONG && interval[OrderSides.BUY].active;

      if (!isSellActiveShortIntervalOfSamePosition && !isBuyActiveLongIntervalOfSamePosition) {
        return true;
      }

      numRemoved++;
      return false;
    });

    if (numRemoved > 0) {
      intervalsBelowOriginal.forEach(interval => {
        const shiftPriceBy = doFloatCalculation(FloatCalculations.multiply, numRemoved, stockState.spaceBetweenIntervals);
        interval[OrderSides.SELL].price = doFloatCalculation(FloatCalculations.add, interval[OrderSides.SELL].price, shiftPriceBy);
        interval[OrderSides.BUY].price = doFloatCalculation(FloatCalculations.add, interval[OrderSides.BUY].price, shiftPriceBy);
      });

      const intervalsAboveAndIncludingOriginal = newIntervals.slice(0, originalIndexInNewIntervals + 1);
      newIntervals = [
        ...intervalsAboveAndIncludingOriginal,
        ...intervalsBelowOriginal,
      ];
    }
  }

  stockState.intervals = newIntervals;
}

let stocksRealizedPnLs: {[stock: string]: number[]} = {};

async function debugSimulatedPrices(bid: number, ask: number, stock: string, stockState: StockState): Promise<StockState> {
  const NUM_PNL_SAMPLES = 3000;
  
  const upperBound = doFloatCalculation(FloatCalculations.add, stockState.intervals[0][OrderSides.SELL].price, 0.5);
  if (doFloatCalculation(FloatCalculations.greaterThan, bid, upperBound)) {
    console.log(`stock: ${stock}, bid: ${bid}, position: ${stockState.position}, realizedPnL: ${stockState.realizedPnL}`);

    if (stockState.position < 100) {
      syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
      debugger;
    }

    if (!stocksRealizedPnLs[stock]) {
      stocksRealizedPnLs[stock] = [];
    }
    const realizedPnLs = stocksRealizedPnLs[stock];

    realizedPnLs.push(stockState.realizedPnL);
    if (realizedPnLs.length === NUM_PNL_SAMPLES) {
      const averagePnL = realizedPnLs.reduce((sum, realizedPnL) => sum + realizedPnL, 0) / realizedPnLs.length;
      console.log(`averagePnL: ${averagePnL}`);
      debugger;
      stocksRealizedPnLs[stock] = [];
    }

    restartSimulatedPrice();
    return (await getStockStates([stock]))[stock];
  }

  const lowerBound = doFloatCalculation(FloatCalculations.subtract, stockState.intervals[stockState.intervals.length - 1][OrderSides.BUY].price, 0.5);
  if (doFloatCalculation(FloatCalculations.lessThan, ask, lowerBound)) {
    console.log(`stock: ${stock}, ask: ${ask}, position: ${stockState.position}, realizedPnL: ${stockState.realizedPnL}`);

    if (stockState.position > 10) { // ) -100) {
      syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
      debugger;
    }

    if (!stocksRealizedPnLs[stock]) {
      stocksRealizedPnLs[stock] = [];
    }
    const realizedPnLs = stocksRealizedPnLs[stock];

    realizedPnLs.push(stockState.realizedPnL);
    if (realizedPnLs.length === NUM_PNL_SAMPLES) {
      const averagePnL = realizedPnLs.reduce((sum, realizedPnL) => sum + realizedPnL, 0) / realizedPnLs.length;
      console.log(`averagePnL: ${averagePnL}`);
      debugger;
      stocksRealizedPnLs[stock] = [];
    }

    restartSimulatedPrice();
    return (await getStockStates([stock]))[stock];
  }

  return stockState;
}
