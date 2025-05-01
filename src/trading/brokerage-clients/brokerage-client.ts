import {setSecurityPosition} from './instructions/set-security-position';

export abstract class BrokerageClient {
    abstract getSnapshot(stock: string): Promise<Snapshot>;
    abstract getSnapshots(stocks: string[]): Promise<Record<string, Snapshot>>;
    abstract getShortableQuantities(stocks: string[]): Promise<Record<string, number>>;
    abstract placeMarketOrder(orderDetails: OrderDetails): Promise<number>;

    async setSecurityPosition({
        brokerageIdOfSecurity,
        currentPosition,
        newPosition,
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
    BUY_COVER = 'BUY_COVER',
    SELL_SHORT = 'SELL_SHORT',
}

export interface OrderDetails {
    ticker: string;
    action: OrderAction;
    quantity: number;
    // limitPrice?: number;
}
