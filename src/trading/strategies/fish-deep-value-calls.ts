import {Brokerages, getBrokerageClient} from '../brokerage-clients/factory';

interface CallDescription {
  brokerage: Brokerages;
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
    brokerage: Brokerages.IBKR,
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
  /* eslint-disable no-await-in-loop */
  while (areThereRemainingCallsToFish()) {
    await fishCalls();
  }
  /* eslint-enable no-await-in-loop */
}

async function fishCalls() {
  /* eslint-disable no-await-in-loop */
  for (const underlying of getRemainingCallsToFish()) {
    const callDescription = callsToFish[underlying];

    const brokerageClient = getBrokerageClient(callDescription.brokerage);

    const snapshot = await brokerageClient.getSnapshot(underlying);

    const askPrice = snapshot.ask;

    console.log(`Ask price for a "${underlying}" share is ${askPrice}`);
  }
  /* eslint-enable no-await-in-loop */
}

function areThereRemainingCallsToFish(): boolean {
  const remainingCallsToFish = getRemainingCallsToFish();
  return remainingCallsToFish.length > 0;
}

function getRemainingCallsToFish(): string[] {
  return Object.keys(callsToFish).filter(underlying => callsToFish[underlying].numCallsToSell > callsToFish[underlying].state.currentlySold);
}
