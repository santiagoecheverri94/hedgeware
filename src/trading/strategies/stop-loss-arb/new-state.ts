import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {jsonPrettyPrint, readJSONFile, syncWriteJSONFile} from '../../../utils/file';
import {IntervalTypes, SmoothingInterval, StockState, getStockStateFilePath, isWideBidAskSpread} from './algo';
import { DateType, getFilePathForStockOnDateType as getFilePathForTickerOnDateType } from '../../../historical-data/save-stock-historical-data';
import { Snapshot } from '../../brokerage-clients/brokerage-client';
import { getWeekdaysInRange } from '../../../utils/time';

export async function createNewStockStateFromExisting(stock: string, initialAskPrice: number): Promise<void> {
  const filePath = getStockStateFilePath(`${stock}`);
  const partialStockState = await readJSONFile<StockState>(filePath);
  const newState = getFullStockState(partialStockState, initialAskPrice);

  syncWriteJSONFile(getStockStateFilePath(`${stock}`), jsonPrettyPrint(newState));
}

async function getTemplateStockState(ticker: string): Promise<StockState> {
  const filePath = getStockStateFilePath(`templates\\${ticker}`);
  const templateStockState = await readJSONFile<StockState>(filePath);

  return templateStockState;
}

function getFullStockState(partialStockState: StockState, initialAskPrice: number): StockState {
  const {
    brokerageId,
    brokerageTradingCostPerShare,
    sharesPerInterval,
    numContracts,
    targetPosition,
    premiumSold,
    callStrikePrice,
    putStrikePrice,
    intervalProfit,
    spaceBetweenIntervals,
    lastAsk,
    lastBid,
  } = partialStockState;

  const longIntervals: SmoothingInterval[] = getLongIntervals({
    initialAskPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
  });

  const shortIntervals: SmoothingInterval[] = getShortIntervals({
    initialAskPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
  });

  const newState: StockState = {
    brokerageId,
    brokerageTradingCostPerShare,
    targetPosition,
    sharesPerInterval,
    spaceBetweenIntervals,
    intervalProfit,
    numContracts,
    premiumSold,
    callStrikePrice,
    initialPrice: initialAskPrice,
    putStrikePrice,
    position: 0,
    lastAsk,
    lastBid,
    transitoryValue: doFloatCalculation(FloatCalculations.multiply, premiumSold || 0, 100),
    unrealizedValue: doFloatCalculation(FloatCalculations.multiply, premiumSold || 0, 100),
    targetExitValuePercentageIncrease: 0,
    intervals: [...longIntervals, ...shortIntervals],
    tradingLogs: [],
  };

  return newState;
}

function getLongIntervals({
  initialAskPrice,
  targetPosition,
  intervalProfit,
  spaceBetweenIntervals,
  sharesPerInterval,
}: {
  initialAskPrice: number
  targetPosition: number
  intervalProfit: number
  spaceBetweenIntervals: number
  sharesPerInterval: number
}): SmoothingInterval[] {
  const basePrice = doFloatCalculation(FloatCalculations.add, initialAskPrice, getSpaceBetweenInitialPriceAndFirstInterval(spaceBetweenIntervals, intervalProfit));
  const intervals: SmoothingInterval[] = [];
  const numIntervals = targetPosition / sharesPerInterval;

  let absoluteIndex = 0;
  for (let i = 0; i <= numIntervals; i++) {
    const spaceFromBaseInterval = doFloatCalculation(FloatCalculations.multiply, absoluteIndex, spaceBetweenIntervals);
    const buyPrice = doFloatCalculation(FloatCalculations.add, basePrice, spaceFromBaseInterval);

    intervals.unshift({
      type: IntervalTypes.LONG,
      positionLimit: sharesPerInterval * i,
      SELL: {
        price: doFloatCalculation(FloatCalculations.add, buyPrice, intervalProfit),
        active: false,
        crossed: false,
      },
      BUY: {
        price: buyPrice,
        active: true,
        crossed: true,
      },
    });

    absoluteIndex++;
  }

  return intervals;
}

function getSpaceBetweenInitialPriceAndFirstInterval(spaceBetweenIntervals: number, intervalProfit: number): number {
  return doFloatCalculation(FloatCalculations.divide, getSpaceBetweenOpposingBuySell(spaceBetweenIntervals, intervalProfit), 2);
}

function getSpaceBetweenOpposingBuySell(spaceBetweenIntervals: number, intervalProfit: number): number {
  return doFloatCalculation(FloatCalculations.subtract, spaceBetweenIntervals, intervalProfit);
}

function getShortIntervals({
  initialAskPrice,
  targetPosition,
  intervalProfit,
  spaceBetweenIntervals,
  sharesPerInterval,
}: {
  initialAskPrice: number
  targetPosition: number
  intervalProfit: number
  spaceBetweenIntervals: number
  sharesPerInterval: number
}): SmoothingInterval[] {
  const basePrice = doFloatCalculation(FloatCalculations.subtract, initialAskPrice, getSpaceBetweenInitialPriceAndFirstInterval(spaceBetweenIntervals, intervalProfit));
  const intervals: SmoothingInterval[] = [];
  const numIntervals = targetPosition / sharesPerInterval;

  let absoluteIndex = 0;
  for (let i = 0; i <= numIntervals; i++) {
    const spaceFromBaseInterval = doFloatCalculation(FloatCalculations.multiply, absoluteIndex, spaceBetweenIntervals);
    const sellPrice = doFloatCalculation(FloatCalculations.subtract, basePrice, spaceFromBaseInterval);

    intervals.push({
      type: IntervalTypes.SHORT,
      positionLimit: -sharesPerInterval * i,
      SELL: {
        price: sellPrice,
        active: true,
        crossed: true,
      },
      BUY: {
        price: doFloatCalculation(FloatCalculations.subtract, sellPrice, intervalProfit),
        active: false,
        crossed: false,
      },
    });

    absoluteIndex++;
  }

  return intervals;
}

export async function createNewHistoricalStockStatesForDateRange(ticker: string, startDate: string, endDate: string): Promise<void> {
  const dates = getWeekdaysInRange(startDate, endDate);

  for (const date of dates) {
    await createNewHistoricalStockStateForDate(ticker, date);
  }
}

export async function createNewHistoricalStockStateForDate(ticker: string, date: string): Promise<void> {
  const templateStockState = await getTemplateStockState(ticker);
  const initialAskPrice = await getInitialAskPriceForTickerAtDate(ticker, date);
  
  if (initialAskPrice === null) {
    return;
  }
  
  const newState = getFullStockState(templateStockState, initialAskPrice);
  syncWriteJSONFile(getStockStateFilePath(`${ticker}__${date}`), jsonPrettyPrint(newState));
}

async function getInitialAskPriceForTickerAtDate(ticker: string, date: string): Promise<number | null> {
  const filePath = getFilePathForTickerOnDateType(ticker, DateType.DAILY, date);
  const snapshots = await readJSONFile<Snapshot[]>(filePath);

  for (const snapshot of snapshots) {
    if (!isWideBidAskSpread(snapshot)) {
      return snapshot.ask;
    }
  }

  return null;
}
