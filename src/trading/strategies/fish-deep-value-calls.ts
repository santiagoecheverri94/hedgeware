import {Brokerages, getBrokerageClient} from '../brokerage-clients/factory';
import {log} from '../../utils/utils';
import {FloatCalculations, doFloatCalculation} from '../../utils/float-calculator';
import {OrderDetails, OrderSides, OrderTypes, TimesInForce} from '../brokerage-clients/brokerage-client';
import moment from 'moment-timezone';

interface CallDetails {
  brokerageId: string;
  numDesiredSold: number;
  strike: number;
  premiumDesired: number;
  maxPremiumDifference: number;
  state: {
    numCurrentlySold: number;
    openOrderId: string;
  }
}

interface StockDetails {
  brokerageId: string;
  state: {
    assumedAskPrice: number;
    numCurrentlyOwned: number;
  }
}

interface TargetSecurities {
  call: CallDetails,
  stock: StockDetails,
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
      },
    },
    stock: {
      brokerageId: '16699274',

      state: {
        assumedAskPrice: 0,
        numCurrentlyOwned: 0,
      },
    },
  },
};

export async function startFishingDeepValueCalls(): Promise<void> {
  while (true) {
    if (!isMarketOpen()) {
      // close positions and exit
      break;
    }

    // if need to purchase share...

    if (shouldSellMoreCalls()) {
      await sellCalls();
    }
  }
}

function isMarketOpen(): boolean {
  const hoursFormat = 'hh:mma';
  const marketTimezone = 'America/New_York';

  const currentTimeInNewYork = moment(moment().tz(marketTimezone).format(hoursFormat), hoursFormat);
  const marketOpens = moment('9:30am', hoursFormat);
  const marketCloses = moment('3:30pm', hoursFormat); // End early to have time to close positions;

  const isMarketHours = currentTimeInNewYork.isBetween(marketOpens, marketCloses);
  return isMarketHours;
}

function shouldSellMoreCalls(): boolean {
  const tickers = getStockTickersWithMoreCallsToSell();
  return tickers.length > 0;
}

function getStockTickersWithMoreCallsToSell(): string[] {
  return Object.keys(targets).filter(stockTicker => getNumberOfMoreCallsToSell(getCallDetails(stockTicker)) > 0);
}

function getNumberOfMoreCallsToSell(call: CallDetails): number {
  return call.numDesiredSold - call.state.numCurrentlySold;
}

function getCallDetails(stockTicker: string) {
  return targets[stockTicker].call;
}

async function sellCalls() {
  for (const stockTicker of getStockTickersWithMoreCallsToSell()) {
    const stock = getStockDetails(stockTicker);
    const snapshot = await brokerageClient.getSnapshot(stock.brokerageId);

    await placeCallOrderIfNeeded(getCallDetails(stockTicker), stock, snapshot.ask);
  }
}

function getStockDetails(stockTicker: string) {
  return targets[stockTicker].stock;
}

async function placeCallOrderIfNeeded(call: CallDetails, stock: StockDetails, currentStockAskPrice: number): Promise<void> {
  if (!call.state.openOrderId) {
    stock.state.assumedAskPrice = currentStockAskPrice;
    call.state.openOrderId = await placeCallOrder(call, currentStockAskPrice);
    return;
  }

  const isCallOrderModificationNeeded = hasStockAskPriceChangedTooMuch(call, stock, currentStockAskPrice);
  logCurrentAskPriceConsequence(currentStockAskPrice, stock.state.assumedAskPrice, call.maxPremiumDifference, isCallOrderModificationNeeded);
  if (isCallOrderModificationNeeded) {
    await modifyCallOrder(call, stock, currentStockAskPrice);
  }
}

function hasStockAskPriceChangedTooMuch(call: CallDetails, stock: StockDetails, currentAskPrice: number): boolean {
  const differenceInAskPrices = Math.abs(doFloatCalculation(FloatCalculations.subtract, currentAskPrice, stock.state.assumedAskPrice));

  return Boolean(doFloatCalculation(FloatCalculations.greaterThan, differenceInAskPrices, call.maxPremiumDifference));
}

function logCurrentAskPriceConsequence(currentStockAskPrice: number, assumedStockAskPrice: number, maxPremiumDifference: number, differenceExceedsMax: boolean) {
  log(`The distance from current ask price of "$${currentStockAskPrice}" to currently assumed ask price of "$${assumedStockAskPrice}" is ${differenceExceedsMax ? 'INDEED' : 'NOT'} larger than the acceptable difference of "$${maxPremiumDifference}". ${differenceExceedsMax ? 'Modify' : 'Keep'} the existing order.`);
}

async function placeCallOrder(call: CallDetails, currentStockAskPrice: number): Promise<string> {
  return brokerageClient.placeOrder(getOrderDetails(call, currentStockAskPrice));
}

function getOrderDetails(call: CallDetails, currentStockAskPrice: number): OrderDetails {
  return {
    side: OrderSides.sell,
    type: OrderTypes.LIMIT,
    timeInForce: TimesInForce.day,
    brokerageIdOfTheSecurity: call.brokerageId,
    quantity: getNumberOfMoreCallsToSell(call),
    price: getCallSellPriceLimit(call, currentStockAskPrice),
  };
}

function getCallSellPriceLimit(call: CallDetails, currentStockAskPrice: number) {
  const intrinsicValue = doFloatCalculation(FloatCalculations.subtract, currentStockAskPrice, call.strike);
  const priceLimit = doFloatCalculation(FloatCalculations.add, intrinsicValue, call.premiumDesired);
  return priceLimit;
}

async function modifyCallOrder(call: CallDetails, stock: StockDetails, currentStockAskPrice: number): Promise<void> {
  stock.state.assumedAskPrice = currentStockAskPrice;
  await brokerageClient.modifyOrder(call.state.openOrderId, getOrderDetails(call, currentStockAskPrice));
}
