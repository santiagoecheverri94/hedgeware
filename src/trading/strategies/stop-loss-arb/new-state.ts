import {FloatCalculations, doFloatCalculation} from '../../../utils/float-calculator';
import {jsonPrettyPrint, readJSONFile, syncWriteJSONFile} from '../../../utils/file';
import {IntervalTypes, SmoothingInterval, StockState, getStockStateFilePath} from './algo';

export async function createNewStockState(stock: string): Promise<void> {
  const {
    brokerageId,
    brokerageTradingCostPerShare,
    sharesPerInterval,
    numContracts,
    targetPosition,
    premiumSold,
    callStrikePrice,
    initialPrice,
    putStrikePrice,
    intervalProfit,
    spaceBetweenIntervals,
    lastAsk,
    lastBid,
  } = await readJSONFile<StockState>(getStockStateFilePath(stock));

  const longIntervals: SmoothingInterval[] = getLongIntervals({
    initialPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
  });

  const shortIntervals: SmoothingInterval[] = getShortIntervals({
    initialPrice,
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
    initialPrice,
    putStrikePrice,
    position: 0,
    lastAsk,
    lastBid,
    transitoryValue: doFloatCalculation(FloatCalculations.multiply, premiumSold || 0, 100),
    unrealizedValue: doFloatCalculation(FloatCalculations.multiply, premiumSold || 0, 100),
    intervals: [...longIntervals, ...shortIntervals],
    tradingLogs: [],
  };

  syncWriteJSONFile(getStockStateFilePath(`${stock}`), jsonPrettyPrint(newState));
}

function getLongIntervals({
  initialPrice,
  targetPosition,
  intervalProfit,
  spaceBetweenIntervals,
  sharesPerInterval,
}: {
  initialPrice: number
  targetPosition: number
  intervalProfit: number
  spaceBetweenIntervals: number
  sharesPerInterval: number
}): SmoothingInterval[] {
  const basePrice = doFloatCalculation(FloatCalculations.add, initialPrice, getSpaceBetweenInitialPriceAndFirstInterval(spaceBetweenIntervals, intervalProfit));
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
  initialPrice,
  targetPosition,
  intervalProfit,
  spaceBetweenIntervals,
  sharesPerInterval,
}: {
  initialPrice: number
  targetPosition: number
  intervalProfit: number
  spaceBetweenIntervals: number
  sharesPerInterval: number
}): SmoothingInterval[] {
  const basePrice = doFloatCalculation(FloatCalculations.subtract, initialPrice, getSpaceBetweenInitialPriceAndFirstInterval(spaceBetweenIntervals, intervalProfit));
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
