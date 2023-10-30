import {FloatCalculations, doFloatCalculation} from './float-calculator';

const INITIAL_PRICE = 11.92;
let randomPrice = INITIAL_PRICE;

export function getSimulatedPrice(): number {
  return getRandomPrice();
}

function getRandomPrice(): number {
  const tickDown = doFloatCalculation(FloatCalculations.subtract, randomPrice, 0.01);
  const tickUp = doFloatCalculation(FloatCalculations.add, randomPrice, 0.01);
  const probabilityOfTickDown = Math.random();
  randomPrice = doFloatCalculation(FloatCalculations.lessThanOrEqual, probabilityOfTickDown, 0.50)
    ? tickDown : tickUp;

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
