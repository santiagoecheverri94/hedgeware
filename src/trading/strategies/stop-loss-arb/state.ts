import {getFileNamesWithinFolder, readJSONFile} from '../../../utils/file';
import {getDirWithStocksDataOnDate, isLiveTrading} from '../../../utils/price-simulator';
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

export async function getHistoricalStockStates(
    date:string,
): Promise<{ [stock: string]: StockState }> {
    const dir = getDirWithStocksDataOnDate(date);

    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    const stockStates: { [stock: string]: StockState } = {};
    for (const file of jsonFiles) {
        const filePath = path.join(dir, file);

        let stock_file_data: any;
        try {
            stock_file_data = await readJSONFile(filePath);
        } catch (error) {
            console.error(`\nError reading file ${filePath}\n`);
            throw error;
        }

        const stockState = getFullStockState({
            date,
            brokerageId: stock_file_data.ticker,
            brokerageTradingCostPerShare: 0, // 0.004,
            numContracts: 1,
            initialPrice: stock_file_data.snapshots[0].ask,
            shiftIntervalsFromInitialPrice: 0,
            targetPosition: 100,
            sharesPerInterval: 25,
            spaceBetweenIntervals: fc.multiply(0.02, 2),
            intervalProfit: 0.02,
        } as unknown as StockState);

        stockStates[stock_file_data.ticker] = stockState;
    }

    return stockStates;
}

export function getStockStateFilePath(stock: string): string {
    return `${getStockStatesFolderPath()}\\${stock}.json`;
}
