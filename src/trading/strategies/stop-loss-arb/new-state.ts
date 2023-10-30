import { FloatCalculations, doFloatCalculation } from "../../../utils/float-calculator";
import { jsonPrettyPrint, syncWriteJSONFile } from "../../../utils/miscellaneous";
import { IntervalTypes, SmoothingInterval, StockState, getStockStateFilePath } from "./algo";

const INTERVAL_PER_POSITION = 1;

export function createNewStockState({
  stock,
  brokerageId,
  brokerageTradingCostPerShare,
  sharesPerInterval,
  numContracts,
  targetPosition,
  initialPrice,
  intervalProfit,
  spaceBetweenIntervals,
}: {
  stock: string
  brokerageId: string
  brokerageTradingCostPerShare: number
  sharesPerInterval: number
  numContracts: number
  targetPosition: number
  initialPrice: number
  intervalProfit: number
  spaceBetweenIntervals: number
}) {
  const longIntervals: SmoothingInterval[] = getLongIntervals({
    initialPrice,
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
  });

  const shortIntervals: SmoothingInterval[] = getShortIntervals({
    initialPrice: doFloatCalculation(FloatCalculations.subtract, initialPrice, doFloatCalculation(FloatCalculations.subtract, spaceBetweenIntervals, intervalProfit)),
    targetPosition,
    intervalProfit,
    spaceBetweenIntervals,
    sharesPerInterval,
  });

  const newState: StockState = {
    brokerageId,
    brokerageTradingCostPerShare,
    sharesPerInterval,
    intervalProfit,
    initialPrice,
    spaceBetweenIntervals,
    numContracts,
    position: 0,
    targetPosition,
    intervals: [...longIntervals, ...shortIntervals],
    tradingLogs: [],
    accountValue: 0,
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
  const intervals: SmoothingInterval[] = [];
  const numIntervals = targetPosition / sharesPerInterval;

  let absoluteIndex = 0;
  for (let i = 0; i <= numIntervals; i++) {
    for (let j = 0; j < INTERVAL_PER_POSITION; j++) {
      const spaceFromBaseInterval = doFloatCalculation(FloatCalculations.multiply, absoluteIndex, spaceBetweenIntervals);
      const buyPrice = doFloatCalculation(FloatCalculations.add, initialPrice, spaceFromBaseInterval);

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
          crossed: false,
        }
      });

      absoluteIndex++;
    }
  }

  return intervals;
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
  const intervals: SmoothingInterval[] = [];
  const numIntervals = targetPosition / sharesPerInterval;

  let absoluteIndex = 0;
  for (let i = 0; i <= numIntervals; i++) {
    for (let j = 0; j < INTERVAL_PER_POSITION; j++) {
      const spaceFromBaseInterval = doFloatCalculation(FloatCalculations.multiply, absoluteIndex, spaceBetweenIntervals);
      const sellPrice = doFloatCalculation(FloatCalculations.subtract, initialPrice, spaceFromBaseInterval);

      intervals.push({
        type: IntervalTypes.SHORT,
        positionLimit: -sharesPerInterval * i,
        SELL: {
          price: sellPrice,
          active: true,
          crossed: false,
        },
        BUY: {
          price: doFloatCalculation(FloatCalculations.subtract, sellPrice, intervalProfit),
          active: false,
          crossed: false,
        }
      });

      absoluteIndex++;
    }
  }

  return intervals;
}
