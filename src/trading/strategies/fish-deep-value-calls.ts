import {FloatCalculations, doFloatCalculation} from '../../utils/float-calculator';
import {BrokerageClient, OrderDetails, OrderSides, OrderTypes, TimesInForce} from '../brokerage-clients/brokerage-client';
import {setTimeout} from 'node:timers/promises';
import {IBKRClient} from '../brokerage-clients/IBKR/client';
import { isMarketOpen } from '../../utils/time';
import { log } from '../../utils/log';

interface CallDetails {
  brokerageId: string;
  numDesiredSold: number;
  strikePrice: number; // TODO: get the strike dynamically from the contract description
  premiumDesired: number;
  maxPremiumDifference: number;
  state: {
    openOrderId: string;
    numCurrentlySold: number,
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

let brokerageClient: BrokerageClient;

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
      brokerageId: '636823129',
      numDesiredSold: 10,
      premiumDesired: 0.1,
      maxPremiumDifference: 0,
      state: {
        openOrderId: '',
        numCurrentlySold: 0,
      },
    },
  },
  {
    stock: {
      ticker: 'BRKB',
      brokerageId: '72063691',
      state: {
        assumedAskPrice: 0,
        numCurrentlyOwned: 0,
      },
    },
    call: {
      strikePrice: 350,
      brokerageId: '608946933',
      numDesiredSold: 10,
      premiumDesired: 1,
      maxPremiumDifference: 0.1,
      state: {
        openOrderId: '',
        numCurrentlySold: 0,
      },
    },
  },
];

export async function startFishingDeepValueCalls(): Promise<void> {
  brokerageClient = new IBKRClient();

  await updateState();

  while (await isMarketOpen() && await shouldSellMoreCalls()) {
    await sellCalls();
    await coverCallsIfNeeded();
  }

  let exitMessage = 'Finished fishing for now because ';
  const isMarketHours = await isMarketOpen();
  exitMessage += (isMarketHours ? 'all calls have been sold for the month!' : 'the market has closed for today.');
  log(exitMessage);

  await cancelCallOrders();

  const waitTimeMs = 10_000;
  await setTimeout(waitTimeMs);

  await coverCallsIfNeeded();

  log('All call orders have been closed, and any naked calls have been covered.');
}

async function updateState(): Promise<void> {
  // TODO: open order ids for the given conid should also be initialized
  for (const security of targetSecurities) {
    const stockOwned = await brokerageClient.getPositionSize(security.stock.brokerageId);
    security.stock.state.numCurrentlyOwned = stockOwned;

    const callsSold = await brokerageClient.getPositionSize(security.call.brokerageId);
    security.call.state.numCurrentlySold = Math.abs(callsSold);
  }
}

async function shouldSellMoreCalls(): Promise<boolean> {
  const securities = getSecuritiesWithMoreCallsToSell();
  return securities.length > 0;
}

function getSecuritiesWithMoreCallsToSell(): TargetSecurity[] {
  return targetSecurities.filter(security => getNumberOfMoreCallsToSell(security) > 0);
}

function getNumberOfMoreCallsToSell(security: TargetSecurity): number {
  return security.call.numDesiredSold - security.call.state.numCurrentlySold;
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
    side: OrderSides.SELL,
    type: OrderTypes.LIMIT,
    timeInForce: TimesInForce.DAY,
    brokerageIdOfSecurity: security.call.brokerageId,
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

async function coverCallsIfNeeded(): Promise<void> {
  await updateState();

  for (const security of targetSecurities) {
    if (isCallsNeedCovering(security)) {
      await covercalls(security);
    }
  }
}

function isCallsNeedCovering(security: TargetSecurity): boolean {
  const numSharesNeeded = getNumSharesNeeded(security);
  const needsCover = numSharesNeeded > security.stock.state.numCurrentlyOwned;

  return needsCover;
}

function getNumSharesNeeded(security: TargetSecurity) {
  return security.call.state.numCurrentlySold * 100;
}

async function covercalls(security: TargetSecurity) {
  const numSharesNeeded = getNumSharesNeeded(security);

  // await brokerageClient.setSecurityPosition(security.stock.brokerageId, numSharesNeeded);
  await brokerageClient.setSecurityPosition({
    brokerageIdOfSecurity: security.stock.brokerageId,
    currentPosition: security.stock.state.numCurrentlyOwned,
    newPosition: numSharesNeeded,
    snapshot: await brokerageClient.getSnapshot(security.stock.brokerageId),
  });
}
