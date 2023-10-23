import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {getCurrentTimeStamp, getFileNamesWithinFolder, isMarketOpen, jsonPrettyPrint, log, readJSONFile, asyncWriteJSONFile, syncWriteJSONFile} from '../../../utils/miscellaneous';
import {restartSimulatedPrice} from '../../../utils/price-simulator';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {OrderSides} from '../../brokerage-clients/brokerage-client';
import {setTimeout} from 'node:timers/promises';

interface SmoothingInterval {
  positionLimit: number;
  [OrderSides.SELL]: {
    active: boolean;
    crossed: boolean;
    price: number;
    boughtAt: number;
  };
  [OrderSides.BUY]: {
    active: boolean;
    crossed: boolean;
    price: number;
  };
}

interface StockState {
  uncrossedBuyingSkips: number;
  brokerageId: string;
  brokerageTradingCostPerShare: number;
  sharesPerInterval: number,
  numContracts: number;
  position: number;
  intervals: SmoothingInterval[];
  tradingLogs: {
    timeStamp: string;
    action: OrderSides,
    price: number;
    previousPosition: number;
    newPosition: number;
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

function getStockStateFilePath(stock: string): string {
  return `${getStockStatesFolderPath()}\\${stock}.json`;
}

async function reconcileStockPosition(stock: string, stockState: StockState): Promise<{bid: number, ask: number}> {
  // 0) wait a second
  if (!process.env.SIMULATE_SNAPSHOT) {
    const ONE_SECOND = 1000;
    await setTimeout(ONE_SECOND);
  }

  // 1)
  const {bid, ask} = await brokerageClient.getSnapshot(stockState.brokerageId);
  const crossingHappened = checkCrossings(stock, stockState, bid, ask);

  if (!process.env.SIMULATE_SNAPSHOT && crossingHappened) {
    log(`"${stock}" crossed, bid: ${bid}, ask: ${ask}, position: ${stockState.position}, realizedPnL: ${stockState.realizedPnL}`);
    asyncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
  }

  // 2)
  const numToBuy = getNumToBuy(stockState, ask);

  // 3)
  let numToSell = 0;
  if (numToBuy === 0) {
    numToSell = getNumToSell(stockState, bid);
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
    });

    const tradingLog: typeof stockState.tradingLogs[number] = {
      action: numToBuy > 0 ? OrderSides.BUY : OrderSides.SELL,
      timeStamp: getCurrentTimeStamp(),
      price: numToBuy > 0 ? ask : bid,
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

    checkCrossings(stock, stockState, bid, ask);

    if (!process.env.SIMULATE_SNAPSHOT) {
      asyncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
    }
  }

  // 5)
  return {bid, ask};
}

function checkCrossings(stock: string, stockState: StockState, bid: number, ask: number): boolean {
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

function getNumToBuy(stockState: StockState, ask: number): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  const indexesToExecute: number[] = [];
  for (let i = intervals.length - 1; i >= 0; i--) {
    const interval = intervals[i];

    if (doFloatCalculation(FloatCalculations.greaterThanOrEqual, ask, interval[OrderSides.BUY].price) && interval[OrderSides.BUY].active && interval[OrderSides.BUY].crossed && newPosition < interval.positionLimit) {
      indexesToExecute.push(i);
      newPosition += stockState.sharesPerInterval;
    }
  }

  if (indexesToExecute.length > 0) {
    // for (let i = intervals.length - 1; i > indexesToExecute[0]; i--) {
    //   const interval = intervals[i];

    //   if (interval[OrderSides.BUY].active && i !== indexesToExecute[indexesToExecute.length - 1] + stockState.uncrossedBuyingSkips) {
    //     indexesToExecute.push(i);
    //   }
    // }

    const tradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, indexesToExecute.length * stockState.sharesPerInterval);
    stockState.realizedPnL = doFloatCalculation(FloatCalculations.subtract, stockState.realizedPnL, tradingCosts);
  }

  for (const index of indexesToExecute) {
    const interval = intervals[index];

    interval[OrderSides.BUY].active = false;
    interval[OrderSides.BUY].crossed = false;

    interval[OrderSides.SELL].active = true;
    interval[OrderSides.SELL].crossed = false;
    interval[OrderSides.SELL].boughtAt = ask;
  }

  return indexesToExecute.length;
}

function getNumToSell(stockState: StockState, bid: number): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  let indexesToExecute: number[] = [];
  for (const [i, interval] of intervals.entries()) {
    if (doFloatCalculation(FloatCalculations.lessThanOrEqual, bid, interval[OrderSides.SELL].price)  && interval[OrderSides.SELL].active && interval[OrderSides.SELL].crossed && newPosition > interval.positionLimit) {
      indexesToExecute.push(i);
      newPosition -= stockState.sharesPerInterval;
    }
  }

  if (indexesToExecute.length > 0) {
    // let maxLossSaleIndex: number | undefined;
    // const lowestSaleToExecute = indexesToExecute[0];
    // for (let i = 0; i < lowestSaleToExecute; i++) {
    //   const interval = intervals[i];

    //   // if (interval[OrderSides.SELL].active && i !== lowestSaleToExecute - stockState.uncrossedBuyingSkips) {
    //   if (interval[OrderSides.SELL].active) {
    //     indexesToExecute.unshift(i);

    //     if (maxLossSaleIndex === undefined) {
    //       maxLossSaleIndex = i;
    //     }
    //   }
    // }

    // if (maxLossSaleIndex !== undefined) {
    //   indexesToExecute = indexesToExecute.filter(index => index !== maxLossSaleIndex);
    // }

    const tradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, indexesToExecute.length * stockState.sharesPerInterval);
    stockState.realizedPnL = doFloatCalculation(FloatCalculations.subtract, stockState.realizedPnL, tradingCosts);
  }

  for (const index of indexesToExecute) {
    const interval = intervals[index];

    interval[OrderSides.SELL].active = false;
    interval[OrderSides.SELL].crossed = false;
    const unscaledSalePnL = doFloatCalculation(FloatCalculations.subtract, bid, interval[OrderSides.SELL].boughtAt ?? bid);
    const salePnL = doFloatCalculation(FloatCalculations.multiply, unscaledSalePnL, stockState.sharesPerInterval);
    stockState.realizedPnL = doFloatCalculation(FloatCalculations.add, stockState.realizedPnL, salePnL);

    interval[OrderSides.BUY].active = true;
    interval[OrderSides.BUY].crossed = false;
  }

  return indexesToExecute.length;
}

let stocksRealizedPnLs: {[stock: string]: number[]} = {};

async function debugSimulatedPrices(bid: number, ask: number, stock: string, stockState: StockState): Promise<StockState> {
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
    if (realizedPnLs.length === 300) {
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

    if (stockState.position > -100) {
      syncWriteJSONFile(getStockStateFilePath(`results\\${stock}`), jsonPrettyPrint(stockState));
      debugger;
    }

    if (!stocksRealizedPnLs[stock]) {
      stocksRealizedPnLs[stock] = [];
    }
    const realizedPnLs = stocksRealizedPnLs[stock];

    realizedPnLs.push(stockState.realizedPnL);
    if (realizedPnLs.length === 300) {
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
