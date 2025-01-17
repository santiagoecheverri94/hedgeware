import {getFilePathForStockDataOnDate} from '../historical-data/save-stock-historical-data';
import {Snapshot} from '../trading/brokerage-clients/brokerage-client';
import {readJSONFile} from './file';
import {FloatCalculations, doFloatCalculation} from './float-calculator';
import {getWeekdaysInRange} from './time';

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

const INITIAL_PRICE = 17.76;
let randomPrice: number;

function getRandomPrice(): number {
  if (!randomPrice) {
    restartRandomPrice();

    return randomPrice;
  }

  const tickDown = doFloatCalculation(FloatCalculations.subtract, randomPrice, 0.01);
  const tickUp = doFloatCalculation(FloatCalculations.add, randomPrice, 0.01);
  const probabilityOfTickDown = Math.random();
  randomPrice = doFloatCalculation(FloatCalculations.lessThanOrEqual, probabilityOfTickDown, 0.5) ?
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

async function getHistoricalSnapshots(fileName: string): Promise<{
  data: Snapshot[],
  index: number,
}> {
  let snapshotsByTheSecond: Snapshot[] = [];

  const {stock, startDate, endDate} = getHistoricalSnapshotStockAndStartAndEndDates(fileName);
  const dateRange = getWeekdaysInRange(startDate, endDate);
  for (const date of dateRange) {
    const snapshotsForDate = await getSnapshotsForStockOnDate(stock, date);
    snapshotsByTheSecond = [...snapshotsByTheSecond, ...snapshotsForDate];
  }

  return {
    data: snapshotsByTheSecond,
    index: 0,
  };
}

export function getHistoricalSnapshotStockAndStartAndEndDates(fileName: string): {stock: string, startDate: string, endDate: string} {
  const stock = fileName.split('__')[0];
  const [startDate, endDate] = fileName.split('__')[1]?.split('_') || [];

  if (!startDate || !endDate) {
    throw new Error(`Invalid historical snapshot file name: "${fileName}" is missing start and end date`);
  }

  return {
    stock,
    startDate,
    endDate,
  };
}

export async function getSnapshotsForStockOnDate(stock: string, date: string): Promise<Snapshot[]> {
  return readJSONFile<Snapshot[]>(getFilePathForStockDataOnDate(stock, date));
}

export function isHistoricalSnapshotsExhausted(stock: string): boolean {
  return historicalSnapshots[stock].index === historicalSnapshots[stock].data.length;
}
