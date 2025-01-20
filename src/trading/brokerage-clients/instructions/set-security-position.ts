import {isLiveTrading} from '../../../utils/price-simulator';
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
}): Promise<void> {
    if (currentPosition === newPosition) {
        return;
    }

    const side = determineIfOrderNeedBeBuyOrSell(currentPosition, newPosition);
    const quantity = getOrderQuantity(currentPosition, newPosition);
    const price = getOrderPrice({snapshot, orderSide: side});

    const orderDetails: OrderDetails = {
        ticker: brokerageIdOfSecurity,
        action: side,
        quantity: quantity,
        price,
    };

    if (!isLiveTrading()) {
        return;
    }

    // TODO: use code commented in this block if we ever want to stop assuming
    // that we can fulfill all our orders at the bid/ask

    // const orderId = await brokerageClient.placeOrder(orderDetails);
    // const waitTimeMs = 60_000 * 5;
    // await setTimeout(waitTimeMs);

    // currentPosition = await brokerageClient.getPositionSize(brokerageIdOfSecurity);

    // if (currentPosition === newPosition) {
    //   return;
    // }

    // await brokerageClient.cancelOrder(orderId);
    // await setTimeout(waitTimeMs);

    // return setSecurityPosition({
    //   brokerageClient,
    //   brokerageIdOfSecurity,
    //   newPosition,
    // });

    // await brokerageClient.placeOrder(orderDetails);
    // const TEN_SECS = 10_000;
    // while (!(await isNewPositionSet(brokerageClient, brokerageIdOfSecurity, newPosition))) {
    //   await setTimeout(TEN_SECS);
    // }

    const orderId = await brokerageClient.placeOrder(orderDetails);
    const ONE_SEC = 1000;
    do {
        await setTimeout(ONE_SEC);
    } while (!(await isOrderFilled(brokerageClient, orderId)));
}

// TODO: use code commented in this block if we ever want to stop assuming that we can fulfill all our orders at the bid/ask
// async function isNewPositionSet(brokerageClient: BrokerageClient, brokerageIdOfSecurity: string, newPosition: number): Promise<boolean> {
//   const currentlySettledPosition = await brokerageClient.getPositionSize(brokerageIdOfSecurity);
//   return currentlySettledPosition === newPosition;
// }

async function isOrderFilled(
    brokerageClient: BrokerageClient,
    orderId: string,
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
