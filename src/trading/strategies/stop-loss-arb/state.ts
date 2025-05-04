import {getFileNamesWithinFolder, jsonPrettyPrint, readJSONFile, syncWriteJSONFile} from '../../../utils/file';
import {
    getDirWithStocksDataOnDate,
    isLiveTrading,
} from '../../../utils/price-simulator';
import {StockState} from './types';
import path from 'node:path';
import fs from 'node:fs/promises';
import {getFullStockState} from './new-state';
import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {BrokerageClient} from '../../brokerage-clients/brokerage-client';

export async function getStocksFileNames(
    date: string,
    filterUnderscores = true,
): Promise<string[]> {
    let fileNames = await getFileNamesWithinFolder(getStockStatesFolderPath(date));

    fileNames = fileNames.filter(
        fileName =>
            ![].some(excludedFileName => fileName.includes(excludedFileName)),
    );

    if (filterUnderscores) {
        fileNames = fileNames.filter(fileName => !fileName.startsWith('_'));
    }

    return fileNames;
}

function getStockStatesFolderPath(date: string): string {
    return `${process.cwd()}\\src\\trading\\strategies\\stop-loss-arb\\stock-states\\${date}`;
}

export async function getStockStates(
    stocks: string[],
    date: string,
): Promise<{ [stock: string]: StockState }> {
    const states: { [stock: string]: StockState } = {};
    for (const stock of stocks) {
        states[stock] = await readJSONFile<StockState>(
            getStockStateFilePath(stock, date),
        );
    }

    return states;
}

export async function getHistoricalStockStates(
    date: string,
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

        const stockState = getInitialStockState(
            date,
            stock_file_data.ticker,
            stock_file_data.snapshots[0].ask,
        );

        stockStates[stock_file_data.ticker] = stockState;
    }

    return stockStates;
}

function getInitialStockState(
    date: string,
    ticker: string,
    initialAskPrice: number,
    prediction?: number,
): StockState {
    const intervalProfit = 0.02;

    // These are flawed hardcoded values. Need to move into a file.
    const partial: Partial<StockState> = {
        date,
        prediction,
        profitThreshold: 0.5,
        lossThreshold: -0.75,
        brokerageId: ticker,
        brokerageTradingCostPerShare: 0, // otherwise 0.004,
        numContracts: 4, // to achieve round lots
        initialPrice: initialAskPrice,
        shiftIntervalsFromInitialPrice: 0,
        targetPosition: 100,
        sharesPerInterval: 25,
        spaceBetweenIntervals: fc.multiply(intervalProfit, 2), // this also needs consideration
        intervalProfit,
    };

    const stockState = getFullStockState(partial as StockState);

    return stockState;
}

export async function writeLiveStockStatesBeforeTradingStart(
    date: string,
    brokerageClient: BrokerageClient,
): Promise<void> {
    const targetFolder = getStockStatesFolderPath(date);

    try {
        await fs.access(targetFolder);
        return;
    } catch {
        await fs.mkdir(targetFolder, {recursive: false});
    }

    const potentialTickerProbs = await getPotentialTickerProbs(date);

    const potentialTickers = potentialTickerProbs.map(ticker => ticker.ticker);

    const shortableQuantities = await brokerageClient.getShortableQuantities(potentialTickers);
    const snapshots = await brokerageClient.getSnapshots(potentialTickers);

    let numLiveTickers = 0;

    for (const tickerProb of potentialTickerProbs) {
        const ticker = tickerProb.ticker;
        const prediction = tickerProb.prediction;
        const shortableQuantity = shortableQuantities[ticker];
        const snapshot = snapshots[ticker];

        if (shortableQuantity >= 500_000) {
            const stockState = getInitialStockState(
                date,
                ticker,
                snapshot.ask,
                prediction,
            );

            syncWriteJSONFile(getStockStateFilePath(ticker, date), jsonPrettyPrint(stockState));

            numLiveTickers++;
            if (numLiveTickers >= 8) {
                break;
            }
        }
    }
}

async function getPotentialTickerProbs(
    date: string,
): Promise<{ ticker: string; prediction: number }[]> {
    // return [
    //     {ticker: 'NG', prediction: 0.843_050_956_726_074_2},
    //     {ticker: 'WULF', prediction: 0.829_906_582_832_336_4},
    //     {ticker: 'SLDB', prediction: 0.812_642_097_473_144_5},
    //     {ticker: 'APLD', prediction: 0.810_300_946_235_656_7},
    // ];

    const potentialTickersData = await getPotentialTickersData(date);

    const data = await fetch('http://127.0.0.1:8008/infer', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            date,
            initial_tickers_data: potentialTickersData,
        }),
    });

    const response = await data.json();

    if (data.status !== 200) {
        throw new Error(response.detail);
    }

    return response;
}

async function getPotentialTickersData(date: string): Promise<any[]> {
    const [year, month] = date.split('-');

    const dir = path.join(
        process.cwd(),
        '..',
        'deephedge',
        'historical-data-screens',
        year,
        month,
        date,
    );

    let files: string[];
    try {
        files = await fs.readdir(dir);
    } catch {
        console.error(`Error reading directory: ${dir}`);
        return [];
    }

    const jsonFiles = files.filter(file => file.endsWith('.json'));

    const json_files_array: any[] = [];
    for (const file of jsonFiles) {
        const filePath = path.join(dir, file);
        try {
            const jsonData = await readJSONFile(filePath);
            json_files_array.push(jsonData);
        } catch {
            console.error(`Error reading JSON file: ${filePath}`);
        }
    }

    return json_files_array;
}

export function getStockStateFilePath(stock: string, date: string): string {
    return `${getStockStatesFolderPath(date)}\\${stock}.json`;
}
