import {getFileNamesWithinFolder, jsonPrettyPrint, readJSONFile, syncWriteJSONFile} from '../../../utils/file';
import {doFloatCalculation, FloatCalculations} from '../../../utils/float-calculator';
import {log} from '../../../utils/log';
import {isLiveTrading} from '../../../utils/price-simulator';
import {getCurrentTimeStamp} from '../../../utils/time';
import {BrokerageClient, OrderSides, Snapshot} from '../../brokerage-clients/brokerage-client';
import {StockState} from './types';

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
  const states: { [stock: string]: StockState } = {};
  for (const stock of stocks) {
    states[stock] = await readJSONFile<StockState>(getStockStateFilePath(stock));
  }

  return states;
}

export function getStockStateFilePath(stock: string): string {
  return `${getStockStatesFolderPath()}\\${stock}.json`;
}

export async function setNewPosition(
  {
    stock,
    brokerageClient,
    stockState,
    newPosition,
    snapshot,
    orderSide,
  }: {
    stock: string, brokerageClient: BrokerageClient, stockState: StockState, newPosition: number, snapshot: Snapshot, orderSide: OrderSides
  }): Promise<void> {
  await brokerageClient.setSecurityPosition({
    brokerageIdOfSecurity: stockState.brokerageId,
    currentPosition: stockState.position * stockState.numContracts,
    newPosition: newPosition * stockState.numContracts,
    snapshot,
  });

  const previousPosition = stockState.position;
  stockState.position = newPosition;

  doSnapShotChangeUpdates(stock, stockState, snapshot);

  const tradingLog: typeof stockState.tradingLogs[number] = {
    action: orderSide,
    timeStamp: snapshot.timestamp || getCurrentTimeStamp(),
    price: orderSide === OrderSides.BUY ? snapshot.ask : snapshot.bid,
    previousPosition,
    newPosition,
    transitoryValue: stockState.transitoryValue,
    unrealizedValue: stockState.unrealizedValue,
  };
  stockState.tradingLogs.push(tradingLog);

  log(`Changed position for ${stock} (${stockState.numContracts} constracts): ${jsonPrettyPrint({
    price: tradingLog.price,
    previousPosition: tradingLog.previousPosition,
    newPosition: tradingLog.newPosition,
  })}`);
}

export function isSnapshotChange(snapshot: Snapshot, stockState: StockState): boolean {
  if (!stockState.lastAsk || !stockState.lastBid) {
    return true;
  }

  return !doFloatCalculation(FloatCalculations.equal, stockState.lastAsk, snapshot.ask) || !doFloatCalculation(FloatCalculations.equal, stockState.lastBid, snapshot.bid);
}

export function doSnapShotChangeUpdates(stock: string, stockState: StockState, snapshot: Snapshot): void {
  stockState.lastAsk = snapshot.ask;
  stockState.lastBid = snapshot.bid;
  stockState.unrealizedValue = getUnrealizedValue(stockState, snapshot);

  if (isLiveTrading()) {
    syncWriteJSONFile(getStockStateFilePath(stock), jsonPrettyPrint(stockState));
  }
}

function getUnrealizedValue(stockState: StockState, snapshot: Snapshot): number {
  if (stockState.position === 0) {
    return stockState.transitoryValue;
  }

  let unrealizedTransactionValue = doFloatCalculation(FloatCalculations.multiply, snapshot.bid, stockState.position);

  const upperCallOffset = getUpperCallOffset(stockState, snapshot);
  unrealizedTransactionValue = doFloatCalculation(FloatCalculations.subtract, unrealizedTransactionValue, upperCallOffset);

  const lowerCallOffset = getLowerCallOffset(stockState, snapshot);
  unrealizedTransactionValue = doFloatCalculation(FloatCalculations.subtract, unrealizedTransactionValue, lowerCallOffset);

  let unrealizedValue = doFloatCalculation(FloatCalculations.add, stockState.transitoryValue, unrealizedTransactionValue);
  const finalTradingCosts = doFloatCalculation(FloatCalculations.multiply, stockState.brokerageTradingCostPerShare, stockState.position);
  unrealizedValue = doFloatCalculation(FloatCalculations.subtract, unrealizedValue, finalTradingCosts);

  return unrealizedValue;
}

function getUpperCallOffset(stockState: StockState, {bid}: Snapshot): number {
  if (!stockState.upperCallStrikePrice || doFloatCalculation(FloatCalculations.lessThan, bid, stockState.upperCallStrikePrice)) {
    return 0;
  }

  const upperCallLiabilityPerShare = doFloatCalculation(FloatCalculations.subtract, bid, stockState.upperCallStrikePrice);

  return doFloatCalculation(FloatCalculations.multiply, upperCallLiabilityPerShare, stockState.lowerCallStrikePrice ? 100 : 200);
}

function getLowerCallOffset(stockState: StockState, {bid}: Snapshot): number {
  if (!stockState.lowerCallStrikePrice || doFloatCalculation(FloatCalculations.lessThan, bid, stockState.lowerCallStrikePrice)) {
    return 0;
  }

  const lowerCallLiabilityPerShare = doFloatCalculation(FloatCalculations.subtract, bid, stockState.lowerCallStrikePrice);

  return doFloatCalculation(FloatCalculations.multiply, lowerCallLiabilityPerShare, stockState.upperCallStrikePrice ? 100 : 200);
}

export function isWideBidAskSpread({bid, ask}: Snapshot): boolean {
  return doFloatCalculation(FloatCalculations.greaterThan, doFloatCalculation(FloatCalculations.subtract, ask, bid), 0.01) === 1;
}
