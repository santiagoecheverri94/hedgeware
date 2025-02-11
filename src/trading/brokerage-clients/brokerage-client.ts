import {setSecurityPosition} from './instructions/set-security-position';
import {getSimulatedSnapshot, isLiveTrading} from '../../utils/price-simulator';
import { OrdersResponse } from './IBKR/types';

export abstract class BrokerageClient {
    protected abstract snapshotFields: { [field in SnapShotFields]: string };

    async getSnapshot(stock: string, brokerageIdOfSecurity: string): Promise<Snapshot> {
        if (!isLiveTrading()) {
            return getSimulatedSnapshot(stock);
        }

        return this.getSnapshotHelper(stock, brokerageIdOfSecurity);
    }

    abstract getSnapshotHelper(
        stock: string,
        brokerageIdOfSecurity: string
    ): Promise<Snapshot>;

    abstract placeOrder(orderDetails: OrderDetails): Promise<number>;
    abstract modifyOrder(orderId: string, orderDetails: OrderDetails): Promise<number>;
    abstract getOrderStatus(orderId: number): Promise<OrderStatus>;
    abstract getPositionSize(brokerageIdOfSecurity: string): Promise<number>;

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
    }): Promise<void> {
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
