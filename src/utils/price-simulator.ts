import {getFilePathForStockOnDateType, DateType} from '../historical-data/save-stock-historical-data';
import {Snapshot} from '../trading/brokerage-clients/brokerage-client';
// import { parseStock } from '../trading/strategies/stop-loss-arb/new-state';
import {readJSONFile} from './file';
import {FloatCalculations, doFloatCalculation} from './float-calculator';

export function isLiveTrading(): boolean {
  return !isRandomSnapshot() && !isHistoricalSnapshot();
}

export function isRandomSnapshot(): boolean {
  return Boolean(process.env.RANDOM_SNAPSHOT);
}

export function isHistoricalSnapshot(): boolean {
  return Boolean(process.env.HISTORICAL_SNAPSHOT);
}

export async function getSimulatedSnapshot(stock: string): Promise<Snapshot> {
  if (isRandomSnapshot()) {
    return getRandomSnapshot();
  }

  if (isHistoricalSnapshot()) {
    return getHistoricalSnapshot(stock);
  }

  throw new Error('No snapshot type specified');
}

function getRandomSnapshot(): Snapshot {
  const randomPrice = getRandomPrice();

  return {
    ask: randomPrice,
    bid: doFloatCalculation(FloatCalculations.subtract, randomPrice, 0.01),
    timestamp: 'Random Snapshot',
  };
}

const INITIAL_PRICE = 9.63;
let randomPrice: number;

function getRandomPrice(): number {
  if (!randomPrice) {
    restartRandomPrice();

    return randomPrice;
  }

  const tickDown = doFloatCalculation(FloatCalculations.subtract, randomPrice, 0.01);
  const tickUp = doFloatCalculation(FloatCalculations.add, randomPrice, 0.01);
  const probabilityOfTickDown = Math.random();
  randomPrice = doFloatCalculation(FloatCalculations.lessThanOrEqual, probabilityOfTickDown, 0.467) ?
    tickDown : tickUp;

  return randomPrice;
}

export function restartSimulatedSnapshot(): void {
  restartRandomPrice();
}

function restartRandomPrice(): void {
  randomPrice = INITIAL_PRICE;
}

const historicalSnapshots: {
  [stock: string]: {
    data: Snapshot[],
    index: number,
  }
} = {};

async function getHistoricalSnapshot(stock: string): Promise<Snapshot> {
  if (!historicalSnapshots[stock]) {
    historicalSnapshots[stock] = await getHistoricalSnapshots(stock);
  }

  const snapshot = historicalSnapshots[stock].data[historicalSnapshots[stock].index];
  historicalSnapshots[stock].index += 1;

  return snapshot;
}

async function getHistoricalSnapshots(stock: string): Promise<{
  data: Snapshot[],
  index: number,
}> {
  let snapshotsByTheSecond: Snapshot[] = [];

  const {ticker, startDate, endDate} = parseStock(stock);

  if (isHistoricalSnapshotDay(startDate, endDate)) {
    snapshotsByTheSecond = await readJSONFile<Snapshot[]>(getFilePathForStockOnDateType(ticker, DateType.DAILY, startDate));
  }

  if (isHistoricalSnapshotDateRange(startDate, endDate)) {
    snapshotsByTheSecond = await readJSONFile<Snapshot[]>(getFilePathForStockOnDateType(ticker, DateType.DATE_RANGE, startDate, endDate));
  }

  return {
    data: snapshotsByTheSecond,
    index: 0,
  };
}

function parseStock(stock: string): {
  ticker: string,
  startDate: string,
  endDate: string,
} {
  const ticker = stock.split('__')[0];
  const startDate = stock.split('__')[1].split('_')[0];
  const endDate = stock.split('__')[1].split('_')[1];

  return {
    ticker,
    startDate,
    endDate,
  };
}

function isHistoricalSnapshotDay(startDate: string, endDate: string): boolean {
  return Boolean(startDate && !endDate);
}

function isHistoricalSnapshotDateRange(startDate: string, endDate: string): boolean {
  return Boolean(startDate && endDate);
}

export function isHistoricalSnapshotsExhausted(stock: string): boolean {
  return historicalSnapshots[stock].index === historicalSnapshots[stock].data.length;
}
