import {
    getFileNamesWithinFolder,
    readJSONFile,
} from '../../../utils/file';
import {isLiveTrading} from '../../../utils/price-simulator';
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
