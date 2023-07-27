import { FloatOperations, evaluateFloatOperation } from "./floatCalculator";

let askPrice = 3.96;

export function getNextRandomAskPrice(): number {
  const num = Math.random();
  if (num < 0.33) {
    askPrice = evaluateFloatOperation(FloatOperations.subtract, askPrice, 0.01);
  } else if (num < 0.66) {
    askPrice = askPrice;
  } else {
    askPrice = evaluateFloatOperation(FloatOperations.add, askPrice, 0.01);
  }

  return askPrice;
}
