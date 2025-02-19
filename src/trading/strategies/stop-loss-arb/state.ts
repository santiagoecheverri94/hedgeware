import {
    getFileNamesWithinFolder,
    readJSONFile,
} from '../../../utils/file';
import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {log} from '../../../utils/log';
import {isLiveTrading} from '../../../utils/price-simulator';
import {
    Snapshot,
} from '../../brokerage-clients/brokerage-client';
import {StockState} from './types';

export async function getStocksFileNames(filterUnderscores = true): Promise<string[]> {
    let fileNames = await getFileNamesWithinFolder(getStockStatesFolderPath());

    fileNames = fileNames.filter(
        fileName =>
            !['results', 'templates', 'historical'].some(excludedFileName =>
                fileName.includes(excludedFileName),
            ),
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

export function getStockStateFilePath(stock: string): string {
    return `${getStockStatesFolderPath()}\\${stock}.json`;
}

export function isSnapshotChange(snapshot: Snapshot, stockState: StockState): boolean {
    if (!stockState.lastAsk || !stockState.lastBid) {
        return true;
    }

    return (
        !fc.eq(stockState.lastAsk, snapshot.ask) ||
        !fc.eq(stockState.lastBid, snapshot.bid)
    );
}

export function isWideBidAskSpread(
    {bid, ask}: Snapshot,
    stockState: StockState,
): boolean {
    return fc.gt(fc.subtract(ask, bid), stockState.intervalProfit) === 1;
}
