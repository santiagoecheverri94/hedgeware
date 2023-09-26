import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {getCurrentTimeStamp, getFileNamesWithinFolder, isMarketOpen, jsonPrettyPrint, log, readJSONFile, writeJSONFile} from '../../../utils/miscellaneous';
import {restartRandomPrice} from '../../../utils/price-simulator';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {OrderSides} from '../../brokerage-clients/brokerage-client';
import {setTimeout} from 'node:timers/promises';

interface SmoothingInterval {
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

interface StockState {
  brokerageId: string;
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
}

const brokerageClient = new IBKRClient();

export async function startStopLossArb(): Promise<void> {
  const stocks = await getStocks();

  const states = await getStockStates(stocks);

  await Promise.all(stocks.map(stock => {
    return (async function () {
      while (isMarketOpen()) {
        await reconcileStockPosition(stock, states[stock]);
      }
    })();
  }));
}

async function getStocks(): Promise<string[]> {
  const fileNames = await getFileNamesWithinFolder(getStockStatesFolderPath());
  return fileNames.filter(fileName => fileName !== 'template');
}

function getStockStatesFolderPath(): string {
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

async function reconcileStockPosition(stock: string, stockState: StockState) {
  // 0) wait a second
  if (!process.env.SIMULATE_SNAPSHOT) {
    const ONE_SECOND = 1000;
    await setTimeout(ONE_SECOND);
  }

  // 1)
  const {last} = await brokerageClient.getSnapshot(stockState.brokerageId);
  checkCrossings(stockState, last);

  // 2)
  const numToBuy = getNumToBuy(stockState, last);

  // 3)
  let numToSell = 0;
  if (numToBuy === 0) {
    numToSell = getNumToSell(stockState, last);
  }

  // 4)
  let newPosition: number | undefined;
  if (numToBuy > 0) {
    newPosition = stockState.position + (10 * numToBuy);
  } else if (numToSell > 0) {
    newPosition = stockState.position - (10 * numToSell);
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
      price: last,
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

    checkCrossings(stockState, last);

    await writeJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
  }
}

// if (doFloatCalculation(FloatCalculations.greaterThan, lastLog[lastLog.length - 1].last, 12.5)) {
//   console.log(`last: ${lastLog[lastLog.length - 1].last}, position: ${states[stock].position}`);

//   if (lastLog[lastLog.length - 1].position < 100) {
//     debugger; printDeltasOfLog();
//   }

//   restartRandomPrice();
//   states = getStockStates(stocks);

// } else if (doFloatCalculation(FloatCalculations.lessThan, lastLog[lastLog.length - 1].last, 11.15)) {
//   console.log(`last: ${lastLog[lastLog.length - 1].last}, position: ${states[stock].position}`);

//   if (lastLog[lastLog.length - 1].position > 10 || lastLog[lastLog.length - 1].position < 0) {
//     debugger; printDeltasOfLog();
//   }

//   restartRandomPrice();
//   states = getStockStates(stocks);
// }

function checkCrossings(stockState: StockState, last: number) {
  const {intervals} = stockState;

  for (const interval of intervals) {
    if (interval[OrderSides.BUY].active && doFloatCalculation(FloatCalculations.lessThan, last, interval[OrderSides.BUY].price)) {
      interval[OrderSides.BUY].crossed = true;
    }

    if (interval[OrderSides.SELL].active && doFloatCalculation(FloatCalculations.greaterThan, last, interval[OrderSides.SELL].price)) {
      interval[OrderSides.SELL].crossed = true;
    }
  }
}

function getNumToBuy(stockState: StockState, last: number): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  const indexesToExecute: number[] = [];
  for (let i = intervals.length - 1; i >= 0; i--) {
    const interval = intervals[i];

    if (doFloatCalculation(FloatCalculations.greaterThanOrEqual, last, interval[OrderSides.BUY].price) && interval[OrderSides.BUY].active && interval[OrderSides.BUY].crossed && newPosition <= interval.positionLimit) {
      indexesToExecute.push(i);
      newPosition += 10;
    }
  }

  if (indexesToExecute.length > 0) {
    for (let i = intervals.length - 1; i > indexesToExecute[0]; i--) {
      const interval = intervals[i];

      if (interval[OrderSides.BUY].active && i !== indexesToExecute[indexesToExecute.length - 1] + 1) {
        indexesToExecute.push(i);
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

  return indexesToExecute.length;
}

function getNumToSell(stockState: StockState, last: number): number {
  const {intervals, position} = stockState;

  let newPosition = position;
  const indexesToExecute: number[] = [];
  for (const [i, interval] of intervals.entries()) {
    if (doFloatCalculation(FloatCalculations.lessThanOrEqual, last, interval[OrderSides.SELL].price)  && interval[OrderSides.SELL].active && interval[OrderSides.SELL].crossed && newPosition > interval.positionLimit) {
      indexesToExecute.push(i);
      newPosition -= 10;
    }
  }

  if (indexesToExecute.length > 0) {
    for (let i = 0; i < indexesToExecute[0]; i++) {
      const interval = intervals[i];

      if (interval[OrderSides.SELL].active) {
        indexesToExecute.unshift(i);
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

  return indexesToExecute.length;
}
