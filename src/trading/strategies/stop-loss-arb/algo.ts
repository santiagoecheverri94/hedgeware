import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {isMarketOpen, readJSONFile} from '../../../utils/miscellaneous';
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

export async function startStopLossArb(): Promise<void> {
  const stocks = getStocks();

  const states = getStockStates(stocks);

  // TODO: correct market hours
  while (isMarketOpen('12:00', '11:59')) {
    for (const stock of stocks) {
      await reconcileStockPosition(stock, states[stock]);
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

const lastLog: {last: number, position: number}[] = [];
async function reconcileStockPosition(stock: string, stockState: StockState) {
  const {last} = await brokerageClient.getSnapshot(stockState.brokerageId);
  checkCrossings(stockState, last);
  // 1)
  // checkCrossings(stockState, last);

  // 2)
  const numToBuy = getNumToBuy(stockState, last);

  // 3)
  let numToSell = 0;
  if (numToBuy === 0) {
    numToSell = getNumToSell(stockState, last);
  }

  // 4)
  if (numToBuy > 0) {
    const newPosition = stockState.position + 10 * stockState.numContracts * numToBuy;
    // await brokerageClient.setSecurityPosition(stockState.brokerageId, newPosition);
    stockState.position = newPosition;
  } else if (numToSell > 0) {
    const newPosition = stockState.position - 10 * stockState.numContracts * numToSell;
    // await brokerageClient.setSecurityPosition(stockState.brokerageId, newPosition);
    stockState.position = newPosition;
  }

  checkCrossings(stockState, last);
  lastLog.push({last, position: stockState.position});
  if (doFloatCalculation(FloatCalculations.greaterThan, last, 12.4)) {
    debugger;
  } else if (doFloatCalculation(FloatCalculations.lessThan, last, 11.25)) {
    debugger;
  }
}

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
  // for (const [i, buyingInterval] of buyingIntervals.entries()) {
  for (let i = buyingIntervals.length - 1; i >= 0; i--) {
    const buyingInterval = buyingIntervals[i];
    if (doFloatCalculation(FloatCalculations.greaterThanOrEqual, last, buyingInterval.price) && buyingInterval.active && buyingInterval.crossed && // (buyingInterval.crossed || indexesToExecute.length > 0)) {
      newPosition <= buyingInterval.positionLimit) {
      indexesToExecute.push(i);
      newPosition += 10;
    }
  }

  if (indexesToExecute.length > 1) {
    for (const [i, buyingInterval] of buyingIntervals.entries()) {
      if (buyingInterval.active && !buyingInterval.crossed) {
        indexesToExecute.push(i);
      }
    }

    indexesToExecute.splice(1, 1);
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
  // for (let i = sellingIntervals.length - 1; i >= 0; i--) {
  for (const [i, sellingInterval] of sellingIntervals.entries()) {
    // const sellingInterval = sellingIntervals[i];

    if (doFloatCalculation(FloatCalculations.lessThanOrEqual, last, sellingInterval.price)  && sellingInterval.active && sellingInterval.crossed && //  (sellingInterval.crossed || indexesToExecute.length > 0)) {
      newPosition > sellingInterval.positionLimit) {
      indexesToExecute.push(i);
      newPosition -= 10;
    }
  }

  if (indexesToExecute.length > 1) {
    for (let i = sellingIntervals.length - 1; i >= 0; i--) {
      const sellingInterval = sellingIntervals[i];
  
      if (sellingInterval.active && !sellingInterval.crossed) {
        indexesToExecute.push(i);
      }
    }

    indexesToExecute.pop();
  }

  for (const index of indexesToExecute) {
    sellingIntervals[index].active = false;
    sellingIntervals[index].crossed = false;

    buyingIntervals[index].active = true;
    buyingIntervals[index].crossed = false;
  }

  return indexesToExecute.length;
}
