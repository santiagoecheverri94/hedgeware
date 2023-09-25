import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {isMarketOpen, log, readJSONFile} from '../../../utils/miscellaneous';
import {restartRandomPrice} from '../../../utils/price-simulator';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {OrderSides} from '../../brokerage-clients/brokerage-client';

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
}

const brokerageClient = new IBKRClient();

const stockLastLogs: {last: number, position: number}[] = [];

export async function startStopLossArb(): Promise<void> {
  const stocks = getStocks();

  const states = getStockStates(stocks);

  // TODO: correct market hours
  // run each stock in its own thread
  while (isMarketOpen()) {
    for (const stock of stocks) {
      await reconcileStockPosition(stock, states[stock]);

      if (stockLastLogs[stockLastLogs.length - 1]?.position !== stockLastLogs[stockLastLogs.length - 2]?.position) {
        log(`Changed position for ${stock}: ${JSON.stringify(stockLastLogs[stockLastLogs.length - 1])}`);
      }
    }
  }

  // TODO: write intervalsState to files per stock
}

function getStocks() {
  return ['PARA']; // TODO: get stocks from file names under intervals-state folder
}

function getStockStates(stocks: string[]): {[stock: string]: StockState} {
  const states: {[stock: string]: StockState} = {};
  for (const stock of stocks) {
    states[stock] = readJSONFile<StockState>(`${process.cwd()}\\src\\trading\\strategies\\stop-loss-arb\\stock-states\\${stock}.json`);
  }

  return states;
}

async function reconcileStockPosition(stock: string, stockState: StockState) {
  const {last} = await brokerageClient.getSnapshot(stockState.brokerageId);
  // 1)
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
    if (process.env.SIMULATE_SNAPSHOT) {
      await brokerageClient.setSecurityPosition(stockState.brokerageId, (newPosition * stockState.numContracts), (stockState.position * stockState.numContracts));
    }

    await brokerageClient.setSecurityPosition(stockState.brokerageId, (newPosition * stockState.numContracts));
    stockState.position = newPosition;
    // TODO: write stockState to file
  }

  // 5)
  checkCrossings(stockState, last);

  // 6)
  stockLastLogs.push({last, position: stockState.position});
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
