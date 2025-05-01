import {BrokerageClient, OrderDetails, OrderAction} from '../brokerage-client';

export async function setSecurityPosition({
    brokerageClient,
    brokerageIdOfSecurity,
    currentPosition,
    newPosition,
}: {
    brokerageClient: BrokerageClient;
    brokerageIdOfSecurity: string;
    currentPosition: number;
    newPosition: number;
}): Promise<number> {
    const side = determineIfOrderNeedBeBuyOrSell(currentPosition, newPosition);
    const quantity = getOrderQuantity(currentPosition, newPosition);

    const orderDetails: OrderDetails = {
        ticker: brokerageIdOfSecurity,
        action: side,
        quantity: quantity,
    };

    const pricePerShare = await brokerageClient.placeMarketOrder(orderDetails);

    return pricePerShare;
}

function determineIfOrderNeedBeBuyOrSell(
    currentPosition: number,
    newPosition: number,
): OrderAction {
    return newPosition > currentPosition ? OrderAction.BUY : OrderAction.SELL;
}

function getOrderQuantity(currentPosition: number, newPosition: number): number {
    return Math.abs(currentPosition - newPosition);
}
