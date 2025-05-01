export interface AccountsResponse {
    accounts: string[];
}

export type SnapshotResponse = {
    [field: string]: string;
};

export type OrdersResponse ={
	'order_id': number;
};

export interface OrderStatusResponse extends OrdersResponse {
    status: string;
    avg_fill_price: number;
}

export type PositionResponse = [
    {
        acctId: string;
        conid: number;
        contractDesc: string;
        position: number;
    }
];
