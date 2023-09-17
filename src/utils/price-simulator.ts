import {FloatCalculations, doFloatCalculation} from './float-calculator';

let randomPrice = 11.72;

export function getRandomPrice(): number {
  const num = Math.random();
  if (num < 0.33) {
    randomPrice = doFloatCalculation(FloatCalculations.subtract, randomPrice, 0.01);
  } else if (num < 0.66) {
    randomPrice = doFloatCalculation(FloatCalculations.add, randomPrice, 0.01);
  }

  return randomPrice;
}

const manualPrice = 0;

export function getManualPrice(): number {
  console.log('Enter last price: ');
  debugger;
  return manualPrice;
}
