import {Brokerages, getBrokerageClient} from '../brokerage-clients/factory';
import {log} from '../utils';

interface TargetSecurities {
  call: {
    brokerageId: string;
    numDesiredSold: number;
    strike: number;
    premiumDesired: number;
    acceptablePremiumSlippage: number;

    state: {
      numCurrentlySold: number;
      openOrderId: string;
    }
  },
  underlying: {
    brokerageId: string;

    state: {
      assumedAskPrice: number;
      numCurrentlyOwned: number;
    }
  },
}

const targets: { [underlyingTicker: string]: TargetSecurities } = {
  ACTG: {
    call: {
      strike: 2.5,
      brokerageId: '643210806', // /* CALL: */ '643210806', /* PUT (for testing): */ '643210997',
      numDesiredSold: 10,
      premiumDesired: 0.1,
      acceptablePremiumSlippage: 0.01,

      state: {
        numCurrentlySold: 0,
        openOrderId: '',
      }
    },
    underlying: {
      brokerageId: '16699274',

      state: {
        assumedAskPrice: 0,
        numCurrentlyOwned: 0,
      }
    },
  },
};

export async function startFishingDeepValueCalls(): Promise<void> {
  await initialize();

  while (areThereRemainingCallsToFish()) {
    await fishCalls();
  }
}

async function initialize(): Promise<void> {

}

function areThereRemainingCallsToFish(): boolean {
  const remainingCallsToFish = getRemainingCallsToFish();
  return remainingCallsToFish.length > 0;
}

function getRemainingCallsToFish(): string[] {
  return Object.keys(targets).filter(underlying => getNumCallsToSell(underlying) > 0);
}

function getNumCallsToSell(underlying: string): number {
  return targets[underlying].call.numDesiredSold - targets[underlying].call.state.numCurrentlySold;
}

async function fishCalls() {
  for (const underlying of getRemainingCallsToFish()) {
    // get current ask price for underlying
    const brokerageClient = getBrokerageClient(Brokerages.IBKR);
    const snapshot = await brokerageClient.getSnapshot(underlying);
    const underlyingAskPrice = snapshot.ask;

    await placeCallOrderForUnderlyingIfNeeded(underlying, underlyingAskPrice);
  }
}

async function placeCallOrderForUnderlyingIfNeeded(underlying: string, currentUnderlyingAskPrice: number): Promise<void> {
  // if no open order, place one
  const {state: callState} = targets[underlying].call;
  if (!callState.openOrderId) {
    callState.openOrderId = await placeCallOrder(underlying, currentUnderlyingAskPrice, getNumCallsToSell(underlying));
    return;
  }

  const {acceptablePremiumSlippage} = targets[underlying].call;
  const {assumedAskPrice} = targets[underlying].underlying.state;
  if (hasUnderlyingAskPriceChangedTooMuch(underlying, currentUnderlyingAskPrice)) {
    log(`The distance from current ask price of $${currentUnderlyingAskPrice} to currently assumed ask price of $${assumedAskPrice} is LARGER than the acceptable difference of $${acceptablePremiumSlippage}. Time to replace the existing order.`);
    callState.openOrderId = await replaceCallOrder(underlying, currentUnderlyingAskPrice);
  } else {
    log(`The distance from current ask price of $${currentUnderlyingAskPrice} to currently assumed ask price of $${assumedAskPrice} is SMALLER than the acceptable difference of $${acceptablePremiumSlippage}. Keep the existing order.`);
  }
}

type OrderId = string;
async function placeCallOrder(underlying: string, currentUnderlyingAskPrice: number, numContracts: number): Promise<OrderId> {
  const newOrderId = `test-${Math.round(Math.random() * 1000)}`;
  return newOrderId;
}

function hasUnderlyingAskPriceChangedTooMuch(underlying: string, currentUnderlyingAskPrice: number): boolean {
  const {acceptablePremiumSlippage} = targets[underlying].call;
  const {assumedAskPrice} = targets[underlying].underlying.state;
  return Math.abs(currentUnderlyingAskPrice - assumedAskPrice) > acceptablePremiumSlippage;
}

async function replaceCallOrder(underlying: string, currentUnderlyingAskPrice: number): Promise<OrderId> {
  const {state: callState} = targets[underlying].call;
  const {state: underlyingState} = targets[underlying].underlying;
  const previousOrderId = callState.openOrderId;
  const numContractsToSell = getNumCallsToSell(underlying);

  // cancel current order
  // set new order
  callState.openOrderId = await placeCallOrder(underlying, currentUnderlyingAskPrice, numContractsToSell);
  underlyingState.assumedAskPrice = currentUnderlyingAskPrice;

  return '';
}
