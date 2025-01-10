export interface SsoValidateResponse {
    RESULT: boolean;
}

export interface TickleResponse {
    session: string;
    iserver: {
        authStatus: {
            authenticated: boolean;
        };
    };
}

export interface AccountsResponse {
    accounts: string[];
}

export type SnapshotResponse = {
    [field: string]: string;
};

export interface IBKROrderDetails {
    ticker: string;
    // exchange?
    price: number;
    side: string;
    quantity: number;
}

export type OrdersResponse = Array<{
    id?: string;
    order_id?: string;
}>;

export interface CancelOrderResponse {
    order_id?: string;
}

export interface OrderStatusResponse {
    order_status: string;
}

export type PositionResponse = [
    {
        acctId: string;
        conid: number;
        contractDesc: string;
        position: number;
    }
];
