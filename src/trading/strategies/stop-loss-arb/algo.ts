import {isMarketOpen, readJSONFile} from '../../../utils/miscellaneous';
import {IBKRClient} from '../../brokerage-clients/IBKR/client';
import {OrderSides} from '../../brokerage-clients/brokerage-client';

interface SmoothingInterval {
  active: boolean;
  crossed: boolean;
  orderSide: OrderSides;
  price: number;
}

interface StockState {
  brokerageId: string;
  numContracts: number;
  position: number;
  sellingIntervals: SmoothingInterval[];
  buyingIntervals: SmoothingInterval[];
}

const brokerageClient = new IBKRClient();

export function startStopLossArb(): void {
  const stocks = getStocks();

  const intervalsState = getStockStates(stocks);

  // TODO: correct market hours
  while (isMarketOpen({
    openingTimeET: '12:00',
    closingTimeET: '11:59',
  })) {
    for (const stock of stocks) {
      reconcileStockPosition(stock, intervalsState[stock]);
    }
  }

  // TODO: write intervalsState to files per stock
}

function getStocks() {
  return ['PARA']; // TODO: get stocks from file names under intervals-state folder
}

function getStockStates(stocks: string[]): {[stock: string]: StockState} {
  const intervalsState: {[stock: string]: StockState} = {};
  for (const stock of stocks) {
    intervalsState[stock] = readJSONFile<StockState>(`./intervals-state/${stock}.json`);
  }

  return intervalsState;
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
    // await brokerageClient.setSecurityPosition(stockState.brokerageId, stockState.position + numToBuy);
    stockState.position += numToBuy;
  } else if (numToSell > 0) {
    // await brokerageClient.setSecurityPosition(stockState.brokerageId, stockState.position - numToSell);
    stockState.position -= numToSell;
  }
}

function checkCrossings(stockState: StockState, last: number) {
  const {buyingIntervals, sellingIntervals} = stockState;

  for (const buyingInterval of buyingIntervals) {
    if (buyingInterval.active && last < buyingInterval.price) {
      buyingInterval.crossed = true;
    }
  }

  for (const sellingInterval of sellingIntervals) {
    if (sellingInterval.active && last > sellingInterval.price) {
      sellingInterval.crossed = true;
    }
  }
}

function getNumToBuy(stockState: StockState, last: number): number {
  const {buyingIntervals, sellingIntervals} = stockState;

  const indexesToExecute: number[] = [];
  for (const [i, buyingInterval] of buyingIntervals.entries()) {
    if (last >= buyingInterval.price && buyingInterval.active && (buyingInterval.crossed || indexesToExecute.length > 0)) {
      indexesToExecute.push(i);
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
  const {buyingIntervals, sellingIntervals} = stockState;

  const indexesToExecute: number[] = [];
  for (let i = sellingIntervals.length - 1; i >= 0; i--) {
    const sellingInterval = sellingIntervals[i];

    if (last <= sellingInterval.price && sellingInterval.active && (sellingInterval.crossed || indexesToExecute.length > 0)) {
      indexesToExecute.push(i);
    }
  }

  if (indexesToExecute.length > 1) {
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
