import {
    BrokerageClient,
    OrderDetails,
    OrderAction,
    OrderStatus,
    Snapshot,
} from '../brokerage-client';
import {setTimeout} from 'node:timers/promises';

export async function setSecurityPosition({
    brokerageClient,
    brokerageIdOfSecurity,
    currentPosition,
    newPosition,
    snapshot,
}: {
    brokerageClient: BrokerageClient;
    brokerageIdOfSecurity: string;
    currentPosition: number;
    newPosition: number;
    snapshot: Snapshot;
}): Promise<number> {
    const side = determineIfOrderNeedBeBuyOrSell(currentPosition, newPosition);
    const quantity = getOrderQuantity(currentPosition, newPosition);
    const price = getOrderPrice({snapshot, orderSide: side});

    const orderDetails: OrderDetails = {
        ticker: brokerageIdOfSecurity,
        action: side,
        quantity: quantity,
        price,
    };

    const orderId = await brokerageClient.placeOrder(orderDetails);
    const ONE_SEC = 1000;
    do {
        await setTimeout(ONE_SEC);
    } while (!(await isOrderFilled(brokerageClient, orderId)));

    return 0; // TODO: fix this
}

async function isOrderFilled(
    brokerageClient: BrokerageClient,
    orderId: number,
): Promise<boolean> {
    const orderStatus = await brokerageClient.getOrderStatus(orderId);
    return orderStatus === OrderStatus.FILLED;
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

function getOrderPrice({
    snapshot,
    orderSide,
}: {
    snapshot: Snapshot;
    orderSide: OrderAction;
}): number {
    if (orderSide === OrderAction.BUY) {
        return snapshot.ask;
    }

    return snapshot.bid;
}
