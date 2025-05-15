export abstract class BrokerageClient {
    abstract getSnapshot(stock: string): Promise<Snapshot>;
    abstract getSnapshots(stocks: string[]): Promise<Record<string, Snapshot>>;
    abstract getShortableQuantities(stocks: string[]): Promise<Record<string, number>>;
    abstract placeMarketOrder(orderDetails: OrderDetails): Promise<number>;

    abstract setSecurityPosition({
        brokerageIdOfSecurity,
        currentPosition,
        newPosition,
    }: {
        brokerageIdOfSecurity: string;
        currentPosition: number;
        newPosition: number;
    }): Promise<number>;
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
    BUY_TO_COVER = 'BUY_TO_COVER',
    SELL_SHORT = 'SELL_SHORT',
}

export interface OrderDetails {
    brokerageIdOfSecurity: string;
    action: OrderAction;
    quantity: number;
    // limitPrice?: number;
}
