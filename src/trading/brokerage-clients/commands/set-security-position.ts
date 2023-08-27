import {BrokerageClient, OrderDetails, OrderSides, OrderTypes, TimesInForce} from '../brokerage-client';
import {setTimeout} from 'node:timers/promises';

export async function setSecurityPosition({
  brokerageClient,
  brokerageIdOfSecurity,
  newPosition,
}: {
  brokerageClient: BrokerageClient,
  brokerageIdOfSecurity: string,
  newPosition: number,
}): Promise<void> {
  let currentPosition = await brokerageClient.getPositionSize(brokerageIdOfSecurity);

  if (currentPosition === newPosition) {
    return;
  }

  const side = determineIfOrderNeedBeBuyOrSell(currentPosition, newPosition);
  const quantity = getOrderQuantity(currentPosition, newPosition);
  const price = await getOrderPrice({brokerageClient, brokerageIdOfSecurity, orderSide: side});

  const orderDetails: OrderDetails = {
    brokerageIdOfSecurity,
    timeInForce: TimesInForce.day,
    type: OrderTypes.LIMIT,
    side: side,
    quantity: quantity,
    price,
  };

  const orderId = await brokerageClient.placeOrder(orderDetails);

  const waitTimeMs = 10_000;
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
  return newPosition > currentPosition ? OrderSides.buy : OrderSides.sell;
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

  if (orderSide === OrderSides.buy) {
    return snapshot.ask;
  }

  return snapshot.bid;
}
