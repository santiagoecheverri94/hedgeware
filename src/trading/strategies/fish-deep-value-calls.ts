import {Brokerages, getBrokerageClient} from '../brokerage-clients/factory';
import {log} from '../../utils/utils';
import { FloatOperations, evaluateFloatOperation } from '../../utils/floatCalculator';

interface TargetSecurities {
  call: {
    brokerageId: string;
    numDesiredSold: number;
    strike: number;
    premiumDesired: number;
    maxPremiumDifference: number;

    state: {
      numCurrentlySold: number;
      openOrderId: string;
    }
  },
  stock: {
    brokerageId: string;

    state: {
      assumedAskPrice: number;
      numCurrentlyOwned: number;
    }
  },
}

const brokerageClient = getBrokerageClient(Brokerages.IBKR);

const targets: { [stockTicker: string]: TargetSecurities } = {
  ACTG: {
    call: {
      strike: 2.5,
      brokerageId: '643210806', // /* CALL: */ '643210806', /* PUT (for testing): */ '643210997',
      numDesiredSold: 10,
      premiumDesired: 0.1,
      maxPremiumDifference: 0.01,

      state: {
        numCurrentlySold: 0,
        openOrderId: '',
      }
    },
    stock: {
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

  // TODO: add cleanup code to cancel orders at end of day
  while (areThereMoreCallsToSell()) {
    await sellCalls();
  }
}

async function initialize(): Promise<void> {

}

function areThereMoreCallsToSell(): boolean {
  const tickers = getStockTickersWithMoreCallsToSell();
  return tickers.length > 0;
}

function getStockTickersWithMoreCallsToSell(): string[] {
  return Object.keys(targets).filter(stockTicker => getNumberOfMoreCallsToSell(stockTicker) > 0);
}

function getNumberOfMoreCallsToSell(stockTicker: string): number {
  return getCallDetails(stockTicker).numDesiredSold - getCallDetails(stockTicker).state.numCurrentlySold;
}

function getCallDetails(stockTicker: string) {
  return targets[stockTicker].call;
}

async function sellCalls() {
  for (const ticker of getStockTickersWithMoreCallsToSell()) {
    const snapshot = await brokerageClient.getSnapshot(getStockDetails(ticker).brokerageId);

    await placeCallOrderIfNeeded(ticker, snapshot.ask);
  }
}

async function placeCallOrderIfNeeded(stockTicker: string, currentStockAskPrice: number): Promise<void> {
  const call = getCallDetails(stockTicker);
  if (!call.state.openOrderId) {
    call.state.openOrderId = await placeCallOrder(stockTicker, currentStockAskPrice, getNumberOfMoreCallsToSell(stockTicker));
    return;
  }

  const isCallOrderModificationNeeded = hasStockAskPriceChangedTooMuch(stockTicker, currentStockAskPrice);

  logCurrentAskPriceConsequence(currentStockAskPrice, getStockDetails(stockTicker).state.assumedAskPrice, getCallDetails(stockTicker).maxPremiumDifference, isCallOrderModificationNeeded);

  if (isCallOrderModificationNeeded) {
    call.state.openOrderId = await modifyCallOrder(stockTicker, currentStockAskPrice);
  } 
}

function logCurrentAskPriceConsequence(currentStockAskPrice: number, assumedStockAskPrice: number, maxPremiumDifference: number, differenceExceedsMax: boolean) {
  log(`The distance from current ask price of "$${currentStockAskPrice}" to currently assumed ask price of "$${assumedStockAskPrice}" is ${differenceExceedsMax ? 'INDEED' : 'NOT'} larger than the acceptable difference of "$${maxPremiumDifference}". ${differenceExceedsMax ? 'Modify' : 'Keep'} the existing order.`);
}

function getStockDetails(stockTicker: string) {
  return targets[stockTicker].stock;
}

async function placeCallOrder(stockTicker: string, currentStockAskPrice: number, numContracts: number): Promise<string> {
  const newOrderId = `test-${Math.round(Math.random() * 1000)}`;
  return newOrderId;
}

function hasStockAskPriceChangedTooMuch(stockTicker: string, currentAskPrice: number): boolean {
  const {assumedAskPrice} = getStockDetails(stockTicker).state;

  const differenceInAskPrices = Math.abs(evaluateFloatOperation(FloatOperations.subtract, currentAskPrice, assumedAskPrice));

  return Boolean(evaluateFloatOperation(FloatOperations.greaterThan, differenceInAskPrices, getCallDetails(stockTicker).maxPremiumDifference));
}

async function modifyCallOrder(stockTicker: string, currentStockAskPrice: number): Promise<string> {
  const call = getCallDetails(stockTicker);
  const stock = getStockDetails(stockTicker);
  const numContractsToSell = getNumberOfMoreCallsToSell(stockTicker);

  // cancel current order
  // set new order
  stock.state.assumedAskPrice = currentStockAskPrice;

  return '';
}
