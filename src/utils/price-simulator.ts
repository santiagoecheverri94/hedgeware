import {FloatCalculations, doFloatCalculation} from './float-calculator';

let askPrice = 12.45;

export function getNextRandomAskPrice(): number {
  const num = Math.random();
  if (num < 0.50) {
    askPrice = doFloatCalculation(FloatCalculations.subtract, askPrice, 0.02);
  } else if (num < 0.75) {
    askPrice = doFloatCalculation(FloatCalculations.add, askPrice, 0.02);
  }

  return askPrice;
}

let lastPrice = 0;

export function getManualLastPrice(): number {
  console.log('Enter last price: ');
  debugger;
  return lastPrice;
}
