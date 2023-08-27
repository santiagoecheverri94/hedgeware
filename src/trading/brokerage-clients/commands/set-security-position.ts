import {BrokerageClient, OrderSides} from '../brokerage-client';

export async function setSecurityPosition({
  brokerageClient,
  brokerageIdOfSecurity,
  newPosition,
}: {
  brokerageClient: BrokerageClient,
  brokerageIdOfSecurity: string,
  newPosition: number,
}): Promise<void> {
  const currentPosition = await brokerageClient.getPositionSize(brokerageIdOfSecurity);

  if (currentPosition === newPosition) {
    return;
  }

  const orderSide = '';
}

function determineIfNeedToBuyOrSell(currentPosition: number, newPosition: number): OrderSides {
  return newPosition > currentPosition ? OrderSides.buy : OrderSides.sell;
}
