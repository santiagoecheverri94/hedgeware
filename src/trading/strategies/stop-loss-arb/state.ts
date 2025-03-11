import {getFileNamesWithinFolder, readJSONFile} from '../../../utils/file';
import {isHistoricalCppSnapshot, isLiveTrading} from '../../../utils/price-simulator';
import {StockState} from './types';
import path from 'node:path';
import fs from 'node:fs/promises';
import {getFullStockState} from './new-state';
import {FloatCalculator as fc} from '../../../utils/float-calculator';

export async function getStocksFileNames(filterUnderscores = true): Promise<string[]> {
    let fileNames = await getFileNamesWithinFolder(getStockStatesFolderPath());

    fileNames = fileNames.filter(
        fileName =>
            ![].some(excludedFileName => fileName.includes(excludedFileName)),
    );

    if (filterUnderscores) {
        fileNames = fileNames.filter(fileName => !fileName.startsWith('_'));
    }

    return fileNames;
}

function getStockStatesFolderPath(): string {
    if (!isLiveTrading()) {
        return `${process.cwd()}\\src\\trading\\strategies\\stop-loss-arb\\stock-states\\simulated`;
    }

    return `${process.cwd()}\\src\\trading\\strategies\\stop-loss-arb\\stock-states`;
}

export async function getStockStates(
    stocks: string[],
): Promise<{ [stock: string]: StockState }> {
    const states: { [stock: string]: StockState } = {};
    for (const stock of stocks) {
        states[stock] = await readJSONFile<StockState>(getStockStateFilePath(stock));
    }

    return states;
}

export async function getHistoricalCppStockStates(date: string, maxSpread: number, minPercentageChange: number): Promise<{ [stock: string]: StockState }> {
    const year = date.split('-')[0];
    const month = date.split('-')[1];

    const cwd = process.cwd();
    const dir = path.join(cwd, '..', 'historical-data', year, month, date);

    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    const stockStates: { [stock: string]: StockState } = {};
    for (const file of jsonFiles) {
        const filePath = path.join(dir, file);
        const data: any = await readJSONFile(filePath);

        if (!data.first_hour_close_price) {
            continue;
        }

        const firstSpread = fc.subtract(data.snapshots[0].ask, data.snapshots[0].bid);
        if (fc.gt(firstSpread, maxSpread)) {
            continue;
        }

        const percentChange = data.first_hour_percentage_change;
        if (fc.lt(percentChange, minPercentageChange)) {
            continue;
        }

        const stockState = getFullStockState({
            date,
            brokerageId: data.ticker,
            brokerageTradingCostPerShare: 0.004,
            numContracts: 1,
            initialPrice: data.snapshots[0].ask,
            shiftIntervalsFromInitialPrice: 0,
            targetPosition: 102,
            sharesPerInterval: 34,
            spaceBetweenIntervals: 0.08,
            intervalProfit: 0.05,
        } as unknown as StockState);

        stockStates[data.ticker] = stockState;
    }

    return stockStates;
}

export function getStockStateFilePath(stock: string): string {
    return `${getStockStatesFolderPath()}\\${stock}.json`;
}
