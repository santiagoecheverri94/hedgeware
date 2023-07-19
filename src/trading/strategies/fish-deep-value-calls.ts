import {Brokerages, getBrokerageClient} from '../brokerage-clients/factory';

interface CallDescription {
  underlyingBrokerageId: string;
  contractBrokerageId: string;
  numCallsToSell: number;
  strike: number;
  premiumDesired: number;
  state: {
    currentlySold: number;
    openOrderId: string | null;
  },
}

const callsToFish: {[underlying: string]: CallDescription} = {
  ACTG: {
    underlyingBrokerageId: '16699274',
    contractBrokerageId: '',
    strike: 2.5,
    premiumDesired: 0.1,
    numCallsToSell: 10,
    state: { // this needs to be initialized everytime dynamically
      currentlySold: 0,
      openOrderId: null,
    },
  },
};

export async function startFishingDeepValueCalls(): Promise<void> {
  while (areThereRemainingCallsToFish()) {
    await fishCalls();
  }
}

async function fishCalls() {
  for (const underlying of getRemainingCallsToFish()) {
    const callDescription = callsToFish[underlying];

    const brokerageClient = getBrokerageClient(Brokerages.IBKR);

    const snapshot = await brokerageClient.getSnapshot(underlying);

    const askPrice = snapshot.ask;

    console.log(`Ask price for a "${underlying}" share is ${askPrice}`);
  }
}

function areThereRemainingCallsToFish(): boolean {
  const remainingCallsToFish = getRemainingCallsToFish();
  return remainingCallsToFish.length > 0;
}

function getRemainingCallsToFish(): string[] {
  return Object.keys(callsToFish).filter(underlying => callsToFish[underlying].numCallsToSell > callsToFish[underlying].state.currentlySold);
}
