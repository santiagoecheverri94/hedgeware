import { FloatCalculations, doFloatCalculation } from "../../../utils/float-calculator";
import { jsonPrettyPrint, readJSONFile, syncWriteJSONFile } from "../../../utils/miscellaneous";
import { IntervalTypes, SmoothingInterval, StockState, getStockStateFilePath } from "./algo";

export async function createNewStockState(stock: string, premiumSold: number) {
  const {
    brokerageId,
    brokerageTradingCostPerShare,
    sharesPerInterval,
    numContracts,
    targetPosition,
    initialPrice,
    intervalProfit,
    spaceBetweenIntervals,
    accountValue,
  } = await readJSONFile<StockState>(getStockStateFilePath(stock));

  const longIntervals: SmoothingInterval[] = getLongIntervals({
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
    position: 0,
    intervalProfit,
    initialPrice,
    spaceBetweenIntervals,
    numContracts,
    intervals: [...longIntervals], // , ...shortIntervals],
    accountValue: premiumSold,
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
  return [
    ...getUpperLongIntervals({
      initialPrice,
      targetPosition,
      intervalProfit,
      spaceBetweenIntervals,
      sharesPerInterval,
    }),
    ...getLowerLongIntervals({
      initialPrice,
      targetPosition,
      intervalProfit,
      spaceBetweenIntervals,
      sharesPerInterval,
    }),
  ];
}

function getUpperLongIntervals({
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
  const numIntervals = (targetPosition / 2) / sharesPerInterval;

  for (let i = 1; i <= numIntervals; i++) {
    const spaceFromBaseInterval = doFloatCalculation(FloatCalculations.multiply, i, spaceBetweenIntervals);
    const buyPrice = doFloatCalculation(FloatCalculations.add, initialPrice, spaceFromBaseInterval);

    intervals.unshift({
      type: IntervalTypes.LONG,
      positionLimit: (targetPosition / 2) + sharesPerInterval * i,
      SELL: {
        price: doFloatCalculation(FloatCalculations.add, buyPrice, intervalProfit),
        active: false,
        crossed: false,
      },
      BUY: {
        price: buyPrice,
        active: true,
        crossed: true,
      }
    });
  }

  return intervals;
}

function getLowerLongIntervals({
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
  const numIntervals = (targetPosition / 2) / sharesPerInterval;

  for (let i = 1; i <= numIntervals; i++) {
    const spaceFromBaseInterval = doFloatCalculation(FloatCalculations.multiply, i - 1, spaceBetweenIntervals);
    const buyPrice = doFloatCalculation(FloatCalculations.subtract, initialPrice, spaceFromBaseInterval);

    intervals.push({
      type: IntervalTypes.LONG,
      positionLimit: sharesPerInterval * (numIntervals - i + 1),
      SELL: {
        price: doFloatCalculation(FloatCalculations.add, buyPrice, intervalProfit),
        active: false,
        crossed: false,
      },
      BUY: {
        price: buyPrice,
        active: true,
        crossed: true,
      }
    });
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
    const spaceFromBaseInterval = doFloatCalculation(FloatCalculations.multiply, absoluteIndex, spaceBetweenIntervals);
    const sellPrice = doFloatCalculation(FloatCalculations.subtract, initialPrice, spaceFromBaseInterval);

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
      }
    });

    absoluteIndex++;
  }

  return intervals;
}
