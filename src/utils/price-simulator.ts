import {Snapshot} from '../trading/brokerage-clients/brokerage-client';
import {StockState} from '../trading/strategies/stop-loss-arb/types';
import {readJSONFile} from './file';
import {FloatCalculator as fc} from './float-calculator';
import path from 'node:path';

export function isLiveTrading(): boolean {
    return !isRandomSnapshot() && !isHistoricalSnapshot();
}

export function isRandomSnapshot(): boolean {
    return Boolean(process.env.RANDOM_SNAPSHOT);
}

export function isHistoricalSnapshot(): boolean {
    return Boolean(process.env.HISTORICAL_SNAPSHOT);
}

export function isHistoricalCppSnapshot(): boolean {
    return isHistoricalSnapshot() && Boolean(process.env.CPP_NODE_ADDON);
}

export async function getSimulatedSnapshot(stockState: StockState): Promise<Snapshot> {
    if (isRandomSnapshot()) {
        return getRandomSnapshot();
    }

    if (isHistoricalSnapshot()) {
        return getHistoricalSnapshot(stockState);
    }

    throw new Error('No snapshot type specified');
}

function getRandomSnapshot(): Snapshot {
    const randomPrice = getRandomPrice();

    return {
        ask: randomPrice,
        bid: fc.subtract(randomPrice, 0.01),
        timestamp: 'Random Snapshot',
    };
}

const INITIAL_PRICE = 9;
let randomPrice: number = INITIAL_PRICE;

function getRandomPrice(): number {
    const tickDown = fc.subtract(randomPrice, 0.01);
    const tickUp = fc.add(randomPrice, 0.01);
    const probabilityOfTickDown = Math.random();
    randomPrice = fc.lte(probabilityOfTickDown, 0.49) ? tickDown : tickUp;

    return randomPrice;
}

export function restartRandomPrice(): void {
    randomPrice = INITIAL_PRICE;
}

async function getHistoricalSnapshot(stockState: StockState): Promise<Snapshot> {
    if (!stockState.historicalSnapshots) {
        stockState.historicalSnapshots = await getHistoricalSnapshotData(stockState);
    }

    const historicalSnapshots = stockState.historicalSnapshots;
    const snapshot = historicalSnapshots.data[historicalSnapshots.index];
    historicalSnapshots.index += 1;

    return snapshot;
}

async function getHistoricalSnapshotData(stockState: StockState): Promise<{
    data: Snapshot[];
    index: number;
}> {
    const {brokerageId, date} = stockState;

    const snapshotsData = await getSnapshotsForStockOnDate(brokerageId, date);

    return {
        data: snapshotsData,
        index: 0,
    };
}

export async function getSnapshotsForStockOnDate(
    stock: string,
    date: string,
): Promise<Snapshot[]> {
    const jsonFileData = await readJSONFile<{snapshots: Snapshot[]}>(getFilePathForStockDataOnDate(stock, date));
    const snapshots = jsonFileData.snapshots;

    return snapshots;
}

export function getDirWithStocksDataOnDate(date: string): string {
    const year = date.split('-')[0];
    const month = date.split('-')[1];

    const cwd = process.cwd();
    const dir = path.join(cwd, '..', 'deephedge', 'historical-data', year, month, date);

    return dir;
}

export function isHistoricalSnapshotsExhausted(stockState: StockState): boolean {
    if (!isHistoricalSnapshot() || !stockState.historicalSnapshots) {
        return false;
    }

    const historicalSnapshots = stockState.historicalSnapshots;
    const isExhausted =
        historicalSnapshots.index === historicalSnapshots.data.length;

    return isExhausted;
}

export function deleteHistoricalSnapshots(stockState: StockState): void {
    delete stockState.historicalSnapshots;
}

function getFilePathForStockDataOnDate(stock: string, date: string): string {
    const dir = getDirWithStocksDataOnDate(date);
    const filepPath = path.join(dir, `${stock}.json`);
    return filepPath;
}
