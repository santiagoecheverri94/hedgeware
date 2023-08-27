import {Brokerages, getBrokerageClient} from '../brokerage-clients/factory';
import {log} from '../../utils/utils';
import {FloatCalculations, doFloatCalculation} from '../../utils/float-calculator';
import {OrderDetails, OrderSides, OrderTypes, TimesInForce} from '../brokerage-clients/brokerage-client';
import moment from 'moment-timezone';
import {setTimeout} from 'node:timers/promises';

interface CallDetails {
  brokerageId: string;
  numDesiredSold: number;
  strikePrice: number;
  premiumDesired: number;
  maxPremiumDifference: number;
  state: {
    openOrderId: string;
  }
}

interface StockDetails {
  ticker: string;
  brokerageId: string;
  state: {
    assumedAskPrice: number;
    numCurrentlyOwned: number;
  }
}

interface TargetSecurity {
  stock: StockDetails,
  call: CallDetails,
}

const brokerageClient = getBrokerageClient(Brokerages.IBKR);

const targetSecurities: TargetSecurity[] = [
  {
    stock: {
      ticker: 'ACTG',
      brokerageId: '16699274',
      state: {
        assumedAskPrice: 0,
        numCurrentlyOwned: 0,
      },
    },
    call: {
      strikePrice: 2.5,
      brokerageId: '643210806',
      numDesiredSold: 10,
      premiumDesired: 0.1,
      maxPremiumDifference: 0,
      state: {
        openOrderId: '',
      },
    },
  },
];

export async function startFishingDeepValueCalls(): Promise<void> {
  while (isMarketOpen() && await shouldSellMoreCalls()) {
    await sellCalls();
    // await coverCallsIfNeeded();
  }

  let exitMessage = 'Finished fishing for now because ';
  const isMarketHours = isMarketOpen();
  exitMessage += (isMarketHours ? 'all calls have been sold for the month!' : 'the market has closed for today.');
  log(exitMessage);

  await cancelCallOrders();
  // await coverCallsIfNeeded();

  log('All call orders have been closed, and any naked calls have been covered.');
}

function isMarketOpen(): boolean {
  const hoursFormat = 'hh:mma';
  const marketTimezone = 'America/New_York';

  const currentTimeInNewYork = moment(moment().tz(marketTimezone).format(hoursFormat), hoursFormat);
  const marketOpens = moment(`${'' || '9:30'}am`, hoursFormat);
  const marketCloses = moment(`${'' || '3:30'}pm`, hoursFormat); // End 30 minutes early to have time to close call orders and cover naked calls;

  const isMarketHours = currentTimeInNewYork.isBetween(marketOpens, marketCloses);
  return isMarketHours;
}

async function shouldSellMoreCalls(): Promise<boolean> {
  const tickers = getSecuritiesWithMoreCallsToSell();
  return tickers.length > 0;
}

function getSecuritiesWithMoreCallsToSell(): TargetSecurity[] {
  return targetSecurities.filter(security => getNumberOfMoreCallsToSell(security) > 0);
}

function getNumberOfMoreCallsToSell(security: TargetSecurity): number {
  const numCallsCurrentlySold = 0; // TODO get this from brokerage
  return security.call.numDesiredSold - numCallsCurrentlySold;
}

async function sellCalls() {
  for (const security of getSecuritiesWithMoreCallsToSell()) {
    const snapshot = await brokerageClient.getSnapshot(security.stock.brokerageId);

    await placeCallOrderIfNeeded(security, snapshot.ask);
  }
}

async function placeCallOrderIfNeeded(security: TargetSecurity, currentStockAskPrice: number): Promise<void> {
  if (!security.call.state.openOrderId) {
    security.stock.state.assumedAskPrice = currentStockAskPrice;
    security.call.state.openOrderId = await placeCallOrder(security, currentStockAskPrice);
    return;
  }

  const isCallOrderModificationNeeded = hasStockAskPriceChangedTooMuch(security, currentStockAskPrice);
  if (isCallOrderModificationNeeded) {
    logCurrentAskPriceConsequence({
      security,
      currentStockAskPrice,
      differenceExceedsMax: isCallOrderModificationNeeded,
    });
    await modifyCallOrder(security, currentStockAskPrice);
  }
}

async function placeCallOrder(security: TargetSecurity, currentStockAskPrice: number): Promise<string> {
  return brokerageClient.placeOrder(getCallOrderDetails(security, currentStockAskPrice));
}

function hasStockAskPriceChangedTooMuch(security: TargetSecurity, currentAskPrice: number): boolean {
  const existingSellPriceLimit = getCallSellPriceLimit(security.stock.state.assumedAskPrice, security.call.strikePrice, security.call.premiumDesired);
  const possiblyNewSellPriceLimit = getCallSellPriceLimit(currentAskPrice, security.call.strikePrice, security.call.premiumDesired);

  const difference = Math.abs(doFloatCalculation(FloatCalculations.subtract, existingSellPriceLimit, possiblyNewSellPriceLimit));

  return Boolean(doFloatCalculation(FloatCalculations.greaterThan, difference, security.call.maxPremiumDifference));
}

function getCallSellPriceLimit(stockAskPrice: number, strikePrice: number, premiumDesired: number) {
  const intrinsicValue = doFloatCalculation(FloatCalculations.subtract, stockAskPrice, strikePrice);

  let priceLimit = doFloatCalculation(FloatCalculations.add, intrinsicValue, premiumDesired);
  priceLimit = roundSecondDecimalPlaceToNearestMultipleOfFive(priceLimit);

  return priceLimit;
}

function logCurrentAskPriceConsequence({security, currentStockAskPrice, differenceExceedsMax}: {security: TargetSecurity, currentStockAskPrice: number, differenceExceedsMax: boolean}) {
  const callSellPriceIfCurrentStockAskPrice = getCallSellPriceLimit(currentStockAskPrice, security.call.strikePrice, security.call.premiumDesired);
  const callSellPriceIfAssumedStockAskPrice = getCallSellPriceLimit(security.stock.state.assumedAskPrice, security.call.strikePrice, security.call.premiumDesired);

  let msg = 'Given these Ask Prices,\n';
  msg += `Current: "$${currentStockAskPrice}" (Call Sell Price: "$${callSellPriceIfCurrentStockAskPrice}"),\n`;
  msg += `Assumed: "$${security.stock.state.assumedAskPrice}" (Call Sell Price: "$${callSellPriceIfAssumedStockAskPrice}"),\n`;
  msg += `The difference in premiums of "$${security.call.maxPremiumDifference}" is ${differenceExceedsMax ? 'INDEED' : 'NOT'} exceeded.\n`;
  msg += `${differenceExceedsMax ? 'Modify' : 'Keep'} the existing order.`;

  log(msg);
}

function getCallOrderDetails(security: TargetSecurity, stockAskPrice: number): OrderDetails {
  return {
    side: OrderSides.sell,
    type: OrderTypes.LIMIT,
    timeInForce: TimesInForce.day,
    brokerageIdOfTheSecurity: security.call.brokerageId,
    quantity: getNumberOfMoreCallsToSell(security),
    price: getCallSellPriceLimit(stockAskPrice, security.call.strikePrice, security.call.premiumDesired),
  };
}

function roundSecondDecimalPlaceToNearestMultipleOfFive(priceLimit: number) {
  let rounded: number;
  rounded = doFloatCalculation(FloatCalculations.roundToNumDecimalPlaces, priceLimit, 1);

  const originalSecondDecimalPlace = Math.floor(priceLimit * 100) % 10;
  if (originalSecondDecimalPlace > 5) {
    rounded = doFloatCalculation(FloatCalculations.subtract, rounded, 0.05);
  }

  return rounded;
}

async function modifyCallOrder(security: TargetSecurity, currentStockAskPrice: number): Promise<void> {
  security.stock.state.assumedAskPrice = currentStockAskPrice;
  await brokerageClient.modifyOrder(security.call.state.openOrderId, getCallOrderDetails(security, currentStockAskPrice));
}

async function cancelCallOrders(): Promise<void> {
  const cancelOrders: Promise<void>[] = [];

  for (const security of targetSecurities) {
    if (security.call.state.openOrderId.length > 0) {
      cancelOrders.push(brokerageClient.cancelOrder(security.call.state.openOrderId));
    }
  }

  await Promise.all(cancelOrders);
}
