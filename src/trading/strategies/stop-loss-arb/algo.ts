import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {isMarketOpen, log, readJSONFile} from '../../../utils/miscellaneous';
import {restartRandomPrice} from '../../../utils/price-simulator';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {OrderSides} from '../../brokerage-clients/brokerage-client';

interface SmoothingInterval {
  active: boolean;
  crossed: boolean;
  orderSide: OrderSides;
  price: number;
  positionLimit: number;
}

interface StockState {
  brokerageId: string;
  numContracts: number;
  position: number;
  sellingIntervals: SmoothingInterval[];
  buyingIntervals: SmoothingInterval[];
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
  if (numToBuy > 0) {
    const newPosition = stockState.position + (10 * stockState.numContracts * numToBuy);
    await brokerageClient.setSecurityPosition(stockState.brokerageId, newPosition);
    stockState.position = newPosition;
  } else if (numToSell > 0) {
    const newPosition = stockState.position - (10 * stockState.numContracts * numToSell);
    await brokerageClient.setSecurityPosition(stockState.brokerageId, newPosition);
    stockState.position = newPosition;
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
  const {buyingIntervals, sellingIntervals} = stockState;

  for (const buyingInterval of buyingIntervals) {
    if (buyingInterval.active && doFloatCalculation(FloatCalculations.lessThan, last, buyingInterval.price)) {
      buyingInterval.crossed = true;
    }
  }

  for (const sellingInterval of sellingIntervals) {
    if (sellingInterval.active && doFloatCalculation(FloatCalculations.greaterThan, last, sellingInterval.price)) {
      sellingInterval.crossed = true;
    }
  }
}

function getNumToBuy(stockState: StockState, last: number): number {
  const {buyingIntervals, sellingIntervals, position} = stockState;

  let newPosition = position;
  const indexesToExecute: number[] = [];
  for (let i = buyingIntervals.length - 1; i >= 0; i--) {
    const buyingInterval = buyingIntervals[i];
    if (doFloatCalculation(FloatCalculations.greaterThanOrEqual, last, buyingInterval.price) && buyingInterval.active && buyingInterval.crossed && // (buyingInterval.crossed || indexesToExecute.length > 0)) {
      newPosition <= buyingInterval.positionLimit) {
      indexesToExecute.push(i);
      newPosition += 10;
    }
  }

  if (indexesToExecute.length > 0) {
    for (let i = buyingIntervals.length - 1; i > indexesToExecute[0]; i--) {
      if (buyingIntervals[i].active && i !== indexesToExecute[indexesToExecute.length - 1] + 1) {
        indexesToExecute.push(i);
      }
    }
  }

  for (const index of indexesToExecute) {
    buyingIntervals[index].active = false;
    buyingIntervals[index].crossed = false;

    sellingIntervals[index].active = true;
    sellingIntervals[index].crossed = false;
  }

  return indexesToExecute.length;
}

function getNumToSell(stockState: StockState, last: number): number {
  const {buyingIntervals, sellingIntervals, position} = stockState;

  let newPosition = position;
  const indexesToExecute: number[] = [];
  for (const [i, sellingInterval] of sellingIntervals.entries()) {
    if (doFloatCalculation(FloatCalculations.lessThanOrEqual, last, sellingInterval.price)  && sellingInterval.active && sellingInterval.crossed && //  (sellingInterval.crossed || indexesToExecute.length > 0)) {
      newPosition > sellingInterval.positionLimit) {
      indexesToExecute.push(i);
      newPosition -= 10;
    }
  }

  if (indexesToExecute.length > 0) {
    for (let i = 0; i < indexesToExecute[0]; i++) {
      if (sellingIntervals[i].active) {
        indexesToExecute.unshift(i);
      }
    }
  }

  for (const index of indexesToExecute) {
    sellingIntervals[index].active = false;
    sellingIntervals[index].crossed = false;

    buyingIntervals[index].active = true;
    buyingIntervals[index].crossed = false;
  }

  return indexesToExecute.length;
}
