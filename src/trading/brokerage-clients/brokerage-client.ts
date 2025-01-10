import { ApisauceInstance } from "apisauce";
import { setSecurityPosition } from "./instructions/set-security-position";
import { WebSocket } from "ws";
import { getSimulatedSnapshot, isLiveTrading } from "../../utils/price-simulator";

export abstract class BrokerageClient {
    protected abstract orderAction: { [side in OrderAction]: string };
    protected abstract orderStatus: { [status in OrderStatus]: string };

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
    abstract placeOrder(orderDetails: OrderDetails): Promise<string>;
    abstract modifyOrder(orderId: string, orderDetails: OrderDetails): Promise<string>;
    abstract cancelOrder(orderId: string): Promise<void>;
    abstract getOrderStatus(orderId: string): Promise<OrderStatus>;
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
    bid = "bid",
    ask = "ask",
    // last = 'last',
}

export type Snapshot = {
    [field in SnapShotFields]: number;
} & {
    timestamp: string;
};

export enum OrderAction {
    BUY = "BUY",
    SELL = "SELL",
}

export enum OrderStatus {
    FILLED = "FILLED",
    // Pending, Cancelled, etc.
}

export interface OrderDetails {
    ticker: string;
    // exchange?
    price: number;
    action: OrderAction;
    quantity: number;
}
