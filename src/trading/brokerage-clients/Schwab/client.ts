import {
    BrokerageClient,
    OrderDetails,
    OrderStatus,
    Snapshot,
} from '../brokerage-client';
import {getAccessToken} from './auth';
import { setTimeout } from "node:timers/promises";

enum GetEndpoints {
    quotes = 'marketdata/v1/quotes',
}

export class SchwabClient extends BrokerageClient {
    baseUrl = 'https://api.schwabapi.com';
    accessToken = '';

    async authenticate(): Promise<void> {
        this.accessToken = await getAccessToken();

        // 20 minutes
        setTimeout(20 * 60 * 1000).then(() => {
            this.authenticate();
        });
    }

    async getSnapshot(stock: string): Promise<Snapshot> {
        const ticker = stock.replace('.', '/');

        const response: any[] = await this.doGetRequest(`marketdata/v1/${stock}/quotes`, {
            fields: 'quote',
        });

        const quote = Object.values(response)[0].quote;

        const snapshot: Snapshot = {
            ask: quote.askPrice,
            bid: quote.bidPrice,
            timestamp: '',
        };

        return snapshot;
    }

    async getSnapshots(stocks: string[]): Promise<Record<string, Snapshot>> {
        const tickers = stocks.map(stock => stock.replace('.', '/'));
        const symbols = tickers.join(',');

        const response: any[] = await this.doGetRequest(GetEndpoints.quotes, {
            symbols,
            fields: 'quote',
            indicative: false,
        });

        const snapshots: Record<string, Snapshot> = {};

        for (const item of Object.values(response)) {
            const symbol = item.symbol.replace('/', '.');

            const snapshot: Snapshot = {
                ask: item.quote.askPrice,
                bid: item.quote.bidPrice,
                timestamp: '',
            }

            snapshots[symbol] = snapshot;
        }

        return snapshots;
    }

    async getShortableQuantities(stocks: string[]): Promise<Record<string, number>> {
        const tickers = stocks.map(stock => stock.replace('.', '/'));
        const symbols = tickers.join(',');

        const response: any[] = await this.doGetRequest(GetEndpoints.quotes, {
            symbols,
            fields: 'reference',
            indicative: false,
        });

        const quantities: Record<string, number> = {};

        for (const item of Object.values(response)) {
            const symbol = item.symbol.replace('/', '.');

            let quantity = 0;
            if (item.reference.isShortable) {
                quantity = item.reference.isHardToBorrow ? item.reference.htbQuantity : 2 * 1e6;
            }

            quantities[symbol] = quantity;
        }

        return quantities;
    }

    placeOrder(orderDetails: OrderDetails): Promise<number> {
        throw new Error('Method not implemented.');
    }

    getOrderStatus(orderId: number): Promise<OrderStatus> {
        throw new Error('Method not implemented.');
    }

    async doGetRequest(path: string, params: any) {
        const urlParams = new URLSearchParams(params).toString();
        const requestUrl = `${this.baseUrl}/${path}?${urlParams}`;

        const data = await fetch(requestUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
            },
        });

        const response = await data.json();

        if (data.status !== 200) {
            debugger;
            throw new Error(response.detail);
        }

        return response;
    }
}
