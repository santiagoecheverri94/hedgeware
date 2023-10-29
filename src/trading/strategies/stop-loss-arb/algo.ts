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
  targetPosition: number;
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
  // TODO: consier moving these branches to inside getNumBuy and getNumSell
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
      // syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
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

function getNumToBuy(stockState: StockState, {ask}: Snapshot): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  const indexesToExecute: number[] = [];
  for (let i = intervals.length - 1; i >= 0; i--) {
    const interval = intervals[i];

    if (doFloatCalculation(FloatCalculations.greaterThanOrEqual, ask, interval[OrderSides.BUY].price) && interval[OrderSides.BUY].active && interval[OrderSides.BUY].crossed) {
      if (newPosition < interval.positionLimit) {
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

    insertShortTailIntervalAtTheBottom(stockState, newPosition);
    removeResolvedLongTailIntervalsAtTheTop(stockState, indexesToExecute);
  }

  return indexesToExecute.length;
}

function insertShortTailIntervalAtTheBottom(stockState: StockState, newPosition: number): void {
  if (-newPosition <= -stockState.targetPosition) {
    return;
  }

  const newShortIntervalSellPrice = doFloatCalculation(FloatCalculations.subtract, stockState.intervals[stockState.intervals.length - 1][OrderSides.SELL].price, stockState.spaceBetweenIntervals);

  const newShortInterval: SmoothingInterval = {
    type: IntervalTypes.SHORT,
    positionLimit: -stockState.targetPosition,
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

  stockState.intervals.push(newShortInterval);
}

function removeResolvedLongTailIntervalsAtTheTop(stockState: StockState, indexesToExecute: number[]): void {
  const resolvedLongTailIntervalsIndexes: number[] = [];

  for (let intervalIndex = 0; intervalIndex < stockState.intervals.length; intervalIndex++) {
    if (resolvedLongTailIntervalsIndexes.length === indexesToExecute.length) {
      break;
    }

    if (stockState.intervals[intervalIndex + 1].positionLimit < stockState.targetPosition) {
      break;
    }

    const interval = stockState.intervals[intervalIndex];
    if (interval.type === IntervalTypes.LONG && interval[OrderSides.BUY].active) {
      resolvedLongTailIntervalsIndexes.push(intervalIndex);
    }
  }

  stockState.intervals = stockState.intervals.filter((_, index) => !resolvedLongTailIntervalsIndexes.includes(index));
}

function getNumToSell(stockState: StockState, {bid}: Snapshot): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  let indexesToExecute: number[] = [];
  for (const [i, interval] of intervals.entries()) {
    if (doFloatCalculation(FloatCalculations.lessThanOrEqual, bid, interval[OrderSides.SELL].price)  && interval[OrderSides.SELL].active && interval[OrderSides.SELL].crossed) {
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
  
    insertLongTailIntervalAtTheTop(stockState, newPosition);
    removeResolvedShortTailIntervalsAtTheBottom(stockState, indexesToExecute);
  }

  return indexesToExecute.length;
}

function insertLongTailIntervalAtTheTop(stockState: StockState, newPosition: number): void {
  if (newPosition >= stockState.targetPosition) {
    return;
  }

  const newLongIntervalBuyPrice = doFloatCalculation(FloatCalculations.add, stockState.intervals[0][OrderSides.BUY].price, stockState.spaceBetweenIntervals);
    
  const newLongInterval: SmoothingInterval = {
    type: IntervalTypes.LONG,
    positionLimit: stockState.targetPosition,
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

  stockState.intervals.unshift(newLongInterval);
}

function removeResolvedShortTailIntervalsAtTheBottom(stockState: StockState, indexesToExecute: number[]): void {
  const resolvedShortTailIntervalsIndexes: number[] = [];

  for (let intervalIndex = stockState.intervals.length - 1; intervalIndex >= 0; intervalIndex--) {
    if (resolvedShortTailIntervalsIndexes.length === indexesToExecute.length) {
      break;
    }

    if (stockState.intervals[intervalIndex - 1].positionLimit > -stockState.targetPosition) {
      break;
    }

    const interval = stockState.intervals[intervalIndex];
    if (interval.type === IntervalTypes.SHORT && interval[OrderSides.SELL].active) {
      resolvedShortTailIntervalsIndexes.push(intervalIndex);
    }
  }

  stockState.intervals = stockState.intervals.filter((_, index) => !resolvedShortTailIntervalsIndexes.includes(index));
}

let testSamples: {[stock: string]: {
  distance: number;
  upOrDown: 'up' | 'down';
  realizedPnL: number;
}[]} = {};

async function debugSimulatedPrices(bid: number, ask: number, stock: string, stockState: StockState): Promise<StockState> {
  const NUM_SAMPLES = 600;
  
  const upperBound = doFloatCalculation(FloatCalculations.add, stockState.intervals[0][OrderSides.SELL].price, 0.5);
  if (doFloatCalculation(FloatCalculations.greaterThan, bid, upperBound)) {
    console.log(`stock: ${stock}, bid: ${bid}, position: ${stockState.position}, realizedPnL: ${stockState.realizedPnL}`);

    if (stockState.position < stockState.targetPosition) {
      syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
      debugger;
    }

    if (!testSamples[stock]) {
      testSamples[stock] = [];
    }
    const samples = testSamples[stock];

    samples.push({
      upOrDown: 'up',
      distance: doFloatCalculation(FloatCalculations.subtract, stockState.tradingLogs[stockState.tradingLogs.length - 1].price, 11.92),
      realizedPnL: stockState.realizedPnL,
    });
    if (samples.length === NUM_SAMPLES) {
      debugger;

      const averageDistance = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.distance), 0), samples.length);
      const averagePnL = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.realizedPnL), 0), samples.length);
      console.log(`averageDistance: ${averageDistance}`);
      console.log(`averagePnL: ${averagePnL}`);
      testSamples[stock] = [];
    }

    restartSimulatedPrice();
    return (await getStockStates([stock]))[stock];
  }

  const lowerBound = doFloatCalculation(FloatCalculations.subtract, stockState.intervals[stockState.intervals.length - 1][OrderSides.BUY].price, 0.5);
  if (doFloatCalculation(FloatCalculations.lessThan, ask, lowerBound)) {
    console.log(`stock: ${stock}, ask: ${ask}, position: ${stockState.position}, realizedPnL: ${stockState.realizedPnL}`);

    if (stockState.position > -stockState.targetPosition) {
      syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
      debugger;
    }

    if (!testSamples[stock]) {
      testSamples[stock] = [];
    }
    const samples = testSamples[stock];

    samples.push({
      upOrDown: 'down',
      distance: doFloatCalculation(FloatCalculations.subtract, 11.92, stockState.tradingLogs[stockState.tradingLogs.length - 1].price),
      realizedPnL: stockState.realizedPnL,
    });
    if (samples.length === NUM_SAMPLES) {
      debugger;

      const averageDistance = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.distance), 0), samples.length);
      const averagePnL = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.realizedPnL), 0), samples.length);
      console.log(`averageDistance: ${averageDistance}`);
      console.log(`averagePnL: ${averagePnL}`);
      testSamples[stock] = [];
    }

    restartSimulatedPrice();
    return (await getStockStates([stock]))[stock];
  }

  return stockState;
}
