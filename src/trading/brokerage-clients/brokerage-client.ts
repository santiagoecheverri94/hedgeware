import {setSecurityPosition} from './instructions/set-security-position';
import {getSimulatedSnapshot, isLiveTrading} from '../../utils/price-simulator';
import {OrdersResponse} from './IBKR/types';

export abstract class BrokerageClient {
    abstract getSnapshot(stock: string): Promise<Snapshot>;
    abstract getSnapshots(stocks: string[]): Promise<Record<string, Snapshot>>;
    abstract getShortableQuantities(stocks: string[]): Promise<Record<string, number>>;
    abstract placeOrder(orderDetails: OrderDetails): Promise<number>;
    abstract getOrderStatus(orderId: number): Promise<OrderStatus>;

    async setSecurityPosition({
        brokerageIdOfSecurity,
        currentPosition,
        newPosition,
        snapshot,
    }: {
        brokerageIdOfSecurity: string;
        currentPosition: number;
        newPosition: number;
        snapshot: Snapshot;
    }): Promise<number> {
        return setSecurityPosition({
            brokerageClient: this,
            brokerageIdOfSecurity,
            newPosition,
            currentPosition,
            snapshot,
        });
    }
}

export enum SnapShotFields {
    bid = 'bid',
    ask = 'ask',
    // last = 'last',
}

export type Snapshot = {
    [field in SnapShotFields]: number;
} & {
    timestamp: string;
};

export enum OrderAction {
    BUY = 'BUY',
    SELL = 'SELL',
}

export enum OrderStatus {
    FILLED = 'Filled',
    // Pending???
}

export interface OrderDetails {
    ticker: string;
    // exchange?
    price: number;
    action: OrderAction;
    quantity: number;
}
