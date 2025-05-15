import {
    getFileNamesWithinFolder,
    jsonPrettyPrint,
    readJSONFile,
    writeJSONFile,
} from '../../../utils/file';
import {getDirWithStocksDataOnDate} from '../../../utils/price-simulator';
import {StockState} from './types';
import path from 'node:path';
import fs from 'node:fs/promises';
import {getFullStockState} from './new-state';
import {BrokerageClient} from '../../brokerage-clients/brokerage-client';
import {FloatCalculator as fc} from '../../../utils/float-calculator';

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

export async function getHistoricalStockStatesForDate(
    date: string,
    partialStockState: Partial<StockState>,
): Promise<{ [stock: string]: StockState }> {
    const dir = getDirWithStocksDataOnDate(date);

    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    const stockStates: { [stock: string]: StockState } = {};
    for (const file of jsonFiles) {
        const filePath = path.join(dir, file);

        let stockFileData: any;
        try {
            stockFileData = await readJSONFile(filePath);
        } catch (error) {
            console.error(`\nError reading file ${filePath}\n`);
            throw error;
        }

        const stockState = getInitialStockState(
            date,
            stockFileData.ticker,
            stockFileData.snapshots[0].ask,
            partialStockState,
        );

        stockStates[stockFileData.ticker] = stockState;
    }

    return stockStates;
}

export function getInitialStockState(
    date: string,
    ticker: string,
    initialAskPrice: number,
    partialStockState: Partial<StockState>,
    prediction?: number,
): StockState {
    const completedPartial: Partial<StockState> = {
        date,
        prediction,
        brokerageId: ticker,
        initialPrice: initialAskPrice,
        ...partialStockState,
    };

    const stockState = getFullStockState(completedPartial as StockState);

    return stockState;
}

const kTargetInvestment = 15_000;
const kTargetNumLiveTickers = 10;

const kMinShortableQuantity = 100_000;

export async function writeLiveStockStatesBeforeTradingStart(
    date: string,
    brokerageClient: BrokerageClient,
    partialStockState: Partial<StockState>,
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

    const shortableQuantities = await brokerageClient.getShortableQuantities(
        potentialTickers,
    );
    const snapshots = await brokerageClient.getSnapshots(potentialTickers);

    let numLiveTickers = 0;
    for (const tickerProb of potentialTickerProbs) {
        const ticker = tickerProb.ticker;
        const prediction = tickerProb.prediction;
        const shortableQuantity = shortableQuantities[ticker];
        const snapshot = snapshots[ticker];

        if (shortableQuantity >= kMinShortableQuantity) {
            const numContracts = getNumContracts(
                snapshot.ask,
                partialStockState as StockState,
            );

            const stockState = getInitialStockState(
                date,
                ticker,
                snapshot.ask,
                {
                    ...partialStockState,
                    numContracts,
                },
                prediction,
            );

            await writeJSONFile(
                getStockStateFilePath(ticker, date),
                jsonPrettyPrint(stockState),
            );

            numLiveTickers++;
            if (numLiveTickers >= kTargetNumLiveTickers) {
                break;
            }
        }
    }
}

async function getPotentialTickerProbs(
    date: string,
): Promise<{ ticker: string; prediction: number }[]> {
    // return [
    //     {ticker: 'SPY', prediction: 0.743_050_956_726_074_2},
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

function getNumContracts(
    initialAskPrice: number,
    partialStockState: StockState,
): number {
    const maxPositionSize =
        partialStockState.targetPosition + partialStockState.sharesPerInterval;

    const maxPositionSizeValue = fc.multiply(maxPositionSize, initialAskPrice);

    const targetInvestmentPerStock = fc.divide(
        kTargetInvestment,
        kTargetNumLiveTickers,
    );

    const numContracts = Math.ceil(
        fc.divide(targetInvestmentPerStock, maxPositionSizeValue),
    );

    return numContracts;
}

export function getStockStateFilePath(stock: string, date: string): string {
    return `${getStockStatesFolderPath(date)}\\${stock}.json`;
}
