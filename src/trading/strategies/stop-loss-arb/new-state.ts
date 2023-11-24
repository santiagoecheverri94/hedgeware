import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {jsonPrettyPrint, readJSONFile, syncWriteJSONFile} from '../../../utils/file';
import {getStockStateFilePath} from './algo';
import {IntervalTypes, SmoothingInterval, StockState} from './types';

export async function createNewStockStateFromExisting(stock: string, centralPrice: number, isStaticIntervals: boolean): Promise<void> {
  const filePath = getStockStateFilePath(`${stock}`);
  const partialStockState = await readJSONFile<StockState>(filePath);
  const newState = getFullStockState(partialStockState, centralPrice, !isStaticIntervals);

  syncWriteJSONFile(getStockStateFilePath(`${stock}`), jsonPrettyPrint(newState));
}

function getFullStockState(partialStockState: StockState, centralPrice: number, isDynamicIntervals: boolean): StockState {
  const {
    brokerageId,
    brokerageTradingCostPerShare,
    sharesPerInterval,
    numContracts,
    targetPosition,
    premiumSold,
    upperCallStrikePrice,
    lowerCallStrikePrice,
    intervalProfit,
    spaceBetweenIntervals,
    lastAsk,
    lastBid,
  } = partialStockState;

  const longIntervalsAbove: SmoothingInterval[] = getLongIntervalsAbove({
    centralPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
  });

  const longIntervalsBelow: SmoothingInterval[] = getLongIntervalsBelow({
    centralPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
  });

  // TODO: remove the following
  let totalPremiumSold = doFloatCalculation(FloatCalculations.subtract, centralPrice, lowerCallStrikePrice);
  totalPremiumSold = doFloatCalculation(FloatCalculations.add, totalPremiumSold, premiumSold);

  const newState: StockState = {
    brokerageId,
    brokerageTradingCostPerShare,
    targetPosition,
    sharesPerInterval,
    spaceBetweenIntervals,
    intervalProfit,
    numContracts,
    premiumSold,
    upperCallStrikePrice,
    centralPrice,
    lowerCallStrikePrice,
    position: 0,
    lastAsk,
    lastBid,
    transitoryValue: doFloatCalculation(FloatCalculations.multiply, totalPremiumSold, 100),
    unrealizedValue: doFloatCalculation(FloatCalculations.multiply, totalPremiumSold, 100),
    isDynamicIntervals,
    intervals: [...longIntervalsAbove, ...longIntervalsBelow],
    tradingLogs: [],
  };

  return newState;
}

function getLongIntervalsAbove({
  centralPrice,
  targetPosition,
  intervalProfit,
  spaceBetweenIntervals,
  sharesPerInterval,
}: {
  centralPrice: number
  targetPosition: number
  intervalProfit: number
  spaceBetweenIntervals: number
  sharesPerInterval: number
}): SmoothingInterval[] {
  const basePrice = doFloatCalculation(FloatCalculations.add, centralPrice, getSpaceBetweenInitialPriceAndFirstInterval(spaceBetweenIntervals, intervalProfit));
  const intervals: SmoothingInterval[] = [];
  const numIntervals = (targetPosition / 2) / sharesPerInterval;

  let absoluteIndex = 0;
  for (let i = 1; i <= numIntervals; i++) {
    const spaceFromBaseInterval = doFloatCalculation(FloatCalculations.multiply, absoluteIndex, spaceBetweenIntervals);
    const buyPrice = doFloatCalculation(FloatCalculations.add, basePrice, spaceFromBaseInterval);

    intervals.unshift({
      type: IntervalTypes.LONG,
      positionLimit: (sharesPerInterval * i) + (targetPosition / 2),
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

function getLongIntervalsBelow({
  centralPrice,
  targetPosition,
  intervalProfit,
  spaceBetweenIntervals,
  sharesPerInterval,
}: {
  centralPrice: number
  targetPosition: number
  intervalProfit: number
  spaceBetweenIntervals: number
  sharesPerInterval: number
}): SmoothingInterval[] {
  const basePrice = doFloatCalculation(FloatCalculations.subtract, centralPrice, getSpaceBetweenInitialPriceAndFirstInterval(spaceBetweenIntervals, intervalProfit));
  const intervals: SmoothingInterval[] = [];
  const numIntervals = (targetPosition / 2) / sharesPerInterval;

  let absoluteIndex = 0;
  for (let i = numIntervals; i >= 1; i--) {
    const spaceFromBaseInterval = doFloatCalculation(FloatCalculations.multiply, absoluteIndex, spaceBetweenIntervals);
    const sellPrice = doFloatCalculation(FloatCalculations.subtract, basePrice, spaceFromBaseInterval);

    intervals.push({
      type: IntervalTypes.LONG,
      positionLimit: sharesPerInterval * i,
      SELL: {
        price: sellPrice,
        active: false,
        crossed: false,
      },
      BUY: {
        price: doFloatCalculation(FloatCalculations.subtract, sellPrice, intervalProfit),
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
