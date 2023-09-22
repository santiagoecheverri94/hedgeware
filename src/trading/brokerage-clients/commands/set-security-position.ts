import {BrokerageClient, OrderDetails, OrderSides, OrderTypes, TimesInForce} from '../brokerage-client';
import {setTimeout} from 'node:timers/promises';

export async function setSecurityPosition({
  brokerageClient,
  brokerageIdOfSecurity,
  currentPosition,
  newPosition,
}: {
  brokerageClient: BrokerageClient,
  brokerageIdOfSecurity: string,
  currentPosition?: number,
  newPosition: number,
}): Promise<void> {
  if (!currentPosition) {
    currentPosition = await brokerageClient.getPositionSize(brokerageIdOfSecurity);
  }

  if (currentPosition === newPosition) {
    return;
  }

  const side = determineIfOrderNeedBeBuyOrSell(currentPosition, newPosition);
  const quantity = getOrderQuantity(currentPosition, newPosition);
  const price = await getOrderPrice({brokerageClient, brokerageIdOfSecurity, orderSide: side});

  const orderDetails: OrderDetails = {
    brokerageIdOfSecurity,
    timeInForce: TimesInForce.DAY,
    type: OrderTypes.LIMIT,
    side: side,
    quantity: quantity,
    price,
  };

  if ((process.env as any).SIMULATE_SNAPSHOT) {
    return;
  }

  const orderId = await brokerageClient.placeOrder(orderDetails);

  const waitTimeMs = 60_000 * 5;
  await setTimeout(waitTimeMs);

  currentPosition = await brokerageClient.getPositionSize(brokerageIdOfSecurity);

  if (currentPosition === newPosition) {
    return;
  }

  await brokerageClient.cancelOrder(orderId);
  await setTimeout(waitTimeMs);

  return setSecurityPosition({
    brokerageClient,
    brokerageIdOfSecurity,
    newPosition,
  });
}

function determineIfOrderNeedBeBuyOrSell(currentPosition: number, newPosition: number): OrderSides {
  return newPosition > currentPosition ? OrderSides.BUY : OrderSides.SELL;
}

function getOrderQuantity(currentPosition: number, newPosition: number): number {
  return Math.abs(currentPosition - newPosition);
}

async function getOrderPrice({
  brokerageClient,
  brokerageIdOfSecurity,
  orderSide,
}: {
  brokerageClient: BrokerageClient,
  brokerageIdOfSecurity: string,
  orderSide: OrderSides,
}): Promise<number> {
  const snapshot = await brokerageClient.getSnapshot(brokerageIdOfSecurity);

  if (orderSide === OrderSides.BUY) {
    return snapshot.ask;
  }

  return snapshot.bid;
}
