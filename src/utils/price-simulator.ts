import { SnapshotByTheSecond, getFilePathForStockOnDate, getFilePathForStockOnDateRange } from '../data/save-stock-historical-data';
import {Snapshot} from '../trading/brokerage-clients/brokerage-client';
import { readJSONFile } from './file';
import {FloatCalculations, doFloatCalculation} from './float-calculator';

const INITIAL_PRICE = 13.72;
let randomPrice: number;

export function getSimulatedSnapshot(): Snapshot {
  const randomPrice = getRandomPrice();

  return {
    ask: randomPrice,
    bid: doFloatCalculation(FloatCalculations.subtract, randomPrice, 0.01),
  };
}

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

const manualPrice = 0;

export function getManualPrice(): number {
  console.log('Enter price: ');
  debugger;
  return manualPrice;
}

export function isLiveTrading(): boolean {
  if (isSimulatedSnapshot()) {
    return false;
  }

  if (isHistoricalSnapshot()) {
    return false;
  }

  return true;
}

export function isSimulatedSnapshot(): boolean {
  return Boolean(process.env.SIMULATE_SNAPSHOT);
}

export function isHistoricalSnapshot(): boolean {
  return Boolean(process.env.HISTORICAL_SNAPSHOT_STOCK && process.env.HISTORICAL_SNAPSHOT_START_DATE);
}

function isHistoricalSnapshotDay(): boolean {
  return isHistoricalSnapshot() && !process.env.HISTORICAL_SNAPSHOT_END_DATE;
}

function isHistoricalSnapshotDateRange(): boolean {
  return Boolean(isHistoricalSnapshot() && process.env.HISTORICAL_SNAPSHOT_END_DATE);
}

let historicalSnapshots: {
  data: SnapshotByTheSecond[],
  index: number,
};

export async function getHistoricalSnapshot(): Promise<Snapshot> {
  if (!historicalSnapshots) {
    historicalSnapshots = await getHistoricalSnapshots();
  }

  const snapshot = historicalSnapshots.data[historicalSnapshots.index].snapshot;
  historicalSnapshots.index = historicalSnapshots.index + 1;

  return snapshot;
}

async function getHistoricalSnapshots(): Promise<{
  data: SnapshotByTheSecond[],
  index: number,
}> {
  let snapshotsByTheSecond: SnapshotByTheSecond[] = [];

  if (isHistoricalSnapshotDay()) {
    snapshotsByTheSecond = readJSONFile<SnapshotByTheSecond[]>(getFilePathForStockOnDate(process.env.HISTORICAL_SNAPSHOT_STOCK, process.env.HISTORICAL_SNAPSHOT_START_DATE));
  }

  if (isHistoricalSnapshotDateRange()) {
    snapshotsByTheSecond = readJSONFile<SnapshotByTheSecond[]>(getFilePathForStockOnDateRange(process.env.HISTORICAL_SNAPSHOT_STOCK, process.env.HISTORICAL_SNAPSHOT_START_DATE, process.env.HISTORICAL_SNAPSHOT_END_DATE));
  }

  return {
    data: snapshotsByTheSecond,
    index: 0,
  };
}
