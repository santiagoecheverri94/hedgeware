import {FloatCalculator as fc} from '../../../utils/float-calculator';
import {BrokerageClient, OrderDetails, OrderAction} from '../brokerage-client';

export async function setSecurityPositionMultiStyleOrders({
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
    // Single Long Order
    if (currentPosition >= 0 && newPosition >= 0) {
        return setSecurityPositionLongOrder({
            brokerageClient,
            brokerageIdOfSecurity,
            currentPosition,
            newPosition,
        });
    }

    // Single Short Order
    if (currentPosition <= 0 && newPosition <= 0) {
        return setSecurityPositionShortOrder({
            brokerageClient,
            brokerageIdOfSecurity,
            currentPosition,
            newPosition,
        });
    }

    // From Long to Short Position
    if (currentPosition > 0 && newPosition < 0) {
        return setSecurityPositionFromLongToShort({
            brokerageClient,
            brokerageIdOfSecurity,
            currentPosition,
            newPosition,
        });
    }

    // From Short to Long Position
    if (currentPosition < 0 && newPosition > 0) {
        return setSecurityPositionFromShortToLong({
            brokerageClient,
            brokerageIdOfSecurity,
            currentPosition,
            newPosition,
        });
    }

    debugger;
    throw new Error(
        `Invalid position change from ${currentPosition} to ${newPosition}`,
    );
}

export async function setSecurityPositionLongOrder({
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
        brokerageIdOfSecurity: brokerageIdOfSecurity,
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

async function setSecurityPositionShortOrder({
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
    const side = determineIfOrderNeedBeBuyToCoverOrSellShort(
        currentPosition,
        newPosition,
    );
    const quantity = getOrderQuantity(currentPosition, newPosition);

    const orderDetails: OrderDetails = {
        brokerageIdOfSecurity: brokerageIdOfSecurity,
        action: side,
        quantity: quantity,
    };

    const pricePerShare = await brokerageClient.placeMarketOrder(orderDetails);

    return pricePerShare;
}

function determineIfOrderNeedBeBuyToCoverOrSellShort(
    currentPosition: number,
    newPosition: number,
): OrderAction {
    return newPosition > currentPosition ?
        OrderAction.BUY_TO_COVER :
        OrderAction.SELL_SHORT;
}

async function setSecurityPositionFromLongToShort({
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
    const longToZeroQuantity = getOrderQuantity(currentPosition, 0);
    const longToZeroPricePerShare = await setSecurityPositionLongOrder({
        brokerageClient,
        brokerageIdOfSecurity,
        currentPosition,
        newPosition: 0,
    });

    const zeroToShortQuantity = getOrderQuantity(0, newPosition);
    const zeroToShortPricePerShare = await setSecurityPositionShortOrder({
        brokerageClient,
        brokerageIdOfSecurity,
        currentPosition: 0,
        newPosition,
    });

    const longToZeroTotalValue = fc.multiply(
        longToZeroPricePerShare,
        longToZeroQuantity,
    );
    const zeroToShortTotalValue = fc.multiply(
        zeroToShortPricePerShare,
        zeroToShortQuantity,
    );
    const totalValue = fc.add(longToZeroTotalValue, zeroToShortTotalValue);

    const averagePricePerShare = fc.divide(
        totalValue,
        longToZeroQuantity + zeroToShortQuantity,
    );

    return averagePricePerShare;
}

async function setSecurityPositionFromShortToLong({
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
    const shortToZeroQuantity = getOrderQuantity(currentPosition, 0);
    const shortToZeroPricePerShare = await setSecurityPositionShortOrder({
        brokerageClient,
        brokerageIdOfSecurity,
        currentPosition,
        newPosition: 0,
    });

    const zeroToLongQuantity = getOrderQuantity(0, newPosition);
    const zeroToLongPricePerShare = await setSecurityPositionLongOrder({
        brokerageClient,
        brokerageIdOfSecurity,
        currentPosition: 0,
        newPosition,
    });

    const shortToZeroTotalValue = fc.multiply(
        shortToZeroPricePerShare,
        shortToZeroQuantity,
    );
    const zeroToLongTotalValue = fc.multiply(
        zeroToLongPricePerShare,
        zeroToLongQuantity,
    );
    const totalValue = fc.add(shortToZeroTotalValue, zeroToLongTotalValue);

    const averagePricePerShare = fc.divide(
        totalValue,
        shortToZeroQuantity + zeroToLongQuantity,
    );

    return averagePricePerShare;
}
