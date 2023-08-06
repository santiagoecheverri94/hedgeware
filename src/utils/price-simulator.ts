import {FloatCalculations, doFloatCalculation} from './float-calculator';

let askPrice = 4.01;

export function getNextRandomAskPrice(): number {
  const num = Math.random();
  if (num < 0.33) {
    askPrice = doFloatCalculation(FloatCalculations.subtract, askPrice, 0.01);
  } else if (num < 0.66) {
    askPrice = doFloatCalculation(FloatCalculations.add, askPrice, 0.01);
  }

  return askPrice;
}
