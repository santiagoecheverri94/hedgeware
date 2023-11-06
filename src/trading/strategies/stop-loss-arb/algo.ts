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
  premiumSold: number;
  callStrikePrice: number;
  initialPrice: number;
  putStrikePrice: number;
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
  accountValue: number;
}

const brokerageClient = new IBKRClient();

export async function startStopLossArb(): Promise<void> {
  const stocks = await getStocks();

  const states = await getStockStates(stocks);

  await Promise.all(stocks.map(stock => (async () => {
    while (await isMarketOpen()) {
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

    stockState.tradingLogs.unshift(tradingLog);

    log(`Changed position for ${stock} (${stockState.numContracts} constracts): ${jsonPrettyPrint({
      price: tradingLog.price,
      previousPosition: tradingLog.previousPosition,
      newPosition: tradingLog.newPosition,
    })}`);

    stockState.position = newPosition;

    checkCrossings(stock, stockState, snapshot);

    if (!process.env.SIMULATE_SNAPSHOT) {
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
      if (interval.type === IntervalTypes.LONG && newPosition == interval.positionLimit || newPosition < interval.positionLimit) {
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
    stockState.accountValue = doFloatCalculation(FloatCalculations.subtract, stockState.accountValue, purchaseValue);

    const tradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, indexesToExecute.length * stockState.sharesPerInterval);
    stockState.accountValue = doFloatCalculation(FloatCalculations.subtract, stockState.accountValue, tradingCosts);

    correctBadBuyIfRequired(stockState, indexesToExecute);
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

  stockState.intervals.forEach(interval => {
    interval[OrderSides.BUY].price = doFloatCalculation(FloatCalculations.add, interval[OrderSides.BUY].price, stockState.spaceBetweenIntervals);
    interval[OrderSides.SELL].price = doFloatCalculation(FloatCalculations.add, interval[OrderSides.SELL].price, stockState.spaceBetweenIntervals);
  });
}

function getNumToSell(stockState: StockState, {bid, ask}: Snapshot): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  let indexesToExecute: number[] = [];
  for (const [i, interval] of intervals.entries()) {
    if (doFloatCalculation(FloatCalculations.lessThanOrEqual, bid, interval[OrderSides.SELL].price)  && interval[OrderSides.SELL].active && interval[OrderSides.SELL].crossed) {
      if (interval.type === IntervalTypes.SHORT && newPosition == interval.positionLimit || newPosition > interval.positionLimit) {
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
    stockState.accountValue = doFloatCalculation(FloatCalculations.add, stockState.accountValue, saleValue);

    const tradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, indexesToExecute.length * stockState.sharesPerInterval);
    stockState.accountValue = doFloatCalculation(FloatCalculations.subtract, stockState.accountValue, tradingCosts);
  
    correctBadSellIfRequired(stockState, indexesToExecute);
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

  stockState.intervals.forEach(interval => {
    interval[OrderSides.BUY].price = doFloatCalculation(FloatCalculations.subtract, interval[OrderSides.BUY].price, stockState.spaceBetweenIntervals);
    interval[OrderSides.SELL].price = doFloatCalculation(FloatCalculations.subtract, interval[OrderSides.SELL].price, stockState.spaceBetweenIntervals);
  });
}

let testSamples: {[stock: string]: {
  distance: number;
  upOrDown: 'up' | 'down';
  accountValue: number;
}[]} = {};

async function debugSimulatedPrices(bid: number, ask: number, stock: string, stockState: StockState): Promise<StockState> {
  if (doFloatCalculation(FloatCalculations.equal, bid, stockState.callStrikePrice)) {
    return debugUpperOrLowerBound({bid, ask} as Snapshot, 'up', stock, stockState);
  }

  if (doFloatCalculation(FloatCalculations.equal, ask, stockState.putStrikePrice)) {
    return debugUpperOrLowerBound({bid, ask} as Snapshot, 'down', stock, stockState);
  }

  return stockState;
}

async function debugUpperOrLowerBound(snapshot: Snapshot, upperOrLowerBound: 'up' | 'down', stock: string, stockState: StockState): Promise<StockState> {
  if (stockState.tradingLogs.length === 0) {
    restartSimulatedPrice();
    return (await getStockStates([stock]))[stock];
  }

  const finalTransactionValue = doFloatCalculation(FloatCalculations.multiply, Math.abs(stockState.position), snapshot[bidOrAsk(upperOrLowerBound)]);
  stockState.accountValue = doFloatCalculation(upperOrLowerBound === 'up' ? FloatCalculations.add : FloatCalculations.subtract, stockState.accountValue, finalTransactionValue);
  
  const finalTradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, Math.abs(stockState.position));
  stockState.accountValue = doFloatCalculation(FloatCalculations.subtract, stockState.accountValue, finalTradingCosts);

  console.log(`stock: ${stock}, bound: ${upperOrLowerBound}, ${bidOrAsk(upperOrLowerBound)}: ${snapshot[bidOrAsk(upperOrLowerBound)]}, position: ${stockState.position}, accountValue: ${stockState.accountValue}`);
  syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
  if (upperOrLowerBound === 'up' && stockState.position < stockState.targetPosition) {
    debugger;
  } else if (upperOrLowerBound === 'down' && stockState.position > -stockState.targetPosition) {
    debugger;
  }

  const NUM_SAMPLES = 1_000;

  if (!testSamples[stock]) {
    testSamples[stock] = [];
  }
  const samples = testSamples[stock];

  samples.push({
    upOrDown: upperOrLowerBound,
    distance: Math.abs(doFloatCalculation(FloatCalculations.subtract, stockState.tradingLogs[0].price, stockState.initialPrice)),
    accountValue: stockState.accountValue,
  });

  if (samples.length === NUM_SAMPLES) {
    debugger;

    const averageDistance = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.distance), 0), samples.length);
    const averageAccountValue = doFloatCalculation(FloatCalculations.divide, samples.reduce((sum, sample) => doFloatCalculation(FloatCalculations.add, sum, sample.accountValue), 0), samples.length);
    console.log(`maxDistance: ${Math.max(...samples.map(sample => sample.distance))}`);
    console.log(`averageDistance: ${averageDistance}`);
    console.log(`averageAccountValue: ${averageAccountValue}`);
    testSamples[stock] = [];
  }

  restartSimulatedPrice();
  return (await getStockStates([stock]))[stock];
}

function bidOrAsk(upperOrLowerBound: 'up' | 'down'): 'bid' | 'ask' {
  return upperOrLowerBound === 'up' ? 'bid' : 'ask';
}
