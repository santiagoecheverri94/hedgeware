import {getFilePathForStockDataOnDate} from '../historical-data/save-stock-historical-data';
import {Snapshot} from '../trading/brokerage-clients/brokerage-client';
import {readJSONFile} from './file';
import {FloatCalculator as fc} from './float-calculator';

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

const historicalSnapshots: {
    [stock: string]: {
        data: Snapshot[];
        index: number;
    };
} = {};

async function getHistoricalSnapshot(stock: string): Promise<Snapshot> {
    if (!historicalSnapshots[stock]) {
        historicalSnapshots[stock] = await getHistoricalSnapshotData(stock);
    }

    const snapshot = historicalSnapshots[stock].data[historicalSnapshots[stock].index];
    historicalSnapshots[stock].index += 1;

    return snapshot;
}

async function getHistoricalSnapshotData(fileName: string): Promise<{
    data: Snapshot[];
    index: number;
}> {
    const {stock, date} = getStockAndDate(fileName);

    const snapshotsData = await getSnapshotsForStockOnDate(stock, date);

    return {
        data: snapshotsData,
        index: 0,
    };
}

function getStockAndDate(fileName: string): {
    stock: string;
    date: string;
} {
    const stock = fileName.split('__')[0];
    const date = fileName.split('__')[1];

    if (!date) {
        throw new Error(
            `Invalid historical snapshot file name: "${fileName}" is missing date`,
        );
    }

    return {
        stock,
        date,
    };
}

export async function getSnapshotsForStockOnDate(
    stock: string,
    date: string,
): Promise<Snapshot[]> {
    return readJSONFile<Snapshot[]>(getFilePathForStockDataOnDate(stock, date));
}

export function isHistoricalSnapshotsExhausted(stock: string): boolean {
    if (!isHistoricalSnapshot()) {
        return false;
    }

    const isExhausted =
        historicalSnapshots[stock].index === historicalSnapshots[stock].data.length;

    return isExhausted;
}

export function deleteHistoricalSnapshots(stock: string): void {
    delete historicalSnapshots[stock];
}
