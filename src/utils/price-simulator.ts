import {FloatCalculations, doFloatCalculation} from './float-calculator';

const INITIAL_PRICE = 12.63;
let randomPrice = INITIAL_PRICE;

export function getSimulatedPrice(): number {
  return getRandomPrice();
}

function getRandomPrice(): number {
  const num = Math.random();
  if (num < 0.33) {
    randomPrice = doFloatCalculation(FloatCalculations.subtract, randomPrice, 0.01);
  } else if (num < 0.66) {
    randomPrice = doFloatCalculation(FloatCalculations.add, randomPrice, 0.01);
  }

  return randomPrice;
}

export function restartSimulatedPrice(): void {
  restartRandomPrice();
}

function restartRandomPrice(): void {
  randomPrice = INITIAL_PRICE;
}

const manualPrice = 0;

export function getManualPrice(): number {
  console.log('Enter last price: ');
  debugger;
  return manualPrice;
}
