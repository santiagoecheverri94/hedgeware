import {getFileNamesWithinFolder, jsonPrettyPrint, readJSONFile, syncWriteJSONFile} from '../../../utils/file';
import {isHistoricalSnapshot, isHistoricalSnapshotsExhausted, isLiveTrading} from '../../../utils/price-simulator';
import {onUserInterrupt} from '../../../utils/system';
import {isMarketOpen} from '../../../utils/time';
import {reconcileStockPosition} from './algo';
import {StockState} from './types';

export async function startStopLossArb(): Promise<void> {
  const stocks = await getStocksFileNames();

  const states = await getStockStates(stocks);

  let userHasInterrupted = false;
  if (isLiveTrading()) {
    onUserInterrupt(() => {
      userHasInterrupted = true;
    });
  }

  await Promise.all(stocks.map(stock => (async () => {
    await isMarketOpen(stock);
    while ((await isMarketOpen(stock) && !userHasInterrupted)) {
      const stockState = states[stock];
      const snapshot = await reconcileStockPosition(stock, stockState);

      if (isHistoricalSnapshot()) {
        if (isHistoricalSnapshotsExhausted(stock)) {
          syncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
          break;
        }
      }

      // if ((await debugSimulation(stock, states, snapshot)).shouldBreak) {
      //   console.log(lastDifferentSnapshot);
      //   console.log(`position: ${stockState.position}, unrealizedValue: ${stockState.unrealizedValue}`);
      //   debugger;
      //   break;
      // }
    }
  })()));

  for (const stock of Object.keys(states).sort()) {
    console.log(`${stock}, unrealizedValue: $${states[stock].unrealizedValue}\n`);
  }

  debugger;
}

export async function getStocksFileNames(filterUnderscores = true): Promise<string[]> {
  let fileNames = await getFileNamesWithinFolder(getStockStatesFolderPath());

  fileNames = fileNames.filter(fileName => !['results', 'templates'].some(excludedFileName => fileName.includes(excludedFileName)));

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

export async function getStockStates(stocks: string[]): Promise<{ [stock: string]: StockState; }> {
  const states: {[stock: string]: StockState} = {};
  for (const stock of stocks) {
    states[stock] = await readJSONFile<StockState>(getStockStateFilePath(stock));
  }

  return states;
}

export function getStockStateFilePath(stock: string): string {
  return `${getStockStatesFolderPath()}\\${stock}.json`;
}
