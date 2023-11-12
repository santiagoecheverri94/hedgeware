import {FloatCalculations, doFloatCalculation} from './float-calculator';

const INITIAL_PRICE = 13.72;
let randomPrice: number;

export function getSimulatedPrice(): number {
  return getRandomPrice();
}

function getRandomPrice(): number {
  if (!randomPrice) {
    restartRandomPrice();

    return randomPrice;
  }

  const tickDown = doFloatCalculation(FloatCalculations.subtract, randomPrice, 0.01);
  const tickUp = doFloatCalculation(FloatCalculations.add, randomPrice, 0.01);
  const probabilityOfTickDown = Math.random();
  randomPrice = doFloatCalculation(FloatCalculations.lessThanOrEqual, probabilityOfTickDown, 0.467) ?
    tickDown : tickUp;

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
  console.log('Enter price: ');
  debugger;
  return manualPrice;
}

export function isLiveTrading(): boolean {
  if (isSimulatedSnapshot()) {
    return false;
  }

  return true;
}

export function isSimulatedSnapshot(): boolean {
  return Boolean(process.env.SIMULATE_SNAPSHOT);
}
