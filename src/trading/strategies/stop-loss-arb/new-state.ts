import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {jsonPrettyPrint, readJSONFile, syncWriteJSONFile} from '../../../utils/file';
import {getStockStateFilePath} from './algo';
import { IntervalTypes, SmoothingInterval, StockState } from './types';

export async function createNewStockStateFromExisting(stock: string, initialAskPrice: number, isDynamicIntervals: boolean): Promise<void> {
  const filePath = getStockStateFilePath(`${stock}`);
  const partialStockState = await readJSONFile<StockState>(filePath);
  const newState = getFullStockState(partialStockState, initialAskPrice, isDynamicIntervals);

  syncWriteJSONFile(getStockStateFilePath(`${stock}`), jsonPrettyPrint(newState));
}

function getFullStockState(partialStockState: StockState, initialAskPrice: number, isDynamicIntervals: boolean): StockState {
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

  // const shortIntervals: SmoothingInterval[] = getShortIntervals({
  //   initialAskPrice,
  //   targetPosition,
  //   intervalProfit,
  //   spaceBetweenIntervals,
  //   sharesPerInterval,
  // });

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
    isDynamicIntervals,
    intervals: [...longIntervals], // , ...shortIntervals],
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
