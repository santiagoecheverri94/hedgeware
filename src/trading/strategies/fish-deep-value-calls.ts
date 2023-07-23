import {Brokerages, getBrokerageClient} from '../brokerage-clients/factory';
import {log} from '../utils';

interface CallDescription {
  underlyingBrokerageId: string;
  callBrokerageId: string;
  contractBrokerageId: string;
  numContractsToSell: number;
  strike: number;
  premiumDesired: number;
  acceptablePremiumDifference: number;
  state: {
    numContractsCurrentlySold: number;
    openOrderId: string | null;
    assumedUnderlyingAskPrice: number;
  },
}

const callsToFish: { [underlying: string]: CallDescription } = {
  ACTG: {
    underlyingBrokerageId: '16699274',
    callBrokerageId: '643210806',
    contractBrokerageId: '',
    strike: 2.5,
    premiumDesired: 0.1,
    acceptablePremiumDifference: 0.01,
    numContractsToSell: 10,
    state: { // this needs to be initialized everytime dynamically
      numContractsCurrentlySold: 0,
      openOrderId: null,
      assumedUnderlyingAskPrice: 0,
    },
  },
};

export async function startFishingDeepValueCalls(): Promise<void> {
  while (areThereRemainingCallsToFish()) {
    await fishCalls();
  }
}

function areThereRemainingCallsToFish(): boolean {
  const remainingCallsToFish = getRemainingCallsToFish();
  return remainingCallsToFish.length > 0;
}

function getRemainingCallsToFish(): string[] {
  return Object.keys(callsToFish).filter(underlying => getNumContractsToSell(underlying) > 0);
}

function getNumContractsToSell(underlying: string): number {
  return callsToFish[underlying].numContractsToSell - callsToFish[underlying].state.numContractsCurrentlySold;
}

async function fishCalls() {
  for (const underlying of getRemainingCallsToFish()) {
    // get current ask price for underlying
    const callDescription = callsToFish[underlying];
    const brokerageClient = getBrokerageClient(Brokerages.IBKR);
    const snapshot = await brokerageClient.getSnapshot(underlying);
    const underlyingAskPrice = snapshot.ask;

    await placeCallOrderForUnderlyingIfNeeded(underlying, underlyingAskPrice);
  }
}

async function placeCallOrderForUnderlyingIfNeeded(underlying: string, currentUnderlyingAskPrice: number): Promise<void> {
  // if no open order, place one
  const {state} = callsToFish[underlying];
  if (!state.openOrderId) {
    state.openOrderId = await placeCallOrder(underlying, currentUnderlyingAskPrice, getNumContractsToSell(underlying));
    return;
  }

  const {acceptablePremiumDifference} = callsToFish[underlying];
  if (hasUnderlyingAskPriceChangedTooMuch(underlying, currentUnderlyingAskPrice)) {
    log(`The distance from current ask price of $${currentUnderlyingAskPrice} to currently assumed ask price of $${state.assumedUnderlyingAskPrice} is LARGER than the acceptable difference of $${acceptablePremiumDifference}. Time to replace the existing order.`);
    state.openOrderId = await replaceCallOrder(underlying, currentUnderlyingAskPrice);
  } else {
    log(`The distance from current ask price of $${currentUnderlyingAskPrice} to currently assumed ask price of $${state.assumedUnderlyingAskPrice} is SMALLER than the acceptable difference of $${acceptablePremiumDifference}. Keep the existing order.`);
  }
}

type OrderId = string;
async function placeCallOrder(underlying: string, currentUnderlyingAskPrice: number, numContracts: number): Promise<OrderId> {
  const newOrderId = `test-${Math.round(Math.random() * 1000)}`;
  return newOrderId;
}

function hasUnderlyingAskPriceChangedTooMuch(underlying: string, currentUnderlyingAskPrice: number): boolean {
  const {acceptablePremiumDifference, state} = callsToFish[underlying];
  return Math.abs(currentUnderlyingAskPrice - state.assumedUnderlyingAskPrice) > acceptablePremiumDifference;
}

async function replaceCallOrder(underlying: string, currentUnderlyingAskPrice: number): Promise<OrderId> {
  const {state} = callsToFish[underlying];
  const previousOrderId = state.openOrderId;
  const numContractsToSell = getNumContractsToSell(underlying);

  // cancel current order
  // set new order
  state.openOrderId = await placeCallOrder(underlying, currentUnderlyingAskPrice, numContractsToSell);
  state.assumedUnderlyingAskPrice = currentUnderlyingAskPrice;

  return '';
}
