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
    backUpShortIntervals?: SmoothingInterval[];
  };
  [OrderSides.BUY]: {
    active: boolean;
    crossed: boolean;
    price: number;
    soldAt?: number;
    backUpLongIntervals?: SmoothingInterval[];
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
  }[];
  accountValue: number;
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
      removeNonNeededLongBackupIntervals(stockState, interval);
      crossingHappened = true;
    }

    if (interval[OrderSides.SELL].active && !interval[OrderSides.SELL].crossed && doFloatCalculation(FloatCalculations.greaterThan, bid, interval[OrderSides.SELL].price)) {
      interval[OrderSides.SELL].crossed = true;
      removeNonNeededShortBackupIntervals(stockState, interval);
      crossingHappened = true;
    }
  }

  return crossingHappened;
}

function removeNonNeededLongBackupIntervals(stockState: StockState, parentInterval: SmoothingInterval): void {
  const backUpLongIntervals = parentInterval[OrderSides.BUY].backUpLongIntervals;
  const newBackUpLongIntervals: SmoothingInterval[] = [];
  if (backUpLongIntervals && backUpLongIntervals.length > 0) {
    for (let i = 0; i < backUpLongIntervals.length; i++) {
      const backupLongInterval = backUpLongIntervals[i];

      if (backupLongInterval[OrderSides.BUY].active) {
        const indexOfBackupLongInterval = stockState.intervals.indexOf(backupLongInterval);
        for (let j = 0; j < indexOfBackupLongInterval; j++) {
          stockState.intervals[j][OrderSides.SELL].price = doFloatCalculation(FloatCalculations.subtract, stockState.intervals[j][OrderSides.SELL].price, stockState.spaceBetweenIntervals);
          stockState.intervals[j][OrderSides.BUY].price = doFloatCalculation(FloatCalculations.subtract, stockState.intervals[j][OrderSides.BUY].price, stockState.spaceBetweenIntervals);
        }

        stockState.intervals.splice(indexOfBackupLongInterval, 1);
      } else {
        newBackUpLongIntervals.push(backupLongInterval);
      }
    }

    parentInterval[OrderSides.BUY].backUpLongIntervals = newBackUpLongIntervals;
  }
}

function removeNonNeededShortBackupIntervals(stockState: StockState, parentInterval: SmoothingInterval): void {
  const backUpShortIntervals = parentInterval[OrderSides.SELL].backUpShortIntervals;
  const newBackUpShortIntervals: SmoothingInterval[] = [];
  if (backUpShortIntervals && backUpShortIntervals.length > 0) {
    for (let i = 0; i < backUpShortIntervals.length; i++) {
      const backupShortInterval = backUpShortIntervals[i];

      if (backupShortInterval[OrderSides.SELL].active) {
        const indexOfBackupShortInterval = stockState.intervals.indexOf(backupShortInterval);
        for (let j = stockState.intervals.length - 1; j > indexOfBackupShortInterval; j--) {
          stockState.intervals[j][OrderSides.SELL].price = doFloatCalculation(FloatCalculations.add, stockState.intervals[j][OrderSides.SELL].price, stockState.spaceBetweenIntervals);
          stockState.intervals[j][OrderSides.BUY].price = doFloatCalculation(FloatCalculations.add, stockState.intervals[j][OrderSides.BUY].price, stockState.spaceBetweenIntervals);
        }

        stockState.intervals.splice(indexOfBackupShortInterval, 1);
      } else {
        newBackUpShortIntervals.push(backupShortInterval);
      }
    }

    parentInterval[OrderSides.SELL].backUpShortIntervals = newBackUpShortIntervals;
  }
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

    const purchaseValue = doFloatCalculation(FloatCalculations.multiply, stockState.sharesPerInterval, ask);
    stockState.accountValue = doFloatCalculation(FloatCalculations.subtract, stockState.accountValue, purchaseValue);
    stockState.accountValue = doFloatCalculation(FloatCalculations.subtract, stockState.accountValue, tradingCosts);

    insertShortTailIntervalAtTheBottom({
      stockState,
      newPosition,
      indexesToExecute,
      bid,
    });
  }

  return indexesToExecute.length;
}

function insertShortTailIntervalAtTheBottom({
  stockState,
  newPosition,
  indexesToExecute,
  bid,
}: {
  stockState: StockState,
  newPosition: number,
  indexesToExecute: number[],
  bid: number,
}): void {
  const topIntervalBought = stockState.intervals[indexesToExecute[0]];
  // if (doFloatCalculation(FloatCalculations.greaterThan, bid, topIntervalBought[OrderSides.SELL].price)) {
  //   return;
  // }

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

  if (topIntervalBought[OrderSides.SELL].backUpShortIntervals) {
    topIntervalBought[OrderSides.SELL].backUpShortIntervals.push(newShortInterval);
  } else {
    topIntervalBought[OrderSides.SELL].backUpShortIntervals = [newShortInterval];
  }

  stockState.intervals.push(newShortInterval);
}

function getNumToSell(stockState: StockState, {bid, ask}: Snapshot): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  let indexesToExecute: number[] = [];
  for (const [i, interval] of intervals.entries()) {
    if (doFloatCalculation(FloatCalculations.lessThanOrEqual, bid, interval[OrderSides.SELL].price)  && interval[OrderSides.SELL].active && interval[OrderSides.SELL].crossed) {
      // if (interval.type === IntervalTypes.SHORT && newPosition == interval.positionLimit || newPosition > interval.positionLimit) {
      if (newPosition >= interval.positionLimit) {
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

    const saleValue = doFloatCalculation(FloatCalculations.multiply, stockState.sharesPerInterval, ask);
    stockState.accountValue = doFloatCalculation(FloatCalculations.add, stockState.accountValue, saleValue);
    stockState.accountValue = doFloatCalculation(FloatCalculations.subtract, stockState.accountValue, tradingCosts);
  
    insertLongTailIntervalAtTheTop({
      stockState,
      newPosition,
      indexesToExecute,
      ask,
    });
  }

  return indexesToExecute.length;
}

function insertLongTailIntervalAtTheTop({
  stockState,
  newPosition,
  indexesToExecute,
  ask,
}: {
  stockState: StockState,
  newPosition: number,
  indexesToExecute: number[],
  ask: number,
}): void {
  const bottomIntervalSold = stockState.intervals[indexesToExecute[indexesToExecute.length - 1]];
  // if (doFloatCalculation(FloatCalculations.lessThan, ask, bottomIntervalSold[OrderSides.BUY].price)) {
  //   return;
  // }

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

  if (bottomIntervalSold[OrderSides.BUY].backUpLongIntervals) {
    bottomIntervalSold[OrderSides.BUY].backUpLongIntervals.unshift(newLongInterval);
  } else {
    bottomIntervalSold[OrderSides.BUY].backUpLongIntervals = [newLongInterval];
  }

  stockState.intervals.unshift(newLongInterval);
}

let testSamples: {[stock: string]: {
  distance: number;
  upOrDown: 'up' | 'down';
  realizedPnL: number;
  accountValue: number;
}[]} = {};

async function debugSimulatedPrices(bid: number, ask: number, stock: string, stockState: StockState): Promise<StockState> {
  const NUM_SAMPLES = 225;
  
  const upperBound = doFloatCalculation(FloatCalculations.add, stockState.intervals[0][OrderSides.SELL].price, 0.5);
  if (doFloatCalculation(FloatCalculations.greaterThan, bid, upperBound)) {
    console.log(`stock: ${stock}, bid: ${bid}, position: ${stockState.position}, realizedPnL: ${stockState.realizedPnL}`);

    const finalSaleValue = doFloatCalculation(FloatCalculations.multiply, stockState.position, bid);
    stockState.accountValue = doFloatCalculation(FloatCalculations.add, stockState.accountValue, finalSaleValue);
    const finalTradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, stockState.position);
    stockState.accountValue = doFloatCalculation(FloatCalculations.subtract, stockState.accountValue, finalTradingCosts);
    syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
    if (stockState.position < 100) {
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
      accountValue: stockState.accountValue,
    });
    if (samples.length === NUM_SAMPLES) {
      debugger;

      const averageDistance = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.distance), 0), samples.length);
      const averagePnL = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.realizedPnL), 0), samples.length);
      const averageAccountValue = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.accountValue), 0), samples.length);
      console.log(`averageDistance: ${averageDistance}`);
      console.log(`averagePnL: ${averagePnL}`);
      console.log(`averageAccountValue: ${averageAccountValue}`);
      testSamples[stock] = [];
    }

    restartSimulatedPrice();
    return (await getStockStates([stock]))[stock];
  }

  const lowerBound = doFloatCalculation(FloatCalculations.subtract, stockState.intervals[stockState.intervals.length - 1][OrderSides.BUY].price, 0.5);
  if (doFloatCalculation(FloatCalculations.lessThan, ask, lowerBound)) {
    console.log(`stock: ${stock}, ask: ${ask}, position: ${stockState.position}, realizedPnL: ${stockState.realizedPnL}`);

    const finalPurchaseValue = doFloatCalculation(FloatCalculations.multiply, Math.abs(stockState.position), ask);
    stockState.accountValue = doFloatCalculation(FloatCalculations.subtract, stockState.accountValue, finalPurchaseValue);
    const finalTradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, Math.abs(stockState.position));
    stockState.accountValue = doFloatCalculation(FloatCalculations.subtract, stockState.accountValue, finalTradingCosts);
    syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
    if (stockState.position > -100) {
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
      accountValue: stockState.accountValue,
    });
    if (samples.length === NUM_SAMPLES) {
      debugger;

      const averageDistance = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.distance), 0), samples.length);
      const averagePnL = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.realizedPnL), 0), samples.length);
      const averageAccountValue = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.accountValue), 0), samples.length);
      console.log(`averageDistance: ${averageDistance}`);
      console.log(`averagePnL: ${averagePnL}`);
      console.log(`averageAccountValue: ${averageAccountValue}`);
      testSamples[stock] = [];
    }

    restartSimulatedPrice();
    return (await getStockStates([stock]))[stock];
  }

  return stockState;
}
